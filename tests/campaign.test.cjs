'use strict';
const assert = require('node:assert/strict');
const C = require('../campaign.js');
let checks = 0, sequence = 0;
function test(name, fn) { fn(); checks++; console.log('✓ ' + name); }
function win(profile, missionId, extra) { return C.recordResult(profile, { missionId, status: 'won', time: 100, baseRatio: 0.8, runId: 'battle-' + (++sequence), ...extra }); }

test('browser global loads without storage, DOM or engine dependencies', () => {
  const vm = require('node:vm'), fs = require('node:fs'), context = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../campaign.js'), 'utf8'), context);
  assert.equal(context.CampaignProgress.totalStars(context.CampaignProgress.createProfile()), 0);
});

test('frontier and classic start unlocked, unknown missions cannot unlock', () => {
  const p = C.createProfile();
  assert.equal(C.isUnlocked(p, 'frontier'), true); assert.equal(C.isUnlocked(p, 'classic'), true);
  for (const id of ['crossroads', 'siege', 'holdout', 'citadel', '__proto__', 'constructor', '', null]) assert.equal(C.isUnlocked(p, id), false);
  assert.equal(C.nextMission(p, 'classic'), 'frontier');
});

test('either second chapter unlocks holdout, then citadel; branches remain replayable', () => {
  for (const branch of ['crossroads', 'siege']) {
    let p = win(C.createProfile(), 'frontier');
    assert.equal(C.isUnlocked(p, 'crossroads'), true); assert.equal(C.isUnlocked(p, 'siege'), true);
    assert.equal(C.isUnlocked(p, 'holdout'), false);
    assert.equal(C.nextMission(p, 'frontier'), 'crossroads');
    p = win(p, branch); assert.equal(C.isUnlocked(p, 'holdout'), true); assert.equal(C.nextMission(p, branch), 'holdout');
    p = win(p, 'holdout'); assert.equal(C.isUnlocked(p, 'citadel'), true); assert.equal(C.nextMission(p, 'holdout'), 'citadel');
    p = win(p, 'citadel'); assert.equal(C.nextMission(p, 'citadel'), branch === 'crossroads' ? 'siege' : 'crossroads');
    p = win(p, branch === 'crossroads' ? 'siege' : 'crossroads');
    assert.equal(C.nextMission(p, 'citadel'), null); assert.equal(C.totalStars(p), 15); assert.equal(p.totalWins, 5);
  }
});

test('star thresholds are inclusive, stars never fall, best time improves independently', () => {
  let p = win(C.createProfile(), 'frontier', { time: 250, baseRatio: 0.2 });
  assert.deepEqual(p.missions.frontier, { stars: 1, bestTime: 250, wins: 1 });
  p = win(p, 'frontier', { time: 200, baseRatio: 0.5 });
  assert.deepEqual(p.missions.frontier, { stars: 3, bestTime: 200, wins: 2 });
  p = win(p, 'frontier', { time: 150, baseRatio: 0.2 });
  assert.deepEqual(p.missions.frontier, { stars: 3, bestTime: 150, wins: 3 });
  p = win(p, 'frontier', { time: 300, baseRatio: 0.1 });
  assert.deepEqual(p.missions.frontier, { stars: 3, bestTime: 150, wins: 4 });
  assert.equal(p.totalWins, 4);
});

test('each campaign mission uses its own speed par', () => {
  let p = C.createProfile();
  for (const [id, par] of [['frontier', 200], ['crossroads', 180], ['siege', 300], ['holdout', 200], ['citadel', 300]]) {
    p = win(p, id, { time: par + 0.01, baseRatio: 0.2 }); assert.equal(p.missions[id].stars, 1);
    p = win(p, id, { time: par, baseRatio: 0.2 }); assert.equal(p.missions[id].stars, 2);
  }
});

test('losses, unfinished battles, locked missions and classic do not record or unlock', () => {
  const p = C.createProfile();
  for (const result of [
    { missionId: 'frontier', status: 'lost' }, { missionId: 'frontier', status: 'playing' },
    { missionId: 'citadel', status: 'won' }, { missionId: 'classic', status: 'won' },
    { missionId: '__proto__', status: 'won' }
  ]) assert.deepEqual(C.recordResult(p, { ...result, runId: 'same', time: 10, baseRatio: 1 }), p);
});

test('terminal saves are idempotent after JSON reload, and recording does not mutate input', () => {
  const p = C.createProfile(), before = JSON.stringify(p);
  const result = { missionId: 'frontier', status: 'won', time: 100, baseRatio: 1, runId: 'persistent-battle' };
  const next = C.recordResult(p, result);
  assert.equal(JSON.stringify(p), before); assert.notEqual(next, p); assert.notEqual(next.missions, p.missions);
  assert.deepEqual(C.recordResult(JSON.stringify(next), result), next);
  for (const badId of [undefined, null, '', '  ', 123, 'a'.repeat(161)]) assert.deepEqual(C.recordResult(p, { ...result, runId: badId }), p);
});

test('malformed profiles, prototype keys and inherited records are discarded', () => {
  for (const raw of [null, undefined, [], 3, false, 'bad JSON', '{}', 'null', '{"version":999}', ' '.repeat(100001)]) assert.deepEqual(C.sanitizeProfile(raw), C.createProfile());
  const poisoned = JSON.parse('{"version":1,"missions":{"__proto__":{"stars":3},"constructor":{"stars":3},"frontier":{"stars":9,"wins":3,"bestTime":24}},"totalWins":99999,"recentResults":["r","r",null]}');
  const clean = C.sanitizeProfile(poisoned);
  assert.deepEqual(Object.keys(clean.missions), ['frontier']); assert.equal(clean.missions.frontier.stars, 3); assert.equal(clean.totalWins, 3); assert.deepEqual(clean.recentResults, ['r']);
  assert.equal(Object.prototype.stars, undefined);
  assert.deepEqual(C.sanitizeProfile({ version: 1, missions: Object.create({ frontier: { stars: 3, wins: 5, bestTime: 5 } }) }).missions, {});
  let touched = false;
  const getter = { version: 1, get missions() { touched = true; throw new Error('must not run'); } };
  assert.deepEqual(C.sanitizeProfile(getter), C.createProfile()); assert.equal(touched, false);
});

test('profile values and recent result history remain bounded', () => {
  const raw = { version: 1, missions: { frontier: { stars: 3, wins: 1e100, bestTime: -10 }, crossroads: { stars: NaN }, siege: { stars: -1 } }, recentResults: Array.from({ length: 1000 }, (_, i) => 'run-' + i) };
  let p = C.sanitizeProfile(raw);
  assert.equal(p.totalWins, 1000000); assert.equal(p.missions.frontier.bestTime, 0); assert.equal(p.recentResults.length, 50); assert.equal(p.recentResults[0], 'run-950');
  p = win(p, 'frontier'); assert.equal(p.totalWins, 1000000); assert.equal(p.recentResults.length, 50);
  for (const time of [NaN, Infinity, undefined, -1, '20']) {
    const badTime = win(C.createProfile(), 'frontier', { time, baseRatio: 0.1 });
    assert.equal(badTime.missions.frontier.stars, 1);
    assert.equal(badTime.missions.frontier.bestTime, 86400);
  }
});

console.log(`\n${checks} campaign tests passed`);
