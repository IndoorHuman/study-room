// tools/vision_read.swift — the room's on-device reader (Phase 26.94, D-01).
//
// The fourth tier is not a language model at all: it is macOS Vision, running
// on the owner's own machine, with no provider, no prompt, no tokens and no
// judgement. This program is the whole of it. It takes a list of picture
// paths and asks Vision four questions about each picture in ONE perform:
// what text is in it (OCR), what it is a picture of (themes), how many faces
// are in it, and a 768-float feature print that tells near-duplicates apart.
//
// It merges three research probes under .scratch/wayfinder-40 and -42 that
// had never been run together. Those probes are THROWAWAY evidence; this file
// is tracked product code, and the two places they were wrong (the language
// order and the stdin read) are corrected here from the start rather than
// fixed afterwards. Both corrections are marked LOAD-BEARING below and both
// have a gate that has been seen red.
//
// PLACEMENT, so the next reader finds the reason already written. tools/ is
// where this repo keeps standalone programs that are run BY PATH and never
// imported — tools/stage_public.py and tools/gen_room_sprites.py are the
// neighbours. adapters/ was the other candidate and is wrong by contract:
// adapters/ is a Python package whose members must expose SOURCE / collect /
// mark_origin (server.py:459-463), and a .swift file is not an adapter by
// that contract. The one real risk of tools/ — that it reads as dev-only, so
// a future tools/-wide exclusion silently drops a SHIPPING file from the
// public copy — is answered by adding this path to tools/stage_public.py's
// REQUIRED list (plan 10), whose own comment says exactly why that list
// exists.
//
// INVOKED AS:  swift tools/vision_read.swift        — ONE spawn (D-12).
//   Never swiftc-then-run the artefact: that is TWO spawns, and the
//   subprocess-site pin at tests/test_no_push.cjs counts spawns by equality.
//   One spawn takes that pin from 1 to 2, which is the number 26.93 already
//   wrote into the pin's own comment as this phase's. It also leaves no
//   binary on disk to cache, invalidate, sign or explain, which is what #27
//   section 7 rejected when it refused to ship a precompiled binary.
//
// Behavior:
//   * stdin   -> newline-delimited picture paths, one per line, arriving on a
//                PIPE. Empty lines are ignored.
//   * stdout  -> ONE JSON object per line per ATTEMPTED picture, flushed
//                after each, so the caller can move a progress bar while a
//                twenty-minute run goes on. A good row carries path, text,
//                themes, faces, lang, dim, type, fp. A row for a picture that
//                could not be read carries path and error and NOTHING else,
//                so a caller counting rows against inputs never sees a silent
//                shortfall. (The other two probes returned silently, which
//                makes a naive join read a failure as an empty string —
//                correct only by luck.)
//   * stderr  -> at most one plain line, and only on a refusal.
//   * exit    -> 0 when at least one picture was read;
//                2 when ZERO paths arrived on stdin;
//                3 when every attempted picture failed.
//                None of the three probes ever exited non-zero for any
//                reason, so a caller checking returncode learned nothing.
//
// Toggles (all via environment, all optional):
//   VR_LANG=zhfirst -> force the macOS-12 fallback language configuration and
//                      report lang "zh-first". This is a TEST SEAM and it is
//                      the only honest one available: the #available else-arm
//                      below can never be SELECTED on any machine this
//                      project has (macOS 26.5.1), so the OS condition stays
//                      unwitnessed. The toggle makes the CODE branch
//                      witnessable, and nothing here or in any document may
//                      claim more than that.
//   VR_CONC=<n>     -> maxConcurrentOperationCount (default 8). Measured:
//                      4 / 8 / 12 / 16 all land inside the run-to-run noise,
//                      because Vision saturates the accelerator internally.
//                      8 is the probes' number kept, not a tuned one.
import Foundation
import Vision
import CoreImage

// ---- the contract constants, exactly ONE copy of each ---------------------
// The two probes that carried these repeated them inline; a merged program
// with two copies is a merged program with two answers.
let confidenceFloor: Float = 0.30
let maxThemes = 8

// ⚠ THE FALLBACK LANGUAGE ORDER, IN ONE PLACE, AND zh-Hans LEADS. See the
// comment on configureLanguage below for why the order is the whole point.
let fallbackLanguages = ["zh-Hans", "en-US"]

let environment = ProcessInfo.processInfo.environment
let forceFallbackLanguages = (environment["VR_LANG"] ?? "") == "zhfirst"
let concurrency = max(1, Int(environment["VR_CONC"] ?? "") ?? 8)

/// One plain line on stderr and a non-zero exit — never a Swift trace.
func refuse(_ line: String, _ code: Int32) -> Never {
    FileHandle.standardError.write(Data(("vision_read: " + line + "\n").utf8))
    exit(code)
}

