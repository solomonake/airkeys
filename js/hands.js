// ── AirKeys hand tracking ───────────────────────────────────────────
// MediaPipe HandLandmarker (GPU) → 10 fingertips → One-Euro smoothing
// → velocity prediction (cancels camera latency) → air-tap detection.
// Assets are vendored locally in /vendor/mediapipe; falls back to CDN.

import { TUNING } from './config.js';

const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL_CDN = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const TIP_IDS = [4, 8, 12, 16, 20]; // thumb..pinky landmark indices

// One-Euro filter — low lag while moving, low jitter while still
class OneEuro {
  constructor(minCutoff = 1.2, beta = 0.012, dCutoff = 1.0) {
    this.minCutoff = minCutoff; this.beta = beta; this.dCutoff = dCutoff;
    this.prev = null; this.dPrev = 0; this.tPrev = 0;
  }
  alpha(cutoff, dt) { const r = 2 * Math.PI * cutoff * dt; return r / (r + 1); }
  filter(x, t) {
    if (this.prev === null) { this.prev = x; this.tPrev = t; return x; }
    const dt = Math.max(1e-3, t - this.tPrev);
    this.tPrev = t;
    const dx = (x - this.prev) / dt;
    const ad = this.alpha(this.dCutoff, dt);
    this.dPrev = ad * dx + (1 - ad) * this.dPrev;
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dPrev);
    const a = this.alpha(cutoff, dt);
    this.prev = a * x + (1 - a) * this.prev;
    return this.prev;
  }
  reset() { this.prev = null; this.dPrev = 0; }
}

class Finger {
  constructor(id) {
    this.id = id;             // 'L0'..'R4'
    this.fx = new OneEuro(); this.fy = new OneEuro();
    this.x = 0; this.y = 0;   // smoothed px
    this.px = 0; this.py = 0; // predicted px (latency-compensated)
    this.vx = 0; this.vy = 0; // px/sec
    this.seen = 0;            // last seen time (s)
    this.armed = true;
    this.zoneEnter = 0;       // when finger entered strike zone (camping guard)
    this.inZone = false;
    this.trail = [];          // recent points for rendering
    this.hist = [];           // [t,x,y] velocity window
  }
  update(x, y, t) {
    this.x = this.fx.filter(x, t);
    this.y = this.fy.filter(y, t);
    this.seen = t;
    const h = this.hist;
    h.push([t, this.x, this.y]);
    while (h.length > 2 && t - h[0][0] > 0.09) h.shift();
    if (h.length >= 2) {
      const [t0, x0, y0] = h[0];
      const dt = Math.max(1e-3, t - t0);
      this.vx = (this.x - x0) / dt;
      this.vy = (this.y - y0) / dt;
    }
    const lead = TUNING.predictMs / 1000;
    this.px = this.x + this.vx * lead;
    this.py = this.y + this.vy * lead;
    this.trail.push({ x: this.px, y: this.py, t });
    while (this.trail.length > 9) this.trail.shift();
  }
  lost() { this.fx.reset(); this.fy.reset(); this.hist.length = 0; this.trail.length = 0; }
}

export class Hands {
  constructor() {
    this.landmarker = null;
    this.video = null;
    this.fingers = new Map(); // id → Finger
    for (const h of ['L', 'R']) for (let i = 0; i < 5; i++) this.fingers.set(h + i, new Finger(h + i));
    this.tracking = false;     // any hand currently visible
    this.lastSeen = 0;
    this.ready = false;
    this.failed = false;
    this.onTap = null;         // (finger, strength) callback
    this.fps = 0;
    this._frames = 0; this._fpsT = 0;
    this.view = { dx: 0, dy: 0, dw: 1, dh: 1, cw: 1, ch: 1 }; // cover-fit mapping
    this.zoneTop = 0;          // strike zone, set by game each frame
    this.zoneBottom = 0;
    this._raf = null;
    this._lastVideoTime = -1;
  }

