'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { Engine } = require('../engine.js');
let checks = 0;
function test(name, fn) { fn(); checks++; console.log('✓ ' + name); }

function harness(width = 1600, height = 640) {
  const calls = [], images = [];
  const gradient = () => ({ addColorStop() {} });
  const ctx = new Proxy({ globalAlpha: 1, createLinearGradient: gradient, createRadialGradient: gradient }, {
    get(target, key) {
      if (key in target) return target[key];
      return (...args) => calls.push({ method: key, args });
    }
  });
  class MockImage {
    constructor() { this.requests = []; images.push(this); }
    set src(value) { this._src = value; this.requests.push(value); }
    get src() { return this._src; }
    succeed(w = 1024, h = 768) { this.width = this.naturalWidth = w; this.height = this.naturalHeight = h; this.onload(); }
    fail() { this.onerror(); }
  }
  const canvas = { getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, width, height }) };
  const context = { window: { devicePixelRatio: 1 }, Image: MockImage };
  vm.runInNewContext(fs.readFileSync(require.resolve('../renderer.js'), 'utf8'), context);
  const renderer = new context.window.WarRenderer(canvas);
  function asset(key) { return renderer.assets.get(key); }
  function sheet(kind = 0) { return asset('animation0-' + kind); }
  function draw(unit, state = { buffs: {} }) {
    calls.length = 0; renderer._drawUnit(unit, state);
    return calls.filter(call => call.method === 'drawImage');
  }
  return { renderer, images, calls, asset, sheet, draw };
}
function unit(overrides) {
  return Object.assign({ id: 1, era: 0, kind: 0, x: 600, y: 510, hp: 100, maxHp: 100,
    side: 'player', facing: 1, moving: false, attackTimer: 0, attackFlash: 0, anim: 0, dead: false }, overrides);
}
function state(units) {
  return { time: 0, status: 'playing', speed: 1, era: 0, enemyEra: 0, missionId: 'classic', units,
    bases: { player: { hp: 1000, maxHp: 1000 }, enemy: { hp: 1000, maxHp: 1000 } }, buffs: {}, effects: [], projectiles: [] };
}
function crop(h, u) {
  const call = h.draw(u).find(draw => draw.args[0] === h.sheet(u.kind).img);
  assert.ok(call, 'sheet is drawn');
  return call.args.slice(1, 5);
}

test('only the three authored era-zero sheets are requested and their dimensions are validated', () => {
  const h = harness();
  assert.deepEqual(h.images.map(img => img.src).filter(url => url.includes('/animations/')),
    ['assets/animations/e0-u0.png', 'assets/animations/e0-u1.png', 'assets/animations/e0-u2.png']);
  h.sheet().img.succeed(); assert.equal(h.sheet().loaded, true);
  h.sheet(1).img.succeed(768, 1024); assert.equal(h.sheet(1).loaded, false); assert.equal(h.sheet(1).failed, true);
  h.sheet(2).img.fail(); assert.equal(h.sheet(2).loaded, false);
});

test('idle loops at 3 fps, walking loops at 8 fps and changing state starts the right row', () => {
  const h = harness(), u = unit(), s = state([u]); h.sheet().img.succeed();
  function render(time) { s.time = time; h.renderer.render(s, 1 / 60); return crop(h, u); }
  assert.deepEqual(render(0), [0, 0, 256, 256]);
  assert.deepEqual(render(1 / 3), [256, 0, 256, 256]);
  u.moving = true;
  assert.deepEqual(render(0.35), [0, 256, 256, 256]);
  assert.deepEqual(render(0.475), [256, 256, 256, 256]);
  assert.deepEqual(render(0.85), [0, 256, 256, 256]);
  u.moving = false;
  assert.deepEqual(render(0.9), [0, 0, 256, 256]);
});

test('an attack plays all four frames for 0.45 simulation seconds after its hit flash ends', () => {
  const h = harness(), u = unit({ moving: true }), s = state([u]); h.sheet().img.succeed();
  h.renderer.render(s, 0);
  u.moving = false; u.attackFlash = 0.2; u.attackTimer = 1.4; s.time = 0.1;
  h.renderer.render(s, 0.1); assert.deepEqual(crop(h, u), [0, 512, 256, 256]);
  for (let frame = 1; frame < 4; frame++) {
    const elapsed = frame * 0.1125;
    s.time = 0.1 + elapsed; u.attackFlash = Math.max(0, 0.2 - elapsed); u.attackTimer = 1.4 - elapsed;
    u.moving = elapsed > 0.2;
    h.renderer.render(s, 0.05);
    assert.deepEqual(crop(h, u), [frame * 256, 512, 256, 256]);
  }
  s.time = 0.55; u.attackTimer = 0.95; h.renderer.render(s, 0.05);
  assert.deepEqual(crop(h, u), [0, 256, 256, 256]);
});

