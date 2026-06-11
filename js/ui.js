// ── AirKeys UI: screens, HUD, song cards, settings ─────────────────
import { SONGS, songDuration, buildChart } from './songs.js';
import { settings, saveSettings, bestFor, GENRES, GENRE_THEME, DEFAULTS } from './config.js';
import { audio } from './audio.js';
import { hands } from './hands.js';

const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

const JUDGE_LABEL = { perfect: 'PERFECT', great: 'GREAT', good: 'GOOD', miss: 'MISS' };

export class UI {
  constructor() {
    this.onPlaySong = null;   // set by main.js
    this.onFreePlay = null;
    this.game = null;
    this.genre = 'All';
    this._previewTimer = null;
    this._judgeTimer = null;
  }

  init() {
    this.buildGenres();
    this.buildSongGrid();
    this.buildSettings();

    $('#btn-freeplay').addEventListener('click', () => { audio.init(); this.onFreePlay(); });
    $('#btn-settings').addEventListener('click', () => this.showSettings(true));
    $('#btn-howto').addEventListener('click', () => $('#howto').classList.remove('hidden'));
    $('#howto-close').addEventListener('click', () => $('#howto').classList.add('hidden'));
    $('#settings-close').addEventListener('click', () => this.showSettings(false));

    $('#btn-pause').addEventListener('click', () => this.game.togglePause());
    $('#pause-resume').addEventListener('click', () => this.game.resume());
    $('#pause-restart').addEventListener('click', () => { this.hidePause(); this.onPlaySong(this.game.song, true); });
    $('#pause-quit').addEventListener('click', () => this.exitToMenu());

    $('#res-replay').addEventListener('click', () => { this.showScreen('game'); this.onPlaySong(this.game.song, true); });
    $('#res-next').addEventListener('click', () => {
      const i = SONGS.indexOf(this.game.song);
      const next = SONGS[(i + 1) % SONGS.length];
      this.showScreen('game');
      this.onPlaySong(next, true);
    });
    $('#res-menu').addEventListener('click', () => this.exitToMenu());
    $('#warmup-cancel').addEventListener('click', () => this.exitToMenu());
    $('#free-exit').addEventListener('click', () => this.exitToMenu());
  }

  exitToMenu() {
    this.game.quit();
    hands.closeCamera(); // privacy: camera light goes off in the menu
    this.hidePause();
    this.showScreen('menu');
    this.buildSongGrid(); // refresh best badges
  }

  // ── menu ──────────────────────────────────────────────────────────
  buildGenres() {
    const box = $('#genres');
    box.innerHTML = '';
    for (const g of GENRES) {
      const b = el('button', 'chip' + (g === this.genre ? ' on' : ''), g);
      b.addEventListener('click', () => { this.genre = g; this.buildGenres(); this.buildSongGrid(); });
      box.appendChild(b);
    }
  }

  buildSongGrid() {
    const grid = $('#songs');
    grid.innerHTML = '';
    for (const song of SONGS) {
      if (this.genre !== 'All' && song.genre !== this.genre) continue;
      const theme = GENRE_THEME[song.genre];
      const best = bestFor(song.id);
      const dots = '●'.repeat(song.difficulty) + '○'.repeat(5 - song.difficulty);
      const card = el('div', 'card');
      card.style.setProperty('--accent', theme.accent);
      card.innerHTML = `
        <div class="card-top">
          <span class="genre-tag">${song.genre}</span>
          ${best ? `<span class="best-badge grade-${best.grade}">${best.grade}</span>` : ''}
        </div>
        <h3>${song.title}</h3>
        <p class="artist">${song.artist}</p>
        <div class="card-meta">
          <span class="dots" title="difficulty">${dots}</span>
          <span>${fmtTime(songDuration(song))}</span>
        </div>
        <div class="card-actions">
          <button class="preview" title="preview">▶</button>
          <button class="play">PLAY</button>
        </div>`;
      card.querySelector('.play').addEventListener('click', () => { this.stopPreview(); this.onPlaySong(song); });
      card.querySelector('.preview').addEventListener('click', (e) => { e.stopPropagation(); this.preview(song); });
      grid.appendChild(card);
    }
  }

