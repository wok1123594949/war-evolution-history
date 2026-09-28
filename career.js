(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.WarCareer = api;
    if (root.document) {
      if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', function () { api.mount(root); }, { once: true });
      else api.mount(root);
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var STORAGE_KEY = 'war-evolution-career-v1';
  var MAX_COUNT = 1000000000, MAX_RUNS = 5000;
  var MISSION_NAMES = { classic: '无尽进化', frontier: '火种边境', crossroads: '王国十字路', siege: '炮火围城', holdout: '钢铁防线', citadel: '终焉堡垒' };
  var ACHIEVEMENTS = [
    { id: 'first', name: '初战告捷', description: '赢下第一场战斗', field: 'wins', target: 1, icon: 'star' },
    { id: 'veteran', name: '常胜之师', description: '累计赢得 10 场战斗', field: 'wins', target: 10, icon: 'shield' },
    { id: 'army', name: '千军之始', description: '累计部署 100 名战士', field: 'deployed', target: 100, icon: 'tower' },
    { id: 'hunter', name: '百战破阵', description: '累计击败 100 名敌军', field: 'kills', target: 100, icon: 'bolt' },
    { id: 'elite', name: '精英猎手', description: '累计击败 10 名精英', field: 'eliteKills', target: 10, icon: 'swords' },
    { id: 'tactician', name: '运筹帷幄', description: '累计选择 20 张战术卡', field: 'tactics', target: 20, icon: 'help' },
    { id: 'combo', name: '势如破竹', description: '在一场战斗中完成 5 连杀', field: 'bestCombo', target: 5, icon: 'bolt' },
    { id: 'expedition', name: '文明远征', description: '在五个战役中各获胜一次', field: 'victories', target: 5, icon: 'star' }
  ];
  var RANKS = [
    { name: '新锐指挥官', wins: 0, mark: 'I' },
    { name: '前线队长', wins: 3, mark: 'II' },
    { name: '战地统领', wins: 10, mark: 'III' },
    { name: '远征元帅', wins: 25, mark: 'IV' }
  ];
  function own(object, key) {
    if (!object || typeof object !== 'object') return undefined;
    try {
      var descriptor = Object.getOwnPropertyDescriptor(object, key);
      return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') ? descriptor.value : undefined;
    } catch (_) { return undefined; }
  }
  function number(value, max) { return typeof value === 'number' && isFinite(value) ? Math.max(0, Math.min(max === undefined ? MAX_COUNT : max, value)) : 0; }
  function count(value, max) { return Math.floor(number(value, max)); }
  function validId(value) { return typeof value === 'string' && value.length <= 160 && value.trim().length > 0 ? value : null; }
  function missionId(value) { return typeof value === 'string' && Object.prototype.hasOwnProperty.call(MISSION_NAMES, value) ? value : 'classic'; }
  function arrayTail(value, max, visit) {
    if (!Array.isArray(value)) return;
    for (var i = Math.max(0, value.length - max); i < value.length; i++) visit(own(value, String(i)));
  }
  function createProfile() {
    return { version: 1, wins: 0, losses: 0, kills: 0, deployed: 0, eliteKills: 0, tactics: 0, bestCombo: 0, totalTime: 0, victories: [], recordedRuns: [], recent: [] };
  }
  function sanitizeProfile(raw) {
    var clean = createProfile();
    if (typeof raw === 'string') {
      if (raw.length > 1000000) return clean;
      try { raw = JSON.parse(raw); } catch (_) { return clean; }
    }
    if (!raw || Array.isArray(raw) || own(raw, 'version') !== 1) return clean;
    ['wins', 'losses', 'kills', 'deployed', 'eliteKills', 'tactics', 'bestCombo'].forEach(function (key) { clean[key] = count(own(raw, key)); });
    clean.totalTime = number(own(raw, 'totalTime'), 10000000000);
    arrayTail(own(raw, 'victories'), 6, function (value) {
      if (typeof value === 'string' && value !== 'classic' && Object.prototype.hasOwnProperty.call(MISSION_NAMES, value) && clean.victories.indexOf(value) < 0) clean.victories.push(value);
    });
    var seen = new Set();
    arrayTail(own(raw, 'recordedRuns'), MAX_RUNS, function (value) {
      var id = validId(value);
      if (id && !seen.has(id)) { seen.add(id); clean.recordedRuns.push(id); }
    });
    arrayTail(own(raw, 'recent'), 6, function (value) {
      var status = own(value, 'status'), id = validId(own(value, 'runId'));
      if (!id || ['won', 'lost'].indexOf(status) < 0) return;
      clean.recent.push({ runId: id, status: status, missionId: missionId(own(value, 'missionId')), kills: count(own(value, 'kills')), time: number(own(value, 'time'), 86400), bestCombo: count(own(value, 'bestCombo')) });
    });
    return clean;
  }
  function recordResult(profile, result) {
    var clean = sanitizeProfile(profile), id = validId(own(result, 'runId')), state = own(result, 'state');
    var status = own(state, 'status');
    if (!id || ['won', 'lost'].indexOf(status) < 0 || clean.recordedRuns.indexOf(id) >= 0) return clean;
    var stats = own(state, 'stats'), tactics = own(state, 'tactics'), bounty = own(state, 'bounty');
    var kills = count(own(stats, 'kills')), deployed = count(own(stats, 'deployed'));
    var eliteKills = Math.min(kills, count(own(stats, 'eliteKills'))), choices = count(own(tactics, 'selected'));
    var bestCombo = Math.min(kills, count(own(bounty, 'best'))), time = number(own(state, 'time'), 86400);
    var mission = missionId(own(state, 'missionId'));
    clean[status === 'won' ? 'wins' : 'losses'] = Math.min(MAX_COUNT, clean[status === 'won' ? 'wins' : 'losses'] + 1);
    clean.kills = Math.min(MAX_COUNT, clean.kills + kills);
    clean.deployed = Math.min(MAX_COUNT, clean.deployed + deployed);
    clean.eliteKills = Math.min(MAX_COUNT, clean.eliteKills + eliteKills);
    clean.tactics = Math.min(MAX_COUNT, clean.tactics + choices);
    clean.bestCombo = Math.max(clean.bestCombo, bestCombo);
    clean.totalTime = Math.min(10000000000, clean.totalTime + time);
    if (status === 'won' && mission !== 'classic' && clean.victories.indexOf(mission) < 0) clean.victories.push(mission);
    clean.recordedRuns.push(id);
    if (clean.recordedRuns.length > MAX_RUNS) clean.recordedRuns.shift();
    clean.recent.push({ runId: id, status: status, missionId: mission, kills: kills, time: time, bestCombo: bestCombo });
    if (clean.recent.length > 6) clean.recent.shift();
    return clean;
  }
  function achievementProgress(profile) {
    var clean = sanitizeProfile(profile);
    return ACHIEVEMENTS.map(function (item) {
      var value = item.field === 'victories' ? clean.victories.length : clean[item.field];
      return Object.assign({}, item, { value: Math.min(item.target, value), unlocked: value >= item.target });
    });
  }
  function rankForProfile(profile) {
    var clean = sanitizeProfile(profile), index = 0;
    RANKS.forEach(function (rank, i) { if (clean.wins >= rank.wins) index = i; });
    var rank = RANKS[index], next = RANKS[index + 1];
    return { name: rank.name, mark: rank.mark, next: next ? next.name : null, remaining: next ? next.wins - clean.wins : 0, progress: next ? Math.min(1, (clean.wins - rank.wins) / (next.wins - rank.wins)) : 1 };
  }

  var browser = null, memory = createProfile(), volatile = false, mounted = false;
  function readProfile() {
    if (!browser || volatile) return sanitizeProfile(memory);
    try { memory = sanitizeProfile(browser.localStorage.getItem(STORAGE_KEY)); }
    catch (_) { volatile = true; }
    return sanitizeProfile(memory);
  }
  function record(result) {
    var before = readProfile(), after = recordResult(before, result);
    var id = validId(own(result, 'runId'));
    var recorded = !!id && before.recordedRuns.indexOf(id) < 0 && after.recordedRuns.indexOf(id) >= 0;
    memory = after;
    if (recorded && browser && !volatile) {
      try { browser.localStorage.setItem(STORAGE_KEY, JSON.stringify(after)); }
      catch (_) { volatile = true; }
    }
    return { profile: sanitizeProfile(after), recorded: recorded, saved: !!browser && !volatile };
  }
  function formatTime(seconds) {
    var minutes = Math.floor(seconds / 60);
    return minutes >= 60 ? Math.floor(minutes / 60) + ' 小时 ' + minutes % 60 + ' 分' : minutes + ' 分 ' + Math.floor(seconds % 60) + ' 秒';
  }
  function mount(root) {
    if (mounted || !root || !root.document) return false;
    var doc = root.document, host = doc.querySelector('.campaign-record') || doc.querySelector('.campaign-heading');
    if (!host) return false;
    browser = root; mounted = true; readProfile();
    var icon = function (name) { return '<svg aria-hidden="true"><use href="#i-' + name + '"></use></svg>'; };
    var button = doc.createElement('button');
    button.type = 'button'; button.className = 'career-trigger';
    button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-controls', 'career-overlay');
    button.innerHTML = icon('star') + '<span>指挥官档案</span>'; host.appendChild(button);
    var overlay = doc.createElement('div');
    overlay.id = 'career-overlay'; overlay.className = 'career-overlay'; overlay.hidden = true;
    overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-labelledby', 'career-title');
    overlay.innerHTML = '<section class="career-panel"><header class="career-head"><div><span class="career-kicker">COMMANDER / SERVICE RECORD</span><h2 id="career-title">指挥官档案</h2><p>每一场战斗，都在书写你的远征履历。</p></div><button class="career-close" type="button" aria-label="关闭指挥官档案">×</button></header><div class="career-content"></div><footer class="career-footer"><span class="career-storage-note"></span><button class="career-close career-return" type="button">返回战役地图</button></footer></section>';
    doc.body.appendChild(overlay);
    var returnFocus = button;
    function draw() {
      var p = readProfile(), rank = rankForProfile(p), achievements = achievementProgress(p);
      var battles = p.wins + p.losses, completed = achievements.filter(function (a) { return a.unlocked; }).length;
      var stats = [[p.wins, '累计胜利'], [battles ? Math.round(p.wins / battles * 100) + '%' : '—', '战斗胜率'], [p.kills, '击败敌军'], [p.deployed, '部署战士'], [p.bestCombo, '最高连杀'], [p.tactics, '战术选择']];
      overlay.querySelector('.career-content').innerHTML = '<div class="career-rank"><div class="career-rank-mark">' + rank.mark + '</div><div class="career-rank-copy"><span>你的当前军衔</span><h3>' + rank.name + '</h3><p>' + (rank.next ? '再赢 ' + rank.remaining + ' 场，晋升「' + rank.next + '」' : '最高军衔已达成，继续书写你的传奇。') + '</p><div class="career-rank-track"><i style="width:' + rank.progress * 100 + '%"></i></div></div><div class="career-service"><strong>' + battles + '</strong><span>已完成战斗</span><small>累计作战 ' + formatTime(p.totalTime) + '</small></div></div>' +
        '<div class="career-stats">' + stats.map(function (s) { return '<div><strong>' + s[0] + '</strong><span>' + s[1] + '</span></div>'; }).join('') + '</div>' +
        '<div class="career-section-heading"><h3>远征成就</h3><span>' + completed + ' / ' + achievements.length + ' 已达成</span></div><div class="career-achievements">' + achievements.map(function (a) { return '<article class="career-achievement' + (a.unlocked ? ' unlocked' : '') + '"><div class="career-medal">' + icon(a.icon) + '</div><div><h4>' + a.name + '<span>' + (a.unlocked ? '已达成' : a.value + ' / ' + a.target) + '</span></h4><p>' + a.description + '</p><div class="career-achievement-track"><i style="width:' + a.value / a.target * 100 + '%"></i></div></div></article>'; }).join('') + '</div>' +
        '<div class="career-section-heading"><h3>最近战报</h3><span>' + p.wins + ' 胜 / ' + p.losses + ' 负</span></div><div class="career-history">' + (p.recent.length ? p.recent.slice().reverse().map(function (r) { return '<div class="career-battle"><span class="career-outcome ' + r.status + '">' + (r.status === 'won' ? '胜利' : '失利') + '</span><strong>' + MISSION_NAMES[r.missionId] + '</strong><span class="career-battle-detail">' + r.kills + ' 击杀 · ' + r.bestCombo + ' 连杀</span><small>' + formatTime(r.time) + '</small></div>'; }).join('') : '<div class="career-empty">你的第一份战报正在等待书写。<span>完成一场战斗后，战绩与成就会自动记录在这里。</span></div>') + '</div>';
      overlay.querySelector('.career-storage-note').textContent = volatile ? '当前浏览器未允许保存，档案在本次访问期间有效。' : '档案保存在当前浏览器；从本次更新起，每场结算后自动记录。';
    }
    function open() { returnFocus = doc.activeElement; draw(); overlay.hidden = false; doc.body.classList.add('career-open'); overlay.querySelector('.career-close').focus({ preventScroll: true }); }
    function close() { overlay.hidden = true; doc.body.classList.remove('career-open'); (returnFocus && returnFocus.isConnected ? returnFocus : button).focus({ preventScroll: true }); }
    button.addEventListener('click', open);
    overlay.querySelectorAll('.career-close').forEach(function (b) { b.addEventListener('click', close); });
    overlay.addEventListener('click', function (event) { if (event.target === overlay) close(); });
    doc.addEventListener('keydown', function (event) {
      if (overlay.hidden) return;
      event.stopImmediatePropagation();
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key === 'Tab') {
        var controls = overlay.querySelectorAll('button:not(:disabled)'), first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }, true);
    return true;
  }
  return { STORAGE_KEY: STORAGE_KEY, createProfile: createProfile, sanitizeProfile: sanitizeProfile, recordResult: recordResult, achievementProgress: achievementProgress, rankForProfile: rankForProfile, record: record, load: readProfile, mount: mount };
});