test('attackTimer catches an attack when a frame misses the short attackFlash', () => {
  const h = harness(), u = unit(), s = state([u]); h.sheet().img.succeed();
  h.renderer.render(s, 0); s.time = 0.2; u.attackTimer = 1.1;
  h.renderer.render(s, 0.1); assert.deepEqual(crop(h, u), [0, 512, 256, 256]);
  s.time = 0.325; u.attackTimer = 0.975; h.renderer.render(s, 0.1);
  assert.deepEqual(crop(h, u), [256, 512, 256, 256]);
});

test('paused and menu-frozen simulations hold frames; actual simulation time drives double speed', () => {
  const h = harness(), u = unit({ moving: true }), s = state([u]); h.sheet().img.succeed();
  h.renderer.render(s, 0); s.time = 0.125; h.renderer.render(s, 0.01);
  const frozen = crop(h, u);
  for (let i = 0; i < 30; i++) h.renderer.render(s, 0.1);
  assert.deepEqual(crop(h, u), frozen, 'open menus with playing status do not advance frames');
  s.status = 'paused'; for (let i = 0; i < 30; i++) h.renderer.render(s, 0.1);
  assert.deepEqual(crop(h, u), frozen);
  s.status = 'playing'; s.speed = 2; s.time += 0.25; h.renderer.render(s, 0.001);
  assert.deepEqual(crop(h, u), [768, 256, 256, 256]);
});

test('sheet crops keep one bottom-center anchor, equal scale, enemy mirroring and no whole-sprite wobble', () => {
  const h = harness(360, 260), u = unit({ side: 'enemy', facing: -1, moving: true }); h.sheet().img.succeed();
  for (const [action, row] of [['idle', 0], ['walk', 1], ['attack', 2]]) {
    h.renderer.unitVisuals.set(u.id, { action, actionTime: 0.35, move: 1, attack: 0.8, hit: 0, phase: 1 });
    const draw = h.draw(u)[0].args;
    assert.equal(draw.length, 9); assert.equal(draw[2], row * 256);
    assert.deepEqual(draw.slice(3), [256, 256, -50.5, -101, 101, 101]);
    assert.ok(h.calls.some(call => call.method === 'scale' && call.args[0] === -1 && call.args[1] === 1));
    const scaling = h.calls.find(call => call.method === 'scale').args;
    assert.ok(Math.abs(h.renderer.scaleX * scaling[0] - h.renderer.scaleY * scaling[1]) < 1e-8);
    assert.ok(h.calls.filter(call => call.method === 'rotate').every(call => call.args[0] === 0));
    assert.deepEqual(h.calls.filter(call => call.method === 'translate').at(-1).args, [600, 510]);
  }
});

test('pending, failed and malformed sheets use static art; missing static art still uses the vector fallback', () => {
  const h = harness(), u = unit(), s = state([u]);
  h.asset('unit0-0').img.succeed(120, 200);
  function staticDrawn() {
    const draws = h.draw(u); assert.equal(draws.length, 1); assert.equal(draws[0].args[0], h.asset('unit0-0').img); assert.equal(draws[0].args.length, 5);
  }
  staticDrawn(); h.sheet().img.fail(); staticDrawn();
  h.renderer.clock = 36; h.renderer.render(s, 0); assert.equal(h.sheet().img.requests.length, 1, 'optional 404s do not poll repeatedly');
  h.sheet().img.succeed(100, 100); staticDrawn();
  h.asset('unit0-0').img.fail(); assert.equal(h.draw(u).length, 0);
  h.renderer.reloadAssets(); h.sheet().img.succeed(); assert.equal(h.draw(u)[0].args.length, 9);
  const laterEra = unit({ era: 1 }); h.asset('unit1-0').img.succeed(120, 200);
  assert.equal(h.draw(laterEra)[0].args[0], h.asset('unit1-0').img);
});

test('dead units freeze their last pose; removal and restarting do not leak an old unit animation', () => {
  const h = harness(), u = unit({ moving: true }), s = state([u]); h.sheet().img.succeed();
  h.renderer.render(s, 0); s.time = 0.25; h.renderer.render(s, 0.1); u.dead = true;
  const before = h.renderer.unitVisuals.get(u.id).actionTime;
  s.time = 0.4; h.renderer.render(s, 0.1); assert.equal(h.renderer.unitVisuals.get(u.id).actionTime, before);
  s.units = []; s.time = 0.5; h.renderer.render(s, 0.1); assert.equal(h.renderer.unitVisuals.size, 0);
  u.dead = false; u.moving = false; s.units = [u]; s.time = 0;
  h.renderer.render(s, 0.1); assert.deepEqual(crop(h, u), [0, 0, 256, 256]);
});

test('rendering real engine frames never mutates combat timing, damage, units or save data', () => {
  const h = harness(), e = new Engine({ seed: 17 });
  for (let kind = 0; kind < 3; kind++) h.sheet(kind).img.succeed();
  e.deploy(0); e.deploy(1);
  for (let i = 0; i < 600; i++) {
    e.step(1 / 60);
    const before = e.serialize(); h.renderer.render(e.state, 1 / 60); assert.equal(e.serialize(), before);
  }
});

console.log(`\n${checks} renderer tests passed`);