  async init() {
    // vendored assets live at /vendor/mediapipe — resolve from this module's URL
    const local = new URL('../vendor/mediapipe', import.meta.url).href;
    let visionModule, wasmBase, modelPath;
    try {
      const head = await fetch(`${local}/wasm/vision_wasm_internal.wasm`, { method: 'HEAD' });
      if (!head.ok) throw new Error('no vendor');
      visionModule = await import(`${local}/vision_bundle.mjs`);
      wasmBase = `${local}/wasm`;
      modelPath = `${local}/hand_landmarker.task`;
    } catch (_) {
      visionModule = await import(`${CDN}/vision_bundle.mjs`);
      wasmBase = `${CDN}/wasm`;
      modelPath = MODEL_CDN;
    }
    const { FilesetResolver, HandLandmarker } = visionModule;
    const fileset = await FilesetResolver.forVisionTasks(wasmBase);
    const make = (delegate) => HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: modelPath, delegate },
      numHands: 2,
      runningMode: 'VIDEO',
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    try { this.landmarker = await make('GPU'); }
    catch (_) { this.landmarker = await make('CPU'); }
    this.ready = true;
  }

  async openCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: 30 }, facingMode: 'user' },
      audio: false,
    });
    const v = document.createElement('video');
    v.srcObject = stream;
    v.muted = true; v.playsInline = true;
    await v.play();
    this.video = v;
    return v;
  }

  // canvas cover-fit mapping (mirrored)
  setViewport(cw, ch) {
    const v = this.video;
    if (!v || !v.videoWidth) { this.view = { dx: 0, dy: 0, dw: cw, dh: ch, cw, ch }; return; }
    const scale = Math.max(cw / v.videoWidth, ch / v.videoHeight);
    const dw = v.videoWidth * scale, dh = v.videoHeight * scale;
    this.view = { dx: (cw - dw) / 2, dy: (ch - dh) / 2, dw, dh, cw, ch };
  }

  start() {
    if (this._raf) return;
    const loop = () => {
      this._raf = requestAnimationFrame(loop);
      this.detect();
    };
    this._raf = requestAnimationFrame(loop);
  }
  stop() { if (this._raf) cancelAnimationFrame(this._raf); this._raf = null; }

  detect() {
    const v = this.video;
    if (!v || !this.landmarker || v.readyState < 2) return;
    if (v.currentTime === this._lastVideoTime) return; // no new camera frame
    this._lastVideoTime = v.currentTime;

    const nowMs = performance.now();
    let result;
    try { result = this.landmarker.detectForVideo(v, nowMs); }
    catch (_) { return; }
    const t = nowMs / 1000;

    this._frames++;
    if (t - this._fpsT >= 1) { this.fps = this._frames; this._frames = 0; this._fpsT = t; }

    const seen = new Set();
    const lms = result.landmarks || [];
    const handed = result.handednesses || result.handedness || [];
    for (let h = 0; h < lms.length; h++) {
      // MediaPipe labels are for the unmirrored image; in selfie view they're swapped,
      // which conveniently makes the label match what the player sees.
      const label = handed[h] && handed[h][0] ? (handed[h][0].categoryName === 'Left' ? 'L' : 'R') : (h === 0 ? 'L' : 'R');
      for (let f = 0; f < 5; f++) {
        const lm = lms[h][TIP_IDS[f]];
        const id = label + f;
        if (seen.has(id)) continue;
        seen.add(id);
        const { dx, dy, dw, dh, cw } = this.view;
        const x = cw - (dx + lm.x * dw); // mirror
        const y = dy + lm.y * dh;
        const fg = this.fingers.get(id);
        fg.update(x, y, t);
        this.judgeTap(fg, t);
      }
    }
    for (const [id, fg] of this.fingers) {
      if (!seen.has(id) && t - fg.seen > 0.25 && fg.hist.length) fg.lost();
    }
    this.tracking = lms.length > 0;
    if (this.tracking) this.lastSeen = t;
  }

  judgeTap(fg, t) {
    const ch = this.view.ch || 1;
    const tapVel = TUNING.tapVelFrac * ch;       // px/s downward to fire
    const rearmVel = -TUNING.rearmVelFrac * ch;  // px/s upward to re-arm
    const inBand = fg.py > this.zoneTop - ch * 0.06 && fg.py < this.zoneBottom + ch * 0.08;

    if (inBand && !fg.inZone) { fg.inZone = true; fg.zoneEnter = t; }
    else if (!inBand) fg.inZone = false;

    if (!fg.armed) {
      // re-arm on upward motion or leaving the band upward
      if (fg.vy < rearmVel || fg.py < this.zoneTop - ch * 0.07) fg.armed = true;
      return;
    }
    if (inBand && fg.vy > tapVel) {
      fg.armed = false;
      const strength = Math.min(1, fg.vy / (tapVel * 2.6) + 0.35);
      if (this.onTap) this.onTap(fg, strength);
    }
  }

  // fingertip currently allowed to assist-hit (not camping)?
  assistActive(fg, t) {
    return fg.inZone && (t - fg.zoneEnter) * 1000 < TUNING.campMs;
  }

  activeFingers(t) {
    const out = [];
    for (const fg of this.fingers.values()) {
      if (t - fg.seen < 0.2 && fg.hist.length >= 2) out.push(fg);
    }
    return out;
  }

  closeCamera() {
    this.stop();
    if (this.video && this.video.srcObject) {
      for (const tr of this.video.srcObject.getTracks()) tr.stop();
    }
    this.video = null;
    this.tracking = false;
  }
}

export const hands = new Hands();
