// ── AirKeys config & persisted settings ─────────────────────────────
const STORE_KEY = 'airkeys.settings.v1';
const SCORE_KEY = 'airkeys.scores.v1';

export const DEFAULTS = {
  input: 'air',          // 'air' (camera) | 'touch' (mouse/touch/keys)
  lanes: 0,              // 0 = auto (per song), or 4/5/6
  speed: 1.0,            // approach-speed multiplier 0.75–1.5
  latency: 0.09,         // seconds of camera latency compensation
  camAlpha: 0.34,        // webcam visibility 0–0.7
  trails: true,          // fingertip trails
  accompaniment: true,   // auto-played bass/chords + gold rain
  assist: true,          // touch-the-tile assist (off = flick-only, harder)
  demo: false,           // autoplay bot (watch the game play itself)
  haptics: true,         // vibrate on hit (touch devices)
};

export const settings = { ...DEFAULTS };

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) Object.assign(settings, JSON.parse(raw));
  } catch (_) { /* private mode etc. */ }
  return settings;
}

export function saveSettings() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch (_) {}
}

// ── per-song best results ───────────────────────────────────────────
let scores = null;
function loadScores() {
  if (scores) return scores;
  try { scores = JSON.parse(localStorage.getItem(SCORE_KEY) || '{}'); }
  catch (_) { scores = {}; }
  return scores;
}
export function bestFor(songId) { return loadScores()[songId] || null; }
export function recordBest(songId, result) {
  const s = loadScores();
  const prev = s[songId];
  if (!prev || result.score > prev.score) {
    s[songId] = { score: result.score, grade: result.grade, acc: result.acc, combo: result.maxCombo };
    try { localStorage.setItem(SCORE_KEY, JSON.stringify(s)); } catch (_) {}
    return true;
  }
  return false;
}

// ── gameplay constants ──────────────────────────────────────────────
export const JUDGE = {
  perfect: 0.095,        // |Δt| seconds
  great:   0.175,
  good:    0.26,
  missAfter: 0.30,       // tile considered missed this long past its time
};

export const TUNING = {
  approachTime: 1.9,     // seconds from spawn (top) to hit line, before speed mult
  hitLineFrac: 0.795,    // hit line y as fraction of canvas height
  keybedFrac:  0.205,    // keybed occupies bottom fraction
  tapVelFrac:  1.05,     // downward fingertip velocity threshold, canvas-heights/sec
  rearmVelFrac: 0.18,    // upward velocity that re-arms a finger
  campMs: 750,           // finger parked in zone longer than this stops assist-hits
  predictMs: 70,         // forward-extrapolate fingertips by this much
  maxVoices: 18,
};

export const GENRES = ['All', 'Starter', 'Classical', 'Romance', 'Grand', 'Pop'];

export const GENRE_THEME = {
  Starter:   { hue: 152, accent: '#4ade80' },
  Classical: { hue: 196, accent: '#38bdf8' },
  Romance:   { hue: 330, accent: '#f472b6' },
  Grand:     { hue: 258, accent: '#a78bfa' },
  Pop:       { hue: 38,  accent: '#fbbf24' },
};
