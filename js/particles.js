// ── pooled particles: hit bursts, landing sparkles, confetti ───────
const MAX = 360;

export class Particles {
  constructor() {
    this.pool = new Array(MAX);
    for (let i = 0; i < MAX; i++) this.pool[i] = { live: false };
    this.cursor = 0;
    this.sprite = null; // soft round glow sprite
  }

  makeSprite() {
    const s = document.createElement('canvas');
    s.width = s.height = 32;
    const c = s.getContext('2d');
    const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 32, 32);
    this.sprite = s;
  }

  spawn(opts) {
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % MAX;
    Object.assign(p, {
      live: true, age: 0,
      x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 1,
      size: 6, life: 0.6, hue: 190, sat: 90, lit: 70, alpha: 1,
      twinkle: 0,
    }, opts);
    return p;
  }

  // burst when a tile is struck
  burst(x, y, hue, power = 1, count = 14) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (60 + Math.random() * 320) * power;
      this.spawn({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.8 - 90 * power,
        g: 760, drag: 0.985,
        size: 2.5 + Math.random() * 5.5,
        life: 0.45 + Math.random() * 0.5,
        hue: hue + (Math.random() * 30 - 15),
        lit: 60 + Math.random() * 30,
      });
    }
  }

  // gentle rising shimmer column (like notes landing on keys in the video)
  shimmer(x, y, hue, width = 40) {
    for (let i = 0; i < 7; i++) {
      this.spawn({
        x: x + (Math.random() - 0.5) * width, y: y + Math.random() * 10,
        vx: (Math.random() - 0.5) * 30, vy: -(60 + Math.random() * 150),
        g: -40, drag: 0.97,
        size: 1.5 + Math.random() * 3,
        life: 0.6 + Math.random() * 0.7,
        hue: hue + (Math.random() * 24 - 12), lit: 75,
        twinkle: 6 + Math.random() * 9,
      });
    }
  }

  confetti(w, h) {
    for (let i = 0; i < 90; i++) {
      this.spawn({
        x: Math.random() * w, y: -20 - Math.random() * h * 0.3,
        vx: (Math.random() - 0.5) * 160, vy: 110 + Math.random() * 240,
        g: 240, drag: 0.992,
        size: 3 + Math.random() * 5,
        life: 2.2 + Math.random() * 1.6,
        hue: Math.random() * 360, sat: 95, lit: 62,
      });
    }
  }

  update(dt) {
    for (const p of this.pool) {
      if (!p.live) continue;
      p.age += dt;
      if (p.age >= p.life) { p.live = false; continue; }
      p.vy += p.g * dt;
      p.vx *= p.drag; p.vy *= p.drag;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
  }

  draw(ctx) {
    if (!this.sprite) this.makeSprite();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.pool) {
      if (!p.live) continue;
      const k = 1 - p.age / p.life;
      let a = p.alpha * k;
      if (p.twinkle) a *= 0.55 + 0.45 * Math.sin(p.age * p.twinkle * Math.PI);
      ctx.globalAlpha = Math.max(0, a);
      ctx.filter = 'none';
      const s = p.size * (0.7 + 0.3 * k) * 2;
      ctx.fillStyle = `hsl(${p.hue} ${p.sat}% ${p.lit}%)`;
      // colored core + white glow sprite stays cheap
      ctx.beginPath();
      ctx.arc(p.x, p.y, s * 0.28, 0, 6.2832);
      ctx.fill();
      ctx.globalAlpha = Math.max(0, a * 0.8);
      ctx.drawImage(this.sprite, p.x - s, p.y - s, s * 2, s * 2);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

export const particles = new Particles();
