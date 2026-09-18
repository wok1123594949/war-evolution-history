'use strict';
const assert = require('node:assert/strict');
const { ERAS, Engine } = require('../engine.js');
let checks = 0;
function test(name, fn) { fn(); checks++; console.log('✓ ' + name); }
function run(engine, seconds) { for (let i = 0; i < Math.round(seconds * 60); i++) engine.step(1 / 60); }
function unit(engine, side, era, kind, x) {
  // Use the real factory, then move its result to a controlled battlefield position.
  const created = engine._spawnFromQueue({ side, era, kind });
  assert.equal(created, true);
  const u = engine.state.units[engine.state.units.length - 1];
  u.x = x; u.attackTimer = 0; return u;
}
function noAI(engine) { engine.state.enemyTimer = 999; engine.state.nextEnemyWave = 999; engine.state.bases.enemy.turrets = 0; }

test('browser global works without modules or dependencies', () => {
  const vm = require('node:vm'), fs = require('node:fs');
  const context = {}; vm.runInNewContext(fs.readFileSync(require.resolve('../engine.js'), 'utf8'), context);
  const e = new context.WarEngine.Engine({ seed: 1 });
  assert.equal(e.deploy(0).ok, true); e.step(1 / 60); assert.ok(e.state.time > 0);
});

test('five eras, three roles, artillery range, medieval names', () => {
  assert.equal(ERAS.length, 5);
  assert.equal(ERAS.every(e => e.units.length === 3), true);
  assert.deepEqual(ERAS[1].units.map(u => u.name), ['长剑卫士', '长弓手', '重骑士']);
  assert.ok(ERAS[2].units[2].range > 200);
  assert.ok(ERAS[3].units[2].range > ERAS[2].units[2].range);
});

test('training is serial, player-only, capped at five and charges once', () => {
  const e = new Engine({ seed: 7 }); noAI(e); e.state.gold = 1000;
  for (let i = 0; i < 5; i++) assert.equal(e.deploy(0).ok, true);
  const spent = e.state.gold;
  assert.equal(e.deploy(0).ok, false); assert.equal(e.state.gold, spent);
  assert.equal(e.deploy(99).ok, false); assert.equal(e.deploy(0.5).ok, false);
  e._enemyDeploy(1);
  assert.equal(e.state.queue.length, 5); assert.equal(e.state.enemyQueue.length, 1);
  run(e, ERAS[0].units[0].trainTime + 0.1);
  assert.equal(e.state.queue.length, 4);
  assert.equal(e.state.units.filter(u => u.side === 'player').length, 1);
});

test('pause freezes all state; every gameplay action is rejected', () => {
  const e = new Engine({ seed: 9 }); e.deploy(0); run(e, 2); e.togglePause();
  const frozen = e.serialize(); run(e, 5); assert.equal(e.serialize(), frozen);
  for (const action of ['deploy', 'evolve', 'buyTurret', 'repair', 'special', 'setSpeed']) assert.equal(e[action](0).ok, false, action);
  assert.equal(e.togglePause().ok, true); run(e, 1); assert.ok(e.state.time > 2);
});

test('speed doubles simulation while invalid or giant frame deltas stay bounded', () => {
  const normal = new Engine({ seed: 1 }), fast = new Engine({ seed: 1 }); fast.setSpeed(2);
  run(normal, 5); run(fast, 5); assert.ok(Math.abs(fast.state.time - normal.state.time * 2) < 1e-8);
  const time = normal.state.time; normal.step(NaN); normal.step(Infinity); normal.step(-1); assert.equal(normal.state.time, time);
  normal.step(900); assert.ok(normal.state.time - time <= 0.251);
});

test('evolution consumes experience once and repairs/increases base health', () => {
  const e = new Engine({ seed: 3 }); assert.equal(e.evolve().ok, false);
  for (let i = 0; i < 4; i++) { const baseMax = e.state.bases.player.maxHp; e.state.xp = ERAS[i].xpRequired; assert.equal(e.evolve().ok, true); assert.equal(e.state.xp, 0); assert.ok(e.state.bases.player.maxHp > baseMax); }
  assert.equal(e.evolve().ok, false); assert.equal(e.state.era, 4);
});

