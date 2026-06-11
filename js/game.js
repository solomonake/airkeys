// ── AirKeys game engine ─────────────────────────────────────────────
import { settings, JUDGE, TUNING, GENRE_THEME, recordBest } from './config.js';
import { audio, midiToName } from './audio.js';
import { buildChart } from './songs.js';
import { hands } from './hands.js';
import { particles } from './particles.js';
import { Renderer } from './render.js';

const GRADE_BASE = { perfect: 100, great: 70, good: 40 };

export class Game {
  constructor(canvas, ui) {
    this.cv = canvas;
    this.ui = ui;                 // callbacks: judgement, combo, score, progress, pause UI, results, handsLost
    this.r = new Renderer(canvas);
    this.state = 'idle';          // idle | warmup | countin | play | paused | results | freeplay
    this.song = null;
    this.chart = null;
    this.raf = null;
    this.lastFrame = 0;
    this.freeScale = [60, 62, 64, 65, 67, 69, 71, 72]; // C major
    this._lastGhost = 0;
    this._lastMissSnd = 0;
    this._bound = false;
    window.addEventListener('resize', () => this.onResize());
  }

  onResize() {
    if (!this.cv.clientWidth) return;
    const lanes = this.state === 'freeplay' ? 8 : (this.chart ? this.chart.lanes : 4);
    this.r.resize(lanes, this.theme());
    hands.zoneTop = this.r.hitY - Math.min(120, this.r.h * 0.13);
    hands.zoneBottom = this.r.h;
    hands.setViewport(this.r.w, this.r.h);
    if (this.approach) this.pxPerSec = this.r.hitY / this.approach; // keep speed true after mid-song resizes
  }

  theme() {
    const g = this.song ? GENRE_THEME[this.song.genre] : null;
    return g ? g.hue : 196;
  }