// ⚠⚠ LOAD-BEARING (1 of 2) — THE LANGUAGE CONFIGURATION.
//
// recognitionLanguages is a PRIORITY ORDER, not a set. The shipped probe put
// en-US first, which forces a Latin reading of every glyph: measured over 300
// of her screenshots, that configuration returned Chinese characters in 0.0%
// of them, against 84.0% for automatic detection and 87.3% for the zh-first
// fallback, and it halved the median character count (165 against 338/336).
// 87% of her screenshots had their Chinese destroyed by it.
//
// THERE MUST BE NO ARM OF THIS BRANCH IN WHICH en-US LEADS. That is asserted
// statically over every tracked .swift file by tests/test_vision_source.cjs,
// which was driven red on a planted violation before it was trusted.
//
// automaticallyDetectsLanguage is macOS 13.0+, so the #available guard is
// load-bearing too: with it replaced by `if true`, the source stops compiling
// at -target arm64-apple-macosx12.0, which is what proves the guard is doing
// work rather than decorating. Without an else arm — which is how the probe
// wrote it — an older Mac would simply get Vision's default, and the default
// is the Latin-first reading this whole comment exists to prevent.
//
// ⚠ The fallback is NOT "degraded", and no document should call it that. It
// recovers MORE Chinese-bearing pictures than automatic detection (87.3%
// against 84.0%) and 1,689 FEWER total characters, and only 31 of 300 outputs
// are byte-identical between the two. It is different, and on macOS 12 it is
// unmeasured.
func configureLanguage(_ request: VNRecognizeTextRequest) -> String {
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    if forceFallbackLanguages {
        request.recognitionLanguages = fallbackLanguages
        return "zh-first"
    }
    if #available(macOS 13.0, *) {
        request.automaticallyDetectsLanguage = true
        return "auto"
    } else {
        request.recognitionLanguages = fallbackLanguages
        return "zh-first"
    }
}

/// Everything Vision has to say about one picture, in one perform.
func readOne(_ path: String) -> [String: Any] {
    guard let image = CIImage(contentsOf: URL(fileURLWithPath: path)) else {
        return ["path": path, "error": "unreadable"]
    }
    let textRequest = VNRecognizeTextRequest()
    let lang = configureLanguage(textRequest)
    let classifyRequest = VNClassifyImageRequest()
    let faceRequest = VNDetectFaceRectanglesRequest()
    let printRequest = VNGenerateImageFeaturePrintRequest()

    let handler = VNImageRequestHandler(ciImage: image, options: [:])
    do {
        try handler.perform([textRequest, classifyRequest,
                             faceRequest, printRequest])
    } catch {
        return ["path": path, "error": "\(error)"]
    }

    let text = (textRequest.results ?? [])
        .compactMap { $0.topCandidates(1).first?.string }
        .joined(separator: " ")
    let themes = (classifyRequest.results ?? [])
        .filter { $0.confidence >= confidenceFloor }
        .sorted { $0.confidence > $1.confidence }
        .prefix(maxThemes)
        .map { $0.identifier }
    let faces = faceRequest.results?.count ?? 0

    // dim and type ride on EVERY good row: without them the consumer cannot
    // validate the vector's length, and a print of the wrong length is worse
    // than no print at all.
    guard let observation =
            printRequest.results?.first as? VNFeaturePrintObservation else {
        return ["path": path, "error": "no feature print"]
    }
    return ["path": path, "text": text, "themes": themes, "faces": faces,
            "lang": lang, "dim": observation.elementCount,
            "type": observation.elementType.rawValue,
            "fp": observation.data.base64EncodedString()]
}

// ⚠⚠ LOAD-BEARING (2 of 2) — THE STDIN READ.
//
// NOT String(contentsOfFile: "/dev/stdin"). That idiom — used by ALL THREE
// probes — reads NOTHING when standard input is a PIPE, which is exactly what
// subprocess hands over. It only works under shell redirection (`< file`),
// which is the only way the probes were ever run, which is why nobody saw it.
// Measured on one binary, both stdin shapes: probe idiom through a pipe gives
// rc=0 and 0 rows for 40 paths, and rc=0 with 40 rows under `< file`. A
// silent zero-work SUCCESS is the worst shape a defect can take, because the
// caller reports a finished pass.
//
// readDataToEndOfFile reads standard input as DATA rather than opening a file
// by name, and returns 40 rows on both shapes. tests/test_vision_program.py
// drives a real pipe and asserts rows == len(paths); it was driven red
// against the probe idiom before it was trusted.
let stdinData = FileHandle.standardInput.readDataToEndOfFile()
let paths = (String(data: stdinData, encoding: .utf8) ?? "")
    .split(separator: "\n")
    .map(String.init)
    .filter { !$0.isEmpty }

// The other half of the same defect: a caller must be able to tell "read
// nothing" from "read everything". Zero paths in is a refusal, never a pass.
if paths.isEmpty {
    refuse("no paths arrived on standard input — nothing was read.", 2)
}

let queue = OperationQueue()
queue.maxConcurrentOperationCount = concurrency
let lock = NSLock()
var attempted = 0
var succeeded = 0

for path in paths {
    queue.addOperation {
        let row = readOne(path)
        let line = (try? JSONSerialization.data(withJSONObject: row))
            .flatMap { String(data: $0, encoding: .utf8) }
        lock.lock()
        attempted += 1
        if row["error"] == nil { succeeded += 1 }
        if let line = line {
            print(line)
            fflush(stdout)
        }
        lock.unlock()
    }
}
queue.waitUntilAllOperationsAreFinished()

if succeeded == 0 {
    refuse("every picture failed to read (\(attempted) attempted).", 3)
}
exit(0)
