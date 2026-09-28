(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CampaignProgress = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var IDS = ['frontier', 'crossroads', 'siege', 'holdout', 'citadel'];
  var PAR = { frontier: 200, crossroads: 180, siege: 300, holdout: 200, citadel: 300 };
  var NEXT = { frontier: ['crossroads', 'siege'], crossroads: ['holdout'], siege: ['holdout'], holdout: ['citadel'], citadel: [] };
  var MAX_WINS = 1000000;
  var MAX_TIME = 86400;
  var MAX_RECENT = 50;

  // Only copy known own data properties. Persisted JSON must never supply a
  // prototype, execute a getter, or create arbitrary mission keys.
  function own(object, key) {
    if (!object || typeof object !== 'object' || Array.isArray(object)) return undefined;
    try {
      var descriptor = Object.getOwnPropertyDescriptor(object, key);
      return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') ? descriptor.value : undefined;
    } catch (_) { return undefined; }
  }
  function bounded(value, fallback, min, max) {
    return typeof value === 'number' && isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  }
  function runId(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 160 && value.trim() ? value : null;
  }
  function createProfile() { return { version: 1, missions: {}, totalWins: 0, recentResults: [] }; }

  function sanitizeProfile(raw) {
    var clean = createProfile();
    if (typeof raw === 'string') {
      if (raw.length > 100000) return clean;
      try { raw = JSON.parse(raw); } catch (_) { return clean; }
    }
    if (own(raw, 'version') !== 1) return clean;
    var missions = own(raw, 'missions');
    IDS.forEach(function (id) {
      var saved = own(missions, id), stars = own(saved, 'stars');
      if (typeof stars !== 'number' || !isFinite(stars) || stars < 1) return;
      var record = {
        stars: Math.floor(Math.min(3, stars)),
        bestTime: bounded(own(saved, 'bestTime'), MAX_TIME, 0, MAX_TIME),
        wins: Math.floor(bounded(own(saved, 'wins'), 1, 1, MAX_WINS))
      };
      clean.missions[id] = record;
      clean.totalWins += record.wins;
    });
    var recent = own(raw, 'recentResults');
    if (Array.isArray(recent)) {
      // Read at most the last 50 entries, even for a damaged giant array.
      for (var i = Math.max(0, recent.length - MAX_RECENT); i < recent.length; i++) {
        var id;
        try { id = runId(recent[i]); } catch (_) { continue; }
        if (id && clean.recentResults.indexOf(id) === -1) clean.recentResults.push(id);
      }
    }
    return clean;
  }

  function unlocked(profile, id) {
    if (id === 'classic' || id === 'frontier') return true;
    if (id === 'crossroads' || id === 'siege') return !!profile.missions.frontier;
    if (id === 'holdout') return !!(profile.missions.crossroads || profile.missions.siege);
    if (id === 'citadel') return !!profile.missions.holdout;
    return false;
  }
  function isUnlocked(profile, missionId) { return unlocked(sanitizeProfile(profile), missionId); }

  function recordResult(profile, result) {
    var clean = sanitizeProfile(profile);
    var id = own(result, 'missionId'), token = runId(own(result, 'runId'));
    if (IDS.indexOf(id) === -1 || own(result, 'status') !== 'won' || !token || !unlocked(clean, id)) return clean;
    if (clean.recentResults.indexOf(token) !== -1) return clean;
    var rawTime = own(result, 'time');
    // A missing/corrupt timer cannot earn a speed star or beat a valid record.
    var validTime = typeof rawTime === 'number' && isFinite(rawTime) && rawTime >= 0;
    var time = validTime ? Math.min(MAX_TIME, rawTime) : MAX_TIME;
    var stars = 1 + (bounded(own(result, 'baseRatio'), 0, 0, 1) >= 0.5 ? 1 : 0) + (validTime && time <= PAR[id] ? 1 : 0);
    var old = clean.missions[id];
    clean.missions[id] = {
      stars: Math.max(old ? old.stars : 0, stars),
      bestTime: Math.min(old ? old.bestTime : MAX_TIME, time),
      wins: Math.min(MAX_WINS, (old ? old.wins : 0) + 1)
    };
    clean.totalWins += clean.missions[id].wins - (old ? old.wins : 0);
    clean.recentResults.push(token);
    if (clean.recentResults.length > MAX_RECENT) clean.recentResults.shift();
    return clean;
  }
  function totalStars(profile) {
    var clean = sanitizeProfile(profile);
    return IDS.reduce(function (sum, id) { return sum + (clean.missions[id] ? clean.missions[id].stars : 0); }, 0);
  }
  function nextMission(profile, currentId) {
    var clean = sanitizeProfile(profile);
    var preferred = IDS.indexOf(currentId) >= 0 ? NEXT[currentId] : [];
    var candidates = preferred.concat(IDS);
    for (var i = 0; i < candidates.length; i++) {
      var id = candidates[i];
      if (!clean.missions[id] && unlocked(clean, id)) return id;
    }
    return null;
  }

  return { createProfile: createProfile, sanitizeProfile: sanitizeProfile, isUnlocked: isUnlocked, recordResult: recordResult, totalStars: totalStars, nextMission: nextMission };
});