  async preview(song) {
    await audio.init();
    this.stopPreview();
    const chart = buildChart(song, song.lanes);
    const t0 = audio.now + 0.05;
    const horizon = Math.min(4, chart.length);
    for (const tile of chart.tiles) {
      if (tile.t > horizon) break;
      audio.piano(tile.midi, 0.5, t0 + tile.t, tile.dur);
    }
    for (const b of chart.bass) {
      if (b.t > horizon) break;
      audio.pad(b.midi, 0.4, t0 + b.t, b.dur);
    }
    this._previewTimer = setTimeout(() => (this._previewTimer = null), horizon * 1000);
  }
  stopPreview() { if (this._previewTimer) { clearTimeout(this._previewTimer); this._previewTimer = null; } }

  // ── screens ───────────────────────────────────────────────────────
  showScreen(name) {
    for (const s of ['menu', 'warmup', 'results']) {
      $(`#screen-${s}`).classList.toggle('hidden', s !== name);
    }
    $('#hud').classList.toggle('hidden', name !== 'game');
    $('#free-hud').classList.add('hidden');
    document.body.classList.toggle('in-game', name === 'game' || name === 'warmup');
  }

  showFreePlay() {
    this.showScreen('game');
    $('#hud').classList.add('hidden');
    $('#free-hud').classList.remove('hidden');
  }

  setWarmupStatus(stage, detail = '') {
    const msgs = {
      engine: ['🧠', 'Warming up the vision engine…'],
      camera: ['📷', 'Opening your camera…'],
      detect: ['🖐️', 'Show your hands to the camera'],
      lock:   ['✨', 'Locked on — get ready!'],
    };
    const [icon, msg] = msgs[stage] || ['…', stage];
    $('#warmup-icon').textContent = icon;
    $('#warmup-msg').textContent = msg;
    $('#warmup-detail').textContent = detail;
  }

  setSongHeader(song) {
    $('#hud-title').textContent = song ? `${song.title} — ${song.artist}` : '';
  }

  // ── game callbacks (passed into Game) ────────────────────────────
  gameCallbacks() {
    return {
      onSongStart: () => {
        $('#combo').textContent = '';
        $('#combo').classList.remove('fire');
        $('#judge').classList.remove('show');
        $('#progress i').style.width = '0%';
        $('#hud-score').textContent = '0';
        $('#hud-acc').textContent = '100.0%';
      },
      onJudge: (grade, lane, combo) => {
        const j = $('#judge');
        j.textContent = JUDGE_LABEL[grade];
        j.className = `show ${grade}`;
        clearTimeout(this._judgeTimer);
        this._judgeTimer = setTimeout(() => j.classList.remove('show'), 420);
        const c = $('#combo');
        if (combo >= 2) {
          c.textContent = combo;
          c.classList.remove('pop'); void c.offsetWidth;
          c.classList.add('pop');
          c.classList.toggle('fire', combo >= 25);
        } else c.textContent = '';
      },
      onScore: (score, acc) => {
        $('#hud-score').textContent = score.toLocaleString();
        $('#hud-acc').textContent = `${(acc * 100).toFixed(1)}%`;
      },
      onProgress: (p) => { $('#progress i').style.width = `${p * 100}%`; },
      onPause: (reason) => {
        $('#pause-overlay').classList.remove('hidden');
        $('#pause-reason').textContent =
          reason === 'hands' ? '🖐️ Lost sight of your hands — step back into frame!'
          : reason === 'hidden' ? 'Paused while the tab was hidden'
          : '';
      },
      onResume: () => this.hidePause(),
      onResults: (song, res) => this.showResults(song, res),
      onFreeNote: (name) => {
        const n = $('#free-note');
        n.textContent = name;
        n.classList.remove('pop'); void n.offsetWidth;
        n.classList.add('pop');
      },
    };
  }

  hidePause() { $('#pause-overlay').classList.add('hidden'); }

