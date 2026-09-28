(function () {
  'use strict';
  // The field guide is intentionally self-contained: it reads the same unit metadata
  // as the simulator and can be used from the campaign screen before a battle starts.
  const W = window.WarEngine;
  if (!W || !Array.isArray(W.ERAS)) return;
  const esc = value => String(value).replace(/[&<>\"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[ch]));
  const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"></use></svg>`;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'field-guide-trigger';
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-controls', 'field-guide-overlay');
  button.innerHTML = `${icon('help')}<span>兵种图鉴</span>`;
  const host = document.querySelector('.campaign-record') || document.querySelector('.campaign-heading');
  host?.appendChild(button);

  const overlay = document.createElement('div');
  overlay.id = 'field-guide-overlay';
  overlay.className = 'field-guide-overlay';
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', '兵种图鉴');
  overlay.innerHTML = `<div class="field-guide-panel">
    <header class="field-guide-head"><div><span class="field-guide-kicker">FIELD GUIDE · UNIT ARCHIVE</span><h2>兵种图鉴</h2><p>认识每一代文明的战士，按定位搭配你的推进节奏。</p></div><button type="button" class="field-guide-close" aria-label="关闭图鉴">×</button></header>
    <nav class="field-guide-tabs" aria-label="时代筛选"></nav>
    <div class="field-guide-preview" hidden><div class="field-preview-label"><strong>动作预览</strong><span>石器时代 · 三兵种同步展示</span></div><div class="field-preview-controls" role="group" aria-label="选择兵种动作"><button type="button" data-preview-action="idle" aria-pressed="true">待机</button><button type="button" data-preview-action="walk" aria-pressed="false">行走</button><button type="button" data-preview-action="attack" aria-pressed="false">攻击</button><button type="button" class="field-preview-toggle" aria-label="暂停动作预览">暂停</button></div><small class="field-preview-note" aria-live="polite"></small></div>
    <div class="field-guide-body"><aside class="field-guide-era"><span class="field-guide-era-mark">I</span><strong></strong><small></small><p></p></aside><section class="field-guide-units" aria-live="polite"></section></div>
    <footer class="field-guide-foot"><span>${icon('bolt')} 基础属性 · 战场中的专长与研发另行加成</span><button type="button" class="field-guide-close secondary">返回战役地图</button></footer>
  </div>`;
  document.body.appendChild(overlay);
  const tabs = overlay.querySelector('.field-guide-tabs');
  const eraInfo = overlay.querySelector('.field-guide-era');
  const units = overlay.querySelector('.field-guide-units');
  const preview = overlay.querySelector('.field-guide-preview');
  const motionPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const previewActions = { idle: { label: '待机', row: 0, duration: 4 / 3 }, walk: { label: '行走', row: 1, duration: .5 }, attack: { label: '攻击', row: 2, duration: .45 } };
  let current = 0;
  let previewAction = 'idle', previewPlaying = !motionPreference?.matches, previewRequested = false;
  let previewGeneration = 0, previewLoaded = 0, previewReady = false;

  function updatePreview() {
    const action = previewActions[previewAction];
    units.style.setProperty('--preview-row', action.row);
    units.style.setProperty('--preview-duration', `${action.duration}s`);
    units.classList.toggle('field-preview-paused', !previewPlaying);
    units.classList.toggle('field-preview-requested', previewRequested);
    preview.querySelectorAll('[data-preview-action]').forEach(control => {
      const selected = control.dataset.previewAction === previewAction;
      control.classList.toggle('active', selected); control.setAttribute('aria-pressed', String(selected));
    });
    const toggle = preview.querySelector('.field-preview-toggle');
    toggle.textContent = previewPlaying ? '暂停' : '播放';
    toggle.setAttribute('aria-label', previewPlaying ? '暂停动作预览' : '播放动作预览');
    preview.querySelector('.field-preview-note').textContent = !previewReady ? '正在准备动作…' : !previewLoaded ? '动作暂不可用，已显示静态立绘。' : !previewPlaying ? '动画已暂停 · 点击动作或播放按钮继续' : previewLoaded < 3 ? '部分兵种展示静态立绘 · 其余动作同步播放' : `${action.label}动作循环播放`;
    units.querySelectorAll('.field-unit-sprite').forEach(frame => { frame.setAttribute('aria-label', `${frame.dataset.unitName} · ${action.label}动作预览`); });
  }
  function restartPreview() {
    // Start all three sheets on the same style update so their frame clocks match.
    units.classList.remove('field-preview-ready');
    void units.offsetWidth;
    if (previewReady && previewLoaded) units.classList.add('field-preview-ready');
  }
  function loadPreviews(generation) {
    const sheets = Array.from(units.querySelectorAll('.field-unit-sheet'));
    Promise.all(sheets.map(sheet => new Promise(resolve => {
      sheet.onload = () => resolve(sheet.naturalWidth === 1024 && sheet.naturalHeight === 768);
      sheet.onerror = () => resolve(false);
      sheet.src = sheet.dataset.src;
    }))).then(loaded => {
      if (generation !== previewGeneration || current !== 0) return;
      previewLoaded = loaded.filter(Boolean).length; previewReady = true;
      sheets.forEach((sheet, index) => {
        const art = sheet.closest('.field-unit-art');
        art.querySelector('.field-unit-static').hidden = loaded[index];
        sheet.parentElement.hidden = !loaded[index];
      });
      updatePreview(); restartPreview();
    });
  }

  function drawTabs() {
    tabs.innerHTML = W.ERAS.map((era, i) => `<button type="button" aria-pressed="${i === current}" class="${i === current ? 'active' : ''}" data-era="${i}"><b>${['I', 'II', 'III', 'IV', 'V'][i]}</b><span>${esc(era.name.replace('时代', ''))}</span></button>`).join('');
    tabs.querySelectorAll('button').forEach(tab => tab.addEventListener('click', () => { current = Number(tab.dataset.era); draw(); tabs.querySelector(`[data-era="${current}"]`).focus({ preventScroll: true }); }));
  }
  function draw() {
    const era = W.ERAS[current];
    const generation = ++previewGeneration;
    preview.hidden = current !== 0; previewLoaded = 0; previewReady = false;
    units.classList.remove('field-preview-ready');
    drawTabs();
    eraInfo.style.setProperty('--guide-era-color', era.color);
    eraInfo.querySelector('.field-guide-era-mark').textContent = ['I', 'II', 'III', 'IV', 'V'][current];
    eraInfo.querySelector('strong').textContent = era.name;
    eraInfo.querySelector('small').textContent = era.subtitle;
    eraInfo.querySelector('p').textContent = `时代技能：${era.specialName}`;
    units.innerHTML = era.units.map((unit, i) => `<article class="field-unit-card" style="--unit-color:${era.color}">
      <div class="field-unit-art"><img class="field-unit-static" src="assets/units/e${current}-u${i}.png" alt="${esc(unit.name)}" loading="lazy">${current === 0 ? `<span class="field-unit-sprite" role="img" aria-label="${esc(unit.name)} · 待机动作预览" data-unit-name="${esc(unit.name)}" hidden><img class="field-unit-sheet" data-src="assets/animations/e0-u${i}.png" alt="" decoding="async"></span>` : ''}<span class="field-unit-index">0${i + 1}</span></div>
      <div class="field-unit-copy"><div class="field-unit-title"><h3>${esc(unit.name)}</h3><span>${icon(i === 0 ? 'shield' : i === 1 ? 'bolt' : 'tower')}${esc(unit.role)}</span></div><p>${esc(unit.description)}</p>
      <dl><div><dt>招募</dt><dd>${unit.cost} 金</dd></div><div><dt>生命</dt><dd>${unit.hp}</dd></div><div><dt>伤害</dt><dd>${unit.damage}</dd></div><div><dt>射程</dt><dd>${unit.range}</dd></div><div><dt>移速</dt><dd>${unit.speed}</dd></div><div><dt>训练</dt><dd>${unit.trainTime}s</dd></div></dl></div>
    </article>`).join('');
    if (current === 0) { updatePreview(); loadPreviews(generation); }
  }
  function open() {
    current = 0; previewAction = 'idle'; previewPlaying = !motionPreference?.matches; previewRequested = false;
    draw(); overlay.hidden = false;
    document.body.classList.add('field-guide-open');
    overlay.querySelector('.field-guide-close').focus({ preventScroll: true });
  }
  preview.addEventListener('click', event => {
    const actionButton = event.target.closest('[data-preview-action]');
    if (actionButton) {
      previewAction = actionButton.dataset.previewAction; previewPlaying = true; previewRequested = true;
      updatePreview(); restartPreview();
    } else if (event.target.closest('.field-preview-toggle')) {
      previewPlaying = !previewPlaying;
      if (previewPlaying) previewRequested = true;
      updatePreview();
    }
  });
  motionPreference?.addEventListener?.('change', event => {
    if (!event.matches) return;
    previewPlaying = false; previewRequested = false; updatePreview();
  });
  function close() {
    overlay.hidden = true;
    document.body.classList.remove('field-guide-open'); button.focus({ preventScroll: true });
  }
  button.addEventListener('click', open);
  overlay.querySelectorAll('.field-guide-close').forEach(b => b.addEventListener('click', close));
  overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
  document.addEventListener('keydown', event => {
    if (overlay.hidden) return;
    // Keep campaign shortcuts from handling keys while this nested dialog is open.
    event.stopImmediatePropagation();
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key === 'Tab') {
      const controls = Array.from(overlay.querySelectorAll('button:not(:disabled)'));
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }, true);
})();
