'use strict';
const assert = require('node:assert/strict');
const C = require('../career.js');
let checks = 0;
function test(name, fn) { fn(); checks++; console.log('✓ ' + name); }
function battle(runId, extra) { return { runId, state: { status: 'won', missionId: 'frontier', time: 65.5, stats: { kills: 12, deployed: 9, eliteKills: 2 }, tactics: { selected: 3 }, bounty: { best: 5 }, ...extra } }; }

test('module loads without browser APIs and creates an empty profile', () => {
  const vm = require('node:vm'), fs = require('node:fs'), context = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../career.js'), 'utf8'), context);
  assert.equal(context.WarCareer.createProfile().wins, 0);
  assert.equal(C.rankForProfile(null).name, '新锐指挥官');
  assert.equal(C.achievementProgress(null).filter(a => a.unlocked).length, 0);
});
test('wins and losses both contribute accurate statistics, without mutating input', () => {
  const initial = C.createProfile(), frozen = JSON.stringify(initial);
  let p = C.recordResult(initial, battle('one'));
  p = C.recordResult(p, battle('two', { status: 'lost' }));
  assert.equal(JSON.stringify(initial), frozen);
  assert.equal(p.wins, 1); assert.equal(p.losses, 1); assert.equal(p.kills, 24);
  assert.equal(p.deployed, 18); assert.equal(p.eliteKills, 4); assert.equal(p.tactics, 6);
  assert.equal(p.bestCombo, 5); assert.equal(p.totalTime, 131);
  assert.deepEqual(p.victories, ['frontier']);
  assert.equal(p.recent.length, 2);
});
test('the same terminal battle remains deduplicated after storage reload', () => {
  const result = battle('persistent-run'), p = C.recordResult(C.createProfile(), result);
  assert.deepEqual(C.recordResult(JSON.stringify(p), result), p);
  assert.deepEqual(C.recordResult(p, battle('persistent-run', { status: 'lost' })), p);
  for (const runId of [null, '', ' ', 3, 'x'.repeat(161)]) assert.deepEqual(C.recordResult(p, battle(runId)), p);
  for (const status of ['playing', 'paused', null, 'win']) assert.deepEqual(C.recordResult(p, battle('unused', { status })), p);
});
test('older battles without bounty or tactical fields record safely', () => {
  const p = C.recordResult(null, { runId: 'old-save', state: { status: 'lost', time: 35, stats: { kills: 4 } } });
  assert.equal(p.losses, 1); assert.equal(p.kills, 4); assert.equal(p.tactics, 0);
  assert.equal(p.bestCombo, 0); assert.equal(p.recent[0].missionId, 'classic');
});
test('achievement thresholds and ranks progress without losing prior achievements', () => {
  let p = C.createProfile();
  const missions = ['frontier', 'crossroads', 'siege', 'holdout', 'citadel'];
  for (let i = 0; i < 10; i++) p = C.recordResult(p, battle('rank-' + i, { missionId: missions[i % 5], stats: { kills: 12, deployed: 10, eliteKills: 2 } }));
  assert.equal(C.rankForProfile(p).name, '战地统领');
  assert.equal(C.rankForProfile(p).remaining, 15);
  assert.equal(C.achievementProgress(p).filter(a => a.unlocked).length, 8);
  p = C.recordResult(p, battle('loss', { status: 'lost', bounty: { best: 1 } }));
  assert.equal(p.bestCombo, 5); assert.equal(C.achievementProgress(p).filter(a => a.unlocked).length, 8);
  assert.equal(C.rankForProfile({ ...p, wins: 25 }).progress, 1);
});
test('malformed data, inherited properties and throwing accessors cannot corrupt profile', () => {
  for (const value of [null, [], 'bad', '{"version":2}', ' '.repeat(1000001)]) assert.deepEqual(C.sanitizeProfile(value), C.createProfile());
  let called = false;
  const raw = { version: 1, get wins() { called = true; throw new Error('should not execute'); }, kills: -3, losses: Infinity, tactics: '2' };
  assert.deepEqual(C.sanitizeProfile(raw), C.createProfile()); assert.equal(called, false);
  assert.equal(C.sanitizeProfile(Object.create({ version: 1, wins: 10 })).wins, 0);
  const invalid = C.recordResult(null, battle('broken', { time: NaN, missionId: '__proto__', stats: { kills: -1, deployed: Infinity, eliteKills: 4 }, bounty: { best: 10 } }));
  assert.equal(invalid.kills, 0); assert.equal(invalid.deployed, 0); assert.equal(invalid.eliteKills, 0); assert.equal(invalid.bestCombo, 0); assert.equal(invalid.totalTime, 0);
  assert.equal(invalid.recent[0].missionId, 'classic');
});
test('history and loaded counters are bounded and mission victories deduplicate', () => {
  const p = C.sanitizeProfile({ version: 1, wins: 1e100, recordedRuns: Array.from({ length: 5200 }, (_, i) => 'r-' + i), victories: ['frontier', 'frontier', '__proto__', 'classic', 'citadel'], recent: [] });
  assert.equal(p.wins, 1000000000); assert.equal(p.recordedRuns.length, 5000);
  assert.equal(p.recordedRuns[0], 'r-200'); assert.deepEqual(p.victories, ['frontier', 'citadel']);
  let history = C.createProfile();
  for (let i = 0; i < 8; i++) history = C.recordResult(history, battle('recent-' + i));
  assert.equal(history.recent.length, 6); assert.equal(history.recent[0].runId, 'recent-2');
});

console.log(`\n${checks} career tests passed`);
