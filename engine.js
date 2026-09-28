(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WarEngine = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var WORLD_WIDTH = 1600;
  var GROUND_Y = 510;
  var DT = 1 / 60;
  var VERSION = 3;
  var MAX_PER_SIDE = 24;
  var MAX_PROJECTILES = 100;
  var MAX_EFFECTS = 100;

  var MISSIONS = [
    { id: 'classic', name: '无尽进化', subtitle: '经典战争', description: '从石器时代一路征战至未来，摧毁敌方基地。', objectiveText: '摧毁敌方基地', icon: '∞', startEra: 0, prerequisites: [], target: 1, parTime: 420, type: 'destroy' },
    { id: 'frontier', name: '火种边境', subtitle: '第一章 · 奠定文明', description: '夺取中立补给站，集结部落战士突破敌军营地。', objectiveText: '摧毁敌方营地', icon: 'Ⅰ', startEra: 0, prerequisites: [], target: 1, parTime: 200, type: 'destroy' },
    { id: 'crossroads', name: '王国十字路', subtitle: '第二章 · 控制战线', description: '在中世纪战场争夺中央哨站，累计控制 60 秒即可获胜。', objectiveText: '累计控制哨站 60 秒', icon: 'Ⅱ', startEra: 1, prerequisites: ['frontier'], target: 60, parTime: 180, type: 'capture' },
    { id: 'siege', name: '炮火围城', subtitle: '第二章 · 击穿壁垒', description: '敌人的城防更加坚固，精英炮车将持续增援。建立火力线后发动总攻。', objectiveText: '摧毁重装要塞', icon: 'Ⅲ', startEra: 2, prerequisites: ['frontier'], target: 1, parTime: 300, type: 'destroy' },
    { id: 'holdout', name: '钢铁防线', subtitle: '第三章 · 最后的坚守', description: '工业军团不断进攻。维修城防、救护前线，坚持 180 秒。', objectiveText: '守住基地 180 秒', icon: 'Ⅳ', startEra: 3, prerequisites: ['crossroads', 'siege'], target: 180, parTime: 200, type: 'survive' },
    { id: 'citadel', name: '终焉堡垒', subtitle: '终章 · 终结战争', description: '未来统帅亲自出征。击败统帅并摧毁能量堡垒，完成文明远征。', objectiveText: '击败统帅并摧毁基地', icon: 'Ⅴ', startEra: 4, prerequisites: ['holdout'], target: 2, parTime: 300, type: 'commander' }
  ];
  var DOCTRINES = [
    { id: 'assault', name: '突击军团', icon: '⚔', description: '用更猛烈的火力迅速推进。', bonus: '部队伤害 +12%', tradeoff: '部队生命 −8%' },
    { id: 'industry', name: '战争工业', icon: '⚙', description: '用持久的经济支撑整场战争。', bonus: '金币收入 +1/秒', tradeoff: '训练耗时 +10%' },
    { id: 'guardian', name: '钢铁守卫', icon: '◆', description: '稳住阵地，再寻找反击机会。', bonus: '部队与基地生命 +15%', tradeoff: '部队移速 −10%' }
  ];
  var UPGRADES = [
    { id: 'weapons', name: '武器锻造', icon: '⚔', description: '每级部队伤害 +15%', maxLevel: 3 },
    { id: 'armor', name: '装甲强化', icon: '◆', description: '每级部队生命 +20%', maxLevel: 3 },
    { id: 'economy', name: '补给体系', icon: '⚙', description: '每级金币收入 +1/秒', maxLevel: 3 }
  ];
  // Tactical cards are offered during a battle. The rotation is deterministic
  // (rather than consuming the battle RNG) so existing saves remain replayable.
  var TACTICS = [
    { id: 'supply', name: '前线补给', icon: '✦', description: '立即获得 100 + 当前时代 × 35 金币。' },
    { id: 'overdrive', name: '超频训练', icon: '➤', description: '12 秒内训练进度加速 100%。' },
    { id: 'barrier', name: '临时壁垒', icon: '◇', description: '15 秒内基地受到的伤害降低 60%。' },
    { id: 'jammer', name: '干扰脉冲', icon: '⌁', description: '10 秒内敌军移动与攻击速度降低 35%。' },
    { id: 'command', name: '指挥授权', icon: '◎', description: '所有主动指令的剩余冷却时间减少 12 秒。' }
  ];
  function tacticById(id) { return TACTICS.find(function (t) { return t.id === id; }) || null; }
  function missionById(id) { return MISSIONS.find(function (m) { return m.id === id; }) || MISSIONS[0]; }
  function validDoctrine(id) { return DOCTRINES.some(function (d) { return d.id === id; }) ? id : 'balanced'; }

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
    this.missionId = missionById(options.missionId).id;
    this.doctrine = validDoctrine(options.doctrine);
    this.state = this._defaultState();
    this._eventsPush('start', '战争开始！守住你的基地。');
  }

  Engine.prototype._defaultState = function () {
    var mission = missionById(this.missionId), era = mission.startEra;
    var hp = 2100 + [0, 450, 1050, 1750, 2700][era];
    var playerHp = Math.round(hp * (this.doctrine === 'guardian' ? 1.15 : 1));
    var enemyHp = mission.id === 'frontier' ? 1500 : mission.id === 'siege' ? 5000 : mission.id === 'holdout' ? 18000 : mission.id === 'citadel' ? 5800 : hp;
    return {
      version: VERSION, missionId: mission.id, doctrine: this.doctrine, time: 0, era: era, enemyEra: era, gold: mission.id === 'classic' ? 180 : 240 + era * 75, xp: 0,
      bases: { player: { hp: playerHp, maxHp: playerHp, turrets: mission.id === 'holdout' ? 1 : 0, hitFlash: 0 }, enemy: { hp: enemyHp, maxHp: enemyHp, turrets: mission.id === 'siege' ? 3 : 1, hitFlash: 0 } },
      units: [], projectiles: [], effects: [], queue: [], enemyQueue: [],
      cooldowns: { special: 0, repair: 0, rally: 0, heal: 0 },
      stats: { kills: 0, deployed: 0, goldEarned: 0, eliteKills: 0, outpostSeconds: 0 },
      upgrades: { weapons: 0, armor: 0, economy: 0 },
      tactics: { choices: [], nextOffer: 12, offers: 0, selected: 0, buffs: { training: 0, barrier: 0, jammer: 0 } },
      objective: { type: mission.type, progress: 0, target: mission.target, label: mission.objectiveText },
      outpost: { x: 800, progress: 0, owner: 'neutral', held: 0, contested: false },
      wave: { number: 1, remaining: 38, nextElite: mission.id !== 'classic', pending: 0 },
      commander: { spawned: false, defeated: false, id: null },
      buffs: { rally: 0 },
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

  Engine.prototype.unitStats = function (kind, eraIndex) {
    if (!Number.isInteger(kind) || kind < 0 || kind > 2) return null;
    var era = eraIndex === undefined ? this.state.era : eraIndex;
    if (!Number.isInteger(era) || era < 0 || era >= ERAS.length) return null;
    var def = clone(ERAS[era].units[kind]), s = this.state;
    def.hp *= (1 + s.upgrades.armor * 0.2) * (s.doctrine === 'guardian' ? 1.15 : s.doctrine === 'assault' ? 0.92 : 1);
    def.damage *= (1 + s.upgrades.weapons * 0.15) * (s.doctrine === 'assault' ? 1.12 : 1);
    def.speed *= s.doctrine === 'guardian' ? 0.9 : 1;
    def.trainTime *= s.doctrine === 'industry' ? 1.1 : 1;
    return def;
  };

  Engine.prototype.incomePerSecond = function () {
    var s = this.state;
    return 3 + s.era * 0.8 + (s.era === 4 ? 1.5 : 0) + (this.difficulty === 'easy' ? 0.6 : 0)
      + s.upgrades.economy + (s.doctrine === 'industry' ? 1 : 0)
      + (s.missionId !== 'classic' ? 1.5 + (s.outpost.owner === 'player' ? 1.5 : 0) : 0);
  };

  Engine.prototype.upgradeCost = function (key) {
    if (!UPGRADES.some(function (u) { return u.id === key; })) return null;
    var level = this.state.upgrades[key];
    return level >= 3 ? null : (key === 'economy' ? 100 : 85) + level * 100 + this.state.era * 18;
  };

  Engine.prototype.upgrade = function (key) {
    var blocked = this._actionAllowed('upgrade'); if (blocked) return blocked;
    if (!UPGRADES.some(function (u) { return u.id === key; })) return this._action(false, '没有这个研究项目');
    var cost = this.upgradeCost(key), oldLevel = this.state.upgrades[key];
    if (cost === null) return this._action(false, '研究已达最高等级');
    if (this.state.gold < cost) return this._action(false, '金币不足');
    this.state.gold -= cost; this.state.upgrades[key]++;
    for (var i = 0; i < this.state.units.length; i++) {
      var u = this.state.units[i]; if (u.side !== 'player' || u.dead) continue;
      if (key === 'armor') {
        var ratio = (1 + this.state.upgrades.armor * 0.2) / (1 + oldLevel * 0.2);
        u.maxHp *= ratio; u.hp *= ratio;
      } else if (key === 'weapons') u.damage *= (1 + this.state.upgrades.weapons * 0.15) / (1 + oldLevel * 0.15);
    }
    this._eventsPush('upgrade', UPGRADES.find(function (u) { return u.id === key; }).name + '升至 ' + this.state.upgrades[key] + ' 级', 'player');
    return this._action(true);
  };

  Engine.prototype.chooseTactic = function (id) {
    var blocked = this._actionAllowed('chooseTactic'); if (blocked) return blocked;
    var tactics = this.state.tactics, index = tactics.choices.indexOf(id), card = tacticById(id);
    if (!card || index < 0) return this._action(false, '战术卡不在手牌中');
    if (id === 'supply') {
      var reward = 100 + this.state.era * 35;
      this.state.gold += reward; this.state.stats.goldEarned += reward;
    } else if (id === 'overdrive') tactics.buffs.training = 12;
    else if (id === 'barrier') tactics.buffs.barrier = 15;
    else if (id === 'jammer') tactics.buffs.jammer = 10;
    else if (id === 'command') {
      ['special', 'repair', 'rally', 'heal'].forEach(function (key) {
        this.state.cooldowns[key] = Math.max(0, this.state.cooldowns[key] - 12);
      }, this);
    }
    tactics.selected++; tactics.choices = []; tactics.nextOffer = this.state.time + 40;
    this._effect('rally', 800, 360, 1.2, '#9fe8ff', card.name, 110);
    this._eventsPush('tactic', card.name + '：' + card.description, 'player');
    return this._action(true, '', { tactic: id });
  };

  Engine.prototype._stepTactics = function (dt) {
    var t = this.state.tactics;
    ['training', 'barrier', 'jammer'].forEach(function (key) { t.buffs[key] = Math.max(0, t.buffs[key] - dt); });
    if (t.choices.length || this.state.time + 1e-8 < t.nextOffer) return;
    var offset = ((this.seed >>> 0) % TACTICS.length + t.offers * 2) % TACTICS.length;
    t.choices = [TACTICS[offset].id, TACTICS[(offset + 1) % TACTICS.length].id, TACTICS[(offset + 3) % TACTICS.length].id];
    t.offers++;
    this._eventsPush('tacticOffer', '战术补给已抵达，从三张卡中选择一张！', 'player');
  };

  Engine.prototype.rally = function () {
    var blocked = this._actionAllowed('rally'); if (blocked) return blocked;
    if (this.state.cooldowns.rally > 0) return this._action(false, '战鼓还在冷却');
    this.state.buffs.rally = 10; this.state.cooldowns.rally = 35;
    this._effect('rally', 330, 360, 1.5, '#ffd376', '全军突击！', 90);
    this._eventsPush('rally', '全军突击：10 秒内攻击速度 +35%，移动速度 +20%', 'player');
    return this._action(true);
  };

  Engine.prototype.heal = function () {
    var blocked = this._actionAllowed('heal'); if (blocked) return blocked;
    if (this.state.cooldowns.heal > 0) return this._action(false, '救护还在冷却');
    var injured = this.state.units.filter(function (u) { return u.side === 'player' && !u.dead && u.hp < u.maxHp; });
    if (!injured.length) return this._action(false, '战场上没有受伤的友军');
    for (var i = 0; i < injured.length; i++) {
      var u = injured[i], amount = Math.min(u.maxHp - u.hp, u.maxHp * 0.25); u.hp += amount;
      this._effect('heal', u.x, GROUND_Y - 80, 1, '#7ae5a4', '+' + Math.round(amount), 36);
    }
    this.state.cooldowns.heal = 40;
    this._eventsPush('heal', '前线救护：' + injured.length + ' 名战士恢复生命', 'player');
    return this._action(true, '', { healed: injured.length });
  };

  Engine.prototype.deploy = function (index) {
    var blocked = this._actionAllowed('deploy'); if (blocked) return blocked;
    if (!Number.isInteger(index) || index < 0 || index > 2) return this._action(false, '没有这个兵种');
    var def = this.unitStats(index);
    if (!def) return this._action(false, '没有这个兵种');
    if (this._population('player') + this.state.queue.length >= MAX_PER_SIDE) return this._action(false, '部队已达 24 人上限');
    if (this.state.queue.length >= 5) return this._action(false, '训练队列已满');
    if (this.state.gold < def.cost) return this._action(false, '金币不足');
    this.state.gold -= def.cost;
    this.state.stats.deployed += 1;
    this.state.queue.push({ side: 'player', era: this.state.era, kind: index, remaining: def.trainTime, total: def.trainTime, elite: false, boss: false });
    this._eventsPush('deploy', def.name + ' 加入训练队列', 'player');
    return this._action(true, '', { queueLength: this.state.queue.length });
  };

  Engine.prototype._enemyDeploy = function (index, flags) {
    if (this.state.status !== 'playing' || !Number.isInteger(index) || index < 0 || index > 2) return false;
    if (this.state.enemyQueue.length >= 5 || this._population('enemy') + this.state.enemyQueue.length >= MAX_PER_SIDE) return false;
    var era = ERAS[this.state.enemyEra], def = era.units[index];
    this.state.enemyQueue.push({ side: 'enemy', era: this.state.enemyEra, kind: index, remaining: def.trainTime * 0.82, total: def.trainTime * 0.82, elite: !!(flags && flags.elite), boss: !!(flags && flags.boss) });
    return true;
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
    var target = (2100 + growth[era]) * (side === 'player' && this.state.doctrine === 'guardian' ? 1.15 : 1);
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
  Engine.prototype._interval = function (u) {
    var rate = u.side === 'player' && this.state.buffs.rally > 0 ? 1.35 : 1;
    if (u.side === 'enemy' && this.state.tactics.buffs.jammer > 0) rate *= 0.65;
    return (u.kind === 1 ? 1.35 : u.kind === 2 ? 1.85 : 1.0) / rate;
  };

  Engine.prototype._effect = function (type, x, y, life, color, label, radius) {
    this.state.effects.push({ type: type, x: x, y: y, life: life, maxLife: life, color: color || '#f8db74', text: label || '', radius: radius || 0 });
    if (this.state.effects.length > MAX_EFFECTS) this.state.effects.shift();
  };

  Engine.prototype._spawnFromQueue = function (entry) {
    if (!entry || (entry.side !== 'player' && entry.side !== 'enemy') || !Number.isInteger(entry.era) || !ERAS[entry.era] || !Number.isInteger(entry.kind) || entry.kind < 0 || entry.kind > 2) return false;
    if (this._population(entry.side) >= MAX_PER_SIDE) return false;
    var side = entry.side, def = side === 'player' ? this.unitStats(entry.kind, entry.era) : clone(ERAS[entry.era].units[entry.kind]);
    if (side === 'enemy' && (entry.elite || entry.boss)) { def.hp *= entry.boss ? 3 : 1.8; def.damage *= entry.boss ? 1.5 : 1.25; }
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
      moving: false, attackFlash: 0, hitFlash: 0, facing: direction, elite: side === 'enemy' && !!(entry.elite || entry.boss), boss: side === 'enemy' && !!entry.boss };
    this.state.units.push(unit);
    if (unit.boss) { this.state.commander.spawned = true; this.state.commander.id = unit.id; this._eventsPush('boss', '敌方统帅抵达战场！击败他才能攻克堡垒。', 'enemy'); }
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
          if (unit.elite) { reward = Math.round(reward * 2); xp *= 2; this.state.stats.eliteKills++; }
          if (unit.boss) { this.state.commander.defeated = true; this._eventsPush('bossDefeated', '敌方统帅已被击败！摧毁堡垒结束战争。', 'player'); }
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
    if (side === 'player' && this.state.tactics.buffs.barrier > 0) damage *= 0.4;
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
      var haste = u.side === 'player' && this.state.buffs.rally > 0 ? 1.2 : 1;
      if (u.side === 'enemy' && this.state.tactics.buffs.jammer > 0) haste *= 0.65;
      var desired = u.x + direction * u.speed * haste * dt, formation = this._formation(u);
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
    var rate = queue[0].side === 'player' && this.state.tactics.buffs.training > 0 ? 2 : 1;
    queue[0].remaining = Math.max(0, queue[0].remaining - dt * rate);
    if (queue[0].remaining === 0 && this._spawnFromQueue(queue[0])) queue.shift();
  };

  Engine.prototype._train = function (dt) {
    this._trainQueue(this.state.queue, dt); this._trainQueue(this.state.enemyQueue, dt);
  };

  Engine.prototype._enemyThink = function (dt) {
    if (this.state.missionId !== 'classic') { this._missionEnemyThink(dt); return; }
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
      this.state.wave.number++;
      this._enemyDeploy(this._rand() < 0.6 ? 0 : 2);
      this._eventsPush('wave', '敌军援兵正在集结', 'enemy');
    }
  };

  Engine.prototype._missionEnemyThink = function (dt) {
    var s = this.state, mission = missionById(s.missionId);
    // Elite orders remain pending until both the queue and population have room.
    if (s.missionId === 'citadel' && s.time >= 32 && !s.commander.spawned && !s.enemyQueue.some(function (q) { return q.boss; })) this._enemyDeploy(2, { boss: true, elite: true });
    if (s.time >= s.nextEnemyWave) {
      s.wave.pending = Math.min(100000, s.wave.pending + 1); s.wave.number++;
      s.nextEnemyWave += s.missionId === 'holdout' ? 30 : 42;
      this._eventsPush('wave', '第 ' + s.wave.number + ' 波：精英' + (s.missionId === 'siege' ? '炮车' : '部队') + '正在集结', 'enemy');
    }
    if (s.wave.pending && this._enemyDeploy(s.missionId === 'siege' ? 2 : s.wave.number % 3, { elite: true })) s.wave.pending--;
    s.wave.remaining = Math.max(0, s.nextEnemyWave - s.time);
    s.enemyTimer -= dt * (s.outpost.owner === 'enemy' ? 1.2 : 1);
    if (s.enemyTimer > 0) return;
    var tempo = s.missionId === 'frontier' ? 8.0 : s.missionId === 'holdout' ? Math.max(3.8, 5.6 - s.time / 100) : 7.5;
    tempo *= this.difficulty === 'easy' ? 1.2 : this.difficulty === 'hard' ? 0.84 : 1;
    s.enemyTimer = tempo + this._rand() * 1.2;
    var roll = this._rand(); this._enemyDeploy(roll < 0.45 ? 0 : roll < 0.8 ? 1 : 2);
    // Missions stay in their starting era until a long battle gives the enemy time to adapt.
    if (s.enemyEra < 4 && s.enemyEra < s.era && s.time > 150 + (s.enemyEra - mission.startEra) * 100) {
      s.enemyEra++; this._upgradeBase('enemy');
      this._eventsPush('enemyEvolve', '敌军进入 ' + ERAS[s.enemyEra].name, 'enemy');
    }
  };

  Engine.prototype._stepOutpost = function (dt) {
    var s = this.state;
    if (s.missionId === 'classic') return;
    var post = s.outpost, player = 0, enemy = 0;
    s.units.forEach(function (u) {
      if (!u.dead && Math.abs(u.x - post.x) <= 130) { if (u.side === 'player') player++; else enemy++; }
    });
    post.contested = player > 0 && enemy > 0;
    var oldOwner = post.owner;
    if (!post.contested && (player || enemy)) {
      var direction = player ? 1 : -1;
      post.progress = clamp(post.progress + direction * dt / 6, -1, 1);
      if (post.owner === 'enemy' && post.progress >= 0 || post.owner === 'player' && post.progress <= 0) post.owner = 'neutral';
      if (post.progress >= 1 - 1e-9) { post.progress = 1; post.owner = 'player'; }
      if (post.progress <= -1 + 1e-9) { post.progress = -1; post.owner = 'enemy'; }
    }
    if (oldOwner !== post.owner) this._eventsPush('outpost', post.owner === 'player' ? '补给站已占领：金币 +1.5/秒，经验 +0.5/秒' : post.owner === 'enemy' ? '敌军占领补给站，增援速度提高！' : '补给站已被中立化', post.owner);
    if (post.owner === 'player') { post.held += dt; s.stats.outpostSeconds += dt; s.xp += dt * 0.5; }
  };

  Engine.prototype._updateObjective = function () {
    var s = this.state, o = s.objective;
    if (o.type === 'capture') o.progress = Math.min(o.target, s.outpost.held);
    else if (o.type === 'survive') o.progress = Math.min(o.target, s.time);
    else if (o.type === 'commander') o.progress = (s.commander.defeated ? 1 : 0) + (s.bases.enemy.hp <= 0 ? 1 : 0);
    else o.progress = clamp(1 - s.bases.enemy.hp / s.bases.enemy.maxHp, 0, 1);
  };

  Engine.prototype._passive = function (dt) {
    var income = this.incomePerSecond();
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
    if (this.state.status !== 'playing') return;
    this._updateObjective();
    if (this.state.bases.player.hp <= 0) { this.state.bases.player.hp = 0; this.state.status = 'lost'; this._eventsPush('lose', '基地失守，战争失败。', 'enemy'); return; }
    var s = this.state, complete = s.objective.progress >= s.objective.target - 1e-8;
    if (complete) { s.status = 'won'; this._eventsPush('win', s.objective.label + '，任务完成！', 'player'); }
  };

  Engine.prototype._tick = function (dt) {
    this._finish();
    if (this.state.status !== 'playing') return;
    this.state.time += dt;
    this.state.cooldowns.special = Math.max(0, this.state.cooldowns.special - dt);
    this.state.cooldowns.repair = Math.max(0, this.state.cooldowns.repair - dt);
    this.state.cooldowns.rally = Math.max(0, this.state.cooldowns.rally - dt);
    this.state.cooldowns.heal = Math.max(0, this.state.cooldowns.heal - dt);
    this.state.buffs.rally = Math.max(0, this.state.buffs.rally - dt);
    this._passive(dt); this._stepTactics(dt); this._enemyThink(dt); this._train(dt); this._moveUnits(dt); this._stepProjectiles(dt);
    this.state.wave.remaining = Math.max(0, this.state.nextEnemyWave - this.state.time);
    this._turretFire('player', dt); this._turretFire('enemy', dt); this._stepOutpost(dt); this._cleanup(dt); this._finish();
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
    if (!payload || typeof payload !== 'object' || (payload.version !== VERSION && payload.version !== 2) || !payload.state || payload.state.version !== payload.version) return fallback('存档版本无效，已开始新战斗');
    try {
      var s = payload.state, legacy = payload.version === 2;
      var engine = new Engine({ difficulty: payload.difficulty, seed: payload.seed, missionId: legacy ? 'classic' : s.missionId, doctrine: legacy ? 'balanced' : s.doctrine }), clean = engine._defaultState();
      engine.events = [];
      engine.rngState = num(payload.rngState, engine.seed, 0, 4294967295) >>> 0;
      engine.accumulator = num(payload.accumulator, 0, 0, DT);
      clean.time = num(s.time, 0, 0, 86400); clean.era = Math.floor(num(s.era, 0, 0, 4)); clean.enemyEra = Math.floor(num(s.enemyEra, 0, 0, 4));
      clean.gold = num(s.gold, 180, 0, 9999999); clean.xp = num(s.xp, 0, 0, 9999999);
      clean.status = ['playing', 'paused', 'won', 'lost'].indexOf(s.status) >= 0 ? s.status : 'playing'; clean.speed = s.speed === 2 ? 2 : 1;
      clean.enemyTimer = num(s.enemyTimer, 3.5, 0, 120); clean.nextEnemyWave = num(s.nextEnemyWave, clean.time + 38, 0, 86460);
      clean.cooldowns.special = num(s.cooldowns && s.cooldowns.special, 0, 0, 120); clean.cooldowns.repair = num(s.cooldowns && s.cooldowns.repair, 0, 0, 120);
      if (!legacy) {
        clean.cooldowns.rally = num(s.cooldowns && s.cooldowns.rally, 0, 0, 35); clean.cooldowns.heal = num(s.cooldowns && s.cooldowns.heal, 0, 0, 40);
        clean.buffs.rally = num(s.buffs && s.buffs.rally, 0, 0, 10);
        UPGRADES.forEach(function (u) { clean.upgrades[u.id] = Math.floor(num(s.upgrades && s.upgrades[u.id], 0, 0, 3)); });
        var post = s.outpost || {};
        clean.outpost.progress = num(post.progress, 0, -1, 1);
        clean.outpost.owner = ['player', 'enemy', 'neutral'].indexOf(post.owner) >= 0 ? post.owner : 'neutral';
        clean.outpost.held = num(post.held, 0, 0, 86400); clean.outpost.contested = !!post.contested;
        var wave = s.wave || {};
        clean.wave.number = Math.floor(num(wave.number, 1, 1, 100000));
        clean.wave.remaining = num(wave.remaining, Math.max(0, clean.nextEnemyWave - clean.time), 0, 86460);
        clean.wave.pending = Math.floor(num(wave.pending, 0, 0, 100000));
        var commander = s.commander || {};
        clean.commander = { spawned: !!commander.spawned, defeated: !!commander.defeated, id: Number.isInteger(commander.id) && commander.id > 0 && commander.id < 1e12 ? commander.id : null };
        var tactics = s.tactics || {}, choices = Array.isArray(tactics.choices) ? tactics.choices.slice(0, 3) : [];
        choices = choices.filter(function (id, index) { return !!tacticById(id) && choices.indexOf(id) === index; });
        clean.tactics.choices = choices.length === 3 ? choices : [];
        clean.tactics.nextOffer = num(tactics.nextOffer, 12, 0, 86440);
        clean.tactics.offers = Math.floor(num(tactics.offers, clean.tactics.choices.length ? 1 : 0, 0, 100000));
        clean.tactics.selected = Math.floor(num(tactics.selected, 0, 0, clean.tactics.offers));
        clean.tactics.buffs.training = num(tactics.buffs && tactics.buffs.training, 0, 0, 12);
        clean.tactics.buffs.barrier = num(tactics.buffs && tactics.buffs.barrier, 0, 0, 15);
        clean.tactics.buffs.jammer = num(tactics.buffs && tactics.buffs.jammer, 0, 0, 10);
      }
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
          return { side: sideValue, era: q.era, kind: q.kind, remaining: num(q.remaining, total, 0, total), total: total, elite: !legacy && sideValue === 'enemy' && !!q.elite, boss: !legacy && sideValue === 'enemy' && !!q.boss };
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
          radius: num(u.radius, engine._radius(kind), 8, 40), moving: !!u.moving, attackFlash: num(u.attackFlash, 0, 0, 1), hitFlash: num(u.hitFlash, 0, 0, 1), facing: u.facing === -1 ? -1 : 1,
          elite: !legacy && u.side === 'enemy' && !!u.elite, boss: !legacy && u.side === 'enemy' && !!u.boss });
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
      clean.stats = { kills: Math.floor(num(s.stats && s.stats.kills, 0, 0, 1000000)), deployed: Math.floor(num(s.stats && s.stats.deployed, 0, 0, 1000000)), goldEarned: num(s.stats && s.stats.goldEarned, 0, 0, 99999999),
        eliteKills: legacy ? 0 : Math.floor(num(s.stats && s.stats.eliteKills, 0, 0, 1000000)), outpostSeconds: legacy ? 0 : num(s.stats && s.stats.outpostSeconds, 0, 0, 86400) };
      engine.nextId = Math.max(maxId + 1, Math.floor(num(payload.nextId, 1, 1, 1e12)));
      engine.state = clean;
      engine._updateObjective();
      if (clean.bases.player.hp <= 0) clean.status = 'lost';
      else if (clean.objective.progress >= clean.objective.target - 1e-8) clean.status = 'won';
      else if (clean.status === 'won' || clean.status === 'lost') clean.status = 'playing';
      engine._eventsPush('load', '存档已恢复'); return engine;
    } catch (err2) { return fallback('存档数据异常，已开始新战斗'); }
  };

  Engine.WORLD_WIDTH = WORLD_WIDTH; Engine.GROUND_Y = GROUND_Y; Engine.DT = DT; Engine.MAX_PER_SIDE = MAX_PER_SIDE; Engine.SAVE_VERSION = VERSION;
  return { ERAS: ERAS, MISSIONS: MISSIONS, DOCTRINES: DOCTRINES, UPGRADES: UPGRADES, TACTICS: TACTICS, Engine: Engine };
});
