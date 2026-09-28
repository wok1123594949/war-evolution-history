(function () {
  'use strict';

  const WORLD = { width: 1600, height: 640, ground: 510 };
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const UNIT_ANIMATION = { cell: 256, columns: 4, rows: 3, idleFps: 3, walkFps: 8, attackDuration: 0.45 };
  const ANIMATION_ROWS = { idle: 0, walk: 1, attack: 2 };
  const PALETTES = [
    { body: '#9a6240', light: '#ceaa75', dark: '#4b3529', glow: '#ec9d38' },
    { body: '#8a9295', light: '#c1c6b6', dark: '#39474a', glow: '#ddac52' },
    { body: '#834b36', light: '#d1ab6e', dark: '#352c29', glow: '#fa983d' },
    { body: '#687266', light: '#bac1a5', dark: '#293932', glow: '#eab565' },
    { body: '#8aa6ae', light: '#d1eeeb', dark: '#263f50', glow: '#72f1ff' }
  ];

  function path(ctx, points, fill, stroke, width) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width || 2; ctx.stroke(); }
  }
  function ellipse(ctx, x, y, rx, ry, color, stroke) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    if (color) { ctx.fillStyle = color; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  function line(ctx, x1, y1, x2, y2, color, width) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.strokeStyle = color; ctx.lineWidth = width || 2; ctx.stroke();
  }
  function roundRect(ctx, x, y, w, h, r, fill, stroke) {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  function seeded(i) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  class WarRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.clock = 0;
      this.previousTime = null;
      this.particles = [];
      this.unitVisuals = new Map();
      this.seenEffects = new WeakSet();
      this.shake = 0;
      this.assets = new Map();
      this.lastAssetRetry = 0;
      this._lastRenderArg = 0;
      this._load('background', 'assets/war-evolution-battlefield.png');
      for (let e = 0; e < 5; e++) {
        this._load('base' + e, 'assets/bases/e' + e + '.png');
        for (let u = 0; u < 3; u++) this._load('unit' + e + '-' + u, 'assets/units/e' + e + '-u' + u + '.png');
      }
      // Only these three units have authored sprite sheets. Other eras use their existing art.
      for (let u = 0; u < 3; u++) this._load('animation0-' + u, 'assets/animations/e0-u' + u + '.png', {
        width: UNIT_ANIMATION.cell * UNIT_ANIMATION.columns,
        height: UNIT_ANIMATION.cell * UNIT_ANIMATION.rows,
        optional: true
      });
      this.resize();
      this.resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this.resize()) : null;
      if (this.resizeObserver) this.resizeObserver.observe(canvas);
    }

    _load(key, url, expected) {
      const img = new Image();
      const asset = { img, url, loaded: false, failed: false, attempts: 1, optional: !!expected?.optional };
      img.onload = () => {
        const valid = !expected || (img.naturalWidth || img.width) === expected.width && (img.naturalHeight || img.height) === expected.height;
        asset.loaded = valid; asset.failed = !valid;
      };
      img.onerror = () => { asset.loaded = false; asset.failed = true; };
      img.src = url;
      this.assets.set(key, asset);
    }

    reloadAssets() {
      for (const a of this.assets.values()) {
        if (!a.loaded) { a.failed = false; a.attempts++; a.img.src = a.url + '?v=' + Date.now(); }
      }
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      this.width = Math.max(1, rect.width);
      this.height = Math.max(1, rect.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.dpr = dpr;
      this.canvas.width = Math.round(this.width * dpr);
      this.canvas.height = Math.round(this.height * dpr);
      // All simulation positions remain in the same fixed world on every screen.
      this.scaleX = this.canvas.width / WORLD.width;
      this.scaleY = this.canvas.height / WORLD.height;
    }

    draw(state, deltaSeconds) { this.render(state, deltaSeconds, this.targetOptions); }

    setTargeting(enabled, pointerX) {
      if (typeof enabled === 'number' && pointerX == null) { this.targetOptions = { targeting: true, pointerX: enabled }; return; }
      this.targetOptions = { targeting: !!enabled, pointerX: pointerX == null ? 800 : pointerX };
    }

    setTarget(value) { if (value == null) this.setTargeting(false); else this.setTargeting(true, value); }
    screenToWorld(clientX) { return this.clientToWorld(clientX); }

    clientToWorld(clientX) {
      const rect = this.canvas.getBoundingClientRect();
      return clamp((clientX - rect.left) / Math.max(1, rect.width) * WORLD.width, 0, WORLD.width);
    }

    handleEvents(events) {
      for (const event of events || []) {
        if (event.type === 'evolve' || event.type === 'enemyEvolve') {
          const x = event.side === 'enemy' ? 1475 : 125;
          this._burst(x, 400, '#ffe4a0', 48, 120, true);
          this.shake = Math.max(this.shake, 4);
        }
        if (event.type === 'win' || event.type === 'lose') {
          this._burst(event.type === 'win' ? 1475 : 125, 420, '#ffbd59', 55, 220);
          this.shake = 8;
        }
      }
    }

    _burst(x, y, color, count, force, rise) {
      for (let i = 0; i < count && this.particles.length < 200; i++) {
        const angle = Math.random() * TAU, speed = (0.25 + Math.random() * 0.75) * force;
        const life = 0.4 + Math.random() * 0.75;
        this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - (rise ? 65 : 10), color, life, max: life, size: 1 + Math.random() * 3, rise: !!rise });
      }
    }

    render(state, deltaSeconds, options) {
      if (!state) return;
      // game.js may pass either a frame delta or a monotonic timestamp.
      if (Number(deltaSeconds) > 0.5) {
        const stamp = Number(deltaSeconds);
        deltaSeconds = this._lastRenderArg > 0 ? stamp - this._lastRenderArg : 0.016;
        this._lastRenderArg = stamp;
      } else this._lastRenderArg = 0;
      const simulationTime = Number.isFinite(state.time) ? state.time : 0;
      const reset = this.previousTime !== null && simulationTime < this.previousTime - 1e-8;
      if (reset) {
        this.unitVisuals.clear(); this.particles.length = 0; this.seenEffects = new WeakSet(); this.shake = 0;
      }
      options = options || this.targetOptions || {};
      const dt = clamp(Number(deltaSeconds) || 0, 0, 0.1);
      this.clock += dt;
      // Animation follows actual simulation progress, including paused menus and speed changes.
      const motionDt = this.previousTime === null || reset ? 0 : Math.max(0, simulationTime - this.previousTime);
      if (this.clock - this.lastAssetRetry > 35) {
        this.lastAssetRetry = this.clock;
        for (const a of this.assets.values()) {
          if (a.failed && !a.optional && a.attempts < 14) { a.failed = false; a.attempts++; a.img.src = a.url + '?attempt=' + a.attempts; }
        }
      }
      this._updateVisuals(state, motionDt);
      this.shake *= Math.pow(0.025, dt);
      const c = this.ctx;
      c.setTransform(this.scaleX, 0, 0, this.scaleY, 0, 0);
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
      c.fillStyle = '#6d765e'; c.fillRect(0, 0, WORLD.width, WORLD.height);
      c.save();
      if (this.shake > 0.15) c.translate(Math.sin(this.clock * 90) * this.shake, Math.cos(this.clock * 76) * this.shake * 0.5);
      this._background(state);
      this._drawBase(125, state.era || 0, 'player', state.bases.player);
      this._drawBase(1475, state.enemyEra || 0, 'enemy', state.bases.enemy);
      this._ambient(state);
      if (state.missionId && state.missionId !== 'classic') this._outpost(state.outpost);
      for (const unit of state.units || []) this._drawUnit(unit, state);
      for (const projectile of state.projectiles || []) this._projectile(projectile, state);
      for (const effect of state.effects || []) this._effect(effect, state);
      this._drawParticles();
      this._foreground();
      if (options.targeting) this._target(options.pointerX || 800, state.era || 0);
      c.restore();
      // A shallow cinematic frame keeps the illustration legible without darkening the battlefield.
      const edge = c.createLinearGradient(0, 0, 0, 100);
      edge.addColorStop(0, 'rgba(28, 19, 13, 0.3)'); edge.addColorStop(1, 'rgba(28, 19, 13, 0)');
      c.fillStyle = edge; c.fillRect(0, 0, 1600, 100);
      this.previousTime = simulationTime;
    }

    _updateVisuals(state, dt) {
      const active = new Set();
      for (const u of state.units || []) {
        active.add(u.id);
        let v = this.unitVisuals.get(u.id);
        const fresh = !v;
        if (!v) {
          v = { x: u.x, hp: u.hp, timer: u.attackTimer || 0, flash: u.attackFlash || 0, move: 0, attack: 0, hit: 0, dust: Math.random(), phase: seeded(u.id) * TAU,
            action: !u.dead && u.attackFlash > 0 ? 'attack' : u.moving ? 'walk' : 'idle', actionTime: 0 };
          this.unitVisuals.set(u.id, v);
        }
        if (dt > 0) {
          const moving = typeof u.moving === 'boolean' ? u.moving : Math.abs(u.x - v.x) > 0.02;
          v.move += ((moving ? 1 : 0) - v.move) * Math.min(1, dt * 12);
          const attacked = !fresh && (u.attackFlash > v.flash + 0.025 || (u.attackTimer || 0) > v.timer + 0.1);
          this._advanceAnimation(v, u, moving, attacked, fresh ? 0 : dt);
          if (attacked && !u.dead) {
            v.attack = 1;
            if (u.kind === 1 || u.kind === 2 && u.era >= 2) this._burst(u.x + (u.side === 'player' ? 34 : -34), 454, u.era === 4 ? '#91faff' : '#ffce6c', 5, 70);
            else this._burst(u.x + (u.side === 'player' ? 28 : -28), 454, '#ffe6a0', 4, 70);
          } else v.attack = Math.max(0, v.attack - dt * 4);
          if (u.hp < v.hp) { v.hit = 1; this._burst(u.x, 454, '#ecbd7b', 4, 70); }
          else v.hit = Math.max(0, v.hit - dt * 5);
          v.dust -= dt;
          if (moving && v.dust <= 0 && !u.dead) {
            v.dust = 0.23 + Math.random() * 0.3;
            this._burst(u.x - (u.side === 'player' ? 12 : -12), 507, '#c8ad75', 2, 17);
          }
        }
        v.x = u.x; v.hp = u.hp; v.timer = u.attackTimer || 0; v.flash = u.attackFlash || 0;
      }
      for (const id of this.unitVisuals.keys()) if (!active.has(id)) this.unitVisuals.delete(id);
      for (const fx of state.effects || []) {
        if (!this.seenEffects.has(fx)) {
          this.seenEffects.add(fx);
          if (fx.type === 'special') { this.shake = 9; this._burst(fx.x, 487, fx.color || '#ffb553', 45, 160); }
          if (fx.type === 'hit') this._burst(fx.x, fx.y, fx.color || '#ffdb92', 5, 64);
          if (fx.type === 'heal') this._burst(fx.x, fx.y || 465, '#a6f6b6', 8, 35, true);
          if (fx.type === 'rally') this._burst(fx.x || 350, fx.y || 475, '#ffd18a', 18, 80, true);
          if (fx.type === 'capture' || fx.type === 'outpost') this._burst(fx.x || 800, 440, fx.side === 'enemy' ? '#ff9b78' : '#a0e6ff', 24, 90, true);
          if (fx.type === 'upgrade') this._burst(fx.x || 125, fx.y || 430, '#ffe0a1', 20, 70, true);
        }
      }
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i]; p.life -= dt;
        if (p.life <= 0) { this.particles.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.pow(0.2, dt); p.vy += (p.rise ? -30 : 140) * dt;
      }
    }

    _advanceAnimation(v, unit, moving, attacked, dt) {
      if (unit.dead) return;
      if (attacked) { v.action = 'attack'; v.actionTime = 0; return; }
      v.actionTime += dt;
      // Attack frames run to completion even after the engine's short hit flash expires.
      if (v.action === 'attack' && v.actionTime < UNIT_ANIMATION.attackDuration - 1e-8) return;
      const next = moving ? 'walk' : 'idle';
      if (v.action !== next) { v.action = next; v.actionTime = 0; }
    }

    _animationAsset(unit) {
      if (unit.era !== 0 || !Number.isInteger(unit.kind) || unit.kind < 0 || unit.kind > 2) return null;
      const asset = this.assets.get('animation0-' + unit.kind);
      return asset?.loaded && !asset.failed ? asset : null;
    }

    _animationFrame(visual) {
      const action = ANIMATION_ROWS[visual.action] === undefined ? 'idle' : visual.action;
      const elapsed = Math.max(0, visual.actionTime || 0);
      const frame = action === 'attack'
        ? Math.min(UNIT_ANIMATION.columns - 1, Math.floor(elapsed / UNIT_ANIMATION.attackDuration * UNIT_ANIMATION.columns + 1e-8))
        : Math.floor(elapsed * (action === 'walk' ? UNIT_ANIMATION.walkFps : UNIT_ANIMATION.idleFps) + 1e-8) % UNIT_ANIMATION.columns;
      return { x: frame * UNIT_ANIMATION.cell, y: ANIMATION_ROWS[action] * UNIT_ANIMATION.cell, size: UNIT_ANIMATION.cell };
    }

    _background(state) {
      const c = this.ctx, bg = this.assets.get('background');
      if (bg.loaded) c.drawImage(bg.img, 0, 0, bg.img.width, bg.img.height, 0, 0, 1600, 640);
      else {
        const sky = c.createLinearGradient(0, 0, 0, 500);
        sky.addColorStop(0, '#678592'); sky.addColorStop(0.55, '#edba77'); sky.addColorStop(1, '#a99259');
        c.fillStyle = sky; c.fillRect(0, 0, 1600, 640);
        for (let j = 0; j < 3; j++) {
          const points = [[0, 450]];
          for (let i = 0; i <= 20; i++) points.push([i * 80, 260 + j * 46 + Math.sin(i * 1.43 + j) * 44]);
          points.push([1600, 640], [0, 640]); path(c, points, ['#9c9c88', '#777d60', '#767050'][j]);
        }
      }
      // The broad, gently shaded path unifies image perspective with the lateral battle line.
      const lane = c.createLinearGradient(0, 439, 0, 551);
      lane.addColorStop(0, 'rgba(214,171,102,0)');
      lane.addColorStop(0.5, 'rgba(205,161,95,0.13)');
      lane.addColorStop(0.72, 'rgba(135,104,62,0.19)');
      lane.addColorStop(1, 'rgba(93,72,46,0)');
      c.fillStyle = lane; c.fillRect(0, 439, 1600, 112);
      c.save();
      const sunlight = c.createRadialGradient(560, 172, 0, 560, 172, 430);
      sunlight.addColorStop(0, 'rgba(255,216,128,0.11)'); sunlight.addColorStop(1, 'rgba(255,216,128,0)');
      c.fillStyle = sunlight; c.fillRect(100, 0, 1000, 590);
      c.globalAlpha = 0.17;
      for (let i = 0; i < 42; i++) {
        const x = seeded(i + 20) * 1600, y = 492 + seeded(i + 51) * 37;
        ellipse(c, x, y, 3 + seeded(i + 90) * 8, 1 + seeded(i + 10), '#5b472d');
      }
      c.restore();
      if (state.era === 4 || state.enemyEra === 4) {
        c.save(); c.globalAlpha = 0.17;
        c.fillStyle = '#54bad2'; c.fillRect(0, 0, 1600, 640); c.restore();
      }
      this._missionAtmosphere(state.missionId);
      this._birds();
    }

    _missionAtmosphere(missionId) {
      const c = this.ctx;
      if (!missionId || missionId === 'classic' || missionId === 'frontier') return;
      c.save();
      if (missionId === 'crossroads' || missionId === 'holdout') {
        const cool = missionId === 'holdout';
        const light = c.createLinearGradient(0, 0, 0, 425);
        light.addColorStop(0, cool ? 'rgba(83,142,190,.16)' : 'rgba(248,181,79,.14)');
        light.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = light; c.fillRect(0, 0, 1600, 425);
      }
      if (missionId === 'siege') {
        for (let i = 0; i < 9; i++) {
          const age = (this.clock * 0.07 + i / 9) % 1;
          const x = 1110 + seeded(i + 220) * 370 - age * 105;
          const y = 410 - age * 255;
          c.globalAlpha = Math.sin(age * Math.PI) * 0.09;
          ellipse(c, x, y, 24 + age * 42, 14 + age * 30, '#6b6252');
        }
      }
      if (missionId === 'citadel') {
        for (let i = 0; i < 22; i++) {
          const age = (this.clock * 0.11 + seeded(i + 212)) % 1;
          const x = 1070 + seeded(i + 220) * 490 + Math.sin(this.clock + i) * 11;
          const y = 494 - age * 310;
          c.globalAlpha = Math.sin(age * Math.PI) * 0.6;
          path(c, [[x,y-4],[x+3,y],[x,y+4],[x-3,y]], '#b5f9ff');
        }
      }
      c.restore();
    }

    _outpost(outpost) {
      if (!outpost) return;
      const c = this.ctx, x = Number.isFinite(outpost.x) ? outpost.x : 800;
      const owner = outpost.owner || 'neutral';
      const color = owner === 'player' ? '#77cae9' : owner === 'enemy' ? '#ed8a66' : '#dec28a';
      const progress = clamp(Number(outpost.progress) || 0, -1, 1);
      c.save(); c.translate(x, WORLD.ground);
      c.save(); c.globalAlpha = 0.55;
      ellipse(c, 0, 4, 72, 13, 'rgba(40,31,20,.2)', color);
      c.lineWidth = 2.5;
      c.beginPath(); c.ellipse(0, 4, 64, 10, 0, -Math.PI / 2, -Math.PI / 2 + Math.abs(progress) * TAU);
      c.strokeStyle = progress < 0 ? '#ed8a66' : '#77cae9'; c.stroke(); c.restore();
      const aspect = this.scaleY / this.scaleX;
      const size = Math.min(1, 1.28 / Math.max(1, aspect));
      c.scale(aspect * size, size);
      // The flag sits behind the battle line; crates stay below the troops' shoulders.
      line(c, 0, -8, 0, -125, '#594630', 5);
      line(c, -1, -8, -1, -125, '#ddbd79', 1.5);
      ellipse(c, 0, -128, 4, 4, '#f2d99b', '#735530');
      const wave = Math.sin(this.clock * 3.4) * 4;
      path(c, [[2,-120],[45,-115+wave],[40,-79+wave],[2,-86]], color, '#6b5131', 2);
      path(c, [[16,-110+wave*.4],[29,-109+wave*.4],[29,-98+wave*.4],[22,-92+wave*.4],[16,-98+wave*.4]], '#f6e5b8', '#766243', 1);
      for (const crate of [{x:-37,y:-27,w:26,h:24},{x:13,y:-22,w:32,h:19},{x:-31,y:-42,w:21,h:15}]) {
        roundRect(c, crate.x, crate.y, crate.w, crate.h, 2, '#967248', '#493b29');
        line(c, crate.x + 3, crate.y + 3, crate.x + crate.w - 3, crate.y + crate.h - 3, '#c2a16b', 2);
        line(c, crate.x + crate.w - 3, crate.y + 3, crate.x + 3, crate.y + crate.h - 3, '#c2a16b', 2);
        line(c, crate.x + 5, crate.y, crate.x + 5, crate.y + crate.h, '#58482f', 2);
      }
      roundRect(c, -43, -159, 86, 22, 5, 'rgba(36,31,25,.88)', '#ba9960');
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = 'bold 13px "Microsoft YaHei", sans-serif';
      c.fillStyle = '#f6e5bf'; c.fillText(outpost.contested ? '交战中' : owner === 'neutral' ? '补给据点' : owner === 'player' ? '我方补给' : '敌方补给', 0, -148);
      roundRect(c, -29, -135, 58, 4, 2, '#3d372b');
      if (Math.abs(progress) > 0.01) roundRect(c, -28, -134, 56 * Math.abs(progress), 2, 1, progress < 0 ? '#ed8a66' : '#77cae9');
      if (outpost.contested) {
        for (let i = 0; i < 5; i++) {
          const angle = this.clock * 2.5 + i * TAU / 5;
          const sx = Math.cos(angle) * 49, sy = -12 + Math.sin(angle) * 8;
          line(c, sx - 3, sy - 6, sx + 3, sy + 1, '#ffe3a4', 2);
        }
      }
      c.restore();
    }

    _birds() {
      const c = this.ctx;
      c.save(); c.strokeStyle = 'rgba(52,52,47,.55)'; c.lineWidth = 1.2;
      for (let i = 0; i < 5; i++) {
        const x = (290 + this.clock * 7 + i * 24) % 1650 - 25, y = 165 + Math.sin(i * 2) * 13;
        const flap = Math.sin(this.clock * 5 + i) * 2.4;
        c.beginPath(); c.moveTo(x - 5, y + flap); c.quadraticCurveTo(x - 2, y - 2, x, y); c.quadraticCurveTo(x + 2, y - 2, x + 5, y + flap); c.stroke();
      }
      c.restore();
    }

    _ambient() {
      const c = this.ctx;
      c.save();
      for (let i = 0; i < 26; i++) {
        const speed = 9 + seeded(i + 20) * 15;
        const x = (seeded(i + 132) * 1700 + this.clock * speed) % 1700 - 50;
        const y = 520 - (this.clock * (4 + seeded(i + 21) * 11) + seeded(i + 2) * 390) % 390;
        c.globalAlpha = (0.12 + seeded(i + 9) * 0.25) * (0.6 + Math.sin(this.clock + i) * 0.3);
        ellipse(c, x, y, 1 + seeded(i + 40) * 1.3, 0.9, '#ffe3a2');
      }
      c.restore();
    }

    _drawBase(x, era, side, base) {
      const c = this.ctx, enemy = side === 'enemy', flag = enemy ? '#bb4930' : '#337a94';
      const palette = PALETTES[era];
      c.save(); c.translate(x, 510);
      const baseAspect = this.scaleY / this.scaleX;
      c.scale(baseAspect, 1);
      ellipse(c, 0, 0, 123, 20, 'rgba(19,15,10,.43)');
      if (base && base.hp <= 0) { c.rotate(enemy ? 0.035 : -0.035); c.globalAlpha = 0.76; }
      const asset = this.assets.get('base' + era);
      if (asset && asset.loaded) {
        c.save();
        if (enemy) c.scale(-1, 1);
        const h = Math.min(205 + era * 6, 225 / baseAspect), w = h * asset.img.width / asset.img.height;
        c.drawImage(asset.img, -w / 2, -h + 7, w, h);
        c.restore();
      } else if (era === 0) this._cave(c, palette);
      else if (era === 1) this._castle(c, palette, flag);
      else if (era === 2) this._fort(c, palette, flag);
      else if (era === 3) this._factory(c, palette, flag);
      else this._futureBase(c, palette, flag);
      this._flag(c, enemy ? 65 : -73, era === 0 ? -156 : -203, flag, enemy);
      if (base && base.turrets) this._turrets(c, era, base.turrets, enemy, palette);
      if (base && base.hp / base.maxHp < 0.45) this._baseFire(c, enemy ? -15 : 20, -80, base.hp / base.maxHp);
      // Team shield anchors the base to its owner's side without recolouring the original illustration.
      c.save(); c.translate(0, -29);
      path(c, [[-14,-18],[14,-18],[14,0],[0,12],[-14,0]], '#d1af6b', '#463322', 2);
      path(c, [[-10,-14],[10,-14],[10,-1],[0,7],[-10,-1]], flag);
      c.strokeStyle = '#f4dfa3'; c.lineWidth = 2;
      line(c, -5, -9, 5, 1, '#f4dfa3', 2); line(c, 5, -9, -5, 1, '#f4dfa3', 2);
      c.restore(); c.restore();
    }

    _cave(c) {
      const rock = c.createLinearGradient(-60, -180, 60, 0);
      rock.addColorStop(0, '#bfa576'); rock.addColorStop(0.45, '#85765a'); rock.addColorStop(1, '#514a37');
      path(c, [[-104,3],[-111,-49],[-92,-110],[-53,-155],[-8,-168],[40,-151],[79,-114],[108,-42],[111,5]], rock, '#463d2e', 3);
      path(c, [[-104,-48],[-89,-111],[-50,-151],[-60,-99],[-76,-46]], '#a1906d', '#746449', 2);
      path(c, [[-51,-155],[-10,-164],[20,-115],[-25,-107]], '#c0ab80', '#79684c', 2);
      path(c, [[20,-151],[77,-113],[94,-66],[54,-84],[20,-115]], '#9d8862', '#6a5a43', 2);
      path(c, [[-55,0],[-58,-52],[-36,-95],[1,-114],[36,-91],[55,-44],[55,2]], '#332b21', '#5e503c', 7);
      const fire = c.createRadialGradient(13,-34,5,13,-34,55); fire.addColorStop(0,'#b57939');fire.addColorStop(1,'#322921');
      path(c, [[-46,0],[-48,-43],[-32,-81],[0,-101],[29,-80],[45,-37],[45,0]], fire);
      path(c, [[-57,-45],[-53,-92],[-27,-114],[-3,-115],[-28,-89],[-40,-42]], '#95835e');
      for (let i = 0; i < 8; i++) { const x = -98 + i * 27; ellipse(c,x,1,14 + seeded(i)*9,6,'#625740','#3c3529'); }
      line(c, -74, -37, -74, -73, '#654a2b', 6); line(c, 71, -28, 71, -65, '#654a2b', 6);
      this._baseFire(c,-74,-77,1); this._baseFire(c,71,-69,1);
      // Hide-and-bone roof dressing.
      path(c, [[-39,-161],[-12,-180],[22,-171],[32,-153],[10,-155],[-5,-163],[-23,-156]], '#b58e55','#6a4c2d');
      line(c,-27,-158,17,-182,'#ddd0a3',5); line(c,-14,-184,27,-157,'#ddd0a3',5);
    }

    _castle(c, p, flag) {
      const wall = c.createLinearGradient(0,-200,0,0);wall.addColorStop(0,'#c0b8a0');wall.addColorStop(1,'#777565');
      roundRect(c,-91,-143,182,145,3,wall,'#4b5047');
      for (const x of [-92,53]) {
        roundRect(c,x,-187,42,186,3,wall,'#4b5047');
        for(let i=0;i<3;i++) roundRect(c,x+i*15,-200,12,26,1,'#c6bda6','#686b5a');
        c.fillStyle='#303b36'; c.fillRect(x+16,-159,9,29); c.fillRect(x+16,-84,9,22);
      }
      for(let row=0;row<7;row++){const y=-132+row*19;line(c,-88,y,88,y,'rgba(61,67,56,.42)',1.3);for(let x=-80+(row%2)*20;x<80;x+=38)line(c,x,y,x,y+18,'rgba(61,67,56,.42)',1.2);}
      c.beginPath();c.moveTo(-33,1);c.lineTo(-33,-58);c.bezierCurveTo(-33,-102,33,-102,33,-58);c.lineTo(33,1);c.closePath();c.fillStyle='#2e332c';c.fill();c.strokeStyle='#ccc0a0';c.lineWidth=7;c.stroke();
      for(let x=-25;x<29;x+=12)line(c,x,-71,x,0,'#67593e',4);
      for(let x=-39;x<43;x+=17)roundRect(c,x,-151,13,23,0,'#bcb49b','#5c6052');
      path(c,[[-25,-132],[25,-132],[23,-101],[0,-87],[-23,-101]],flag,'#d2b472');
      line(c,0,-121,0,-102,'#e6d3a0',3);line(c,-8,-113,8,-113,'#e6d3a0',3);
    }

    _fort(c,p,flag) {
      const wall=c.createLinearGradient(0,-190,0,0);wall.addColorStop(0,'#cda474');wall.addColorStop(1,'#856343');
      path(c,[[-110,0],[-95,-115],[-57,-131],[55,-131],[99,-110],[110,0]],wall,'#523f2d',3);
      roundRect(c,-76,-164,150,55,3,'#b58c5a','#61452c');
      path(c,[[-88,-164],[0,-201],[87,-164]],'#513f31','#352b21',3);
      line(c,-90,-164,89,-164,'#c6a476',5);
      for(let y=-101;y<0;y+=22){line(c,-99,y,103,y,'#6e5339',1);for(let x=-92;x<101;x+=32)line(c,x+(y%2?16:0),y,x+(y%2?16:0),y+20,'#856344',1);}
      roundRect(c,-28,-87,56,90,18,'#3f3528','#b8a171');
      for(const x of [-71,50]){roundRect(c,x,-99,22,16,4,'#322f24','#c2a273');line(c,x-2,-80,x+24,-80,'#c1a575',3);}
      for(const x of [-40,26])roundRect(c,x,-149,15,24,3,'#493c2a','#ddbc87');
      for(let i=0;i<6;i++){const x=-117+i*44;path(c,[[x,4],[x,-18],[x+15,-23],[x+29,-18],[x+30,4]],'#9a8862','#625038',2);}
    }

    _factory(c,p,flag) {
      roundRect(c,-94,-128,182,132,4,'#656b58','#293e37');
      path(c,[[-95,-128],[-95,-153],[-63,-178],[-28,-150],[9,-180],[43,-151],[87,-178],[90,-126]],'#869183','#30453e',3);
      roundRect(c,-70,-223,25,113,3,'#616f61','#36473e');roundRect(c,41,-212,26,81,3,'#626f61','#36473e');
      roundRect(c,-75,-223,36,14,3,'#979e89','#4c5b4d');roundRect(c,37,-212,34,14,3,'#979e89','#4c5b4d');
      for(let i=0;i<9;i++){
        const y=-235-((this.clock*20+i*17)%130),x=-57+Math.sin(i+this.clock*.7)*14;
        c.save();c.globalAlpha=.12*(1-(-y-235)/150);ellipse(c,x,y,18+(-y-225)*.18,10+(-y-225)*.13,'#d1c4a5');c.restore();
      }
      for(let i=0;i<4;i++)roundRect(c,-75+i*39,-111,26,30,2,i%2?'#c09853':'#7e9a90','#31483f');
      for(let i=0;i<3;i++){line(c,-90,-69+i*26,88,-69+i*26,'#465448',2);}
      roundRect(c,-31,-68,63,73,3,'#253e36','#9faa91');
      for(let i=0;i<7;i++)line(c,-28,-63+i*9,27,-63+i*9,'#526155',3);
      roundRect(c,-108,-36,35,38,4,'#81907b','#344d40');roundRect(c,71,-33,36,35,4,'#81907b','#344d40');
      for(const x of [-85,-40,40,82]){ellipse(c,x,-47,3,3,'#bbc0a6');}
    }

    _futureBase(c,p,flag) {
      const metal=c.createLinearGradient(0,-212,0,0);metal.addColorStop(0,'#bad1cd');metal.addColorStop(.5,'#6c9098');metal.addColorStop(1,'#315364');
      path(c,[[-110,3],[-93,-52],[-74,-70],[-73,-173],[-39,-209],[33,-209],[71,-169],[73,-71],[99,-48],[115,3]],metal,'#213f51',3);
      path(c,[[-42,-196],[31,-196],[54,-169],[49,-134],[-45,-134],[-58,-165]],'#294d64','#b9e6df',3);
      c.save();c.shadowColor='#6ae5ff';c.shadowBlur=13;path(c,[[-29,-183],[24,-183],[39,-165],[32,-149],[-30,-149],[-41,-165]],'#77d8e5');c.restore();
      path(c,[[-24,2],[-25,-83],[-11,-103],[14,-103],[29,-84],[28,2]],'#162e45','#7dced2',4);
      for(const x of [-88,69]){roundRect(c,x,-99,19,86,4,'#506d78','#b0d4cd');line(c,x+9,-80,x+9,-33,'#64e9f0',3);}
      for(let i=0;i<4;i++)line(c,-64,-119+i*22,-37,-119+i*22,'#2c4c59',5);
      for(let i=0;i<4;i++)line(c,39,-119+i*22,66,-119+i*22,'#2c4c59',5);
      line(c,0,-207,0,-241,'#597e87',4);ellipse(c,0,-245,7,7,'#83faff');
      c.save();c.globalAlpha=.14+.035*Math.sin(this.clock*3);c.strokeStyle='#9ceef4';c.lineWidth=2;c.beginPath();c.ellipse(0,-107,126,134,0,Math.PI,TAU);c.stroke();c.restore();
    }

    _flag(c,x,y,color,enemy) {
      line(c,x,y+110,x,y-11,'#4b3e29',4);line(c,x-1,y+110,x-1,y-10,'#d4b879',1);
      const wave=Math.sin(this.clock*3+x)*5;
      path(c,[[x+2,y],[x+43,y+6+wave],[x+37,y+39+wave],[x+2,y+32]],color,'#523728',1.5);
      line(c,x+10,y+7,x+10,y+27,'rgba(255,230,164,.6)',2);
      path(c,[[x+22,y+13+wave*.4],[x+29,y+20+wave*.4],[x+22,y+28+wave*.4],[x+16,y+20+wave*.4]],'#e7d3a2');
      ellipse(c,x,y-12,4,4,'#ddc079');
    }

    _turrets(c,era,count,enemy,p) {
      c.save();if(enemy)c.scale(-1,1);
      for(let i=0;i<count;i++){
        c.save();c.translate(54-i*43,-95-i%2*11);
        roundRect(c,-15,-11,30,19,3,'#574d37','#292f26');
        if(era===0){line(c,-11,-8,11,-41,'#493725',6);line(c,8,-8,-12,-37,'#735c37',5);line(c,-15,-28,28,-28,'#3d382b',5);ellipse(c,28,-29,7,6,'#a99d7c','#5c5745');}
        else if(era===1){line(c,-10,-12,10,-35,'#694e31',5);line(c,-14,-30,37,-30,'#463c2d',6);c.beginPath();c.arc(17,-31,23,-1.3,1.3);c.strokeStyle='#ba9b68';c.lineWidth=3;c.stroke();}
        else{roundRect(c,-14,-32,36,27,5,era===4?'#90bfca':'#66715e','#2e3b31');line(c,12,-23,48,-27,era===4?'#759da7':'#445043',12);line(c,20,-25,47,-29,era===4?'#96e9ef':'#abb391',3);}
        c.restore();
      }
      c.restore();
    }

    _baseFire(c,x,y,intensity) {
      c.save();c.translate(x,y);
      const t=this.clock*7+x;
      const glow=c.createRadialGradient(0,0,1,0,0,25);glow.addColorStop(0,'rgba(255,174,49,.35)');glow.addColorStop(1,'rgba(255,121,12,0)');c.fillStyle=glow;c.fillRect(-25,-25,50,50);
      path(c,[[-8,6],[-9,-3],[-4,-14-Math.sin(t)*5],[0,-6],[4,-21-Math.sin(t+2)*7],[9,-6],[8,5]],'#ed8d29');
      path(c,[[-4,5],[-3,-5],[1,-12-Math.sin(t+1)*5],[5,-1],[3,5]],'#ffda70');c.restore();
    }

    _drawUnit(u, state) {
      const c=this.ctx, v=this.unitVisuals.get(u.id)||{move:0,attack:0,hit:0,phase:0};
      const animation=this._animationAsset(u);
      const direction=u.facing === -1 || u.facing === 1 ? u.facing : u.side==='player'?1:-1, heavy=u.kind===2;
      const dead=u.dead?clamp((u.anim||0)/.65,0,1):0;
      const stride=Math.sin((u.anim||this.clock)*10+v.phase);
      const bob=animation?0:v.move*Math.abs(stride)*(heavy?2:3.2);
      const lunge=animation?0:v.attack*Math.sin(v.attack*Math.PI)*12;
      const footY=(u.y||510)+((u.id%3)-1)*3;
      const aspect = this.scaleY / this.scaleX;
      // Tall mobile canvases retain sprite proportions without making every soldier a giant.
      const mobileSize = Math.min(1, Math.sqrt(1.15 / Math.max(1, aspect)));
      const unitSize = mobileSize * (u.boss ? 1.16 : u.elite ? 1.06 : 1);
      const rally = !!(state && state.buffs && state.buffs.rally > 0 && u.side === 'player' && !u.dead);
      c.save();c.globalAlpha=1-dead;
      c.translate(u.x, footY);c.scale(aspect * unitSize, unitSize);c.translate(-u.x, -footY);
      if (rally || u.elite || u.boss) {
        c.save();
        const aura = c.createRadialGradient(u.x, footY-43, 5, u.x, footY-43, 69);
        const glow = rally ? 'rgba(255,153,56,.23)' : 'rgba(252,207,91,.19)';
        aura.addColorStop(0, glow); aura.addColorStop(1, 'rgba(255,190,71,0)');
        c.fillStyle = aura; c.fillRect(u.x-72, footY-115, 144, 140);
        c.globalAlpha *= .65 + Math.sin(this.clock*4 + u.id)*.15;
        ellipse(c, u.x, footY+1, heavy?45:28, heavy?10:7, null, rally?'#ffc16d':'#f4d47e');
        c.restore();
      }
      ellipse(c,u.x,footY+2,heavy?42:24,heavy?9:6,'rgba(13,17,12,.32)');
      c.save();c.globalAlpha*=.65;
      c.strokeStyle=u.side==='player'?'#79b8cc':'#dc8064';c.lineWidth=1.5;
      c.beginPath();c.ellipse(u.x,footY+2,heavy?39:22,heavy?8:5,0,0,TAU);c.stroke();c.restore();
      c.save();c.translate(u.x+direction*lunge,footY-bob+dead*14);c.scale(direction,1);
      c.rotate((animation?0:v.move*stride*.025+v.attack*.06)+dead*1.18);
      const asset=this.assets.get('unit'+u.era+'-'+u.kind);
      const height=heavy?(u.era>=3?116:119):(u.kind===1?93:101);
      if(animation||asset&&asset.loaded){
        const frame=animation?this._animationFrame(v):null;
        const w=animation?height:height*asset.img.width/asset.img.height;
        const drawSprite=()=>{
          if(animation)c.drawImage(animation.img,frame.x,frame.y,frame.size,frame.size,-w/2,-height,w,height);
          else c.drawImage(asset.img,-w/2,-height,w,height);
        };
        c.save();c.shadowColor=u.elite||u.boss?'#ffd76a':rally?'#ffb65b':'rgba(18,17,14,.38)';c.shadowBlur=u.elite||u.boss?9:rally?7:3;c.shadowOffsetY=2;
        drawSprite();c.restore();
        if(v.hit>.05){c.save();c.globalAlpha*=v.hit*.24;c.globalCompositeOperation='lighter';drawSprite();c.restore();}
      }else this._fallbackUnit(c,u,v,stride,height);
      if(v.attack>.6&&u.kind===1&&u.era>=2)this._muzzle(c,36,-51,u.era===4);
      c.restore();
      if(!u.dead){
        const y=footY-height-13;
        c.save();c.globalAlpha=u.hp<u.maxHp?.96:.68;
        roundRect(c,u.x-23,y,46,5,2,'#251f17','#a98c58');
        const health=clamp(u.hp/u.maxHp,0,1);
        const g=c.createLinearGradient(0,y,0,y+5);g.addColorStop(0,u.side==='player'?'#d3dd88':'#edb47a');g.addColorStop(1,u.side==='player'?'#78944b':'#bd553c');
        roundRect(c,u.x-22,y+1,Math.max(0.1,44*health),3,1,g);
        // Tiny coloured pennant marks remain readable when troops overlap.
        path(c,[[u.x-28,y-1],[u.x-24,y+2.5],[u.x-28,y+6],[u.x-32,y+2.5]],u.side==='player'?'#71c0d7':'#e47759','#493825',1);
        c.restore();
        if (u.boss) {
          c.save(); c.textAlign='center'; c.textBaseline='middle';
          roundRect(c,u.x-43,y-25,86,20,4,'rgba(48,28,27,.94)','#e7be68');
          path(c,[[u.x-45,y-19],[u.x-40,y-15],[u.x-45,y-11],[u.x-50,y-15]],'#f4d582','#785334',1);
          c.fillStyle='#ffe6ab'; c.font='bold 12px "Microsoft YaHei", sans-serif';
          c.fillText(String(u.name||'敌军统帅').slice(0,8),u.x,y-15);c.restore();
        } else if (u.elite) {
          path(c,[[u.x-9,y-9],[u.x-11,y-17],[u.x-4,y-13],[u.x,y-20],[u.x+4,y-13],[u.x+11,y-17],[u.x+9,y-9]],'#ffe18f','#9a7137',1);
        }
      }
      c.restore();
    }

    _fallbackUnit(c,u,v,stride) {
      const p=PALETTES[u.era], team=u.side==='player'?'#3f8194':'#a64935';
      c.lineJoin='round';c.lineCap='round';
      if(u.kind===2&&(u.era===0||u.era===1)) {this._mount(c,u,v,stride,p,team);return;}
      if(u.kind===2&&(u.era===2||u.era===3)) {this._vehicle(c,u,p,team);return;}
      const mech=u.kind===2&&u.era===4;
      if(mech)c.scale(1.25,1.25);
      const leg=v.move*stride*10;
      // Boots, bent knees and cloth are painted as separate articulated pieces.
      line(c,-9,-34,-14-leg,-18,p.dark,10);line(c,-14-leg,-18,-11-leg,0,p.dark,9);
      roundRect(c,-18-leg,-7,21,8,3,'#3b3429','#242a24');
      line(c,8,-35,13+leg,-17,p.body,11);line(c,13+leg,-17,13+leg,-1,p.dark,9);
      roundRect(c,7+leg,-7,22,8,3,'#594f3a','#2c3027');
      path(c,[[-17,-68],[6,-74],[20,-58],[15,-33],[-17,-32],[-23,-49]],p.body,'#362f28',2.5);
      path(c,[[-14,-66],[3,-69],[14,-57],[9,-39],[-13,-39]],u.era===0?'#b68a54':p.light);
      path(c,[[-19,-45],[16,-45],[21,-29],[-19,-29]],u.era===0?'#5d422c':team,'#413728',2);
      for(let i=0;i<4;i++)line(c,-13+i*9,-43,-11+i*9,-30,'rgba(24,30,23,.4)',1.5);
      line(c,-16,-65,-27,-50,p.dark,11);line(c,-27,-50,-19,-40,'#be9665',8);
      ellipse(c,1,-81,12,14,'#cfaa76','#493b2c');
      path(c,[[4,-89],[14,-83],[16,-76],[10,-74],[8,-65],[-2,-67]],'#d5ae77');
      line(c,8,-83,12,-83,'#302d26',2.5);
      if(u.era===0){
        path(c,[[-13,-78],[-14,-91],[-8,-98],[6,-99],[16,-92],[12,-87],[-4,-88],[-5,-77]],'#44362a','#30281f',2);
        path(c,[[5,-75],[14,-77],[13,-63],[3,-61],[-4,-69]],'#594230');
      }else if(u.era===1){
        path(c,[[-13,-80],[-15,-92],[-9,-101],[7,-103],[15,-94],[16,-80],[7,-81],[3,-93],[-4,-91],[-4,-80]],'#aeb6ac','#46504c',2);
        line(c,-11,-89,12,-93,'#e0debf',2);path(c,[[-1,-102],[0,-113],[11,-109],[17,-96]],team);
      }else if(u.era===2){
        path(c,[[-19,-92],[-13,-98],[-14,-108],[12,-108],[14,-98],[22,-92]],'#373c35','#b99a66',2);
        path(c,[[-12,-98],[12,-98],[10,-104],[-11,-104]],team);
      }else if(u.era===3){
        c.beginPath();c.ellipse(0,-88,16,14,0,Math.PI,TAU);c.fillStyle='#66745b';c.fill();line(c,-19,-87,19,-87,'#344335',5);line(c,-13,-88,11,-94,'#adac83',2);
      }else{
        path(c,[[-14,-77],[-17,-92],[-7,-105],[11,-102],[19,-91],[13,-75]],p.light,p.dark,2);
        path(c,[[-3,-94],[14,-91],[13,-83],[0,-84]],'#335466');line(c,-1,-91,13,-89,'#94f4f7',4);
        line(c,-8,-56,6,-59,'#73eaff',4);
      }
      // Forward arm follows the weapon; shield silhouettes distinguish melee from range.
      line(c,11,-63,21,-50,p.body,11);line(c,21,-50,33,-53,'#c39e72',8);
      if(u.kind===0){
        if(u.era===0){line(c,29,-47,40,-88,'#76532b',6);path(c,[[33,-88],[43,-100],[57,-93],[49,-79],[37,-80]],'#a5a79b','#4c5047',2);line(c,34,-85,42,-87,'#d6c8a0',2);}
        else if(u.era===1){line(c,33,-43,44,-91,'#c7ccc1',7);path(c,[[40,-87],[47,-105],[48,-87]],'#e2e1c8','#566164');line(c,26,-57,42,-52,'#b99c56',4);}
        else if(u.era===2){line(c,27,-30,49,-109,'#8e713d',5);path(c,[[43,-107],[51,-126],[55,-110],[48,-98]],'#d4d8bc','#4d625c',2);}
        else {line(c,33,-46,41,-85,p.dark,9);line(c,40,-83,45,-103,u.era===4?'#83eaff':'#b1bead',6);}
        if(u.era>0){path(c,[[-35,-66],[-12,-69],[-8,-45],[-21,-27],[-37,-39]],u.era===4?'#487891':team,'#c4b77f',3);line(c,-23,-63,-22,-35,'#dfd19f',2);}
      }else{
        if(u.era===0){line(c,30,-54,36,-86,'#6a4e30',3);ellipse(c,39,-90,7,6,'#9da18e','#525648');path(c,[[32,-55],[43,-63],[41,-49]],'#a2824f');}
        else if(u.era===1){c.beginPath();c.moveTo(36,-91);c.bezierCurveTo(62,-69,61,-49,39,-23);c.strokeStyle='#be9860';c.lineWidth=4;c.stroke();line(c,36,-91,39,-23,'#d8c39a',1);line(c,23,-55,69,-56,'#c9b78c',2);path(c,[[67,-60],[76,-56],[67,-52]],'#b9c2b4');}
        else{roundRect(c,15,-59,51,12,3,u.era===4?'#8cafb3':'#434c3b','#272f26');line(c,57,-54,78,-56,u.era===4?'#5becf8':'#333c2c',5);path(c,[[15,-54],[6,-45],[7,-36],[23,-49]],'#6b4d2f');if(u.era===3)roundRect(c,38,-48,12,15,1,'#3b4736');}
      }
    }

    _mount(c,u,v,stride,p,team) {
      c.scale(0.84, 0.84);
      const mammoth=u.era===0,leg=v.move*stride*9;
      for(const [x,phase]of[[-31,1],[-15,-1],[19,1],[38,-1]]){line(c,x,-37,x+leg*phase,-8,mammoth?'#5c4430':'#574b37',13);roundRect(c,x+leg*phase-8,-10,19,11,3,'#39352c');}
      ellipse(c,-4,-49,mammoth?52:46,mammoth?31:23,mammoth?'#81603f':'#897454','#392f26');
      path(c,[[20,-63],[36,-90],[53,-96],[69,-81],[63,-62],[43,-56]],mammoth?'#957047':'#b29464','#453627',3);
      if(mammoth){
        c.beginPath();c.moveTo(59,-72);c.bezierCurveTo(84,-61,82,-21,67,-18);c.lineWidth=15;c.strokeStyle='#927046';c.stroke();
        c.beginPath();c.moveTo(52,-60);c.bezierCurveTo(65,-31,87,-38,86,-58);c.lineWidth=5;c.strokeStyle='#efe3b7';c.stroke();ellipse(c,41,-77,15,21,'#725135','#4c3928');
        for(let i=0;i<9;i++)line(c,-44+i*9,-45,-43+i*9,-25,'#6b4c32',3);
      }else{
        path(c,[[31,-88],[31,-106],[39,-95],[51,-97],[58,-107],[60,-86]],'#68583e','#3c3327');path(c,[[-47,-49],[-64,-40],[-65,-22],[-58,-31]],'#3b3428');
        path(c,[[26,-87],[44,-92],[60,-76],[49,-65],[36,-65]],'#b0b2a0','#4f5950',2);line(c,39,-80,63,-77,team,3);
      }
      ellipse(c,58,-82,2,2,'#171f19');
      path(c,[[-31,-66],[5,-70],[18,-36],[-20,-31]],team,'#d4b275',3);
      // A visible rider, with shoulders, face, helmet and a raised weapon.
      line(c,-5,-71,9,-57,'#4c4534',10);line(c,8,-58,3,-35,'#594e35',8);
      path(c,[[-23,-103],[-4,-106],[9,-87],[-2,-65],[-22,-71]],mammoth?'#b68b54':'#aeb6aa','#483e2d',2);
      ellipse(c,-10,-116,10,12,'#d0aa74','#5d4930');
      path(c,[[-21,-118],[-19,-129],[-4,-132],[3,-118]],mammoth?'#5a412b':'#c5c8b1','#514c3b',2);
      if(!mammoth)path(c,[[-12,-130],[-10,-144],[2,-140],[8,-126]],team);
      line(c,-4,-97,16,-89,'#bba87b',7);line(c,11,-62,41,-133,mammoth?'#9a7743':'#bebca2',4);path(c,[[34,-130],[44,-151],[48,-134]],'#d6d4b8','#746f52');
    }

    _vehicle(c,u,p,team) {
      const tank=u.era===3;
      if(tank){
        roundRect(c,-54,-31,112,31,13,'#29382c','#182c21');
        for(let i=0;i<6;i++){ellipse(c,-42+i*18,-15,10,10,'#72795c','#283b2a');ellipse(c,-42+i*18,-15,4,4,'#384b34');}
        path(c,[[-55,-28],[-43,-51],[29,-55],[52,-38],[62,-26]],'#6e7959','#293e2c',3);
        path(c,[[-27,-53],[-25,-73],[9,-82],[33,-68],[32,-51]],'#889270','#304630',3);
        line(c,21,-64,77,-66,'#475d40',12);line(c,25,-69,78,-71,'#a2af81',3);roundRect(c,-20,-84,37,7,2,'#4a623f','#2c422c');
        path(c,[[-19,-42],[-8,-42],[-8,-33],[-19,-33]],team);line(c,-40,-52,-49,-94,'#303d2b',2);
        for(let i=0;i<7;i++)ellipse(c,-40+i*13,-31,1.5,1.5,'#b2b78e');
      }else{
        path(c,[[-39,-18],[-23,-34],[48,-30],[64,-18]],'#8a643a','#493922',3);
        c.save();c.translate(-9,-46);c.rotate(-.13);roundRect(c,-39,-16,90,23,5,'#585b45','#2e3928');roundRect(c,47,-17,10,26,2,'#454d37','#242e22');line(c,-28,-13,42,-13,'#afab7f',3);c.restore();
        for(const x of[-25,29]){ellipse(c,x,-15,22,22,'#755531','#c2a46a');ellipse(c,x,-15,17,17,'#423c28','#c4a369');for(let i=0;i<6;i++){const a=i*TAU/6;line(c,x,-15,x+Math.cos(a)*16,-15+Math.sin(a)*16,'#b49257',3);}ellipse(c,x,-15,5,5,'#dac088','#755933');}
        path(c,[[-45,-33],[-51,-52],[-55,-76],[-44,-90],[-29,-90],[-21,-71],[-27,-43]],'#805c38','#3c3325',2);
        ellipse(c,-38,-99,10,12,'#c9a571','#584b31');path(c,[[-53,-106],[-47,-120],[-25,-120],[-22,-108]],'#3d4735','#b59b63',2);
        line(c,-32,-79,-12,-51,'#bea176',7);line(c,-42,-41,-53,-8,'#514c32',10);line(c,-30,-40,-38,-7,'#685a36',10);
      }
    }

    _muzzle(c,x,y,future) {
      c.save();c.globalCompositeOperation='lighter';c.shadowColor=future?'#7df6ff':'#ffc65b';c.shadowBlur=14;
      path(c,[[x,y-3],[x+15,y-10],[x+10,y-3],[x+29,y],[x+12,y+5],[x+15,y+11],[x,y+4]],future?'#adfaff':'#ffe9a1');c.restore();
    }

    _projectile(p,state) {
      const c=this.ctx,direction=p.side==='player'?1:-1,era=p.side==='player'?state.era:state.enemyEra;
      c.save();c.translate(p.x,p.y);c.rotate(direction<0?Math.PI:0);
      if(era===0&&p.kind!==3){ellipse(c,0,0,5,4,'#b6b39a','#5a5e4f');line(c,-12,2,-4,1,'rgba(238,208,148,.6)',2);}
      else if(era===1){line(c,-25,0,7,0,'#d1bc87',2);path(c,[[6,-3],[13,0],[6,3]],'#d4dcc9');line(c,-20,0,-26,-4,'#c6a867',2);line(c,-20,0,-26,4,'#c6a867',2);}
      else {
        c.globalCompositeOperation='lighter';c.shadowColor=era===4?'#83f8ff':'#ffbc58';c.shadowBlur=10;
        line(c,-23,0,0,0,era===4?'rgba(88,220,255,.4)':'rgba(255,172,65,.45)',p.kind===3?5:3);
        line(c,-8,0,3,0,era===4?'#c1ffff':'#fff0ad',p.kind===3?5:3);ellipse(c,3,0,p.kind===3?4:2.5,p.kind===3?4:2.5,'#fff2c5');
      }
      c.restore();
    }

    _effect(fx,state) {
      const c=this.ctx,life=clamp(fx.life/Math.max(.001,fx.maxLife),0,1),t=1-life;
      c.save();
      if(fx.type==='special'){
        const era=state.era;
        if(era===4){
          const beam=c.createLinearGradient(fx.x-35,0,fx.x+35,0);beam.addColorStop(0,'rgba(61,205,255,0)');beam.addColorStop(.45,'rgba(135,244,255,.65)');beam.addColorStop(.5,'rgba(239,255,255,.95)');beam.addColorStop(.55,'rgba(135,244,255,.65)');beam.addColorStop(1,'rgba(61,205,255,0)');
          c.globalAlpha=life;c.fillStyle=beam;c.fillRect(fx.x-35,0,70,510);
        }else if(era===1){
          c.globalAlpha=life;
          for(let i=0;i<13;i++){const x=fx.x-155+seeded(i+90)*310,y=-90+t*760+seeded(i+11)*90;line(c,x-30,y-100,x,y,'#ffd283',2);ellipse(c,x,y,3,5,'#ffb456');}
        }else{
          c.globalAlpha=life;
          const x=fx.x-80+Math.min(1,t*3)*80,y=-40+Math.min(1,t*3)*515;
          if(t<.45){line(c,x-60,y-130,x,y,'rgba(255,192,96,.5)',18);line(c,x-40,y-90,x,y,'#f5bd5f',9);ellipse(c,x,y,era===0?24:14,era===0?23:14,era===0?'#8d7a55':'#ffefb6','#c1a976');}
        }
        c.globalAlpha=life*.6;c.strokeStyle=era===4?'#95f6fb':'#ffe0a0';c.lineWidth=6*life;c.beginPath();c.ellipse(fx.x,505,35+t*190,12+t*35,0,0,TAU);c.stroke();
        const explosion=c.createRadialGradient(fx.x,483,1,fx.x,483,140*t+30);explosion.addColorStop(0,era===4?'rgba(164,246,255,.8)':'rgba(255,217,131,.7)');explosion.addColorStop(1,'rgba(255,176,58,0)');c.fillStyle=explosion;c.fillRect(fx.x-200,320,400,230);
        c.globalAlpha=life;c.textAlign='center';c.font='bold 22px "STKaiti", "KaiTi", serif';c.lineWidth=4;c.strokeStyle='#53381e';c.strokeText(fx.text||'',fx.x,345-t*35);c.fillStyle='#fff0be';c.fillText(fx.text||'',fx.x,345-t*35);
      }else if(fx.type==='repair'){
        c.globalAlpha=life;c.fillStyle='#d7ffc2';c.font='bold 26px Georgia';c.textAlign='center';c.shadowColor='#58a971';c.shadowBlur=12;c.fillText(fx.text||'+',fx.x,fx.y-t*45);
      }else if(fx.type==='heal'){
        const x=fx.x, y=(fx.y||461)-t*34;
        c.globalAlpha=life;c.shadowColor='#8ef3a7';c.shadowBlur=8;
        roundRect(c,x-3,y-11,6,22,1,'#caffd4');roundRect(c,x-11,y-3,22,6,1,'#caffd4');
        c.globalAlpha=life*.55;c.strokeStyle='#bcf8c7';c.lineWidth=2;
        c.beginPath();c.ellipse(x,505,15+t*29,5+t*7,0,0,TAU);c.stroke();
      }else if(fx.type==='rally'||fx.type==='upgrade'||fx.type==='capture'||fx.type==='outpost'){
        const x=Number.isFinite(fx.x)?fx.x:fx.type==='upgrade'?125:800;
        const color=fx.type==='rally'?'#ffd091':fx.side==='enemy'?'#ffa685':fx.type==='upgrade'?'#ffe8a6':'#adeaff';
        c.globalAlpha=life;c.strokeStyle=color;c.lineWidth=3*life;
        c.beginPath();c.ellipse(x,505,25+t*90,8+t*21,0,0,TAU);c.stroke();
        c.fillStyle=color;c.textAlign='center';c.font='bold 19px "Microsoft YaHei", sans-serif';
        c.shadowColor='#3c2c1b';c.shadowBlur=4;
        const label=fx.text||(fx.type==='rally'?'战意鼓舞':fx.type==='upgrade'?'军备升级':'据点易主');
        c.fillText(label,x,(fx.y||392)-t*30);
      }else if(fx.type==='hit'){
        c.translate(fx.x,fx.y);c.globalAlpha=life;c.globalCompositeOperation='lighter';c.strokeStyle=fx.color||'#ffe4ae';c.lineWidth=2;
        for(let i=0;i<6;i++){const a=i*TAU/6;line(c,Math.cos(a)*6,Math.sin(a)*6,Math.cos(a)*(9+t*16),Math.sin(a)*(9+t*16),fx.color||'#ffe4ae',2);}
      }
      c.restore();
    }

    _drawParticles() {
      const c=this.ctx;c.save();
      for(const p of this.particles){c.globalAlpha=clamp(p.life/p.max,0,1)*.85;ellipse(c,p.x,p.y,p.size,p.size*.65,p.color);}
      c.restore();
    }

    _foreground() {
      const c=this.ctx;
      // A few hand-painted leaves and stones sit in front of the feet, adding depth.
      c.save();c.globalAlpha=.64;
      for(let i=0;i<18;i++){
        const x=seeded(i+323)*1600,y=533+seeded(i+16)*83;
        const color=i%2?'#7b7948':'#a39253';
        for(let j=0;j<3;j++){c.beginPath();c.moveTo(x+j*3,y);c.quadraticCurveTo(x+j*4-5,y-8,x+j*3-8,y-13-seeded(i)*8);c.strokeStyle=color;c.lineWidth=1.6;c.stroke();}
        if(i%3===0)ellipse(c,x+14,y,7,3,'#877653','#4d4c30');
      }
      c.restore();
      const foot=c.createLinearGradient(0,584,0,640);foot.addColorStop(0,'rgba(24,20,12,0)');foot.addColorStop(1,'rgba(24,20,12,.24)');c.fillStyle=foot;c.fillRect(0,584,1600,56);
    }

    _target(x,era) {
      const c=this.ctx;x=clamp(x,220,1380);c.save();
      const pulse=.6+.15*Math.sin(this.clock*7);
      c.globalAlpha=pulse;c.fillStyle='rgba(255,170,56,.18)';c.beginPath();c.ellipse(x,508,180,38,0,0,TAU);c.fill();
      c.setLineDash([9,6]);c.strokeStyle='#ffe3a0';c.lineWidth=2;c.stroke();c.setLineDash([]);
      line(c,x-25,480,x+25,480,'#ffedb2',2);line(c,x,456,x,504,'#ffedb2',2);ellipse(c,x,480,12,12,null,'#ffedb2');
      c.globalAlpha=1;c.textAlign='center';c.font='bold 19px "Microsoft YaHei", sans-serif';c.strokeStyle='#563b22';c.lineWidth=4;c.strokeText('点击战场 · 释放战术技能',x,408);c.fillStyle='#ffe9b6';c.fillText('点击战场 · 释放战术技能',x,408);c.restore();
    }

    destroy() {
      if(this.resizeObserver)this.resizeObserver.disconnect();
      this.particles.length=0;this.unitVisuals.clear();this.assets.clear();
    }
  }

  window.WarRenderer = WarRenderer;
  window.GameRenderer = WarRenderer;
})();
