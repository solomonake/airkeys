// ── AirKeys renderer ────────────────────────────────────────────────
// Canvas 2D, but everything expensive (glows, gradients, the piano
// keybed, tile textures, nebula) is pre-baked to offscreen sprites at
// resize time. The per-frame loop is drawImage + transforms only.

import { TUNING, settings } from './config.js';
import { particles } from './particles.js';

const TAU = Math.PI * 2;

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.w = 0; this.h = 0; this.dpr = 1;
    this.lanes = 4;
    this.laneW = 0; this.margin = 0;
    this.hitY = 0; this.keyTop = 0;
    this.stars = [];
    this.sky = null; this.keybed = null;
    this.tileTex = []; this.goldTex = null;
    this.orb = null;
    this.laneFlash = [];
    this.keyFlash = []; // accompaniment key flashes: {x,t,hue}
    this.shakeT = 0;
    this.hue = 196;
  }

  resize(lanes, hue) {
    const { cv } = this;
    this.lanes = lanes;
    this.hue = hue;
    this.dpr = Math.min(1.6, window.devicePixelRatio || 1);
    const w = cv.clientWidth, h = cv.clientHeight;
    cv.width = Math.round(w * this.dpr);
    cv.height = Math.round(h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.w = w; this.h = h;
    this.hitY = h * TUNING.hitLineFrac;
    this.keyTop = this.hitY;
    this.margin = w * 0.03;
    this.laneW = (w - this.margin * 2) / lanes;
    this.laneFlash = new Array(lanes).fill(-9);
    this.bakeSky();
    this.bakeKeybed();
    this.bakeTiles();
    this.bakeOrb();
    this.bakeStatics();
  }

  // pre-bake everything that used to be a per-frame gradient
  bakeStatics() {
    const { w, h } = this;
    // vignette
    const vg = document.createElement('canvas');
    vg.width = Math.max(2, Math.round(w / 2)); vg.height = Math.max(2, Math.round(h / 2));
    {
      const x = vg.getContext('2d');
      const g = x.createRadialGradient(vg.width / 2, vg.height * 0.45, vg.height * 0.35, vg.width / 2, vg.height * 0.45, vg.height * 0.95);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.42)');
      x.fillStyle = g;
      x.fillRect(0, 0, vg.width, vg.height);
    }
    this.vignetteTex = vg;
    // lane separator beam (1 col strip)
    const beam = document.createElement('canvas');
    beam.width = 2; beam.height = Math.max(2, Math.round(this.hitY));
    {
      const x = beam.getContext('2d');
      const g = x.createLinearGradient(0, 0, 0, beam.height);
      g.addColorStop(0, 'rgba(140,180,255,0)');
      g.addColorStop(1, 'rgba(140,180,255,1)');
      x.fillStyle = g;
      x.fillRect(0, 0, 2, beam.height);
    }
    this.beamTex = beam;
    // per-lane hit flash columns
    this.flashTex = [];
    const fh = Math.max(2, Math.round(this.hitY * 0.55));
    for (let i = 0; i < this.lanes; i++) {
      const c = document.createElement('canvas');
      c.width = Math.max(2, Math.round(this.laneW - 4)); c.height = fh;
      const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 0, fh);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(1, `hsla(${this.tileHue(i)} 90% 65% / 1)`);
      x.fillStyle = g;
      x.fillRect(0, 0, c.width, fh);
      this.flashTex.push(c);
    }
    // hit line glow strip
    const hl = document.createElement('canvas');
    hl.width = 4; hl.height = 26;
    {
      const x = hl.getContext('2d');
      const g = x.createLinearGradient(0, 0, 0, 26);
      g.addColorStop(0, 'rgba(150,200,255,0)');
      g.addColorStop(1, 'rgba(150,200,255,1)');
      x.fillStyle = g;
      x.fillRect(0, 0, 4, 26);
    }
    this.hitLineTex = hl;
  }

  laneX(i) { return this.margin + i * this.laneW; }
  laneCenter(i) { return this.laneX(i) + this.laneW / 2; }
  laneFromX(x) {
    return Math.max(0, Math.min(this.lanes - 1, Math.floor((x - this.margin) / this.laneW)));
  }

  // ── bakes ─────────────────────────────────────────────────────────
  bakeSky() {
    const { w, h } = this;
    const c = document.createElement('canvas');
    c.width = Math.max(2, Math.round(w / 2)); c.height = Math.max(2, Math.round(h / 2));
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, '#04050f');
    g.addColorStop(0.55, '#070b1c');
    g.addColorStop(1, '#0b1026');
    x.fillStyle = g;
    x.fillRect(0, 0, c.width, c.height);
    const blob = (bx, by, r, hue, a) => {
      const rg = x.createRadialGradient(bx, by, 0, bx, by, r);
      rg.addColorStop(0, `hsla(${hue} 65% 38% / ${a})`);
      rg.addColorStop(1, 'hsla(0 0% 0% / 0)');
      x.fillStyle = rg;
      x.fillRect(bx - r, by - r, r * 2, r * 2);
    };
    blob(c.width * 0.78, c.height * 0.22, c.width * 0.5, this.hue, 0.16);
    blob(c.width * 0.16, c.height * 0.5, c.width * 0.42, (this.hue + 70) % 360, 0.12);
    blob(c.width * 0.5, c.height * 0.85, c.width * 0.6, (this.hue + 320) % 360, 0.08);
    this.sky = c;
    this.stars = [];
    const n = Math.round((w * h) / 14000);
    for (let i = 0; i < n; i++) {
      this.stars.push({
        x: Math.random() * w, y: Math.random() * h * 0.75,
        r: 0.5 + Math.random() * 1.4,
        ph: Math.random() * TAU, sp: 0.4 + Math.random() * 1.6,
      });
    }
  }

  bakeKeybed() {
    const { w, h } = this;
    const kbH = h - this.keyTop;
    const c = document.createElement('canvas');
    c.width = Math.max(2, Math.round(w * this.dpr));
    c.height = Math.max(2, Math.round(kbH * this.dpr));
    const x = c.getContext('2d');
    x.scale(this.dpr, this.dpr);
    // 21 white keys across, classic pattern of black keys
    const nWhite = 21;
    const kw = w / nWhite;
    x.fillStyle = '#0a0c18';
    x.fillRect(0, 0, w, kbH);
    for (let i = 0; i < nWhite; i++) {
      const g = x.createLinearGradient(0, 0, 0, kbH);
      g.addColorStop(0, '#e8e6df');
      g.addColorStop(0.06, '#fdfcf7');
      g.addColorStop(1, '#cfccc2');
      x.fillStyle = g;
      x.fillRect(i * kw + 0.75, 2, kw - 1.5, kbH - 2);
    }
    // black keys: pattern within an octave of 7 whites: after degrees 0,1,3,4,5 (C D F G A)
    const blackAfter = [0, 1, 3, 4, 5];
    const bw = kw * 0.58, bh = kbH * 0.62;
    for (let i = 0; i < nWhite - 1; i++) {
      if (!blackAfter.includes(i % 7)) continue;
      const bx = (i + 1) * kw - bw / 2;
      const g = x.createLinearGradient(0, 0, 0, bh);
      g.addColorStop(0, '#262a38');
      g.addColorStop(0.8, '#05060c');
      g.addColorStop(1, '#10131f');
      x.fillStyle = g;
      x.fillRect(bx, 0, bw, bh);
      x.fillStyle = 'rgba(255,255,255,0.08)';
      x.fillRect(bx, bh - 4, bw, 2);
    }
    // top shadow lip
    const lip = x.createLinearGradient(0, 0, 0, 14);
    lip.addColorStop(0, 'rgba(0,0,0,0.85)');
    lip.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = lip;
    x.fillRect(0, 0, w, 14);
    this.keybed = c;
  }

  tileHue(lane) {
    // cool cyan→blue sweep across lanes, like the reference's right hand
    return this.hue - 14 + (lane / Math.max(1, this.lanes - 1)) * 34;
  }

  bakeTiles() {
    this.tileTex = [];
    const tw = Math.max(8, this.laneW * 0.84);
    for (let i = 0; i < this.lanes; i++) {
      this.tileTex.push(this.makeTileTex(tw, this.tileHue(i), 1));
    }
    this.goldTex = this.makeTileTex(Math.max(6, this.w / 21 * 0.7), 44, 0.85);
  }

  makeTileTex(tw, hue, sat) {
    const P = 16, H = 220, R = Math.min(11, tw * 0.28);
    const c = document.createElement('canvas');
    c.width = Math.round(tw + P * 2);
    c.height = H + P * 2;
    const x = c.getContext('2d');
    const rr = (xx, yy, ww, hh, r) => {
      x.beginPath();
      x.moveTo(xx + r, yy);
      x.arcTo(xx + ww, yy, xx + ww, yy + hh, r);
      x.arcTo(xx + ww, yy + hh, xx, yy + hh, r);
      x.arcTo(xx, yy + hh, xx, yy, r);
      x.arcTo(xx, yy, xx + ww, yy, r);
      x.closePath();
    };
    x.shadowColor = `hsla(${hue} ${90 * sat}% 62% / 0.9)`;
    x.shadowBlur = 14;
    const g = x.createLinearGradient(0, P, 0, P + H);
    g.addColorStop(0, `hsla(${hue} ${72 * sat}% 46% / 0.55)`);
    g.addColorStop(0.75, `hsla(${hue} ${85 * sat}% 58% / 0.92)`);
    g.addColorStop(1, `hsla(${hue} ${95 * sat}% 72% / 1)`);
    x.fillStyle = g;
    rr(P, P, tw, H, R);
    x.fill();
    x.shadowBlur = 0;
    x.strokeStyle = `hsla(${hue} 100% 86% / 0.85)`;
    x.lineWidth = 1.5;
    rr(P + 0.75, P + 0.75, tw - 1.5, H - 1.5, R);
    x.stroke();
    // bright bottom edge = the striking edge
    const eg = x.createLinearGradient(0, P + H - 26, 0, P + H);
    eg.addColorStop(0, 'rgba(255,255,255,0)');
    eg.addColorStop(1, 'rgba(255,255,255,0.85)');
    x.fillStyle = eg;
    rr(P + 1.5, P + H - 26, tw - 3, 24.5, R * 0.8);
    x.fill();
    return { c, P, H, tw };
  }

  bakeOrb() {
    const s = document.createElement('canvas');
    s.width = s.height = 64;
    const x = s.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    this.orb = s;
  }

  // ── per-frame draws ──────────────────────────────────────────────
  drawSky(t) {
    const { ctx, w, h } = this;
    ctx.drawImage(this.sky, 0, 0, w, h);
    ctx.save();
    ctx.fillStyle = '#fff';
    for (const s of this.stars) {
      const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph));
      ctx.globalAlpha = a;
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
    ctx.restore();
  }

  drawCamera(video, view) {
    if (!video || video.readyState < 2 || settings.camAlpha <= 0.01) return;
    const { ctx, w } = this;
    ctx.save();
    ctx.globalAlpha = settings.camAlpha;
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, w - view.dx - view.dw, view.dy, view.dw, view.dh);
    ctx.restore();
    // blue-night tint so the feed sits inside the scene
    ctx.fillStyle = `rgba(7, 10, 28, ${0.5 * settings.camAlpha + 0.08})`;
    ctx.fillRect(0, 0, this.w, this.hitY);
  }

  drawLanes(beatPulse, t) {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = 0.10 + beatPulse * 0.07;
    for (let i = 0; i <= this.lanes; i++) {
      ctx.drawImage(this.beamTex, this.laneX(i) - 0.5, 0, 1, this.hitY);
    }
    // lane hit flashes
    for (let i = 0; i < this.lanes; i++) {
      const dt = t - this.laneFlash[i];
      if (dt > 0.28) continue;
      const k = 1 - dt / 0.28;
      ctx.globalAlpha = 0.24 * k;
      const tex = this.flashTex[i];
      ctx.drawImage(tex, this.laneX(i) + 2, this.hitY - tex.height, tex.width, tex.height);
    }
    ctx.restore();
  }

  // gold accompaniment bars raining behind the lanes (non-interactive)
  drawGoldBars(bars, now, pxPerSec) {
    if (!bars.length) return;
    const { ctx } = this;
    const tex = this.goldTex;
    ctx.save();
    ctx.globalAlpha = 0.5;
    for (const b of bars) {
      const yBottom = this.hitY + (now - b.t) * pxPerSec;
      const len = Math.max(26, b.dur * pxPerSec * 0.92);
      const yTop = yBottom - len;
      if (yTop > this.hitY || yBottom < -40) continue;
      const drawBottom = Math.min(yBottom, this.hitY);
      const hgt = drawBottom - yTop;
      if (hgt <= 2) continue;
      ctx.drawImage(tex.c, b.x - tex.c.width / 2, yTop - tex.P, tex.c.width, hgt + tex.P * 2);
    }
    ctx.restore();
  }

  drawTile(tile, now, pxPerSec) {
    const { ctx } = this;
    const tex = this.tileTex[tile.lane];
    const yBottom = this.hitY + (now - tile.t) * pxPerSec;
    const len = Math.max(40, Math.min(tile.dur * pxPerSec * 0.92, this.hitY * 0.9));
    const yTop = yBottom - len;
    if (yTop > this.h || yBottom < -60) return;
    const x = this.laneCenter(tile.lane) - tex.tw / 2;

    if (tile.state === 'hit') {
      const k = Math.min(1, (now - tile.stateT) / 0.22);
      ctx.save();
      ctx.globalAlpha = 1 - k;
      const grow = 1 + k * 0.35;
      const cx = this.laneCenter(tile.lane);
      ctx.translate(cx, this.hitY);
      ctx.scale(grow, grow);
      ctx.translate(-cx, -this.hitY);
      ctx.drawImage(tex.c, x - tex.P, this.hitY - len - tex.P, tex.c.width, len + tex.P * 2);
      ctx.restore();
      return;
    }
    if (tile.state === 'miss') {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 0.65 - (now - tile.stateT) * 1.6);
      ctx.filter = 'grayscale(0.8)';
      ctx.drawImage(tex.c, x - tex.P, yTop - tex.P, tex.c.width, len + tex.P * 2);
      ctx.filter = 'none';
      ctx.restore();
      return;
    }
    ctx.drawImage(tex.c, x - tex.P, yTop - tex.P, tex.c.width, len + tex.P * 2);
    if (tile.chord) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(this.laneCenter(tile.lane), yBottom - 12, 3, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  drawHitLine(beatPulse) {
    const { ctx, w } = this;
    const y = this.hitY;
    ctx.save();
    const a = 0.55 + beatPulse * 0.45;
    ctx.globalAlpha = 0.22 * a;
    ctx.drawImage(this.hitLineTex, 0, y - 26, w, 26);
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgba(190,225,255,${0.75 * a})`;
    ctx.fillRect(0, y - 1.5, w, 2.5);
    ctx.restore();
  }

  drawKeybed(t) {
    const { ctx, w, h } = this;
    ctx.drawImage(this.keybed, 0, this.keyTop, w, h - this.keyTop);
    // pressed-key flashes (player lanes + gold accompaniment)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.lanes; i++) {
      const dt = t - this.laneFlash[i];
      if (dt > 0.32) continue;
      const k = 1 - dt / 0.32;
      ctx.globalAlpha = 0.5 * k;
      ctx.fillStyle = `hsl(${this.tileHue(i)} 95% 64%)`;
      ctx.fillRect(this.laneX(i) + 2, this.keyTop, this.laneW - 4, (h - this.keyTop) * 0.94);
    }
    for (const f of this.keyFlash) {
      const dt = t - f.t;
      if (dt > 0.4) continue;
      const k = 1 - dt / 0.4;
      ctx.globalAlpha = 0.32 * k;
      ctx.fillStyle = `hsl(${f.hue} 95% 62%)`;
      const kw = w / 21;
      ctx.fillRect(f.x - kw / 2, this.keyTop, kw, (h - this.keyTop) * 0.94);
    }
    ctx.restore();
    if (this.keyFlash.length > 24) this.keyFlash.splice(0, this.keyFlash.length - 24);
  }

  drawFingers(fingers, t, trails) {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const fg of fingers) {
      const warm = fg.id[0] === 'L';
      const hue = warm ? 42 : this.hue;
      if (trails && fg.trail.length > 1) {
        ctx.beginPath();
        ctx.moveTo(fg.trail[0].x, fg.trail[0].y);
        for (let i = 1; i < fg.trail.length; i++) ctx.lineTo(fg.trail[i].x, fg.trail[i].y);
        ctx.strokeStyle = `hsla(${hue} 95% 65% / 0.35)`;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
      const r = fg.armed ? 10 : 7;
      ctx.globalAlpha = 0.95;
      ctx.drawImage(this.orb, fg.px - r * 1.9, fg.py - r * 1.9, r * 3.8, r * 3.8);
      ctx.globalAlpha = 1;
      ctx.fillStyle = `hsl(${hue} 95% ${fg.armed ? 68 : 55}%)`;
      ctx.beginPath();
      ctx.arc(fg.px, fg.py, r * 0.42, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  flashLane(lane, t) { this.laneFlash[lane] = t; }
  flashKey(x, hue, t) { this.keyFlash.push({ x, hue, t }); }

  vignette() {
    this.ctx.drawImage(this.vignetteTex, 0, 0, this.w, this.h);
  }
}