  bindInput() {
    if (this._bound) return;
    this._bound = true;
    hands.onTap = (fg, strength) => {
      if (this.state === 'play' || this.state === 'countin') {
        this.strike(this.r.laneFromX(fg.px), strength, 'air', fg);
      } else if (this.state === 'freeplay') {
        this.freeStrike(fg, strength);
      }
    };
    this.cv.addEventListener('pointerdown', (e) => {
      const rect = this.cv.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      if (this.state === 'play' || this.state === 'countin') {
        this.strike(this.r.laneFromX(x), 0.8, 'touch');
      } else if (this.state === 'freeplay') {
        this.freeStrike({ px: x, py: y, id: x < rect.width / 2 ? 'L1' : 'R1' }, 0.8);
      }
    });
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.key === 'Escape') { this.togglePause(); return; }
      const lanes = this.chart ? this.chart.lanes : 8;
      const rows = { 4: 'dfjk', 5: 'dfgjk', 6: 'sdfjkl', 8: 'asdfghjk' };
      const row = rows[lanes] || 'dfjk';
      let lane = row.indexOf(e.key.toLowerCase());
      if (lane < 0 && /^[1-9]$/.test(e.key)) lane = parseInt(e.key, 10) - 1;
      if (lane < 0 || lane >= lanes) return;
      if (this.state === 'play' || this.state === 'countin') this.strike(lane, 0.85, 'touch');
      else if (this.state === 'freeplay') {
        this.freeStrike({ px: this.r.laneCenter(lane), py: this.r.hitY, id: lane < lanes / 2 ? 'L1' : 'R1' }, 0.85);
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'play') this.pause('hidden');
    });
  }

  // ── lifecycle ─────────────────────────────────────────────────────
  async startSong(song) {
    this.song = song;
    this.chart = buildChart(song, settings.lanes || song.lanes);
    this.bindInput();
    this.onResize();

    const c = this.chart;
    this.approach = TUNING.approachTime / (settings.speed || 1);
    this.pxPerSec = this.r.hitY / this.approach;
    this.leadIn = Math.max(this.approach + 0.8, c.spb * 4 + 0.6);

    // runtime state
    this.tiles = c.tiles.map(t => ({ ...t, state: 'fall', stateT: 0 }));
    this.spawnIdx = 0;
    this.active = [];
    this.bassIdx = 0;
    this.activeGold = [];
    this.score = 0; this.combo = 0; this.maxCombo = 0;
    this.counts = { perfect: 0, great: 0, good: 0, miss: 0 };
    this.ended = false;
    this.pausedAt = 0;

    if (this.ui.onSongStart) this.ui.onSongStart();
    await audio.init();
    this.t0 = audio.now + 0.1; // ctx time when songTime == -leadIn
    // count-in ticks on the last 4 beats
    for (let k = 4; k >= 1; k--) {
      const at = this.t0 + this.leadIn - c.spb * k;
      if (at > audio.now) audio.tick(at, k === 4);
    }
    this.state = 'countin';
    this.startLoop();
  }

  songTime() { return audio.now - this.t0 - this.leadIn; }
  ctxTimeFor(songT) { return this.t0 + this.leadIn + songT; }

  startFreePlay() {
    this.song = null; this.chart = null;
    this.bindInput();
    this.state = 'freeplay';
    this.onResize();
    audio.init();
    this.startLoop();
  }

  // camera-and-hands preview while the player gets in position
  startWarmup() {
    this.song = null; this.chart = null;
    this.bindInput();
    this.state = 'warmup';
    this.onResize();
    this.startLoop();
  }

  pause(reason) {
    if (this.state !== 'play' && this.state !== 'countin') return;
    this.prePause = this.state;
    this.state = 'paused';
    this.pausedAt = audio.now;
    this.ui.onPause(reason);
  }

  resume() {
    if (this.state !== 'paused') return;
    const resumeDelay = 1.0;
    this.t0 += (audio.now - this.pausedAt) + resumeDelay;
    audio.tick(audio.now + resumeDelay * 0.5);
    this.state = this.prePause || 'play';
    this.ui.onResume();
  }
  togglePause() {
    if (this.state === 'paused') this.resume();
    else if (this.state === 'play' || this.state === 'countin') this.pause('user');
  }

  quit() {
    this.state = 'idle';
    this.stopLoop();
  }

  // ── input → judgement ─────────────────────────────────────────────
  strike(lane, strength, source, fg) {
    if (this.state !== 'play' && this.state !== 'countin') return;
    const lat = source === 'air' ? settings.latency : 0.012;
    const t = this.songTime() - lat;
    let best = null, bestDt = Infinity;
    for (const tile of this.active) {
      if (tile.lane !== lane || tile.state !== 'fall') continue;
      const dt = Math.abs(t - tile.t);
      if (dt < bestDt) { bestDt = dt; best = tile; }
    }
    if (!best || bestDt > JUDGE.good) {
      // ghost tap — responsive feedback, no penalty
      const now = performance.now() / 1000;
      if (now - this._lastGhost > 0.13) {
        this._lastGhost = now;
        audio.ghost();
        particles.shimmer(this.r.laneCenter(lane), this.r.hitY, this.r.tileHue(lane), this.r.laneW * 0.4);
      }
      return;
    }
    let grade = bestDt <= JUDGE.perfect ? 'perfect' : bestDt <= JUDGE.great ? 'great' : 'good';
    if (source === 'assist' && grade === 'perfect') grade = 'great';
    this.hitTile(best, grade, strength, source);
  }

  hitTile(tile, grade, strength) {
    const now = performance.now() / 1000;
    tile.state = 'hit';
    tile.stateT = this.songTime();
    const vel = 0.45 + 0.5 * strength + (grade === 'perfect' ? 0.08 : 0);
    audio.piano(tile.midi, vel, 0, Math.max(0.35, tile.dur * 1.2));

    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.counts[grade]++;
    const mult = 1 + Math.min(this.combo, 50) / 50;
    this.score += Math.round(GRADE_BASE[grade] * mult);

    const cx = this.r.laneCenter(tile.lane);
    const hue = this.r.tileHue(tile.lane);
    const power = grade === 'perfect' ? 1.25 : grade === 'great' ? 0.95 : 0.7;
    particles.burst(cx, this.r.hitY, hue, power, grade === 'perfect' ? 18 : 12);
    particles.shimmer(cx, this.r.hitY, hue, this.r.laneW * 0.6);
    this.r.flashLane(tile.lane, now);
    if (settings.haptics && navigator.vibrate) navigator.vibrate(grade === 'perfect' ? 18 : 9);

    this.ui.onJudge(grade, tile.lane, this.combo);
    this.ui.onScore(this.score, this.acc());
  }

  missTile(tile) {
    tile.state = 'miss';
    tile.stateT = this.songTime();
    this.combo = 0;
    this.counts.miss++;
    const now = performance.now() / 1000;
    if (now - this._lastMissSnd > 0.16) { this._lastMissSnd = now; audio.miss(); }
    this.ui.onJudge('miss', tile.lane, 0);
    this.ui.onScore(this.score, this.acc());
  }

  acc() {
    const c = this.counts;
    const total = c.perfect + c.great + c.good + c.miss;
    if (!total) return 1;
    return (c.perfect + c.great * 0.7 + c.good * 0.4) / total;
  }

  freeStrike(fg, strength) {
    const lane = Math.max(0, Math.min(7, Math.floor((fg.px - this.r.margin) / this.r.laneW)));
    const octaveUp = fg.py < this.r.h * 0.45 ? 12 : 0;
    const midi = this.freeScale[lane] + octaveUp;
    audio.piano(midi, 0.5 + 0.5 * strength, 0, 0.9);
    const now = performance.now() / 1000;
    const cx = this.r.laneCenter(lane);
    particles.burst(cx, Math.min(fg.py, this.r.hitY), this.r.tileHue(lane), 0.9, 12);
    this.r.flashLane(lane, now);
    this.ui.onFreeNote(midiToName(midi));
  }

  // ── main loop ─────────────────────────────────────────────────────
  startLoop() {
    if (this.raf) return;
    this.lastFrame = performance.now() / 1000;
    const tick = () => {
      this.raf = requestAnimationFrame(tick);
      this.frame();
    };
    this.raf = requestAnimationFrame(tick);
  }
  stopLoop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = null; }

  frame() {
    const now = performance.now() / 1000;
    const dt = Math.min(0.05, now - this.lastFrame);
    this.lastFrame = now;

    if (settings.input === 'air' && hands.video) hands.detect();

    if (this.state === 'play' || this.state === 'countin') this.updatePlay(now, dt);
    particles.update(dt);
    this.render(now);
  }

  updatePlay(now, dt) {
    const t = this.songTime();
    const c = this.chart;

    if (this.state === 'countin' && t >= -0.001) this.state = 'play';

    // spawn tiles entering the approach window
    while (this.spawnIdx < this.tiles.length && this.tiles[this.spawnIdx].t - this.approach <= t) {
      this.active.push(this.tiles[this.spawnIdx++]);
    }
    // accompaniment: schedule audio just-in-time, spawn gold bars on approach
    if (settings.accompaniment) {
      while (this.bassIdx < c.bass.length && c.bass[this.bassIdx].t - this.approach <= t) {
        const ev = c.bass[this.bassIdx++];
        const quiet = this.song.accompanimentQuiet ? 0.35 : 0.55;
        audio.pad(ev.midi, quiet, this.ctxTimeFor(ev.t), ev.dur);
        const x = this.keyXForMidi(ev.midi);
        this.activeGold.push({ ...ev, x, landed: false });
      }
    } else {
      while (this.bassIdx < c.bass.length && c.bass[this.bassIdx].t - this.approach <= t) this.bassIdx++;
    }

    // gold bars landing + cleanup
    for (const b of this.activeGold) {
      if (!b.landed && t >= b.t) {
        b.landed = true;
        this.r.flashKey(b.x, 46, now);
        particles.shimmer(b.x, this.r.hitY + 6, 46, this.r.w / 30);
      }
    }
    this.activeGold = this.activeGold.filter(b => t - b.t < 1.0);

    // assist hits: fingertip resting on a tile as it crosses the line
    if (settings.input === 'air' && settings.assist && this.state === 'play') {
      const fingers = hands.activeFingers(now);
      for (const tile of this.active) {
        if (tile.state !== 'fall') continue;
        const dtT = t - settings.latency - tile.t;
        if (dtT < -JUDGE.good * 0.8 || dtT > JUDGE.good) continue;
        const cx = this.r.laneCenter(tile.lane);
        for (const fg of fingers) {
          if (!hands.assistActive(fg, now)) continue;
          if (Math.abs(fg.px - cx) <= this.r.laneW * 0.46 && fg.py >= hands.zoneTop) {
            this.hitTile(tile, Math.abs(dtT) <= JUDGE.perfect ? 'great' : Math.abs(dtT) <= JUDGE.great ? 'great' : 'good', 0.5, 'assist');
            break;
          }
        }
      }
    }

    // demo bot
    if (settings.demo) {
      for (const tile of this.active) {
        if (tile.state === 'fall' && t - tile.t >= -0.005) {
          this.hitTile(tile, 'perfect', 0.8, 'demo');
        }
      }
    }

    // misses
    for (const tile of this.active) {
      if (tile.state === 'fall' && t - tile.t > JUDGE.missAfter) this.missTile(tile);
    }
    this.active = this.active.filter(tile =>
      tile.state === 'fall' || t - tile.stateT < 0.6);

    // hands-lost auto pause
    if (settings.input === 'air' && this.state === 'play' && hands.ready && !settings.demo) {
      if (now - hands.lastSeen > 2.4 && hands.lastSeen > 0) this.pause('hands');
    }

    this.ui.onProgress(Math.max(0, Math.min(1, t / c.length)));

    // song end
    if (!this.ended && t > c.length + 1.6) {
      this.ended = true;
      this.finish();
    }
  }

  finish() {
    const acc = this.acc();
    const grade = acc >= 0.96 ? 'S' : acc >= 0.9 ? 'A' : acc >= 0.78 ? 'B' : acc >= 0.6 ? 'C' : 'D';
    const result = {
      score: this.score, grade, acc, maxCombo: this.maxCombo, counts: { ...this.counts },
      total: this.tiles.length,
    };
    result.isBest = recordBest(this.song.id, result);
    if (grade === 'S' || grade === 'A') particles.confetti(this.r.w, this.r.h);
    this.state = 'results';
    this.ui.onResults(this.song, result);
  }

  keyXForMidi(midi) {
    const f = Math.max(0, Math.min(1, (midi - 33) / 50));
    const kw = this.r.w / 21;
    const idx = Math.max(0, Math.min(20, Math.round(f * 20)));
    return (idx + 0.5) * kw;
  }

  // ── render ────────────────────────────────────────────────────────
  render(now) {
    const r = this.r;
    if (!r.w) return;
    const t = (this.state === 'play' || this.state === 'countin' || this.state === 'paused')
      ? this.songTime() : 0;

    r.drawSky(now);
    if (settings.input === 'air') r.drawCamera(hands.video, hands.view);

    const beat = this.chart ? (t / this.chart.spb) % 1 : (now * 2) % 1;
    const pulse = Math.max(0, 1 - beat) ** 2;

    if (this.state === 'freeplay') {
      r.drawLanes(pulse * 0.5, now);
      r.drawHitLine(0.4);
      r.drawKeybed(now);
      this.drawFreeLabels();
    } else if (this.chart) {
      if (settings.accompaniment) r.drawGoldBars(this.activeGold, t, this.pxPerSec);
      r.drawLanes(pulse, now);
      for (const tile of this.active) r.drawTile(tile, t, this.pxPerSec);
      r.drawHitLine(pulse);
      r.drawKeybed(now);
      if (this.state === 'countin' && t < 0) this.drawCountIn(t);
    } else {
      r.drawHitLine(0.3);
      r.drawKeybed(now);
    }

    particles.draw(r.ctx);

    if (settings.input === 'air') {
      r.drawFingers(hands.activeFingers(now), now, settings.trails);
    }
    r.vignette();
  }

  drawCountIn(t) {
    const c = this.r.ctx;
    const spb = this.chart.spb;
    const beatsLeft = Math.ceil(-t / spb);
    if (beatsLeft > 4 || beatsLeft < 1) return;
    const phase = 1 - ((-t / spb) % 1);
    c.save();
    c.globalAlpha = 0.9 * (1 - phase * 0.6);
    c.fillStyle = '#fff';
    c.font = `700 ${Math.round(this.r.h * 0.13 * (1 + phase * 0.12))}px ui-rounded, -apple-system, system-ui`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(String(beatsLeft), this.r.w / 2, this.r.h * 0.38);
    c.restore();
  }

  drawFreeLabels() {
    const c = this.r.ctx;
    const names = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'];
    c.save();
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.font = `600 ${Math.round(this.r.h * 0.024)}px ui-rounded, system-ui`;
    c.textAlign = 'center';
    for (let i = 0; i < 8; i++) c.fillText(names[i], this.r.laneCenter(i), this.r.hitY - 14);
    c.globalAlpha = 0.35;
    c.font = `500 ${Math.round(this.r.h * 0.018)}px system-ui`;
    c.fillText('— raise your hand higher for the upper octave —', this.r.w / 2, this.r.h * 0.42);
    c.restore();
  }
}
