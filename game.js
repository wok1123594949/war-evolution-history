(function () {
  'use strict';
  const { ERAS, Engine, MISSIONS, DOCTRINES, UPGRADES } = window.WarEngine;
  const Campaign = window.CampaignProgress;
  const $ = id => document.getElementById(id);
  const icons = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const numerals = ['I', 'II', 'III', 'IV', 'V'];
  const english = ['STONE AGE', 'MEDIEVAL AGE', 'GUNPOWDER AGE', 'INDUSTRIAL AGE', 'FUTURE AGE'];
  const saveKey = 'age-of-war-save-v3', legacyKey = 'age-of-war-save-v2';
  const profileKey = 'age-of-war-campaign-v1', soundKey = 'age-of-war-sound';
  const mission = id => MISSIONS.find(m => m.id === id) || MISSIONS[0];
  const asset = (era, kind) => `assets/units/e${era}-u${kind}.png`;
  const fmt = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  const stars = count => '★'.repeat(count) + '☆'.repeat(3 - count);
  const token = () => window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const texts = new Map();
  let engine = new Engine(), renderer, profile = Campaign.createProfile();
  let started = false, difficulty = 'normal', targeting = false, resultShown = false;
  let lastFrame = performance.now(), lastUI = 0, lastSave = 0, renderedEra = '', queueSignature = '';
  let menuPaused = false, helpPaused = false, selectedTarget = 800, sound = true, runId = token();
  let selectedMission = 'frontier', selectedDoctrine = 'assault', nextMissionId = null;
  let storageFailed = false;

  function text(id, value) { value = String(value); if (texts.get(id) !== value) { $(id).textContent = value; texts.set(id, value); } }
  function hidden(id, value) { $(id).hidden = value; }
  function notify(message) {
    text('battle-toast', message); $('battle-toast').classList.add('show'); clearTimeout(notify.timer);
    notify.timer = setTimeout(() => $('battle-toast').classList.remove('show'), 3000);
  }
  function setButtonIcon(id, name) { $(id).querySelector('use').setAttribute('href', `#i-${name}`); }
  function readStorage(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
  function writeStorage(key, value) {
    try { localStorage.setItem(key, value); return true; }
    catch (_) { storageFailed = true; text('save-label', '浏览器存储不可用'); text('campaign-note', '当前浏览器无法保存进度，请勿关闭页面。'); return false; }
  }
  function getSave() { return readStorage(saveKey) || readStorage(legacyKey); }
  function detectSave() {
    let available = false;
    const raw = getSave();
    if (raw) {
      const restored = Engine.fromSave(raw);
      available = !restored.events.some(e => e.type === 'saveError');
      if (available) text('continue-detail', `${mission(restored.state.missionId).name} · ${fmt(restored.state.time)}`);
    }
    hidden('continue-btn', !available || started);
  }
  function clearBattleSave() {
    try { localStorage.removeItem(saveKey); localStorage.removeItem(legacyKey); } catch (_) {}
  }
  function save(force = false) {
    if (!started || (resultShown && !force)) return;
    const payload = JSON.parse(engine.serialize()); payload.runId = runId;
    if (writeStorage(saveKey, JSON.stringify(payload))) {
      text('save-label', '本地自动存档');
      try { localStorage.removeItem(legacyKey); } catch (_) {}
    }
  }
  profile = Campaign.sanitizeProfile(readStorage(profileKey));
  selectedMission = Campaign.nextMission(profile) || 'frontier';
  sound = readStorage(soundKey) !== 'off';
  GameAudio.setEnabled(sound); setButtonIcon('sound-btn', sound ? 'sound' : 'mute');
  $('sound-btn').setAttribute('aria-label', sound ? '关闭音效' : '开启音效');

  function syncModal(focusId) {
    const modal = ['start-overlay', 'help-overlay', 'result-overlay'].map($).find(el => !el.hidden);
    document.querySelector('.game-shell').inert = !!modal;
    if (focusId) $(focusId).focus({ preventScroll: true });
  }
  function renderCampaign() {
    text('campaign-stars', `${Campaign.totalStars(profile)} / 15`);
    $('mission-cards').innerHTML = MISSIONS.filter(m => m.id !== 'classic').map((m, index) => {
      const unlocked = Campaign.isUnlocked(profile, m.id), record = profile.missions[m.id];
      const lockText = m.id === 'holdout' ? '完成任一第二章支线解锁' : `完成${mission(m.prerequisites[0]).name}解锁`;
      return `<button class="mission-card ${selectedMission === m.id ? 'selected' : ''}" data-mission="${m.id}" aria-pressed="${selectedMission === m.id}" ${unlocked ? '' : 'disabled'}><img src="assets/bases/e${m.startEra}.png" alt=""><span class="chapter-num">BATTLEFIELD / 0${index + 1}</span><strong>${m.name}</strong><span class="mission-type">${m.objectiveText}</span>${record ? `<span class="earned-stars" aria-label="${record.stars}星">${stars(record.stars)}</span>` : `<span class="mission-lock">${unlocked ? '已开放 · 等待出征' : lockText}</span>`}</button>`;
    }).join('');
    $('mission-cards').querySelectorAll('button').forEach(b => b.addEventListener('click', () => selectMission(b.dataset.mission)));
    $('classic-btn').classList.toggle('selected', selectedMission === 'classic');
    $('classic-btn').setAttribute('aria-pressed', selectedMission === 'classic');
    const m = mission(selectedMission), record = profile.missions[m.id];
    $('mission-art').src = `assets/bases/e${m.startEra}.png`; $('mission-art').alt = `${ERAS[m.startEra].name}基地`;
    text('mission-chapter', m.id === 'classic' ? 'CLASSIC / FREE BATTLE' : `BATTLEFIELD / 0${MISSIONS.indexOf(m)}`);
    text('mission-subtitle', m.subtitle); text('selected-mission-name', m.name); text('mission-description', m.description); text('mission-goal', m.objectiveText);
    text('mission-medals', m.id === 'classic' ? '自由进化 · 不计入战役勋章' : `${record ? `${stars(record.stars)} · 最快 ${fmt(record.bestTime)} · ` : ''}速通勋章：${fmt(m.parTime)} 内完成`);
    $('start-btn').querySelector('span').textContent = `出征 · ${m.name}`;
    $('start-btn').disabled = !Campaign.isUnlocked(profile, m.id);
    if (!storageFailed) text('campaign-note', Campaign.totalStars(profile) === 15 ? '全部勋章已收集！尝试挑战难度，或使用不同专长再战。' : '胜利解锁后续关卡 · 保全基地、快速通关可获得额外勋章');
    renderDoctrines();
  }
  function selectMission(id) {
    if (!Campaign.isUnlocked(profile, id)) return;
    selectedMission = id; renderCampaign(); GameAudio.unlock(); GameAudio.play('ui');
  }
  function renderDoctrines() {
    $('doctrine-options').innerHTML = DOCTRINES.map((d, i) => `<button class="doctrine-choice ${d.id === selectedDoctrine ? 'selected' : ''}" data-doctrine="${d.id}" aria-pressed="${d.id === selectedDoctrine}" title="${d.description}">${icons(['swords', 'coin', 'shield'][i])}<strong>${d.name}</strong><small>${d.bonus}<br>${d.tradeoff}</small></button>`).join('');
    $('doctrine-options').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      selectedDoctrine = b.dataset.doctrine; renderDoctrines(); $('doctrine-options').querySelector(`[data-doctrine="${selectedDoctrine}"]`).focus(); GameAudio.play('ui');
    }));
  }
  function renderEra() {
    const s = engine.state, era = ERAS[s.era], index = era.id;
    $('era-nodes').innerHTML = ERAS.map((e, i) => `<div class="era-step ${i === index ? 'current' : i < index ? 'passed' : ''}" ${i === index ? 'aria-current="step"' : ''}><b><i>${numerals[i]}</i></b><span>${e.name}<small>${english[i]}</small></span></div>`).join('');
    $('unit-buttons').innerHTML = era.units.map((_, kind) => {
      const unit = engine.unitStats(kind), hp = Math.round(unit.hp), damage = Math.round(unit.damage), training = +unit.trainTime.toFixed(1);
      return `<button class="unit-card" data-kind="${kind}" title="${unit.description}｜生命 ${hp}｜伤害 ${damage}｜训练 ${training} 秒" aria-label="征募${unit.name}，${unit.cost}金币"><img src="${asset(index, kind)}" alt="${unit.name}" draggable="false"><span class="unit-key">${kind + 1}</span><span class="unit-role">${kind === 0 ? '近战' : kind === 1 ? '远程' : index > 1 ? '范围重装' : '重装'}</span><span class="unit-info"><span class="unit-heading"><strong>${unit.name}</strong><span class="unit-cost">${icons('coin')}${unit.cost}</span></span><span class="unit-stats"><span>${icons('shield')}${hp}</span><span>${icons('swords')}${damage}</span><span>${icons('clock')}${training}s</span></span></span></button>`;
    }).join('');
    $('unit-buttons').querySelectorAll('button').forEach(b => b.addEventListener('click', () => action('deploy', +b.dataset.kind)));
    text('next-era-name', ERAS[index + 1]?.name || '文明巅峰'); text('next-era-label', index === 4 ? '所有时代已解锁' : '下一时代');
    text('next-era-icon', numerals[Math.min(4, index + 1)]); text('era-count', `${numerals[index]} / V`);
    text('skill-name', era.specialName); text('player-era', era.name);
    $('evolve-btn').querySelector('span').textContent = index === 4 ? '已达最终时代' : '进化时代';
    text('battle-tip', `先征募${era.units[0].name}稳住前线，${era.units[1].name}在后方输出。`);
    renderedEra = `${s.era}:${s.doctrine}:${s.upgrades.weapons}:${s.upgrades.armor}`;
    queueSignature = ''; document.documentElement.style.setProperty('--era', era.color);
  }
  function renderQueue() {
    const q = engine.state.queue, signature = q.map(item => `${item.era}:${item.kind}`).join(',');
    if (signature !== queueSignature || !$('training-queue').children.length) {
      $('training-queue').innerHTML = Array.from({ length: 5 }, (_, i) => `<span class="queue-slot" ${q[i] ? `title="${ERAS[q[i].era].units[q[i].kind].name}"` : ''}>${q[i] ? `<img src="${asset(q[i].era, q[i].kind)}" alt="${ERAS[q[i].era].units[q[i].kind].name}"><i></i>` : ''}</span>`).join(''); queueSignature = signature;
    }
    const first = $('training-queue').querySelector('i'); if (first && q[0]) first.style.width = `${100 * (1 - q[0].remaining / q[0].total)}%`;
    text('queue-label', q.length ? `${q.length}/5 · ${Math.ceil(q[0].remaining)}s` : '等待征募');
  }
  $('tech-cards').innerHTML = UPGRADES.map((u, i) => `<button class="tech-card" data-upgrade="${u.id}" title="${u.description}，现有与后续部队均生效"><div><strong>${icons(['swords', 'shield', 'coin'][i])}${u.name}</strong><span class="tech-cost"></span></div><small>${u.description}</small><span class="tech-levels"><i></i><i></i><i></i></span></button>`).join('');
  $('tech-cards').querySelectorAll('button').forEach(b => b.addEventListener('click', () => action('upgrade', b.dataset.upgrade)));
  function updateStrategy(running) {
    const s = engine.state, m = mission(s.missionId), o = s.objective, post = s.outpost;
    text('mission-title', m.name); text('objective-text', o.label);
    text('objective-value', o.type === 'capture' || o.type === 'survive' ? `${Math.floor(o.progress)} / ${o.target} 秒` : o.type === 'commander' ? `${s.commander.defeated ? '统帅已击败' : s.commander.spawned ? '统帅已登场' : '统帅待登场'} · ${o.progress}/2` : `突破进度 ${Math.floor(o.progress * 100)}%`);
    $('objective-fill').style.width = `${Math.min(100, o.progress / o.target * 100)}%`;
    text('outpost-income', s.missionId === 'classic' ? '经典自由战 · 自由进化' : `${post.owner === 'player' ? '我方据点 +1.5金/秒' : post.owner === 'enemy' ? '敌方控制据点' : '中央据点待占领'}${post.contested ? ' · 交战中' : ''}`);
    text('wave-count', s.wave.pending ? '精英正在集结' : `第 ${s.wave.number + 1} 波 · ${s.wave.nextElite ? '精英援军' : '敌军增援'}`);
    text('wave-time', s.wave.pending ? `${s.wave.pending} 名等待进场` : `${Math.ceil(s.wave.remaining)} 秒后抵达`);
    document.querySelector('.wave-preview').classList.toggle('urgent', s.wave.remaining < 10 || s.wave.pending > 0);
    text('doctrine-badge', DOCTRINES.find(d => d.id === s.doctrine)?.name || '均衡军团');
    for (const b of $('tech-cards').children) {
      const id = b.dataset.upgrade, level = s.upgrades[id], cost = engine.upgradeCost(id);
      b.disabled = !running || cost === null || s.gold < cost;
      b.querySelector('.tech-cost').textContent = cost === null ? 'MAX' : `${cost} 金`;
      b.querySelectorAll('.tech-levels i').forEach((el, i) => el.classList.toggle('active', i < level));
      b.setAttribute('aria-label', `${UPGRADES.find(u => u.id === id).name}，${level}/3 级，${cost === null ? '已满级' : `升级 ${cost} 金币`}`);
    }
    const injured = s.units.some(u => u.side === 'player' && !u.dead && u.hp < u.maxHp);
    $('rally-btn').disabled = !running || s.cooldowns.rally > 0;
    $('heal-btn').disabled = !running || s.cooldowns.heal > 0 || !injured;
    $('rally-btn').classList.toggle('active', s.buffs.rally > 0);
    text('rally-caption', s.buffs.rally > 0 ? `全军突击 · 剩余 ${Math.ceil(s.buffs.rally)} 秒` : s.cooldowns.rally > 0 ? `${Math.ceil(s.cooldowns.rally)} 秒后就绪` : '攻速 +35% · 移速 +20% · 10秒');
    text('heal-caption', s.cooldowns.heal > 0 ? `${Math.ceil(s.cooldowns.heal)} 秒后就绪` : injured ? '恢复全军 25% 最大生命' : '暂无伤员 · 恢复 25% 生命');
  }
  function updateUI() {
    const s = engine.state, era = ERAS[s.era], running = started && s.status === 'playing';
    const units = s.units.filter(u => u.side === 'player' && !u.dead).length;
    if (renderedEra !== `${s.era}:${s.doctrine}:${s.upgrades.weapons}:${s.upgrades.armor}`) renderEra();
    text('gold', Math.floor(s.gold)); text('income', `+${engine.incomePerSecond().toFixed(1)}/s`); text('xp', Math.floor(s.xp)); text('population', `${units} / ${s.populationCap}`); text('timer', fmt(s.time));
    const p = s.bases.player, e = s.bases.enemy;
    $('player-hp').style.width = `${100 * p.hp / p.maxHp}%`; $('enemy-hp').style.width = `${100 * e.hp / e.maxHp}%`;
    text('player-hp-text', `${Math.ceil(p.hp)} / ${Math.round(p.maxHp)}`); text('enemy-hp-text', `${Math.ceil(e.hp)} / ${Math.round(e.maxHp)}`); text('enemy-era', ERAS[s.enemyEra].name);
    if ($('player-slots').dataset.level !== String(p.turrets)) { $('player-slots').innerHTML = [0, 1, 2].map(i => `<svg class="${i < p.turrets ? 'built' : ''}"><use href="#i-tower"/></svg>`).join('') + `<span>防御等级 ${p.turrets} / 3</span>`; $('player-slots').dataset.level = p.turrets; }
    const ready = !!era.xpRequired && s.xp >= era.xpRequired;
    $('xp-bar').style.width = `${era.xpRequired ? Math.min(100, 100 * s.xp / era.xpRequired) : 100}%`;
    text('xp-detail', era.xpRequired ? `${Math.floor(s.xp)} / ${era.xpRequired} XP` : '五个时代全部解锁'); text('evolve-hint', ready ? '研究完成！' : s.era === 4 ? '完成战役目标' : '击败敌军获得经验');
    $('evolve-btn').disabled = !running || !ready; $('evolve-btn').classList.toggle('ready', ready && running);
    for (const b of $('unit-buttons').children) b.disabled = !running || s.gold < era.units[+b.dataset.kind].cost || s.queue.length >= 5 || units + s.queue.length >= s.populationCap;
    $('turret-btn').disabled = !running || s.gold < era.turretCost || p.turrets >= 3;
    text('turret-cost', p.turrets >= 3 ? '已满级' : `${era.turretCost} 金 · ${p.turrets}/3`);
    $('repair-btn').disabled = !running || s.gold < era.repairCost || p.hp >= p.maxHp || s.cooldowns.repair > 0;
    text('repair-cost', s.cooldowns.repair > 0 ? `${Math.ceil(s.cooldowns.repair)}s 冷却` : `${era.repairCost} 金`);
    $('skill-btn').disabled = !running || s.cooldowns.special > 0;
    text('skill-caption', s.cooldowns.special > 0 ? `${Math.ceil(s.cooldowns.special)} 秒后就绪` : targeting ? '点击战场，确定落点' : '范围轰击 · 已就绪');
    $('skill-shade').style.width = `${Math.min(100, 100 * s.cooldowns.special / Math.max(22, 34 - s.era * 2))}%`;
    text('speed-btn', `${s.speed}×`); setButtonIcon('pause-btn', s.status === 'paused' ? 'play' : 'pause');
    $('pause-btn').setAttribute('aria-label', s.status === 'paused' ? '继续战斗' : '暂停');
    $('pause-btn').title = s.status === 'paused' ? '继续战斗（空格）' : '暂停（空格）';
    hidden('battle-banner', s.status !== 'paused' || !$('start-overlay').hidden || !$('help-overlay').hidden);
    text('battle-status', s.status === 'paused' ? '战斗已暂停' : s.status === 'won' ? '战役目标完成' : s.status === 'lost' ? '基地已失守' : '黎明军团 · 推进战线');
    $('battle-tip').style.opacity = s.time > 25 ? '0' : '1'; renderQueue(); updateStrategy(running);
  }
  function handleEvents() {
    const events = engine.drainEvents(); renderer?.handleEvents?.(events);
    for (const ev of events) {
      if (!['kill', 'spawn'].includes(ev.type) || ev.side === 'player') text('latest-event', `${fmt(engine.state.time)}　${ev.text}`);
      if (['evolve', 'enemyEvolve', 'turret', 'repair', 'saveError', 'load', 'upgrade', 'rally', 'heal', 'outpost', 'boss', 'bossDefeated', 'wave'].includes(ev.type)) notify(ev.text);
      if (['deploy', 'evolve', 'special', 'repair', 'turret'].includes(ev.type)) GameAudio.play(ev.type);
      if (['upgrade', 'rally'].includes(ev.type)) GameAudio.play('evolve');
      if (ev.type === 'heal') GameAudio.play('repair');
      if (ev.type === 'kill') GameAudio.play('hit');
    }
  }
  function action(method, ...args) {
    GameAudio.unlock(); if (!started || !$('start-overlay').hidden || !$('help-overlay').hidden || !$('result-overlay').hidden) return;
    const result = engine[method](...args); if (!result.ok) { notify(result.reason); GameAudio.play('error'); }
    handleEvents(); updateUI(); checkEnd(); if (result.ok) save(); return result;
  }
  function setTargeting(value) {
    targeting = value; $('battle-frame').classList.toggle('targeting', value); $('skill-btn').classList.toggle('selected', value); hidden('target-hint', !value);
    renderer?.setTargeting?.(value, selectedTarget); updateUI();
  }
  function toggleTarget() {
    if (!started || engine.state.status !== 'playing' || !$('start-overlay').hidden || !$('help-overlay').hidden) return;
    if (engine.state.cooldowns.special > 0) { notify('战术技能尚未就绪'); return; }
    GameAudio.unlock(); setTargeting(!targeting); GameAudio.play('ui');
  }
  function pointerWorld(event) {
    const rect = $('battlefield').getBoundingClientRect();
    return renderer?.clientToWorld ? renderer.clientToWorld(event.clientX) : Math.max(220, Math.min(1380, (event.clientX - rect.left) / rect.width * 1600));
  }
  $('battlefield').addEventListener('pointermove', event => { if (targeting) selectedTarget = pointerWorld(event); });
  $('battlefield').addEventListener('click', event => { if (!targeting) return; selectedTarget = pointerWorld(event); const r = action('special', selectedTarget); if (r?.ok) setTargeting(false); });
  $('cancel-target').addEventListener('click', () => setTargeting(false));
  function start(resume = false, retry = false) {
    GameAudio.unlock();
    if (resume) {
      const raw = getSave(); engine = Engine.fromSave(raw);
      try { const savedToken = JSON.parse(raw)?.runId; runId = typeof savedToken === 'string' && savedToken.trim().length > 0 && savedToken.length <= 160 ? savedToken : token(); } catch (_) { runId = token(); }
    } else {
      if (!retry && !Campaign.isUnlocked(profile, selectedMission)) return;
      engine = new Engine({ difficulty: retry ? engine.difficulty : difficulty, missionId: retry ? engine.state.missionId : selectedMission, doctrine: retry ? engine.state.doctrine : selectedDoctrine });
      runId = token();
    }
    if (engine.state.status === 'paused') engine.togglePause();
    selectedMission = engine.state.missionId; difficulty = engine.difficulty;
    if (engine.state.doctrine !== 'balanced') selectedDoctrine = engine.state.doctrine;
    document.querySelectorAll('[data-difficulty]').forEach(b => b.classList.toggle('selected', b.dataset.difficulty === difficulty));
    started = true; resultShown = false; renderedEra = ''; queueSignature = ''; menuPaused = false; helpPaused = false;
    hidden('start-overlay', true); hidden('result-overlay', true); hidden('help-overlay', true); setTargeting(false);
    handleEvents(); updateUI(); syncModal('pause-btn'); lastFrame = performance.now(); GameAudio.play('ui'); save(); checkEnd();
  }
  function openMenu() {
    setTargeting(false); menuPaused = started && engine.state.status === 'playing';
    if (menuPaused) engine.togglePause(); save(); detectSave(); hidden('menu-resume', !started || resultShown);
    renderCampaign(); hidden('result-overlay', true); hidden('start-overlay', false); updateUI(); syncModal('start-btn');
  }
  function resumeMenu() {
    if (!started || resultShown) return;
    if (menuPaused && engine.state.status === 'paused') engine.togglePause(); menuPaused = false;
    hidden('start-overlay', true); updateUI(); syncModal('menu-btn'); lastFrame = performance.now();
  }
  function showHelp() {
    if (!started || !$('start-overlay').hidden || resultShown) return;
    setTargeting(false); helpPaused = engine.state.status === 'playing'; if (helpPaused) engine.togglePause();
    hidden('help-overlay', false); updateUI(); syncModal('close-help');
  }
  function closeHelp() {
    hidden('help-overlay', true); if (helpPaused && engine.state.status === 'paused') engine.togglePause();
    helpPaused = false; updateUI(); syncModal('help-btn'); lastFrame = performance.now();
  }
  function checkEnd() {
    if (!started || resultShown || !['won', 'lost'].includes(engine.state.status)) return;
    save(); resultShown = true; setTargeting(false);
    const s = engine.state, m = mission(s.missionId), won = s.status === 'won';
    const healthy = s.bases.player.hp / s.bases.player.maxHp >= .5, fast = s.time <= m.parTime;
    const earned = won ? 1 + Number(healthy) + Number(fast) : 0;
    profile = Campaign.recordResult(profile, { missionId: s.missionId, status: s.status, runId, time: s.time, baseRatio: s.bases.player.hp / s.bases.player.maxHp });
    if (writeStorage(profileKey, JSON.stringify(profile))) clearBattleSave();
    text('result-kicker', won ? 'VICTORY' : 'DEFEAT'); text('result-title', won ? `${m.name} · 告捷` : '防线失守');
    text('result-copy', won ? s.missionId === 'classic' ? '暮色军团的基地已被摧毁，你的文明赢得了这场战争。' : '战役目标已完成。调整专长与战术，继续下一段文明远征。' : '尝试让近战保护远程部队；投资补给与科研，把号令留给关键交锋。');
    text('result-medals', s.missionId === 'classic' ? '' : stars(earned));
    text('result-objective', s.missionId === 'classic' ? '经典自由战不计入远征勋章。' : `${won ? '✓' : '○'} 完成目标　${won && healthy ? '✓' : '○'} 基地 ≥50%　${won && fast ? '✓' : '○'} ${fmt(m.parTime)} 内完成`);
    $('result-stats').innerHTML = `<div><strong>${fmt(s.time)}</strong><small>战斗用时</small></div><div><strong>${s.stats.kills}</strong><small>击败敌军</small></div><div><strong>${s.stats.eliteKills}</strong><small>精英击破</small></div>`;
    nextMissionId = won && s.missionId !== 'classic' ? Campaign.nextMission(profile, s.missionId) : null;
    hidden('next-mission-btn', !nextMissionId); if (nextMissionId) text('next-mission-btn', `下一战场 · ${mission(nextMissionId).name}`);
    hidden('result-overlay', false); GameAudio.play(won ? 'win' : 'lose'); syncModal(nextMissionId ? 'next-mission-btn' : 'restart-btn');
  }
  $('start-btn').addEventListener('click', () => start()); $('continue-btn').addEventListener('click', () => start(true));
  $('classic-btn').addEventListener('click', () => selectMission('classic'));
  $('menu-resume').addEventListener('click', resumeMenu); $('menu-btn').addEventListener('click', openMenu);
  $('home-btn').addEventListener('click', event => { event.preventDefault(); openMenu(); });
  $('restart-btn').addEventListener('click', () => start(false, true)); $('result-menu').addEventListener('click', openMenu);
  $('next-mission-btn').addEventListener('click', () => { if (nextMissionId) selectedMission = nextMissionId; openMenu(); });
  $('evolve-btn').addEventListener('click', () => action('evolve')); $('turret-btn').addEventListener('click', () => action('buyTurret')); $('repair-btn').addEventListener('click', () => action('repair'));
  $('rally-btn').addEventListener('click', () => action('rally')); $('heal-btn').addEventListener('click', () => action('heal'));
  $('skill-btn').addEventListener('click', toggleTarget); $('pause-btn').addEventListener('click', () => { setTargeting(false); action('togglePause'); });
  $('resume-btn').addEventListener('click', () => action('togglePause')); $('speed-btn').addEventListener('click', () => action('setSpeed', engine.state.speed === 1 ? 2 : 1));
  $('help-btn').addEventListener('click', showHelp); $('close-help').addEventListener('click', closeHelp);
  $('sound-btn').addEventListener('click', () => { sound = !sound; GameAudio.setEnabled(sound); setButtonIcon('sound-btn', sound ? 'sound' : 'mute'); $('sound-btn').setAttribute('aria-label', sound ? '关闭音效' : '开启音效'); writeStorage(soundKey, sound ? 'on' : 'off'); GameAudio.unlock(); GameAudio.play('ui'); });
  $('fullscreen-btn').addEventListener('click', async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch (_) { notify('此浏览器不支持全屏，放大窗口也能获得完整战场。'); } });
  document.querySelectorAll('[data-difficulty]').forEach(button => button.addEventListener('click', () => { difficulty = button.dataset.difficulty; document.querySelectorAll('[data-difficulty]').forEach(b => b.classList.toggle('selected', b === button)); GameAudio.unlock(); GameAudio.play('ui'); }));
  document.addEventListener('keydown', event => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    const modal = ['start-overlay', 'help-overlay', 'result-overlay'].map($).find(el => !el.hidden);
    if (event.key === 'Tab' && modal) {
      const controls = Array.from(modal.querySelectorAll('button:not(:disabled),[href]')).filter(el => !el.hidden && el.getClientRects().length);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    if (event.key === 'Escape') { if (targeting) setTargeting(false); else if (!$('help-overlay').hidden) closeHelp(); else if (!$('start-overlay').hidden && started && !resultShown) resumeMenu(); else if (started && !resultShown) action('togglePause'); return; }
    if (!started || modal) return;
    const key = event.key.toLowerCase();
    if (key === ' ') { event.preventDefault(); setTargeting(false); action('togglePause'); }
    else if (['1', '2', '3'].includes(key)) action('deploy', Number(key) - 1);
    else if (key === 'e') action('evolve'); else if (key === 'q') toggleTarget(); else if (key === 't') action('buyTurret'); else if (key === 'r') action('repair'); else if (key === 'f') action('rally'); else if (key === 'h') action('heal');
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && started && engine.state.status === 'playing') { engine.togglePause(); setTargeting(false); updateUI(); save(); } lastFrame = performance.now(); });
  window.addEventListener('pagehide', () => save());
  function loop(now) {
    const dt = Math.min(.1, (now - lastFrame) / 1000); lastFrame = now;
    if (started && $('start-overlay').hidden && $('help-overlay').hidden) engine.step(dt);
    handleEvents(); if (now - lastUI > 90) { updateUI(); lastUI = now; checkEnd(); }
    if (renderer) renderer.render(engine.state, dt, { targeting, pointerX: selectedTarget });
    if (started && now - lastSave > 4000) { save(); lastSave = now; }
    requestAnimationFrame(loop);
  }
  if (window.WarRenderer) renderer = new WarRenderer($('battlefield'));
  else console.error('Battle renderer failed to load');
  // Read-only diagnostics. Every player action goes through the visible controls.
  window.warGame = { snapshot: () => JSON.parse(engine.serialize()), campaign: () => Campaign.sanitizeProfile(profile), assetsReady: () => !!renderer, refreshAssets: () => renderer?.reloadAssets?.() };
  detectSave(); renderCampaign(); updateUI(); syncModal(); requestAnimationFrame(loop);
})();