  showResults(song, res) {
    this.showScreen('results');
    $('#res-grade').textContent = res.grade;
    $('#res-grade').className = `grade-${res.grade}`;
    $('#res-song').textContent = `${song.title} — ${song.artist}`;
    $('#res-score').textContent = res.score.toLocaleString();
    $('#res-acc').textContent = `${(res.acc * 100).toFixed(1)}%`;
    $('#res-combo').textContent = `${res.maxCombo}×`;
    $('#res-best').classList.toggle('hidden', !res.isBest);
    const c = res.counts;
    $('#res-counts').innerHTML = `
      <span class="perfect">${c.perfect} perfect</span>
      <span class="great">${c.great} great</span>
      <span class="good">${c.good} good</span>
      <span class="missc">${c.miss} miss</span>`;
  }

  // ── settings ──────────────────────────────────────────────────────
  showSettings(on) { $('#settings').classList.toggle('hidden', !on); }

  buildSettings() {
    const box = $('#settings-body');
    box.innerHTML = '';
    const row = (label, control, hint) => {
      const r = el('div', 'set-row');
      const l = el('label', '', label + (hint ? `<small>${hint}</small>` : ''));
      r.appendChild(l); r.appendChild(control);
      box.appendChild(r);
      return r;
    };
    const select = (opts, val, fn) => {
      const s = el('select');
      for (const [v, label] of opts) {
        const o = el('option', '', label); o.value = v;
        if (String(val) === String(v)) o.selected = true;
        s.appendChild(o);
      }
      s.addEventListener('change', () => { fn(s.value); saveSettings(); });
      return s;
    };
    const slider = (min, max, step, val, fn, fmt) => {
      const wrap = el('div', 'slider-wrap');
      const s = el('input'); s.type = 'range'; s.min = min; s.max = max; s.step = step; s.value = val;
      const out = el('span', 'slider-val', fmt(val));
      s.addEventListener('input', () => { fn(parseFloat(s.value)); out.textContent = fmt(parseFloat(s.value)); saveSettings(); });
      wrap.appendChild(s); wrap.appendChild(out);
      return wrap;
    };
    const toggle = (val, fn) => {
      const b = el('button', 'toggle' + (val ? ' on' : ''));
      b.addEventListener('click', () => {
        const on = !b.classList.contains('on');
        b.classList.toggle('on', on);
        fn(on); saveSettings();
      });
      return b;
    };

    row('Input', select([['air', '🖐️ Air (camera)'], ['touch', '👆 Touch / keys']], settings.input,
      (v) => { settings.input = v; }), 'how you strike the tiles');
    row('Lanes', select([[0, 'Auto (per song)'], [4, '4'], [5, '5'], [6, '6']], settings.lanes,
      (v) => { settings.lanes = parseInt(v, 10); }), 'applies on next song');
    row('Tile speed', slider(0.7, 1.5, 0.05, settings.speed,
      (v) => { settings.speed = v; }, (v) => `${v.toFixed(2)}×`), 'applies on next song');
    row('Air latency trim', slider(0, 0.2, 0.005, settings.latency,
      (v) => { settings.latency = v; }, (v) => `${Math.round(v * 1000)} ms`), 'raise if hits feel "late"');
    row('Camera visibility', slider(0, 0.7, 0.02, settings.camAlpha,
      (v) => { settings.camAlpha = v; }, (v) => `${Math.round(v * 100)}%`));
    row('Fingertip trails', toggle(settings.trails, (v) => { settings.trails = v; }));
    row('Accompaniment', toggle(settings.accompaniment, (v) => { settings.accompaniment = v; }), 'the game plays the left hand');
    row('Touch-the-tile assist', toggle(settings.assist, (v) => { settings.assist = v; }), 'off = flick-only, for pros');
    row('Demo autoplay', toggle(settings.demo, (v) => { settings.demo = v; }), 'watch AirKeys play itself');

    const reset = el('button', 'btn ghost', 'Reset to defaults');
    reset.addEventListener('click', () => {
      Object.assign(settings, DEFAULTS);
      saveSettings();
      this.buildSettings();
    });
    box.appendChild(reset);
  }

  toast(msg, ms = 3200) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }
}
