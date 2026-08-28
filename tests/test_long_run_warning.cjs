#!/usr/bin/env node
/**
 * #171 launch blocker 3 — her long-run warning is one shared sentence,
 * shown before every long door (folder import, whole-vault, adapter collect).
 * Words are hers 2026-08-28 shape B — byte-exact.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..', 'app.js');
const appSrc = fs.readFileSync(APP, 'utf8');

const HER_WARNING =
  'This next part can run for an evening or more than a day. ' +
  'I don\u2019t know which yet. I\u2019ll keep going until it\u2019s done.';

const violations = [];

if (!appSrc.includes("OWNER_COPY_LONG_RUN_WARNING")) {
  violations.push('OWNER_COPY_LONG_RUN_WARNING missing from app.js');
}

// Reconstruct the constant the way app.js builds it (two string parts + \u2019).
const constMatch = appSrc.match(
  /var OWNER_COPY_LONG_RUN_WARNING\s*=\s*((?:'[^']*'\s*\+\s*)*'[^']*'\s*;)/);
if (!constMatch) {
  violations.push('OWNER_COPY_LONG_RUN_WARNING declaration not found');
} else {
  let built;
  try {
    built = Function('"use strict"; return (' +
      constMatch[1].replace(/;$/, '') + ')')();
  } catch (e) {
    violations.push('could not eval OWNER_COPY_LONG_RUN_WARNING: ' + e.message);
    built = null;
  }
  if (built !== null && built !== HER_WARNING) {
    violations.push(
      'OWNER_COPY_LONG_RUN_WARNING drifted from her sentence.\n' +
      '  got:  ' + JSON.stringify(built) + '\n' +
      '  want: ' + JSON.stringify(HER_WARNING));
  }
}

function functionBody(name) {
  const re = new RegExp('function\\s+' + name + '\\s*\\(');
  const m = re.exec(appSrc);
  if (!m) { return null; }
  let i = m.index + m[0].length;
  // find opening brace of function
  while (i < appSrc.length && appSrc[i] !== '{') { i++; }
  if (appSrc[i] !== '{') { return null; }
  let depth = 0;
  const start = i;
  for (; i < appSrc.length; i++) {
    const c = appSrc[i];
    if (c === '{') { depth++; }
    else if (c === '}') {
      depth--;
      if (depth === 0) { return appSrc.slice(start, i + 1); }
    }
  }
  return null;
}

if (!/function\s+warnBeforeLongRun\s*\(/.test(appSrc)) {
  violations.push('warnBeforeLongRun helper missing');
}

['runImport', 'confirmVaultImport', 'runAdapterCollect'].forEach(function (name) {
  const body = functionBody(name);
  if (!body) {
    violations.push(name + ' not found');
    return;
  }
  if (!/warnBeforeLongRun\s*\(/.test(body)) {
    violations.push(name + ' must call warnBeforeLongRun before starting');
  }
});

// The old false promise must not survive on the folder-import door.
const runBody = functionBody('runImport') || '';
if (/may take a minute/.test(runBody)) {
  violations.push('runImport still says "may take a minute" — replaced by her warning');
}

if (violations.length) {
  console.error('test_long_run_warning FAIL');
  violations.forEach(function (v) { console.error('  - ' + v); });
  process.exit(1);
}
console.log('test_long_run_warning OK');
