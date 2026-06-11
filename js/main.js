// ── AirKeys boot & flow ─────────────────────────────────────────────
import { loadSettings, settings } from './config.js';
import { audio } from './audio.js';
import { hands } from './hands.js';
import { Game } from './game.js';
import { UI } from './ui.js';

const canvas = document.getElementById('stage');
const ui = new UI();
const game = new Game(canvas, ui.gameCallbacks());
ui.game = game;

loadSettings();
if (new URLSearchParams(location.search).get('demo') === '1') settings.demo = true;
if (new URLSearchParams(location.search).get('touch') === '1') settings.input = 'touch';

let flowToken = 0; // cancels in-flight warmups when user backs out

async function ensureAir() {
  const token = ++flowToken;
  ui.showScreen('warmup');
  game.startWarmup();
  try {
    if (!hands.ready) {
      ui.setWarmupStatus('engine');
      await hands.init();
    }
    if (token !== flowToken) return false;
    if (!hands.video) {
      ui.setWarmupStatus('camera');
      await hands.openCamera();
      game.onResize(); // map landmarks to the canvas
    }
    if (token !== flowToken) return false;
    ui.setWarmupStatus('detect');
    // wait until hands are steadily visible
    const lockedAt = await new Promise((resolve) => {
      let since = 0;
      const poll = setInterval(() => {
        if (token !== flowToken) { clearInterval(poll); resolve(0); return; }
        if (hands.tracking) {
          since = since || performance.now();
          if (performance.now() - since > 650) { clearInterval(poll); resolve(performance.now()); }
        } else since = 0;
      }, 80);
    });
    if (!lockedAt || token !== flowToken) return false;
    ui.setWarmupStatus('lock');
    await new Promise(r => setTimeout(r, 500));
    return token === flowToken;
  } catch (err) {
    console.warn('air input unavailable:', err);
    if (token !== flowToken) return false;
    settings.input = 'touch';
    ui.toast('📷 Camera unavailable — switched to touch mode (tap lanes or use D F J K)');
    return true; // proceed in touch mode
  }
}

ui.onPlaySong = async (song, immediate = false) => {
  await audio.init();
  if (settings.input === 'air' && !(immediate && hands.video)) {
    const ok = await ensureAir();
    if (!ok) return; // cancelled
  }
  ui.showScreen('game');
  ui.setSongHeader(song);
  ui.gameCallbacks().onScore(0, 1);
  await game.startSong(song);
};

ui.onFreePlay = async () => {
  await audio.init();
  if (settings.input === 'air') {
    const ok = await ensureAir();
    if (!ok) return;
  }
  ui.showFreePlay();
  game.startFreePlay();
};

// back out of warmup also cancels the flow
document.getElementById('warmup-cancel').addEventListener('click', () => { flowToken++; });

ui.init();
ui.showScreen('menu');

// surface fatal errors instead of a silent black screen
window.addEventListener('error', (e) => {
  const msg = (e.message || '').slice(0, 120);
  if (msg) ui.toast('⚠️ ' + msg, 5000);
});
