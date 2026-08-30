#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function readSurveyUrl(libRoot) {
  const p = path.join(libRoot, 'survey_url.txt');
  if (!fs.existsSync(p)) return null;
  const u = fs.readFileSync(p, 'utf8').trim();
  return u.startsWith('https://') ? u : null;
}

const mvp = path.join(ROOT, 'MyNotes');
const url = readSurveyUrl(mvp);
assert.ok(url && url.startsWith('https://'), 'mvp survey_url.txt must be https');
assert.ok(fs.existsSync(path.join(mvp, 'items', 'survey-wall-invite.md')));
const layout = JSON.parse(fs.readFileSync(path.join(mvp, 'layout.json'), 'utf8'));
assert.deepStrictEqual(layout.objects['survey-poster'], {x: 300, y: 36});

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
assert.ok(html.includes('id="room-obj-survey-poster"'), 'poster in index.html');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
assert.ok(app.includes('applySurveyPosterFromStatus'), 'client applies status');
assert.ok(app.includes("'survey-poster'"), 'poster in ROOM_OBJECT_IDS / FUNCTIONAL');

const server = fs.readFileSync(path.join(ROOT, 'server.py'), 'utf8');
assert.ok(server.includes('"survey-poster"'), 'LAYOUT_OBJECTS knows poster');
assert.ok(server.includes('survey_url'), 'status exposes survey_url');

console.log('OK test_survey_wall_invite.cjs');
