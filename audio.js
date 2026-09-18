(function () {
  'use strict';
  let context, enabled = true, lastHit = 0;
  function unlock() {
    try { context ||= new (window.AudioContext || window.webkitAudioContext)(); if (context.state === 'suspended') context.resume(); } catch (_) {}
  }
  function tone(frequency, duration, volume, type, when = 0, end = frequency) {
    if (!enabled || !context || context.state !== 'running') return;
    const oscillator = context.createOscillator(), gain = context.createGain(), now = context.currentTime + when;
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, now); oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, end), now + duration);
    gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(volume, now + .008); gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain); gain.connect(context.destination); oscillator.start(now); oscillator.stop(now + duration + .01);
  }
  function noise(duration, volume, lowpass) {
    if (!enabled || !context || context.state !== 'running') return;
    const count = Math.floor(context.sampleRate * duration), buffer = context.createBuffer(1, count, context.sampleRate), data = buffer.getChannelData(0);
    for (let i = 0; i < count; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / count, 2);
    const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain(); source.buffer = buffer; filter.type = 'lowpass'; filter.frequency.value = lowpass; gain.gain.value = volume;
    source.connect(filter); filter.connect(gain); gain.connect(context.destination); source.start();
  }
  function play(kind) {
    if (!enabled) return;
    if (kind === 'ui') tone(520, .07, .025, 'triangle', 0, 340);
    else if (kind === 'deploy') { tone(330, .09, .035, 'triangle'); tone(490, .12, .02, 'triangle', .07); }
    else if (kind === 'spawn') tone(190, .11, .022, 'triangle', 0, 280);
    else if (kind === 'evolve') [262, 330, 392, 523, 659].forEach((n, i) => tone(n, .5, .045, 'triangle', i * .12));
    else if (kind === 'special') { tone(65, .7, .08, 'sine', 0, 24); noise(.9, .11, 900); }
    else if (kind === 'repair') { tone(440, .18, .03, 'sine'); tone(660, .25, .025, 'sine', .12); }
    else if (kind === 'turret') { noise(.12, .05, 1200); tone(180, .15, .04, 'triangle'); }
    else if (kind === 'win') [262, 330, 392, 523, 392, 523].forEach((n, i) => tone(n, .4, .05, 'triangle', i * .17));
    else if (kind === 'lose') [220, 196, 147, 110].forEach((n, i) => tone(n, .4, .035, 'triangle', i * .22));
    else if (kind === 'error') tone(110, .13, .025, 'triangle', 0, 80);
    else if (kind === 'hit' && performance.now() - lastHit > 150) { lastHit = performance.now(); noise(.09, .02, 1700); tone(100, .065, .02, 'sine', 0, 40); }
  }
  window.GameAudio = { unlock, play, setEnabled(value) { enabled = value; if (value) unlock(); } };
})();