test('melee passes its own ranged rear line; same formation preserves spacing', () => {
  const e = new Engine({ seed: 11 }); noAI(e);
  const archer = unit(e, 'player', 0, 1, 650), melee = unit(e, 'player', 0, 0, 620);
  unit(e, 'enemy', 0, 2, 880);
  run(e, 1.2); assert.ok(melee.x > archer.x + 8, `${melee.x} vs ${archer.x}`);
  const e2 = new Engine({ seed: 12 }); noAI(e2);
  const lead = unit(e2, 'player', 0, 0, 700), back = unit(e2, 'player', 0, 0, 660); lead.speed = 10; back.speed = 100;
  run(e2, 3); assert.ok(lead.x - back.x >= lead.radius + back.radius + 7.99);
});

test('defenders block base attacks; dead targets cannot award twice', () => {
  const e = new Engine({ seed: 8 }); noAI(e);
  const attacker = unit(e, 'player', 2, 1, 1160), defender = unit(e, 'enemy', 0, 0, 1390);
  assert.equal(e._unitBaseAttack(attacker, 'enemy'), false);
  const hp = e.state.bases.enemy.hp; e._unitAttack(attacker, defender); e._stepProjectiles(1);
  assert.equal(e.state.bases.enemy.hp, hp);
  e._damageUnit(defender, 999, 'player'); const gold = e.state.gold, kills = e.state.stats.kills;
  e._damageUnit(defender, 999, 'player'); assert.equal(e.state.gold, gold); assert.equal(e.state.stats.kills, kills); assert.equal(kills, 1);
});

test('artillery projectile damages several enemies with one impact', () => {
  const e = new Engine({ seed: 4 }); noAI(e);
  const cannon = unit(e, 'player', 2, 2, 600), one = unit(e, 'enemy', 2, 0, 790), two = unit(e, 'enemy', 2, 0, 845);
  e._unitAttack(cannon, one);
  assert.equal(e.state.projectiles.length, 1); assert.ok(e.state.projectiles[0].splash > 0);
  for (let i = 0; i < 80; i++) e._stepProjectiles(1 / 60);
  assert.ok(one.hp < one.maxHp); assert.ok(two.hp < two.maxHp);
  assert.ok(e.state.effects.some(fx => fx.type === 'explosion'));
});

test('turret levels improve damage and fire rate; repair observes cooldown', () => {
  const e = new Engine({ seed: 4 }); noAI(e); e.state.gold = 3000; unit(e, 'enemy', 4, 2, 430);
  assert.equal(e.buyTurret().ok, true); e._turretFire('player', 0.1);
  const damage1 = e.state.projectiles[0].damage, interval1 = e.state.turretTimers.player;
  e.buyTurret(); e.buyTurret(); assert.equal(e.buyTurret().ok, false);
  e.state.turretTimers.player = 0; e._turretFire('player', 0.1);
  assert.ok(e.state.projectiles.at(-1).damage > damage1); assert.ok(e.state.turretTimers.player < interval1);
  assert.equal(e.repair().ok, false); e.state.bases.player.hp -= 1000;
  assert.equal(e.repair().ok, true); assert.equal(e.repair().ok, false);
});

test('special damage resolves rewards and terminal victory immediately', () => {
  const e = new Engine({ seed: 4 }); noAI(e);
  const enemy = unit(e, 'enemy', 0, 1, 1380); e.state.bases.enemy.hp = 30;
  assert.equal(e.special(1380).ok, true); assert.equal(enemy.dead, true); assert.equal(e.state.stats.kills, 1); assert.equal(e.state.status, 'won');
  const frozen = e.serialize(); run(e, 5); assert.equal(e.serialize(), frozen);
  for (const action of ['deploy', 'evolve', 'buyTurret', 'repair', 'special', 'setSpeed', 'togglePause']) assert.equal(e[action](0).ok, false, action);
  const loss = new Engine({ seed: 4 }); loss.state.bases.player.hp = 0; run(loss, 0.1); assert.equal(loss.state.status, 'lost');
});

test('save resumes deterministic battle including clocks, queue, projectiles and RNG', () => {
  const a = new Engine({ seed: 123 }); a.state.gold = 3000; a.buyTurret();
  for (let i = 0; i < 100 * 60; i++) { if (i % 300 === 0) a.deploy((i / 300) % 3); a.step(1 / 60); }
  a.step(0.019); a.deploy(1);
  const b = Engine.fromSave(a.serialize()); assert.deepEqual(JSON.parse(a.serialize()), JSON.parse(b.serialize()));
  a.drainEvents(); b.drainEvents();
  for (let i = 0; i < 30 * 60; i++) { a.step(1 / 60); b.step(1 / 60); }
  assert.deepEqual(JSON.parse(a.serialize()), JSON.parse(b.serialize())); assert.deepEqual(a.drainEvents(), b.drainEvents());
  a.togglePause(); assert.equal(Engine.fromSave(a.serialize()).state.status, 'paused');
});

