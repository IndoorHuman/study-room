#!/usr/bin/env node
'use strict';
/* UPD-09 / gap closure — behind-latest prompt in #update-whats-new-line.
 *
 * Pins:
 *   - OWNER_COPY_UPDATE_PROMPT framing (D-10) + provider-neutral CLI/agent fields
 *   - update_cli + update_agent_prompt status fields (no Cursor-only slash cmd)
 *   - show_update_prompt wins over show_whats_new (mutual exclusion)
 *   - client behind branch + stronger styling vs quiet line
 *   - no UPD-09 forbidden tokens in new field names
 *
 * No live key. No network.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const QUIET_LINE_ID = 'update-whats-new-line';
const UPDATE_CLI_TEMPLATE =
  'python3 tools/update_room.py --source DOWNLOADED --dest APP_FOLDER';
const UPDATE_AGENT_PROMPT =
  'Update my Study Room: quit server.py first, then run ' +
  'python3 tools/update_room.py --source [downloaded folder] ' +
  '--dest [live app folder].';
const OWNER_COPY_UPDATE_PROMPT =
  'A newer version is ready — in Terminal, from your app folder:';

let failures = 0;
function fail(msg) {
  console.log('  FAIL ' + msg);
  failures++;
}
function ok(cond, msg) {
  if (cond) console.log('  ok   ' + msg);
  else fail(msg);
}

console.log('-- UPD-09 behind-latest prompt --------------------------------');

const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const serverSrc = fs.readFileSync(path.join(ROOT, 'server.py'), 'utf8');
const noPushSrc = fs.readFileSync(path.join(ROOT, 'tests/test_no_push.cjs'), 'utf8');

ok(app.indexOf(OWNER_COPY_UPDATE_PROMPT) !== -1,
  'app.js carries OWNER_COPY_UPDATE_PROMPT framing');

ok(serverSrc.indexOf(OWNER_COPY_UPDATE_PROMPT) !== -1,
  'server.py exposes OWNER_COPY_UPDATE_PROMPT framing');

ok(app.indexOf('insertBefore(el, toolbar.nextSibling)') !== -1,
  '#update-whats-new-line mounts below .room-toolbar, not inside it');

ok(serverSrc.indexOf('UPDATE_CLI_TEMPLATE') !== -1,
  'server.py pins UPDATE_CLI_TEMPLATE constant');

ok(serverSrc.indexOf('UPDATE_AGENT_PROMPT') !== -1,
  'server.py pins UPDATE_AGENT_PROMPT constant');

ok(serverSrc.indexOf('update_cli') !== -1 &&
    serverSrc.indexOf('update_agent_prompt') !== -1,
  'handle_status includes update_cli + update_agent_prompt when behind');

ok(serverSrc.indexOf('update_command') === -1,
  'server.py no longer exposes Cursor-only update_command field');

ok(app.indexOf('/visualroom-update') === -1,
  'app.js does not hardcode Cursor-only /visualroom-update fallback');

ok(/if\s+show_update_prompt[\s\S]{0,120}show_whats_new\s*=\s*False/.test(serverSrc) ||
    /if\s+show_update_prompt[\s\S]{0,200}show_whats_new\s*=\s*false/.test(serverSrc),
  'server mutual exclusion: behind prompt suppresses show_whats_new');

ok(app.indexOf('show_update_prompt') !== -1,
  'client reads show_update_prompt from status');

ok(app.indexOf('update_cli') !== -1 && app.indexOf('update_agent_prompt') !== -1,
  'client reads update_cli + update_agent_prompt from status');

ok(app.indexOf('OWNER_COPY_UPDATE_AGENT') !== -1,
  'client mounts agent paste lead line');

ok(app.indexOf('update-behind-prompt') !== -1,
  'client behind branch uses update-behind-prompt class discriminator');

ok(app.indexOf('font-weight:500') !== -1 &&
    app.indexOf('var(--ink)') !== -1 &&
    app.indexOf('show_update_prompt') !== -1,
  'client behind branch uses stronger styling than quiet line');

ok(app.indexOf(QUIET_LINE_ID) !== -1,
  '#' + QUIET_LINE_ID + ' host reused for behind prompt');

ok(fs.existsSync(path.join(ROOT, 'UPDATE-GUIDE.md')),
  'UPDATE-GUIDE.md ships for GitHub walkthrough');

ok(fs.existsSync(path.join(ROOT, 'skills/visualroom-update/SKILL.md')),
  'portable visualroom-update skill ships in repo');

// Forbidden-token gate on new status field names (not owner copy).
const forbiddenNames = ['check for updates', 'checkForUpdates', 'auto-update',
  'downloadUpdate', 'updateAvailable'];
forbiddenNames.forEach(function (tok) {
  ok(serverSrc.toLowerCase().indexOf(tok.toLowerCase()) === -1,
    'server status field names avoid forbidden token: ' + tok);
});

ok(noPushSrc.indexOf('APP_SOURCES') !== -1,
  'test_no_push.cjs gate still present for regression');

function statusBehind(localStamp, latestStamp) {
  const py = `
import json, os, sys, tempfile
from pathlib import Path
from unittest import mock
os.environ["HOME"] = ${JSON.stringify(require('os').tmpdir() + '/studyroom-behind-status-')}
import study_lib
import server

home = tempfile.mkdtemp(prefix="studyroom-behind-status-")
os.environ["HOME"] = home
tree = Path(tempfile.mkdtemp(prefix="studyroom-behind-tree-"))
try:
    if ${JSON.stringify(localStamp)}:
        (tree / "RELEASE_DATE").write_text(${JSON.stringify(localStamp)} + "\\n", encoding="utf-8")
    if ${JSON.stringify(latestStamp)}:
        study_lib.write_latest_release_date(${JSON.stringify(latestStamp)})

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
  const r = spawnSync('python3', ['-c', py], {
    encoding: 'utf8',
    cwd: ROOT,
  });
  if (r.status !== 0) {
    return { err: (r.stderr || r.stdout || 'python failed').trim() };
  }
  try {
    return { data: JSON.parse(r.stdout.trim()) };
  } catch (e) {
    return { err: 'bad json: ' + r.stdout };
  }
}

const behind = statusBehind('2026-08-01', '2026-09-01');
if (behind.err) {
  fail('status behind runtime: ' + behind.err.split('\n')[0]);
} else {
  ok(behind.data.show_update_prompt === true,
    'status: local behind → show_update_prompt true');
  ok(behind.data.update_cli === UPDATE_CLI_TEMPLATE,
    'status: update_cli present when behind');
  ok(behind.data.update_agent_prompt === UPDATE_AGENT_PROMPT,
    'status: update_agent_prompt present when behind');
  ok(behind.data.update_command === undefined,
    'status: no legacy update_command field');
  ok(behind.data.show_whats_new === false,
    'status: show_whats_new false when behind wins');
}

if (failures > 0) {
  console.log('\n' + failures + ' failure(s)');
  process.exit(1);
}
console.log('\nOK');
process.exit(0);
