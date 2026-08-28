#!/usr/bin/env node
'use strict';
/* UPD-05 / map #148 — quiet what's-new line truth table.
 *
 * Truth table (D-09 / #148):
 *   upgrade once  → show (stamped date ≠ last remembered; stamp present;
 *                   stamp newer than remembered)
 *   first run     → SILENT (no remembered); memory becomes stamp if present
 *   dev (no stamp)→ SILENT
 *   downgrade     → SILENT; memory still updates to stamp
 *
 * DOM id pinned: update-whats-new-line
 * OWNER_COPY_* empty until plan 06 sitting — never invent her prose.
 *
 * Policy is computed server-side (study_lib); this suite drives it under a
 * throwaway HOME and pins the client mount + empty copy slot.
 *
 * No live key. No network.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const QUIET_LINE_ID = 'update-whats-new-line';
const OWNER_COPY_QUIET_LINE = 'See what changed in this update.';

let failures = 0;
function fail(msg) {
  console.log('  FAIL ' + msg);
  failures++;
}
function ok(cond, msg) {
  if (cond) console.log('  ok   ' + msg);
  else fail(msg);
}

console.log('-- UPD-05 quiet-line truth table ------------------------------');

const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const serverSrc = fs.readFileSync(path.join(ROOT, 'server.py'), 'utf8');
const libSrc = fs.readFileSync(path.join(ROOT, 'study_lib.py'), 'utf8');

ok(OWNER_COPY_QUIET_LINE === 'See what changed in this update.',
  'OWNER_COPY_QUIET_LINE pins owner sitting (D-10)');

ok(app.includes("OWNER_COPY_QUIET_WHATS_NEW = 'See what changed in this update.'"),
  'app.js client mirror matches owner quiet line');
ok(/OWNER_COPY_QUIET_WHATS_NEW\s*=\s*"See what changed in this update\."/.test(serverSrc),
  'server OWNER_COPY_QUIET_WHATS_NEW pins owner sitting');

ok(libSrc.indexOf('def compute_show_whats_new') !== -1 ||
    libSrc.indexOf('def should_show_whats_new') !== -1,
  'study_lib exposes show-whats-new policy helper');
ok(libSrc.indexOf('last_run_version') !== -1,
  'last_run_version lives under settings home');

const hasId = app.includes(QUIET_LINE_ID) || html.includes(QUIET_LINE_ID);
ok(hasId, '#' + QUIET_LINE_ID + ' mount present in sources');
ok(app.indexOf('show_whats_new') !== -1,
  'client reads server show_whats_new policy bit');

function drivePolicy(casesJson) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'studyroom-quiet-'));
  const py = `
import json, os, sys, tempfile
from pathlib import Path
os.environ["HOME"] = ${JSON.stringify(home)}
sys.path.insert(0, ${JSON.stringify(ROOT)})
import study_lib

cases = json.loads(${JSON.stringify(JSON.stringify(casesJson))})
out = []
for c in cases:
    tip = study_lib.last_run_version_path()
    if tip.exists():
        tip.unlink()
    remembered = c.get("remembered")
    if remembered is not None:
        study_lib.ensure_room_config_dir()
        tip.write_text(remembered + "\\n", encoding="utf-8")
    stamp = c.get("stamp")
    show = study_lib.compute_show_whats_new(stamp, study_lib.read_last_run_version())
    study_lib.remember_release_stamp(stamp)
    after = study_lib.read_last_run_version()
    out.append({"name": c["name"], "show": show, "after": after})
print(json.dumps(out))
`;
  const r = spawnSync('python3', ['-c', py], {
    encoding: 'utf8',
    env: Object.assign({}, process.env, { HOME: home }),
  });
  try {
    fs.rmSync(home, { recursive: true, force: true });
  } catch (_) { /* ignore */ }
  if (r.status !== 0) {
    return { err: (r.stderr || r.stdout || 'python failed').trim() };
  }
  try {
    return { rows: JSON.parse(r.stdout.trim()) };
  } catch (e) {
    return { err: 'bad json: ' + r.stdout };
  }
}

const cases = [
  { name: 'upgrade', stamp: '2026-09-01', remembered: '2026-08-01',
    expectShow: true, expectAfter: '2026-09-01' },
  { name: 'first', stamp: '2026-09-01', remembered: null,
    expectShow: false, expectAfter: '2026-09-01' },
  { name: 'missing-stamp', stamp: null, remembered: '2026-08-01',
    expectShow: false, expectAfter: '2026-08-01' },
  { name: 'downgrade', stamp: '2026-07-01', remembered: '2026-08-01',
    expectShow: false, expectAfter: '2026-07-01' },
  { name: 'same', stamp: '2026-09-01', remembered: '2026-09-01',
    expectShow: false, expectAfter: '2026-09-01' },
];

const driven = drivePolicy(cases);
if (driven.err) {
  fail('NOT_YET: quiet-line policy helpers — ' + driven.err.split('\n')[0]);
} else {
  const byName = {};
  driven.rows.forEach(function (row) { byName[row.name] = row; });
  cases.forEach(function (c) {
    const row = byName[c.name];
    if (!row) {
      fail(c.name + ': missing result row');
      return;
    }
    ok(row.show === c.expectShow,
      c.name + ': show=' + row.show + ' (want ' + c.expectShow + ')');
    ok(row.after === c.expectAfter,
      c.name + ': remembered after=' + JSON.stringify(row.after) +
        ' (want ' + JSON.stringify(c.expectAfter) + ')');
  });
}

if (failures > 0) {
  console.log('\n' + failures + ' failure(s)');
  process.exit(1);
}
console.log('\nOK');
process.exit(0);