test('bad saves, missing IDs, duplicates and malicious arrays stay bounded', () => {
  for (const bad of [null, 'bad json', '{}', { version: 999, state: {} }, { version: 0, state: {} }]) {
    const restored = Engine.fromSave(bad); assert.equal(restored.state.status, 'playing'); assert.ok(restored.drainEvents().some(ev => ev.type === 'saveError'));
  }
  const cycle = {}; cycle.self = cycle; assert.doesNotThrow(() => Engine.fromSave(cycle));
  const e = new Engine({ seed: 8 }); unit(e, 'player', 0, 0, 400); const data = JSON.parse(e.serialize());
  data.nextId = 1; data.state.effects = [null, {}, null]; data.state.units.push(data.state.units[0]);
  const restored = Engine.fromSave(data); assert.equal(restored.state.units.length, 1); assert.ok(restored.nextId > restored.state.units[0].id); run(restored, 1);
  assert.ok(restored.state.effects.every(fx => Number.isFinite(fx.life)));
});

test('population hard cap includes queued units and independent enemy queue', () => {
  const e = new Engine({ seed: 6 }); noAI(e); e.state.gold = 10000;
  for (let i = 0; i < Engine.MAX_PER_SIDE; i++) unit(e, 'player', 0, i % 3, 500 + i * 30);
  assert.equal(e.deploy(0).ok, false); assert.equal(e._spawnFromQueue({ side: 'player', era: 0, kind: 0 }), false);
  e._enemyDeploy(0); assert.equal(e.state.enemyQueue.length, 1);
  assert.equal(e.state.units.length, Engine.MAX_PER_SIDE);
});

function play(seed, difficulty, useSpecial = true) {
  const e = new Engine({ seed, difficulty }); let deployed = 0, peak = 0;
  for (let frame = 0; frame < 60 * 600 && e.state.status === 'playing'; frame++) {
    if (frame % 60 === 0) {
      const s = e.state; e.evolve();
      const enemies = s.units.filter(u => u.side === 'enemy' && !u.dead);
      if (useSpecial && enemies.length >= 3 && s.cooldowns.special === 0) {
        let best = enemies[0], score = 0;
        for (const u of enemies) {
          const value = enemies.filter(v => Math.abs(v.x - u.x) <= 180).reduce((sum, v) => sum + Math.min(v.hp, 160 + s.era * 95), 0);
          if (value > score) { score = value; best = u; }
        }
        e.special(best.x);
      }
      if (s.bases.player.hp < s.bases.player.maxHp * 0.55) e.repair();
      if (s.queue.length < 2 && e.deploy([0, 1, 0, 2, 1][deployed % 5]).ok) deployed++;
    }
    e.step(1 / 60); peak = Math.max(peak, e.state.units.length);
    assert.ok(e.state.units.filter(u => u.side === 'player' && !u.dead).length <= Engine.MAX_PER_SIDE);
    assert.ok(e.state.units.filter(u => u.side === 'enemy' && !u.dead).length <= Engine.MAX_PER_SIDE);
  }
  return { seed, difficulty, status: e.state.status, seconds: Math.round(e.state.time), era: e.state.era, peak, kills: e.state.stats.kills };
}

test('balanced strategy crosses all eras and wins several normal seeds in bounded time', () => {
  const results = [1, 7, 42, 2026].map(seed => play(seed, 'normal'));
  for (const result of results) { assert.equal(result.status, 'won', JSON.stringify(result)); assert.equal(result.era, 4); assert.ok(result.seconds >= 240 && result.seconds <= 480, JSON.stringify(result)); }
  console.log('  balance: ' + results.map(r => `seed ${r.seed}: ${r.seconds}s / ${r.kills} kills`).join('; '));
});

test('AI advances and an unattended base eventually falls', () => {
  const e = new Engine({ seed: 42 }); run(e, 260);
  assert.equal(e.state.status, 'lost'); assert.ok(e.state.enemyEra >= 1); assert.ok(e.state.time > 40);
});

console.log(`\n${checks} engine tests passed`);
