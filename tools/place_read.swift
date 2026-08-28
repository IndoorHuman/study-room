// tools/place_read.swift — WHERE a photograph was taken, and WHEN, read
// on-device and written down NOWHERE.
//
// 26.996-06. This is the one genuinely net-new capability in its phase:
// measured before it was written, there is not one coordinate, GPS read or
// location read anywhere in the shipped source.
//
// ⛔⛔ WHY THIS IS A SEPARATE PROGRAM AND NOT A WIDENING OF tools/vision_read.
// That reader PERSISTS what it reads — that is its whole job, and the room
// depends on it. Persisting a coordinate is forbidden by ruling: nothing about
// where she was is ever written at rest. Sharing a program with a reader whose
// contract is to persist would make "writes nothing" a property of a call site
// rather than of a program, and a property of a call site is one an ordinary
// refactor can take away. THE SEPARATION IS FORCED, NOT STYLISTIC.
//
// ⛔ THIS PROGRAM WRITES NOTHING. No cache, no sidecar, no log, no temporary
// file that outlives the run. Its whole output goes to standard output and its
// whole memory goes away with the process. tests/test_place_read_writes_nothing.py
// hashes the entire library tree either side of a real read and compares.
//
// Behavior, copied whole from the shipped probe it sits beside:
//   * stdin   -> newline-delimited picture paths, one per line, on a PIPE.
//   * stdout  -> ONE JSON object per line per ATTEMPTED picture, flushed after
//                each. A good row carries path, and lat/lon when the picture
//                carries them, and when. A row for a picture that could not be
//                read carries path and error and NOTHING else, so a caller
//                counting rows against inputs never sees a silent shortfall.
//   * stderr  -> at most one plain line, and only on a refusal.
//   * exit    -> 0 when at least one picture was attempted and read;
//                2 when ZERO paths arrived on stdin;
//                3 when every attempted picture failed.
//
// ⚠ A PICTURE WITH NO LOCATION IS NOT AN ERROR. Most of a camera roll carries
// none, and an absence is the ordinary case rather than a fault: such a row
// comes back good, with `lat`/`lon` simply absent. The caller is what decides
// what an absence means, and by ruling it means *that day*, silently.

import Foundation
import ImageIO

let args = CommandLine.arguments
let concurrency = 4

func refuse(_ line: String, _ code: Int32) -> Never {
    FileHandle.standardError.write(Data(("place_read: " + line + "\n").utf8))
    exit(code)
}

// ⛔ ONE DECLARED CONVENTION, STATED HERE BECAUSE A COMPARISON IN TWO
// CONVENTIONS IS A COMPARISON THAT IS SOMETIMES RIGHT: signed decimal degrees,
// WGS-84 — north and east positive, south and west negative. A picture's
// stored latitude is an UNSIGNED magnitude with a separate hemisphere letter,
// so the letter MUST be applied or every southern and western photograph lands
// in the wrong hemisphere while looking perfectly well-formed.
//
// ⛔ AND A COORDINATE THAT CANNOT BE READ IN THAT CONVENTION IS RETURNED AS AN
// ABSENCE, NEVER AS A GUESS. A missing hemisphere letter is the case that
// matters: taking the magnitude and hoping is how a photograph taken in Sydney
// is grouped with one taken in Shanghai.
func signedDegrees(_ magnitude: Any?, _ ref: Any?, positive: String) -> Double? {
    guard let m = magnitude as? Double, m.isFinite else { return nil }
    guard let r = (ref as? String)?.uppercased(), !r.isEmpty else { return nil }
    if r == positive { return m }
    // the only other legal letters for each axis; anything else is an absence
    if (positive == "N" && r == "S") || (positive == "E" && r == "W") {
        return -m
    }
    return nil
}

// ⚠ THE OFFSET IS CARRIED, NOT DISCARDED, and this is not pedantry. The whole
// feature groups by DAY, and a timestamp read without its offset is a day
// thrown off by one for every picture taken near midnight in a place that is
// not this machine's timezone — which is exactly the travel case a place
// grouping exists for. When a picture carries an offset it is applied; when it
// does not, the naive stamp is returned and marked as such, so a caller can
// never mistake an assumed timezone for a known one.
func stampOf(_ exif: [String: Any]?, _ tiff: [String: Any]?) -> (String, Bool)? {
    let raw = (exif?[kCGImagePropertyExifDateTimeOriginal as String] as? String)
        ?? (exif?[kCGImagePropertyExifDateTimeDigitized as String] as? String)
        ?? (tiff?[kCGImagePropertyTIFFDateTime as String] as? String)
    guard let raw = raw else { return nil }
    let offset = (exif?[kCGImagePropertyExifOffsetTimeOriginal as String] as? String)
        ?? (exif?[kCGImagePropertyExifOffsetTime as String] as? String)
    if let offset = offset, !offset.isEmpty {
        return (raw + " " + offset, true)
    }
    return (raw, false)
}

func readOne(_ path: String) -> [String: Any] {
    let url = URL(fileURLWithPath: path)
    guard let src = CGImageSourceCreateWithURL(url as CFURL, nil) else {
        return ["path": path, "error": "unreadable"]
    }
    guard let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil)
            as? [String: Any] else {
        return ["path": path, "error": "no properties"]
    }
    var row: [String: Any] = ["path": path]
    let gps = props[kCGImagePropertyGPSDictionary as String] as? [String: Any]
    if let gps = gps {
        let lat = signedDegrees(gps[kCGImagePropertyGPSLatitude as String],
                                gps[kCGImagePropertyGPSLatitudeRef as String],
                                positive: "N")
        let lon = signedDegrees(gps[kCGImagePropertyGPSLongitude as String],
                                gps[kCGImagePropertyGPSLongitudeRef as String],
                                positive: "E")
        // ⛔ BOTH OR NEITHER. Half a coordinate is not a place, and a row
        // carrying one axis would invite a caller to compare against a default
        // for the other — which is a point in the Gulf of Guinea, not an
        // absence.
        if let lat = lat, let lon = lon {
            row["lat"] = lat
            row["lon"] = lon
        }
    }
    let exif = props[kCGImagePropertyExifDictionary as String] as? [String: Any]
    let tiff = props[kCGImagePropertyTIFFDictionary as String] as? [String: Any]
    if let (stamp, hasOffset) = stampOf(exif, tiff) {
        row["when"] = stamp
        row["when_offset_known"] = hasOffset
    }
    return row
}

if args.contains("--self-test") {
    // A caller may confirm the program runs and writes nothing without handing
    // it a single photograph of hers.
    print("{\"ok\":true}")
    exit(0)
}

// ⚠⚠ LOAD-BEARING — THE STDIN READ, copied from the shipped probe together
// with its reason. NOT String(contentsOfFile: "/dev/stdin"): that idiom reads
// NOTHING when standard input is a PIPE, which is exactly what a spawn hands
// over. It only works under shell redirection, which is the only way the
// original research probes were ever run, which is why nobody saw it for
// months. ⛔ A silent zero-work SUCCESS is the worst shape a defect can take,
// because the caller reports a finished pass over an empty answer.
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
