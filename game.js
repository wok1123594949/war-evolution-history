(function () {
  'use strict';
  const { ERAS, Engine } = window.WarEngine;
  const $ = id => document.getElementById(id);
  const icons = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const numerals = ['I', 'II', 'III', 'IV', 'V'];
  const english = ['STONE AGE', 'MEDIEVAL AGE', 'GUNPOWDER AGE', 'INDUSTRIAL AGE', 'FUTURE AGE'];
  const saveKey = 'age-of-war-save-v2', soundKey = 'age-of-war-sound';
  let engine = new Engine(), renderer, started = false, difficulty = 'normal', targeting = false, resultShown = false;
  let lastFrame = performance.now(), lastUI = 0, lastSave = 0, renderedEra = -1, queueSignature = '', menuPaused = false, helpPaused = false;
  let selectedTarget = 800, saveAvailable = false, sound = true;
  
  const asset = (era, kind) => `assets/units/e${era}-u${kind}.png`;
  const fmt = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  const texts = new Map();
  function text(id, value) { value = String(value); if (texts.get(id) !== value) { $(id).textContent = value; texts.set(id, value); } }
  function hidden(id, value) { if ($(id).hidden !== value) $(id).hidden = value; }
  function notify(message) {
    text('battle-toast', message); $('battle-toast').classList.add('show'); clearTimeout(notify.timer);
    notify.timer = setTimeout(() => $('battle-toast').classList.remove('show'), 2500);
  }
  function setButtonIcon(id, name) { const use = $(id).querySelector('use'); if (use.getAttribute('href') !== `#i-${name}`) use.setAttribute('href', `#i-${name}`); }
  function getSave() { try { return localStorage.getItem(saveKey); } catch (_) { return null; } }
  function detectSave() {
    const raw = getSave(); saveAvailable = false;
    if (raw) try { const parsed = JSON.parse(raw); if (parsed.version === 2 && parsed.state && ['playing', 'paused'].includes(parsed.state.status) && parsed.state.time > 1) {
      saveAvailable = true; text('continue-detail', `${ERAS[parsed.state.era]?.name || ''} · ${fmt(parsed.state.time)}`);
    } } catch (_) {}
    hidden('continue-btn', !saveAvailable || started);
  }
  function save() {
    if (!started) return;
    try {
      if (['won', 'lost'].includes(engine.state.status)) { localStorage.removeItem(saveKey); return; }
      localStorage.setItem(saveKey, engine.serialize()); text('save-label', '本地自动存档');
    } catch (_) { text('save-label', '当前浏览器无法存档'); }
  }
  try { sound = localStorage.getItem(soundKey) !== 'off'; } catch (_) {}
  GameAudio.setEnabled(sound); setButtonIcon('sound-btn', sound ? 'sound' : 'mute');
  $('sound-btn').setAttribute('aria-label', sound ? '关闭音效' : '开启音效');

  function renderEra() {
    const era = ERAS[engine.state.era], index = era.id;
    $('era-nodes').innerHTML = ERAS.map((e, i) => `<div class="era-step ${i === index ? 'current' : i < index ? 'passed' : ''}" ${i === index ? 'aria-current="step"' : ''}><b><i>${numerals[i]}</i></b><span>${e.name}<small>${english[i]}</small></span></div>`).join('');
    $('unit-buttons').innerHTML = era.units.map((unit, kind) => `<button class="unit-card" data-kind="${kind}" title="${unit.description}｜生命 ${unit.hp}｜伤害 ${unit.damage}｜训练 ${unit.trainTime} 秒" aria-label="征募${unit.name}，${unit.cost}金币"><img src="${asset(index, kind)}" alt="${unit.name}" draggable="false"><span class="unit-key">${kind + 1}</span><span class="unit-role">${kind === 0 ? '近战' : kind === 1 ? '远程' : index > 1 ? '范围重装' : '重装'}</span><span class="unit-info"><div><strong>${unit.name}</strong><span class="unit-cost">${icons('coin')}${unit.cost}</span></div><span class="unit-stats"><span>${icons('shield')}${unit.hp}</span><span>${icons('swords')}${unit.damage}</span><span>${icons('clock')}${unit.trainTime}s</span></span></span></button>`).join('');
    $('unit-buttons').querySelectorAll('button').forEach(button => button.addEventListener('click', () => action('deploy', +button.dataset.kind)));
    text('next-era-name', ERAS[index + 1]?.name || '文明巅峰'); text('next-era-label', index === 4 ? '所有时代已解锁' : '下一时代');
    text('next-era-icon', numerals[Math.min(4, index + 1)]); text('era-count', `${numerals[index]} / V`);
    text('skill-name', era.specialName); text('player-era', era.name);
    $('evolve-btn').querySelector('span').textContent = index === 4 ? '已达最终时代' : '进化时代';
    renderedEra = index; queueSignature = ''; document.documentElement.style.setProperty('--era', era.color);
  }
  function renderQueue() {
    const q = engine.state.queue, signature = q.map(item => `${item.era}:${item.kind}`).join(',');
    if (signature !== queueSignature || !$('training-queue').children.length) {
      $('training-queue').innerHTML = Array.from({ length: 5 }, (_, i) => `<span class="queue-slot" ${q[i] ? `title="${ERAS[q[i].era].units[q[i].kind].name}"` : ''}>${q[i] ? `<img src="${asset(q[i].era, q[i].kind)}" alt="${ERAS[q[i].era].units[q[i].kind].name}"><i></i>` : ''}</span>`).join(''); queueSignature = signature;
    }
    const first = $('training-queue').querySelector('i'); if (first && q[0]) first.style.width = `${100 * (1 - q[0].remaining / q[0].total)}%`;
    text('queue-label', q.length ? `${q.length}/5 · ${Math.ceil(q[0].remaining)}s` : '等待征募');
  }
  function updateUI() {
    const s = engine.state, era = ERAS[s.era], running = started && s.status === 'playing', units = s.units.filter(u => u.side === 'player' && !u.dead).length;
    if (renderedEra !== s.era) renderEra();
    text('gold', Math.floor(s.gold)); text('xp', Math.floor(s.xp)); text('population', `${units} / ${s.populationCap}`); text('timer', fmt(s.time));
    const p = s.bases.player, e = s.bases.enemy;
    $('player-hp').style.width = `${100 * p.hp / p.maxHp}%`; $('enemy-hp').style.width = `${100 * e.hp / e.maxHp}%`;
    text('player-hp-text', `${Math.ceil(p.hp)} / ${p.maxHp}`); text('enemy-hp-text', `${Math.ceil(e.hp)} / ${e.maxHp}`); text('enemy-era', ERAS[s.enemyEra].name);
    const turretMarkup = [0, 1, 2].map(i => `<svg class="${i < p.turrets ? 'built' : ''}"><use href="#i-tower"/></svg>`).join('') + `<span>防御等级 ${p.turrets} / 3</span>`;
    if ($('player-slots').dataset.level !== String(p.turrets)) { $('player-slots').innerHTML = turretMarkup; $('player-slots').dataset.level = p.turrets; }
    const ready = !!era.xpRequired && s.xp >= era.xpRequired;
    $('xp-bar').style.width = `${era.xpRequired ? Math.min(100, 100 * s.xp / era.xpRequired) : 100}%`;
    text('xp-detail', era.xpRequired ? `${Math.floor(s.xp)} / ${era.xpRequired} XP` : '五个时代全部解锁'); text('evolve-hint', ready ? '研究完成！' : s.era === 4 ? '摧毁敌方基地' : '击败敌军获得经验');
    $('evolve-btn').disabled = !running || !ready; $('evolve-btn').classList.toggle('ready', ready && running);
    for (const b of $('unit-buttons').children) b.disabled = !running || s.gold < era.units[+b.dataset.kind].cost || s.queue.length >= 5 || units + s.queue.length >= s.populationCap;
    $('turret-btn').disabled = !running || s.gold < era.turretCost || p.turrets >= 3;
    text('turret-cost', p.turrets >= 3 ? '已满级' : `${era.turretCost} 金 · ${p.turrets}/3`);
    $('repair-btn').disabled = !running || s.gold < era.repairCost || p.hp >= p.maxHp || s.cooldowns.repair > 0;
    text('repair-cost', s.cooldowns.repair > 0 ? `${Math.ceil(s.cooldowns.repair)}s 冷却` : `${era.repairCost} 金`);
    $('skill-btn').disabled = !running || s.cooldowns.special > 0;
    text('skill-caption', s.cooldowns.special > 0 ? `${Math.ceil(s.cooldowns.special)} 秒后就绪` : targeting ? '点击战场，确定落点' : '范围轰击 · 已就绪');
    $('skill-shade').style.width = `${Math.min(100, 100 * s.cooldowns.special / Math.max(16, 26 - s.era * 2))}%`;
    text('speed-btn', `${s.speed}×`); setButtonIcon('pause-btn', s.status === 'paused' ? 'play' : 'pause');
    $('pause-btn').setAttribute('aria-label', s.status === 'paused' ? '继续战斗' : '暂停'); $('pause-btn').title = s.status === 'paused' ? '继续战斗（空格）' : '暂停（空格）';
    hidden('battle-banner', s.status !== 'paused' || !$('start-overlay').hidden || !$('help-overlay').hidden);
    text('battle-status', s.status === 'paused' ? '战斗已暂停' : s.status === 'won' ? '敌营已摧毁' : s.status === 'lost' ? '基地已失守' : '保卫基地 · 摧毁敌营');
    $('battle-tip').style.opacity = s.time > 35 ? '0' : '1'; renderQueue();
  }
  function handleEvents() {
    const events = engine.drainEvents();
    renderer?.handleEvents?.(events);
    for (const ev of events) {
      if (ev.type !== 'kill' && ev.type !== 'spawn' || ev.side === 'player') text('latest-event', `${fmt(engine.state.time)}　${ev.text}`);
      if (['evolve', 'enemyEvolve', 'turret', 'repair', 'saveError', 'load'].includes(ev.type)) notify(ev.text);
      if (['deploy', 'evolve', 'special', 'repair', 'turret'].includes(ev.type)) GameAudio.play(ev.type);
      if (ev.type === 'kill') GameAudio.play('hit');
    }
  }
  function action(method, ...args) {
    GameAudio.unlock(); if (!started || !$('start-overlay').hidden || !$('help-overlay').hidden) return;
    const result = engine[method](...args); if (!result.ok) { notify(result.reason); GameAudio.play('error'); }
    if (result.ok && method === 'evolve') renderedEra = -1;
    handleEvents(); updateUI(); checkEnd(); return result;
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
    if (renderer?.clientToWorld) return renderer.clientToWorld(event.clientX);
    return Math.max(220, Math.min(1380, (event.clientX - rect.left) / rect.width * 1600));
  }
  $('battlefield').addEventListener('pointermove', event => { if (targeting) { selectedTarget = pointerWorld(event); renderer?.setTargeting?.(true, selectedTarget); } });
  $('battlefield').addEventListener('click', event => { if (!targeting) return; selectedTarget = pointerWorld(event); const r = action('special', selectedTarget); if (r?.ok) setTargeting(false); });
  $('cancel-target').addEventListener('click', () => setTargeting(false));

  function start(resume = false) {
    GameAudio.unlock(); engine = resume ? Engine.fromSave(getSave()) : new Engine({ difficulty });
    if (engine.state.status === 'paused') engine.togglePause();
    started = true; resultShown = false; renderedEra = -1; queueSignature = ''; menuPaused = false;
    hidden('start-overlay', true); hidden('result-overlay', true); hidden('help-overlay', true); setTargeting(false);
    handleEvents(); updateUI(); lastFrame = performance.now(); GameAudio.play('ui'); save();
  }
  function openMenu() {
    setTargeting(false); menuPaused = started && engine.state.status === 'playing';
    if (menuPaused) engine.togglePause(); save(); detectSave(); hidden('menu-resume', !started || ['won', 'lost'].includes(engine.state.status));
    $('start-btn').querySelector('span').textContent = started ? '开启新征程' : '开启征程'; hidden('start-overlay', false); updateUI();
  }
  function resumeMenu() { if (menuPaused && engine.state.status === 'paused') engine.togglePause(); menuPaused = false; hidden('start-overlay', true); updateUI(); lastFrame = performance.now(); }
  function showHelp() { if (!$('start-overlay').hidden) return; setTargeting(false); helpPaused = engine.state.status === 'playing'; if (helpPaused) engine.togglePause(); hidden('help-overlay', false); updateUI(); }
  function closeHelp() { hidden('help-overlay', true); if (helpPaused && engine.state.status === 'paused') engine.togglePause(); helpPaused = false; updateUI(); lastFrame = performance.now(); }
  function checkEnd() {
    if (!started || resultShown || !['won', 'lost'].includes(engine.state.status)) return;
    resultShown = true; setTargeting(false); const s = engine.state, won = s.status === 'won';
    text('result-kicker', won ? 'VICTORY' : 'DEFEAT'); text('result-title', won ? '文明的胜利' : '防线失守');
    text('result-copy', won ? `从火种到${ERAS[s.era].name}，你的军团击溃了暮色军团。` : '战争从未终结。重新组织前锋与后排，把握下一次进化的时机。');
    $('result-stats').innerHTML = `<div><strong>${fmt(s.time)}</strong><small>战斗用时</small></div><div><strong>${s.stats.kills}</strong><small>击败敌军</small></div><div><strong>${s.stats.deployed}</strong><small>征募部队</small></div>`;
    hidden('result-overlay', false); GameAudio.play(won ? 'win' : 'lose'); save();
  }
  $('start-btn').addEventListener('click', () => start(false)); $('continue-btn').addEventListener('click', () => start(true));
  $('menu-resume').addEventListener('click', resumeMenu); $('menu-btn').addEventListener('click', openMenu); $('home-btn').addEventListener('click', event => { event.preventDefault(); openMenu(); });
  $('restart-btn').addEventListener('click', () => start(false)); $('result-menu').addEventListener('click', () => { hidden('result-overlay', true); openMenu(); });
  $('evolve-btn').addEventListener('click', () => action('evolve')); $('turret-btn').addEventListener('click', () => action('buyTurret')); $('repair-btn').addEventListener('click', () => action('repair'));
  $('skill-btn').addEventListener('click', toggleTarget); $('pause-btn').addEventListener('click', () => { setTargeting(false); action('togglePause'); });
  $('resume-btn').addEventListener('click', () => action('togglePause')); $('speed-btn').addEventListener('click', () => action('setSpeed', engine.state.speed === 1 ? 2 : 1));
  $('help-btn').addEventListener('click', showHelp); $('close-help').addEventListener('click', closeHelp);
  $('sound-btn').addEventListener('click', () => { sound = !sound; GameAudio.setEnabled(sound); setButtonIcon('sound-btn', sound ? 'sound' : 'mute'); $('sound-btn').setAttribute('aria-label', sound ? '关闭音效' : '开启音效'); try { localStorage.setItem(soundKey, sound ? 'on' : 'off'); } catch (_) {} GameAudio.play('ui'); });
  $('fullscreen-btn').addEventListener('click', async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch (_) { notify('此浏览器不支持全屏，放大窗口也能获得完整战场。'); } });
  document.querySelectorAll('[data-difficulty]').forEach(button => button.addEventListener('click', () => { difficulty = button.dataset.difficulty; document.querySelectorAll('[data-difficulty]').forEach(b => b.classList.toggle('selected', b === button)); GameAudio.unlock(); GameAudio.play('ui'); }));
  document.addEventListener('keydown', event => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    if (event.key === 'Escape') { if (targeting) setTargeting(false); else if (!$('help-overlay').hidden) closeHelp(); else if (!$('start-overlay').hidden && started && !resultShown) resumeMenu(); else if (started && !resultShown) action('togglePause'); return; }
    if (!started || !$('start-overlay').hidden || !$('help-overlay').hidden || !$('result-overlay').hidden) return;
    const key = event.key.toLowerCase();
    if (key === ' ') { event.preventDefault(); setTargeting(false); action('togglePause'); }
    else if (['1', '2', '3'].includes(key)) action('deploy', Number(key) - 1);
    else if (key === 'e') action('evolve'); else if (key === 'q') toggleTarget(); else if (key === 't') action('buyTurret'); else if (key === 'r') action('repair');
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && started && engine.state.status === 'playing') { engine.togglePause(); setTargeting(false); updateUI(); save(); } lastFrame = performance.now(); });
  window.addEventListener('pagehide', save);
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
  // Read-only diagnostics for browser QA. Mutations go through the same visible controls.
  window.warGame = { snapshot: () => JSON.parse(engine.serialize()), assetsReady: () => !!renderer, refreshAssets: () => renderer?.reloadAssets?.() };
  detectSave(); renderEra(); updateUI(); requestAnimationFrame(loop);
})();
