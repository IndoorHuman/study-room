#!/usr/bin/env node
'use strict';
/* UPD-15 / UPD-18 (26.9997, D-10, D-11, D-17, D-18): the Update button, the
 * consent question, the Manage switch, and the six sentence slots.
 *
 * Wave-0 Nyquist instrument. At the commit that adds it none of the six
 * OWNER_COPY slots exist in server.py or app.js, so it prints FAIL lines
 * and exits 1. Plan 26.9997-02 lands the consent slots, plan 26.9997-04 the
 * button, failed line and switch; plan 26.9997-06 (her 2026-08-30 sitting)
 * adopted every string below verbatim as her words. The pins hold hers.
 *
 * Pins:
 *   - each of the six slots declared ONCE here, present byte-for-byte in
 *     server.py, and (except the ASK, which travels in the status payload)
 *     byte-for-byte in app.js; non-empty; free of U+2014 (2026-08-30 re-ruling)
 *   - server.py status field names avoid the forbidden names the behind
 *     prompt suite already repeats (never `updateAvailable` and friends)
 *   - app.js mounts #update-install-button only under update_install_ready
 *   - app.js carries .update-consent-answer buttons and #update-check-switch
 *   - the three terminal fields still ride the behind payload (D-11)
 *   - app.js never uses the banned timer token; the regex is READ from
 *     tests/test_no_push.cjs FORBIDDEN_TOKENS, never retyped here
 *   - status: update_install_ready true only when behind AND consented;
 *     update_consent_ask present only while unasked and stamped
 *
 * No live key. No network (the spawned status drive fakes the transport).
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const QUIET_LINE_ID = 'update-whats-new-line';
const UPDATE_CLI_TEMPLATE =
  'python3 tools/update_room.py --source DOWNLOADED --dest APP_FOLDER';

// The six slots, declared ONCE. Her words, adopted verbatim at the
// 2026-08-30 sitting (plan 06); a slot value must never be empty (an empty
// ask renders nothing).
const SLOTS = {
  OWNER_COPY_UPDATE_CONSENT_ASK:
    'May this room ask GitHub once a day whether a newer version exists? ' +
    'Nothing of yours is sent.',
  OWNER_COPY_UPDATE_CONSENT_YES: 'yes',
  OWNER_COPY_UPDATE_CONSENT_NO: 'no',
  OWNER_COPY_UPDATE_BUTTON: 'Update',
  OWNER_COPY_UPDATE_FAILED:
    'Nothing changed. The old copy is still in place. To update by hand, ' +
    'use Terminal from your app folder:',
  OWNER_COPY_UPDATE_SWITCH_LABEL: 'Ask GitHub once a day for a newer version'
};
// The one slot that does not need an app.js mirror: the question travels in
// the status payload from the server constant (the base_consent precedent).
const SERVER_ONLY = { OWNER_COPY_UPDATE_CONSENT_ASK: true };

let failures = 0;
function fail(msg) {
  console.log('  FAIL ' + msg);
  failures++;
}
function ok(cond, msg) {
  if (cond) console.log('  ok   ' + msg);
  else fail(msg);
}

console.log('-- UPD-15/18 update button, consent, switch, slots ------------');

const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const serverSrc = fs.readFileSync(path.join(ROOT, 'server.py'), 'utf8');
const noPushSrc = fs.readFileSync(path.join(ROOT, 'tests/test_no_push.cjs'), 'utf8');

// ---- the six slots -------------------------------------------------------

Object.keys(SLOTS).forEach(function (name) {
  const value = SLOTS[name];
  ok(typeof value === 'string' && value.length > 0,
    name + ' (her word, 2026-08-30) is non-empty');
  ok(value.indexOf('\u2014') === -1,
    name + ' carries no em dash (U+2014, 2026-08-30 re-ruling)');
  ok(serverSrc.indexOf(name) !== -1,
    'server.py declares ' + name);
  ok(serverSrc.indexOf(value) !== -1,
    'server.py carries ' + name + ' byte-for-byte');
  if (!SERVER_ONLY[name]) {
    ok(app.indexOf(name) !== -1,
      'app.js declares ' + name);
    ok(app.indexOf(value) !== -1,
      'app.js carries ' + name + ' byte-for-byte');
  }
});

// ---- forbidden field names (the behind-prompt suite's list, repeated) ----

const forbiddenNames = ['check for updates', 'checkForUpdates', 'auto-update',
  'downloadUpdate', 'updateAvailable'];
forbiddenNames.forEach(function (tok) {
  ok(serverSrc.toLowerCase().indexOf(tok.toLowerCase()) === -1,
    'server status field names avoid forbidden token: ' + tok);
});

// ---- the timer token, read from the gate, never retyped ------------------

(function () {
  const m = noPushSrc.match(/name:\s*'setInterval\('\s*,\s*re:\s*\/([^\n]*?)\/i\s*\}/);
  if (!m) {
    fail('tests/test_no_push.cjs no longer carries the timer token; D-04 is unenforced');
    return;
  }
  const timerRe = new RegExp(m[1], 'i');
  ok(!timerRe.test(app), 'app.js uses no timer (the poll is a chained one-shot)');
  ok(noPushSrc.indexOf("name: 'sched'") !== -1 && noPushSrc.indexOf("name: 'cron'") !== -1,
    'tests/test_no_push.cjs still bans sched and cron');
}());

// ---- the button, the answers, the switch ---------------------------------

ok(app.indexOf('update-install-button') !== -1,
  'app.js mounts #update-install-button');
ok(/update_install_ready[\s\S]{0,600}update-install-button/.test(app),
  'app.js mounts #update-install-button only under update_install_ready');
ok(app.indexOf('update-consent-answer') !== -1,
  'app.js carries .update-consent-answer buttons');
ok(app.indexOf('data-answer') !== -1,
  'answer buttons carry their token on a data attribute');
ok(app.indexOf('update-check-switch') !== -1,
  'app.js carries #update-check-switch on the Manage screen');
ok(app.indexOf('/api/update/consent') !== -1,
  'app.js posts the answer to /api/update/consent');
ok(app.indexOf('/api/update/install') !== -1,
  'app.js posts the tap to /api/update/install');
ok(app.indexOf('update_consent_ask') !== -1,
  'app.js reads update_consent_ask from status');
ok(app.indexOf('update_result') !== -1,
  'app.js reads update_result from status (the ONE failed line)');
ok(app.indexOf(QUIET_LINE_ID) !== -1,
  '#' + QUIET_LINE_ID + ' host still carries the line');
ok(app.indexOf('insertBefore(el, toolbar.nextSibling)') !== -1,
  '#update-whats-new-line still mounts below .room-toolbar');

ok(serverSrc.indexOf('update_consent_state') !== -1 &&
    serverSrc.indexOf('update_consent_ask') !== -1 &&
    serverSrc.indexOf('update_install_ready') !== -1 &&
    serverSrc.indexOf('update_result') !== -1,
  'server.py status carries the four new fields');
ok(serverSrc.indexOf('/api/update/consent') !== -1 &&
    serverSrc.indexOf('/api/update/install') !== -1,
  'server.py dispatches both update routes');

// ---- the spawned status drive -------------------------------------------

// D-02-A (deferred from plan 02, fixed here): JSON.stringify(null) emits
// the bare word null, which is a Python NameError inside the spawned body,
// so the unasked and dev-tree drives died before handle_status ever ran.
// A null argument must land as None.
function pyLit(x) { return x === null ? 'None' : JSON.stringify(x); }

function statusDrive(localStamp, latestStamp, consent) {
  const py = `
import json, os, sys, tempfile
from pathlib import Path
from unittest import mock
os.environ["HOME"] = ${JSON.stringify(require('os').tmpdir() + '/studyroom-update-button-')}
import study_lib
import server

home = tempfile.mkdtemp(prefix="studyroom-update-button-")
os.environ["HOME"] = home
tree = Path(tempfile.mkdtemp(prefix="studyroom-update-button-tree-"))
try:
    # Never a real request from this drive: fake the seam whether or not
    # the product code exists yet.
    study_lib._update_transport = lambda *a, **k: (None, {}, b"")
    if ${pyLit(localStamp)}:
        (tree / "RELEASE_DATE").write_text(${pyLit(localStamp)} + "\\n", encoding="utf-8")
    if ${pyLit(latestStamp)}:
        study_lib.write_latest_release_date(${pyLit(latestStamp)})
    if ${pyLit(consent)} and hasattr(study_lib, "record_update_consent"):
        study_lib.record_update_consent(${pyLit(consent)})

    class FakeServer(object):
        def __init__(self):
            self.library_root = Path(home) / "lib"
            self.library_root.mkdir(exist_ok=True)

    class StatusFake(object):
        def __init__(self):
            self.answer = None
            self.server = FakeServer()
        def store_or_fresh(self):
            return {"schema_version": study_lib.SCHEMA_VERSION, "meta": {}, "items": {}}
        def json_response(self, data, code=200):
            self.answer = data
            return data

    fake = StatusFake()
    with mock.patch.object(server, "REPO_ROOT", tree):
        server.StudyHandler.handle_status(fake)
    print(json.dumps(fake.answer))
finally:
    import shutil
    shutil.rmtree(tree, ignore_errors=True)
    shutil.rmtree(home, ignore_errors=True)
`;
  const r = spawnSync('python3', ['-c', py], { encoding: 'utf8', cwd: ROOT });
  if (r.status !== 0) {
    return { err: (r.stderr || r.stdout || 'python failed').trim() };
  }
  try {
    return { data: JSON.parse(r.stdout.trim()) };
  } catch (e) {
    return { err: 'bad json: ' + r.stdout };
  }
}

const consented = statusDrive('2026-08-01', '2026-09-01', 'yes');
if (consented.err) {
  fail('status drive (consented): ' + consented.err.split('\n')[0]);
} else {
  const d = consented.data;
  ok(d.show_update_prompt === true, 'status: behind -> show_update_prompt true');
  ok(d.update_install_ready === true,
    'status: behind AND consented -> update_install_ready true');
  ok(d.update_consent_state === 'consented',
    'status: update_consent_state reads consented');
  ok(d.update_consent_ask === undefined || d.update_consent_ask === null,
    'status: no question once answered');
  ok(d.update_cli === UPDATE_CLI_TEMPLATE &&
      typeof d.update_skill_install === 'string' &&
      typeof d.update_agent_prompt === 'string',
    'status: the three terminal fields still ride the behind payload (D-11)');
  ok(d.update_command === undefined, 'status: no legacy update_command field');
  ok(d.show_whats_new === false, 'status: show_whats_new false when behind wins');
}

const unasked = statusDrive('2026-08-01', '2026-09-01', null);
if (unasked.err) {
  fail('status drive (unasked): ' + unasked.err.split('\n')[0]);
} else {
  const d = unasked.data;
  ok(d.update_install_ready !== true,
    'status: behind but unasked -> update_install_ready not true');
  ok(d.update_consent_state === 'unasked',
    'status: update_consent_state reads unasked');
  ok(d.update_consent_ask === SLOTS.OWNER_COPY_UPDATE_CONSENT_ASK,
    'status: the question travels in the payload while unasked');
  ok(d.update_cli === UPDATE_CLI_TEMPLATE,
    'status: terminal path still offered while unasked (D-11)');
}

const dev = statusDrive(null, '2026-09-01', 'yes');
if (dev.err) {
  fail('status drive (dev tree): ' + dev.err.split('\n')[0]);
} else {
  const d = dev.data;
  ok(d.update_install_ready !== true,
    'status: an unstamped tree never offers an install (D-09)');
  ok(d.update_consent_ask === undefined || d.update_consent_ask === null,
    'status: an unstamped tree never asks the question (D-09)');
  ok(d.update_consent_state === null || d.update_consent_state === undefined,
    'status: update_consent_state is null on a dev tree');
}

if (failures > 0) {
  console.log('\n' + failures + ' failure(s)');
  process.exit(1);
}
console.log('\nOK');
process.exit(0);
