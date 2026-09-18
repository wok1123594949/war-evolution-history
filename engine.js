(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WarEngine = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var WORLD_WIDTH = 1600;
  var GROUND_Y = 510;
  var DT = 1 / 60;
  var VERSION = 2;
  var MAX_PER_SIDE = 24;
  var MAX_PROJECTILES = 100;
  var MAX_EFFECTS = 100;

  var ERAS = [
    { id: 0, name: '石器时代', subtitle: '火种与石斧', color: '#c98b54', xpRequired: 120, specialName: '巨石投掷', turretCost: 95, repairCost: 45,
      units: [
        { name: '石斧兵', role: '肉盾近战', cost: 28, hp: 145, damage: 16, range: 48, speed: 47, trainTime: 2.8, description: '结实的近战战士' },
        { name: '投石手', role: '远程', cost: 40, hp: 74, damage: 22, range: 250, speed: 29, trainTime: 3.8, description: '站在后排投掷石块' },
        { name: '猛犸骑手', role: '重装', cost: 68, hp: 260, damage: 30, range: 55, speed: 22, trainTime: 5.3, description: '缓慢但难以阻挡' }
      ] },
    { id: 1, name: '中世纪', subtitle: '城堡与骑士', color: '#d99f4a', xpRequired: 220, specialName: '烈焰箭雨', turretCost: 145, repairCost: 65,
      units: [
        { name: '长剑卫士', role: '肉盾近战', cost: 40, hp: 205, damage: 23, range: 50, speed: 51, trainTime: 2.7, description: '举盾持剑的坚实前锋' },
        { name: '长弓手', role: '远程', cost: 54, hp: 100, damage: 32, range: 280, speed: 32, trainTime: 3.6, description: '稳定的远程火力' },
        { name: '重骑士', role: '重装', cost: 84, hp: 350, damage: 43, range: 58, speed: 27, trainTime: 5.1, description: '重甲骑士，突破敌方阵线' }
      ] },
    { id: 2, name: '火药时代', subtitle: '炮火与列阵', color: '#d96b43', xpRequired: 350, specialName: '火炮轰击', turretCost: 210, repairCost: 85,
      units: [
        { name: '长枪兵', role: '肉盾近战', cost: 52, hp: 285, damage: 32, range: 56, speed: 55, trainTime: 2.7, description: '用长枪守住战线' },
        { name: '火枪手', role: '远程', cost: 70, hp: 135, damage: 48, range: 320, speed: 35, trainTime: 3.5, description: '一轮齐射撕开防线' },
        { name: '加农炮车', role: '重装', cost: 108, hp: 470, damage: 66, range: 240, speed: 25, trainTime: 5.0, description: '炮弹爆炸伤害范围内的敌人' }
      ] },
    { id: 3, name: '工业时代', subtitle: '钢铁与蒸汽', color: '#71828a', xpRequired: 520, specialName: '蒸汽冲击', turretCost: 290, repairCost: 110,
      units: [
        { name: '钢铁卫兵', role: '肉盾近战', cost: 67, hp: 390, damage: 44, range: 60, speed: 58, trainTime: 2.6, description: '钢板包裹的推进者' },
        { name: '机枪兵', role: '远程', cost: 89, hp: 178, damage: 67, range: 350, speed: 38, trainTime: 3.4, description: '持续压制敌方阵线' },
        { name: '坦克', role: '重装', cost: 138, hp: 660, damage: 92, range: 280, speed: 29, trainTime: 4.9, description: '远程炮击，压制成群的敌人' }
      ] },
    { id: 4, name: '未来时代', subtitle: '能量与星舰', color: '#59d0d2', xpRequired: null, specialName: '轨道打击', turretCost: 380, repairCost: 140,
      units: [
        { name: '能量先锋', role: '肉盾近战', cost: 84, hp: 530, damage: 60, range: 64, speed: 62, trainTime: 2.5, description: '用护盾撕开战线' },
        { name: '粒子射手', role: '远程', cost: 112, hp: 236, damage: 92, range: 390, speed: 42, trainTime: 3.3, description: '粒子束精准命中目标' },
        { name: '巨型机甲', role: '重装', cost: 175, hp: 900, damage: 128, range: 330, speed: 32, trainTime: 4.8, description: '高能炮火对敌军造成范围伤害' }
      ] }
  ];

  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function num(v, fallback, lo, hi) { return typeof v === 'number' && isFinite(v) ? clamp(v, lo, hi) : fallback; }
  function text(v, fallback) { return typeof v === 'string' ? v.slice(0, 120) : fallback; }

  function Engine(options) {
    options = options || {};
    this.difficulty = options.difficulty === 'easy' || options.difficulty === 'hard' ? options.difficulty : 'normal';
    this.seed = ((Number.isFinite(options.seed) ? options.seed : Date.now()) >>> 0) || 1;
    this.rngState = this.seed;
    this.nextId = 1;
    this.events = [];
    this.accumulator = 0;
    this.state = this._defaultState();
    this._eventsPush('start', '战争开始！守住你的基地。');
  }

  Engine.prototype._defaultState = function () {
    var hp = 2100;
    return {
      version: VERSION, time: 0, era: 0, enemyEra: 0, gold: 180, xp: 0,
      bases: { player: { hp: hp, maxHp: hp, turrets: 0, hitFlash: 0 }, enemy: { hp: hp, maxHp: hp, turrets: 1, hitFlash: 0 } },
      units: [], projectiles: [], effects: [], queue: [], enemyQueue: [],
      cooldowns: { special: 0, repair: 0 },
      stats: { kills: 0, deployed: 0, goldEarned: 0 },
      status: 'playing', speed: 1, enemyTimer: 3.5,
      nextEnemyWave: 38, turretTimers: { player: 0, enemy: 0 }, populationCap: MAX_PER_SIDE
    };
  };

  Engine.prototype._eventsPush = function (type, textValue, side) {
    var event = { type: type, text: textValue };
    if (side) event.side = side;
    this.events.push(event);
    if (this.events.length > 200) this.events.shift();
  };

  Engine.prototype.drainEvents = function () {
    var out = this.events.slice(); this.events.length = 0; return out;
  };

  Engine.prototype._rand = function () {
    this.rngState = (Math.imul(this.rngState, 1664525) + 1013904223) >>> 0;
    return this.rngState / 4294967296;
  };

  Engine.prototype._newId = function () { return this.nextId++; };

  Engine.prototype._actionAllowed = function (name) {
    if (this.state.status === 'won' || this.state.status === 'lost') return { ok: false, reason: '战斗已经结束' };
    if (this.state.status === 'paused' && name !== 'togglePause') return { ok: false, reason: '战斗已暂停' };
    return null;
  };

  Engine.prototype._action = function (ok, reason, extra) {
    var result = { ok: !!ok };
    if (!ok) result.reason = reason || '操作失败';
    if (extra) for (var k in extra) result[k] = extra[k];
    return result;
  };

  Engine.prototype.deploy = function (index) {
    var blocked = this._actionAllowed('deploy'); if (blocked) return blocked;
    if (!Number.isInteger(index) || index < 0 || index > 2) return this._action(false, '没有这个兵种');
    var era = ERAS[this.state.era], def = era.units[index];
    if (!def) return this._action(false, '没有这个兵种');
    if (this._population('player') + this.state.queue.length >= MAX_PER_SIDE) return this._action(false, '部队已达 24 人上限');
    if (this.state.queue.length >= 5) return this._action(false, '训练队列已满');
    if (this.state.gold < def.cost) return this._action(false, '金币不足');
    this.state.gold -= def.cost;
    this.state.stats.deployed += 1;
    this.state.queue.push({ side: 'player', era: this.state.era, kind: index, remaining: def.trainTime, total: def.trainTime });
    this._eventsPush('deploy', def.name + ' 加入训练队列', 'player');
    return this._action(true, '', { queueLength: this.state.queue.length });
  };

  Engine.prototype._enemyDeploy = function (index) {
    if (this.state.status !== 'playing') return;
    if (this.state.enemyQueue.length >= 5 || this._population('enemy') + this.state.enemyQueue.length >= MAX_PER_SIDE) return;
    var era = ERAS[this.state.enemyEra], def = era.units[index];
    this.state.enemyQueue.push({ side: 'enemy', era: this.state.enemyEra, kind: index, remaining: def.trainTime * 0.82, total: def.trainTime * 0.82 });
  };

  Engine.prototype.evolve = function () {
    var blocked = this._actionAllowed('evolve'); if (blocked) return blocked;
    if (this.state.era >= ERAS.length - 1) return this._action(false, '已经是最终时代');
    var cost = ERAS[this.state.era].xpRequired;
    if (this.state.xp < cost) return this._action(false, '经验不足，还需要 ' + Math.ceil(cost - this.state.xp) + ' XP');
    this.state.xp -= cost; this.state.era += 1;
    this._upgradeBase('player');
    this._effect('evolve', 125, 415, 1.5, ERAS[this.state.era].color);
    this._eventsPush('evolve', '进入 ' + ERAS[this.state.era].name + '！', 'player');
    return this._action(true, '', { era: this.state.era });
  };

  Engine.prototype._upgradeBase = function (side) {
    var base = this.state.bases[side];
    var growth = [0, 450, 1050, 1750, 2700];
    var era = side === 'player' ? this.state.era : this.state.enemyEra;
    var target = 2100 + growth[era];
    base.maxHp = Math.max(base.maxHp, target); base.hp = Math.min(base.maxHp, base.hp + 400 + era * 150);
  };

  Engine.prototype.buyTurret = function () {
    var blocked = this._actionAllowed('buyTurret'); if (blocked) return blocked;
    var era = ERAS[this.state.era];
    if (this.state.gold < era.turretCost) return this._action(false, '金币不足');
    if (this.state.bases.player.turrets >= 3) return this._action(false, '炮塔已达上限');
    this.state.gold -= era.turretCost; this.state.bases.player.turrets += 1;
    this._eventsPush('turret', '防御炮塔升至 ' + this.state.bases.player.turrets + ' 级', 'player');
    return this._action(true, '');
  };

  Engine.prototype.repair = function () {
    var blocked = this._actionAllowed('repair'); if (blocked) return blocked;
    if (this.state.cooldowns.repair > 0) return this._action(false, '维修还在冷却');
    var era = ERAS[this.state.era];
    if (this.state.gold < era.repairCost) return this._action(false, '金币不足');
    var base = this.state.bases.player;
    if (base.hp >= base.maxHp) return this._action(false, '基地无需维修');
    this.state.gold -= era.repairCost; base.hp = Math.min(base.maxHp, base.hp + 260 + this.state.era * 80);
    this.state.cooldowns.repair = 12;
    this._effect('repair', 125, 420, 1.2, '#6ff0b0', '+' + Math.round(260 + this.state.era * 80));
    this._eventsPush('repair', '基地修复完成', 'player');
    return this._action(true, '');
  };

  Engine.prototype.special = function (targetX) {
    var blocked = this._actionAllowed('special'); if (blocked) return blocked;
    if (this.state.cooldowns.special > 0) return this._action(false, '技能还在冷却');
    var enemies = this.state.units.filter(function (u) { return u.side === 'enemy' && !u.dead; });
    var defaultX = enemies.length ? enemies.reduce(function (a, b) { return a.x < b.x ? a : b; }).x + 60 : 1260;
    var x = typeof targetX === 'number' && isFinite(targetX) ? clamp(targetX, 220, 1380) : defaultX;
    var damage = 160 + this.state.era * 95;
    var hit = 0;
    for (var i = 0; i < this.state.units.length; i++) {
      var u = this.state.units[i];
      if (u.side === 'enemy' && !u.dead && Math.abs(u.x - x) <= 180) { this._damageUnit(u, damage, 'player'); hit += 1; }
    }
    if (Math.abs(1475 - x) <= 180) { this._damageBase('enemy', Math.round(damage * 0.45)); }
    this.state.cooldowns.special = Math.max(22, 34 - this.state.era * 2);
    this._effect('special', x, 475, 1.3, ERAS[this.state.era].color, ERAS[this.state.era].specialName, 180);
    this._eventsPush('special', ERAS[this.state.era].specialName + ' 命中 ' + hit + ' 个目标', 'player');
    this._finish();
    return this._action(true, '', { hit: hit });
  };

  Engine.prototype.setSpeed = function (speed) {
    var blocked = this._actionAllowed('setSpeed'); if (blocked) return blocked;
    speed = Number(speed) === 2 ? 2 : Number(speed) === 1 ? 1 : 0;
    if (!speed) return this._action(false, '速度只能是 1 或 2');
    this.state.speed = speed; return this._action(true, '');
  };

  Engine.prototype.togglePause = function () {
    if (this.state.status === 'won' || this.state.status === 'lost') return this._action(false, '战斗已经结束');
    this.state.status = this.state.status === 'paused' ? 'playing' : 'paused';
    this._eventsPush('pause', this.state.status === 'paused' ? '战斗暂停' : '战斗继续');
    return this._action(true, '');
  };

  Engine.prototype._population = function (side) {
    return this.state.units.filter(function (u) { return u.side === side && !u.dead; }).length;
  };

  Engine.prototype._ranged = function (u) { return u.kind === 1 || (u.kind === 2 && u.era >= 2); };
  Engine.prototype._formation = function (u) { return this._ranged(u) ? (u.kind === 2 ? 2 : 1) : 0; };
  Engine.prototype._radius = function (kind) { return kind === 2 ? 24 : 15; };
  Engine.prototype._baseX = function (side) { return side === 'player' ? 125 : 1475; };
  Engine.prototype._enemySide = function (side) { return side === 'player' ? 'enemy' : 'player'; };
  Engine.prototype._interval = function (u) { return u.kind === 1 ? 1.35 : u.kind === 2 ? 1.85 : 1.0; };

  Engine.prototype._effect = function (type, x, y, life, color, label, radius) {
    this.state.effects.push({ type: type, x: x, y: y, life: life, maxLife: life, color: color || '#f8db74', text: label || '', radius: radius || 0 });
    if (this.state.effects.length > MAX_EFFECTS) this.state.effects.shift();
  };

  Engine.prototype._spawnFromQueue = function (entry) {
    if (this._population(entry.side) >= MAX_PER_SIDE) return false;
    var def = ERAS[entry.era].units[entry.kind], side = entry.side;
    var baseX = side === 'player' ? 202 : 1398, direction = side === 'player' ? 1 : -1;
    var radius = this._radius(entry.kind), formation = this._formation(entry);
    // The training gate holds a completed unit until there is room to walk out.
    for (var i = 0; i < this.state.units.length; i++) {
      var friend = this.state.units[i];
      if (!friend.dead && friend.side === side && this._formation(friend) === formation && Math.abs(friend.x - baseX) < radius + friend.radius + 6) return false;
    }
    var unit = { id: this._newId(), side: side, era: entry.era, kind: entry.kind, x: baseX, y: GROUND_Y,
      hp: def.hp, maxHp: def.hp, damage: def.damage, range: def.range, speed: def.speed,
      attackTimer: 0.15 + this._rand() * 0.15, anim: 0, dead: false, hitRewarded: false, radius: radius,
      moving: false, attackFlash: 0, hitFlash: 0, facing: direction };
    this.state.units.push(unit);
    this._eventsPush('spawn', def.name + ' 抵达战场', side);
    return true;
  };

  Engine.prototype._damageUnit = function (unit, amount, attackerSide) {
    if (!unit || unit.dead || !Number.isFinite(amount) || amount <= 0) return;
    unit.hp = Math.max(0, unit.hp - amount); unit.hitFlash = 0.12;
    if (unit.hp <= 0) {
      unit.dead = true; unit.anim = 0; unit.moving = false;
      this._effect('death', unit.x, GROUND_Y - 26, 0.45, unit.side === 'player' ? '#8acbd7' : '#e99165', '', unit.radius);
      if (!unit.hitRewarded) {
        unit.hitRewarded = true;
        if (attackerSide === 'player' && unit.side === 'enemy') {
          var reward = Math.round(ERAS[unit.era].units[unit.kind].cost * 0.6);
          var xp = 13 + unit.era * 6 + unit.kind * 3;
          this.state.stats.kills++; this.state.xp += xp; this.state.gold += reward; this.state.stats.goldEarned += reward;
          this._effect('reward', unit.x, GROUND_Y - 70, 0.9, '#f8db74', '+' + reward);
          this._eventsPush('kill', '+' + reward + ' 金币，+' + xp + ' XP', 'player');
        }
      }
    }
  };

  Engine.prototype._damageBase = function (side, damage) {
    var base = this.state.bases[side];
    if (base.hp <= 0) return;
    base.hp = Math.max(0, base.hp - damage); base.hitFlash = 0.2;
    this._effect('hit', this._baseX(side), GROUND_Y - 55, 0.25, '#f6bf68');
  };

  Engine.prototype._nearestEnemy = function (unit) {
    var best = null, dist = Infinity;
    for (var i = 0; i < this.state.units.length; i++) {
      var other = this.state.units[i]; if (other.dead || other.side === unit.side) continue;
      var d = Math.abs(other.x - unit.x); if (d < dist) { best = other; dist = d; }
    }
    return best;
  };

  Engine.prototype._blockingEnemy = function (unit, baseSide) {
    var baseX = this._baseX(baseSide), lo = Math.min(baseX, unit.x), hi = Math.max(baseX, unit.x);
    return this.state.units.some(function (other) {
      return !other.dead && other.side !== unit.side && other.x >= lo - other.radius && other.x <= hi + other.radius;
    });
  };

  Engine.prototype._fire = function (unit, target, baseSide) {
    if (unit.attackTimer > 0) return;
    unit.attackTimer = this._interval(unit); unit.attackFlash = 0.2;
    var targetX = target ? target.x : this._baseX(baseSide), targetY = GROUND_Y - 30;
    unit.facing = targetX >= unit.x ? 1 : -1;
    if (this._ranged(unit)) {
      if (this.state.projectiles.length >= MAX_PROJECTILES) return;
      this.state.projectiles.push({ id: this._newId(), x: unit.x, y: GROUND_Y - (unit.kind === 2 ? 44 : 38),
        targetId: target ? target.id : null, baseTarget: baseSide || null, targetX: targetX, targetY: targetY,
        side: unit.side, era: unit.era, kind: unit.kind, life: 3, damage: unit.damage,
        splash: unit.kind === 2 ? 75 + unit.era * 8 : 0 });
    } else if (target) {
      this._damageUnit(target, unit.damage, unit.side);
      this._effect('slash', (unit.x + target.x) / 2, GROUND_Y - 32, 0.15, '#ffe7a9');
    } else this._damageBase(baseSide, unit.damage);
  };

  Engine.prototype._unitAttack = function (unit, target) {
    if (!target || target.dead) return false;
    if (Math.abs(target.x - unit.x) <= unit.range + target.radius + unit.radius) { this._fire(unit, target, null); return true; }
    return false;
  };

  Engine.prototype._unitBaseAttack = function (unit, baseSide) {
    if (this._blockingEnemy(unit, baseSide)) return false;
    var base = this.state.bases[baseSide];
    if (base.hp <= 0) return true;
    if (Math.abs(this._baseX(baseSide) - unit.x) <= unit.range + 58) { this._fire(unit, null, baseSide); return true; }
    return false;
  };

  Engine.prototype._moveUnits = function (dt) {
    var live = this.state.units.filter(function (u) { return !u.dead; });
    // Front units move first. Separate formations allow melee to pass archers and artillery.
    live.sort(function (a, b) { return a.side === b.side ? (a.side === 'player' ? b.x - a.x : a.x - b.x) : (a.side === 'player' ? -1 : 1); });
    for (var i = 0; i < live.length; i++) {
      var u = live[i]; if (u.dead) continue;
      u.anim += dt; u.moving = false; u.attackTimer = Math.max(0, u.attackTimer - dt);
      u.attackFlash = Math.max(0, u.attackFlash - dt); u.hitFlash = Math.max(0, u.hitFlash - dt);
      var enemy = this._nearestEnemy(u);
      if (this._unitAttack(u, enemy)) continue;
      var direction = u.side === 'player' ? 1 : -1;
      if (this._unitBaseAttack(u, this._enemySide(u.side))) continue;
      var desired = u.x + direction * u.speed * dt, formation = this._formation(u);
      for (var j = 0; j < live.length; j++) {
        var other = live[j]; if (other === u || other.dead) continue;
        var ahead = (other.x - u.x) * direction;
        if (ahead <= 0) continue;
        if (other.side === u.side && this._formation(other) !== formation) continue;
        var gap = u.radius + other.radius + (other.side === u.side ? 8 : 5);
        if (direction > 0) desired = Math.min(desired, Math.max(u.x, other.x - gap));
        else desired = Math.max(desired, Math.min(u.x, other.x + gap));
      }
      desired = clamp(desired, 168, 1432); u.moving = Math.abs(desired - u.x) > 0.001; u.x = desired; u.facing = direction;
    }
  };

  Engine.prototype._turretFire = function (side, dt) {
    this.state.turretTimers[side] = Math.max(0, this.state.turretTimers[side] - dt);
    var level = this.state.bases[side].turrets, era = side === 'player' ? this.state.era : this.state.enemyEra;
    if (this.state.turretTimers[side] > 0 || level <= 0 || this.state.bases[side].hp <= 0) return;
    var targetSide = this._enemySide(side), target = null, distance = Infinity, range = 340 + era * 20 + level * 25;
    for (var i = 0; i < this.state.units.length; i++) {
      var u = this.state.units[i]; if (u.dead || u.side !== targetSide) continue;
      var d = Math.abs(u.x - this._baseX(side)); if (d < distance && d <= range) { target = u; distance = d; }
    }
    if (!target || this.state.projectiles.length >= MAX_PROJECTILES) return;
    this.state.turretTimers[side] = 1.65 - (level - 1) * 0.2;
    this.state.projectiles.push({ id: this._newId(), x: side === 'player' ? 160 : 1440, y: 395,
      targetId: target.id, baseTarget: null, targetX: target.x, targetY: GROUND_Y - 30,
      side: side, era: era, kind: 3, life: 3, damage: (22 + era * 12) * (1 + (level - 1) * 0.4), splash: 0 });
  };

  Engine.prototype._stepProjectiles = function (dt) {
    var keep = [], unitsById = Object.create(null);
    for (var i = 0; i < this.state.units.length; i++) unitsById[this.state.units[i].id] = this.state.units[i];
    for (var j = 0; j < this.state.projectiles.length; j++) {
      var p = this.state.projectiles[j]; p.life -= dt;
      if (p.life <= 0) continue;
      var target = unitsById[p.targetId];
      if (target && !target.dead) p.targetX = target.x;
      var dx = p.targetX - p.x, dy = p.targetY - p.y, dist = Math.sqrt(dx * dx + dy * dy);
      var speed = p.kind === 3 ? 540 : p.kind === 2 ? 350 : 450 + p.era * 45;
      if (dist <= speed * dt + 3) {
        p.x = p.targetX; p.y = p.targetY;
        if (p.splash > 0) {
          for (var k = 0; k < this.state.units.length; k++) {
            var victim = this.state.units[k];
            if (victim.side !== p.side && !victim.dead && Math.abs(victim.x - p.x) <= p.splash + victim.radius) this._damageUnit(victim, p.damage * (victim.id === p.targetId ? 1 : 0.65), p.side);
          }
          this._effect('explosion', p.x, p.y, 0.5, '#ffc266', '', p.splash);
        } else if (target && !target.dead && Math.abs(target.x - p.x) <= target.radius + 18) this._damageUnit(target, p.damage, p.side);
        if (p.baseTarget) {
          // Defenders can intercept a shell that was launched at their base.
          var intercept = null;
          for (var m = 0; m < this.state.units.length; m++) {
            var defender = this.state.units[m];
            if (defender.side === p.baseTarget && !defender.dead && Math.abs(defender.x - p.x) < 125) { intercept = defender; break; }
          }
          if (intercept) { if (!p.splash) this._damageUnit(intercept, p.damage, p.side); }
          else this._damageBase(p.baseTarget, p.damage);
        }
        this._effect('hit', p.x, p.y, 0.2, p.side === 'player' ? '#f8db74' : '#ff8c73');
      } else { p.x += dx / dist * speed * dt; p.y += dy / dist * speed * dt; keep.push(p); }
    }
    this.state.projectiles = keep;
  };

  Engine.prototype._trainQueue = function (queue, dt) {
    if (!queue.length) return;
    queue[0].remaining = Math.max(0, queue[0].remaining - dt);
    if (queue[0].remaining === 0 && this._spawnFromQueue(queue[0])) queue.shift();
  };

  Engine.prototype._train = function (dt) {
    this._trainQueue(this.state.queue, dt); this._trainQueue(this.state.enemyQueue, dt);
  };

  Engine.prototype._enemyThink = function (dt) {
    var thresholds = this.difficulty === 'easy' ? [0, 85, 165, 250, 350] : this.difficulty === 'hard' ? [0, 48, 105, 165, 240] : [0, 62, 130, 210, 295];
    if (this.state.enemyEra < 4 && this.state.time >= thresholds[this.state.enemyEra + 1] && this.state.enemyEra < this.state.era + 1) {
      this.state.enemyEra++; this._upgradeBase('enemy');
      this.state.bases.enemy.turrets = this.state.enemyEra >= 2 ? 2 : 1;
      this._eventsPush('enemyEvolve', '敌军进入 ' + ERAS[this.state.enemyEra].name, 'enemy');
      this._effect('evolve', 1475, 415, 1.5, ERAS[this.state.enemyEra].color);
    }
    this.state.enemyTimer -= dt;
    if (this.state.enemyTimer > 0) return;
    var tempo = this.difficulty === 'easy' ? 8.3 : this.difficulty === 'hard' ? 5.4 : 6.4;
    this.state.enemyTimer = Math.max(4.0, tempo - this.state.enemyEra * 0.3) + this._rand() * 1.3 + Math.min(8, Math.max(0, this.state.time - 310) * 0.055);
    var roll = this._rand(), kind = roll < 0.43 ? 0 : roll < 0.79 ? 1 : 2;
    this._enemyDeploy(kind);
    if (this.state.time >= this.state.nextEnemyWave) {
      this.state.nextEnemyWave = this.state.time + (this.difficulty === 'hard' ? 35 : 45);
      this._enemyDeploy(this._rand() < 0.6 ? 0 : 2);
      this._eventsPush('wave', '敌军援兵正在集结', 'enemy');
    }
  };

  Engine.prototype._passive = function (dt) {
    var income = 3.0 + this.state.era * 0.8 + (this.state.era === 4 ? 1.5 : 0) + (this.difficulty === 'easy' ? 0.6 : 0);
    this.state.gold += dt * income; this.state.stats.goldEarned += dt * income;
    this.state.xp += dt * (1.0 + this.state.era * 0.12);
    var p = this.state.bases.player, e = this.state.bases.enemy;
    if (p.hp > 0) p.hp = Math.min(p.maxHp, p.hp + dt * (0.3 + this.state.era * 0.08));
    if (e.hp > 0) e.hp = Math.min(e.maxHp, e.hp + dt * (0.25 + this.state.enemyEra * 0.08));
    p.hitFlash = Math.max(0, p.hitFlash - dt); e.hitFlash = Math.max(0, e.hitFlash - dt);
  };

  Engine.prototype._cleanup = function (dt) {
    var kept = [];
    for (var i = 0; i < this.state.units.length; i++) {
      var u = this.state.units[i];
      if (u.dead) { u.anim += dt; if (u.anim > 0.65) continue; }
      kept.push(u);
    }
    this.state.units = kept;
    this.state.effects = this.state.effects.filter(function (fx) { fx.life -= dt; return fx.life > 0; }).slice(-MAX_EFFECTS);
  };

  Engine.prototype._finish = function () {
    if (this.state.bases.enemy.hp <= 0 && this.state.status === 'playing') { this.state.bases.enemy.hp = 0; this.state.status = 'won'; this._eventsPush('win', '敌方基地已摧毁，胜利！', 'player'); }
    else if (this.state.bases.player.hp <= 0 && this.state.status === 'playing') { this.state.bases.player.hp = 0; this.state.status = 'lost'; this._eventsPush('lose', '基地失守，战争失败。', 'enemy'); }
  };

  Engine.prototype._tick = function (dt) {
    this._finish();
    if (this.state.status !== 'playing') return;
    this.state.time += dt;
    this.state.cooldowns.special = Math.max(0, this.state.cooldowns.special - dt);
    this.state.cooldowns.repair = Math.max(0, this.state.cooldowns.repair - dt);
    this._passive(dt); this._enemyThink(dt); this._train(dt); this._moveUnits(dt); this._stepProjectiles(dt);
    this._turretFire('player', dt); this._turretFire('enemy', dt); this._cleanup(dt); this._finish();
  };

  Engine.prototype.step = function (dt) {
    if (!Number.isFinite(dt) || dt <= 0) return this.state;
    if (this.state.status !== 'playing') return this.state;
    dt = Math.min(dt, 0.25) * (this.state.speed || 1);
    this.accumulator += dt;
    var guard = 0;
    while (this.accumulator + 1e-10 >= DT && guard++ < 30) { this._tick(DT); this.accumulator = Math.max(0, this.accumulator - DT); if (this.state.status !== 'playing') break; }
    return this.state;
  };

  Engine.prototype.serialize = function () {
    return JSON.stringify({ version: VERSION, difficulty: this.difficulty, seed: this.seed, rngState: this.rngState,
      nextId: this.nextId, accumulator: this.accumulator, state: this.state });
  };

  Engine.fromSave = function (data) {
    function fallback(reason) { var fresh = new Engine({ seed: 1 }); fresh.events = []; fresh._eventsPush('saveError', reason); return fresh; }
    var payload;
    try {
      if (typeof data === 'string' && data.length > 2000000) return fallback('存档过大，已开始新战斗');
      // Materialize object inputs as plain JSON too: reject cycles and unsupported values safely.
      payload = JSON.parse(typeof data === 'string' ? data : JSON.stringify(data));
    } catch (err) { return fallback('存档损坏，已开始新战斗'); }
    if (!payload || typeof payload !== 'object' || payload.version !== VERSION || !payload.state || payload.state.version !== VERSION) return fallback('存档版本无效，已开始新战斗');
    try {
      var engine = new Engine({ difficulty: payload.difficulty, seed: payload.seed }), s = payload.state, clean = engine._defaultState();
      engine.events = [];
      engine.rngState = num(payload.rngState, engine.seed, 0, 4294967295) >>> 0;
      engine.accumulator = num(payload.accumulator, 0, 0, DT);
      clean.time = num(s.time, 0, 0, 86400); clean.era = Math.floor(num(s.era, 0, 0, 4)); clean.enemyEra = Math.floor(num(s.enemyEra, 0, 0, 4));
      clean.gold = num(s.gold, 180, 0, 9999999); clean.xp = num(s.xp, 0, 0, 9999999);
      clean.status = ['playing', 'paused', 'won', 'lost'].indexOf(s.status) >= 0 ? s.status : 'playing'; clean.speed = s.speed === 2 ? 2 : 1;
      clean.enemyTimer = num(s.enemyTimer, 3.5, 0, 120); clean.nextEnemyWave = num(s.nextEnemyWave, clean.time + 38, 0, 86460);
      clean.cooldowns.special = num(s.cooldowns && s.cooldowns.special, 0, 0, 120); clean.cooldowns.repair = num(s.cooldowns && s.cooldowns.repair, 0, 0, 120);
      var sides = ['player', 'enemy'];
      for (var i = 0; i < sides.length; i++) {
        var side = sides[i], b = s.bases && s.bases[side]; if (!b) continue;
        var max = num(b.maxHp, 2100, 1, 100000);
        clean.bases[side] = { maxHp: max, hp: num(b.hp, max, 0, max), turrets: Math.floor(num(b.turrets, 0, 0, 3)), hitFlash: num(b.hitFlash, 0, 0, 1) };
        clean.turretTimers[side] = num(s.turretTimers && s.turretTimers[side], 0, 0, 10);
      }
      function queueEntries(entries, sideValue) {
        return Array.isArray(entries) ? entries.slice(0, 5).filter(function (q) {
          return q && q.side === sideValue && Number.isInteger(q.kind) && q.kind >= 0 && q.kind <= 2 && Number.isInteger(q.era) && q.era >= 0 && q.era <= 4;
        }).map(function (q) {
          var total = num(q.total, ERAS[q.era].units[q.kind].trainTime, 0.1, 30);
          return { side: sideValue, era: q.era, kind: q.kind, remaining: num(q.remaining, total, 0, total), total: total };
        }) : [];
      }
      var used = Object.create(null), counts = { player: 0, enemy: 0 }, maxId = 0;
      clean.units = [];
      if (Array.isArray(s.units)) s.units.slice(0, 64).forEach(function (u) {
        if (!u || (u.side !== 'player' && u.side !== 'enemy') || !Number.isInteger(u.id) || u.id <= 0 || u.id > 1e12 || used[u.id]) return;
        if (!u.dead && counts[u.side] >= MAX_PER_SIDE) return;
        used[u.id] = true; maxId = Math.max(maxId, u.id); if (!u.dead) counts[u.side]++;
        var era = Math.floor(num(u.era, 0, 0, 4)), kind = Math.floor(num(u.kind, 0, 0, 2)), def = ERAS[era].units[kind], maxHp = num(u.maxHp, def.hp, 1, 100000), hp = num(u.hp, maxHp, 0, maxHp);
        clean.units.push({ id: u.id, side: u.side, era: era, kind: kind, x: num(u.x, u.side === 'player' ? 202 : 1398, 168, 1432), y: GROUND_Y,
          hp: hp, maxHp: maxHp, damage: num(u.damage, def.damage, 0, 5000), range: num(u.range, def.range, 1, 1000), speed: num(u.speed, def.speed, 1, 300),
          attackTimer: num(u.attackTimer, 0, 0, 10), anim: num(u.anim, 0, 0, 86400), dead: !!u.dead || hp === 0, hitRewarded: !!u.hitRewarded,
          radius: num(u.radius, engine._radius(kind), 8, 40), moving: !!u.moving, attackFlash: num(u.attackFlash, 0, 0, 1), hitFlash: num(u.hitFlash, 0, 0, 1), facing: u.facing === -1 ? -1 : 1 });
      });
      clean.queue = queueEntries(s.queue, 'player').slice(0, Math.max(0, MAX_PER_SIDE - counts.player));
      clean.enemyQueue = queueEntries(s.enemyQueue, 'enemy').slice(0, Math.max(0, MAX_PER_SIDE - counts.enemy));
      clean.projectiles = [];
      if (Array.isArray(s.projectiles)) s.projectiles.slice(0, MAX_PROJECTILES).forEach(function (p) {
        if (!p || (p.side !== 'player' && p.side !== 'enemy') || !Number.isInteger(p.id) || p.id <= 0 || p.id > 1e12 || used[p.id]) return;
        used[p.id] = true; maxId = Math.max(maxId, p.id);
        clean.projectiles.push({ id: p.id, x: num(p.x, 800, 0, WORLD_WIDTH), y: num(p.y, 460, 0, 600),
          targetId: Number.isInteger(p.targetId) && p.targetId > 0 ? p.targetId : null, baseTarget: p.baseTarget === engine._enemySide(p.side) ? p.baseTarget : null,
          targetX: num(p.targetX, 800, 0, WORLD_WIDTH), targetY: num(p.targetY, GROUND_Y - 30, 0, 600), side: p.side,
          era: Math.floor(num(p.era, 0, 0, 4)), kind: Math.floor(num(p.kind, 0, 0, 3)), life: num(p.life, 1, 0.01, 10), damage: num(p.damage, 1, 0, 5000), splash: num(p.splash, 0, 0, 200) });
      });
      clean.effects = Array.isArray(s.effects) ? s.effects.slice(-MAX_EFFECTS).filter(function (fx) { return fx && typeof fx === 'object'; }).map(function (fx) {
        return { type: text(fx.type, 'hit'), x: num(fx.x, 800, 0, WORLD_WIDTH), y: num(fx.y, 450, 0, 600), life: num(fx.life, 0.5, 0, 10), maxLife: num(fx.maxLife, 0.5, 0.01, 10), color: text(fx.color, '#fff'), text: text(fx.text, ''), radius: num(fx.radius, 0, 0, 500) };
      }) : [];
      clean.stats = { kills: Math.floor(num(s.stats && s.stats.kills, 0, 0, 1000000)), deployed: Math.floor(num(s.stats && s.stats.deployed, 0, 0, 1000000)), goldEarned: num(s.stats && s.stats.goldEarned, 0, 0, 99999999) };
      engine.nextId = Math.max(maxId + 1, Math.floor(num(payload.nextId, 1, 1, 1e12)));
      engine.state = clean;
      if (clean.bases.enemy.hp <= 0) clean.status = 'won'; else if (clean.bases.player.hp <= 0) clean.status = 'lost';
      engine._eventsPush('load', '存档已恢复'); return engine;
    } catch (err2) { return fallback('存档数据异常，已开始新战斗'); }
  };

  Engine.WORLD_WIDTH = WORLD_WIDTH; Engine.GROUND_Y = GROUND_Y; Engine.DT = DT; Engine.MAX_PER_SIDE = MAX_PER_SIDE; Engine.SAVE_VERSION = VERSION;
  return { ERAS: ERAS, Engine: Engine };
});
