// tools/likeness_read.swift — the likeness reader (Phase 26.996, plan 07).
//
// One tap on a photograph, and the room offers to set aside the others of that
// same person or animal. This program is the only thing that ever looks at a
// face or an animal closely enough to compare two of them.
//
// ⛔⛔ IT WRITES NOTHING. NOT A CROP, NOT A PRINT, NOT A CACHE, NOT A TEMPORARY
// FILE. Her ruling (#116) is that the room holds nothing representing a
// particular person's face, and the ONLY way to make that true is that the
// comparison material never reaches disk at all — it is computed, written to
// standard output, consumed by one call, and gone when the process exits.
// tests/test_likeness_finder.py takes a manifest of the whole store tree before
// and after a match run and asserts it is byte-identical.
//
// ⚠ THAT IS WHY THIS IS SLOW, AND THE SLOWNESS IS NOT A DEFECT TO OPTIMISE
// AWAY. A cache of face prints would make a tap instant and would be exactly
// the artefact she ruled must never exist. If the wall-clock ever has to come
// down, it comes down by looking at FEWER PHOTOGRAPHS, never by keeping what
// was looked at.
//
// WHY NOT tools/vision_read.swift. That program asks Vision four questions and
// keeps, for faces, `results?.count` — a bare integer. No boxes, no geometry,
// no per-face print, and its stored feature prints are WHOLE-PICTURE prints. A
// whole-picture print compares two PICTURES, not two people: two photographs of
// one person in different rooms are far apart by it, and two photographs of
// different people on the same sofa are close. So the crops and their prints
// must be computed here, from the pictures, at the moment of the tap.
//
// THE TWO CORRECTIONS INHERITED FROM ITS COMMENTS, both load-bearing there:
//   * ONE spawn for the whole batch, never a compile-then-run — the
//     subprocess-site pin counts spawns by equality.
//   * stdin is read with readDataToEndOfFile, NEVER String(contentsOfFile:
//     "/dev/stdin"), which reads NOTHING from a pipe and hands the caller a
//     silent zero-work success.
//
// ⛔ NO OUTBOUND CALL. No provider, no key, no network. On her machine, over her
// pictures, and that is the whole promise.
//
// INVOKED AS:  swift tools/likeness_read.swift
//   stdin  -> newline-delimited `<item_id>\t<path>`, on a PIPE.
//   stdout -> ONE JSON object per line per ATTEMPTED photograph, flushed after
//             each. A good row carries id, faces[] and animals[], each entry a
//             base64 print with its length. A row for a photograph that could
//             not be read carries id and error and NOTHING else, so a caller
//             counting rows against inputs never sees a silent shortfall.
//   exit   -> 0 when at least one photograph was read; 2 when ZERO lines
//             arrived on stdin; 3 when every attempted photograph failed.
import Foundation
import Vision
import CoreImage

// ---- contract constants, exactly ONE copy of each -------------------------
// A face or animal smaller than this on its shorter side is not something a
// likeness can be told from; below it, Vision's print is mostly noise. Skipped
// detections are COUNTED BY REASON rather than silently dropped.
let minSide: CGFloat = 48.0
// The box is tight to the features; the padding is what makes two crops of one
// subject comparable rather than two crops of two croppings.
let cropPad: CGFloat = 0.40

let environment = ProcessInfo.processInfo.environment
let concurrency = max(1, Int(environment["LR_CONC"] ?? "") ?? 8)

func refuse(_ line: String, _ code: Int32) -> Never {
    FileHandle.standardError.write(Data(("likeness_read: " + line + "\n").utf8))
    exit(code)
}

/// The prints of every subject of one KIND in one photograph.
/// ⛔ Returns them; never writes them.
func printsFor(_ image: CIImage, _ extent: CGRect,
               _ observations: [VNDetectedObjectObservation])
        -> ([[String: Any]], Int) {
    var out: [[String: Any]] = []
    var tooSmall = 0
    for (index, observation) in observations.enumerated() {
        // VNImageRectForNormalizedRect and CIImage share a bottom-left origin,
        // so the box needs no flip. Said plainly because the obvious defect
        // here is a vertical flip, which yields a print of the wrong part of
        // the picture and reads downstream as "the room is bad at faces"
        // rather than as a coordinate error.
        let box = VNImageRectForNormalizedRect(observation.boundingBox,
                                               Int(extent.width),
                                               Int(extent.height))
        if box.width < minSide || box.height < minSide {
            tooSmall += 1
            continue
        }
        let padded = box.insetBy(dx: -box.width * cropPad,
                                 dy: -box.height * cropPad)
            .intersection(extent)
        if padded.isEmpty { tooSmall += 1; continue }

        let request = VNGenerateImageFeaturePrintRequest()
        let handler = VNImageRequestHandler(ciImage: image.cropped(to: padded),
                                            options: [:])
        do { try handler.perform([request]) } catch { continue }
        guard let feature =
                request.results?.first as? VNFeaturePrintObservation
        else { continue }
        out.append(["i": index,
                    "fp": feature.data.base64EncodedString(),
                    "dim": feature.elementCount])
    }
    return (out, tooSmall)
}

func readOne(_ itemId: String, _ path: String) -> [String: Any] {
    guard let image = CIImage(contentsOf: URL(fileURLWithPath: path)) else {
        return ["id": itemId, "error": "unreadable"]
    }
    let extent = image.extent
    if extent.isEmpty || extent.isInfinite {
        return ["id": itemId, "error": "no extent"]
    }

    let faceRequest = VNDetectFaceRectanglesRequest()
    let animalRequest = VNRecognizeAnimalsRequest()
    let handler = VNImageRequestHandler(ciImage: image, options: [:])
    do {
        // ONE perform for both questions over one decode of the picture.
        try handler.perform([faceRequest, animalRequest])
    } catch {
        return ["id": itemId, "error": "\(error)"]
    }

    let (faces, faceSmall) = printsFor(image, extent,
                                       faceRequest.results ?? [])
    let (animals, animalSmall) = printsFor(image, extent,
                                           animalRequest.results ?? [])
    return ["id": itemId, "faces": faces, "animals": animals,
            "too_small": faceSmall + animalSmall]
}

// stdin as DATA, not as a file by name — see the header.
let stdinData = FileHandle.standardInput.readDataToEndOfFile()
let lines = (String(data: stdinData, encoding: .utf8) ?? "")
    .split(separator: "\n")
    .map(String.init)
    .filter { !$0.isEmpty }

// "read nothing" must be distinguishable from "read everything".
if lines.isEmpty {
    refuse("no paths arrived on standard input — nothing was read.", 2)
}

let queue = OperationQueue()
queue.maxConcurrentOperationCount = concurrency
let lock = NSLock()
var attempted = 0
var succeeded = 0

for line in lines {
    let parts = line.components(separatedBy: "\t")
    if parts.count != 2 { continue }
    let itemId = parts[0]
    let path = parts[1]
    queue.addOperation {
        let row = readOne(itemId, path)
        let text = (try? JSONSerialization.data(withJSONObject: row))
            .flatMap { String(data: $0, encoding: .utf8) }
        lock.lock()
        attempted += 1
        if row["error"] == nil { succeeded += 1 }
        if let text = text {
            print(text)
            fflush(stdout)
        }
        lock.unlock()
    }
}
queue.waitUntilAllOperationsAreFinished()

if succeeded == 0 {
    refuse("every photograph failed to read (\(attempted) attempted).", 3)
}
exit(0)
