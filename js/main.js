// AirKeys boot and flow.
import { loadSettings, settings } from './config.js';
import { audio } from './audio.js';
import { hands } from './hands.js';
import { Game } from './game.js';
import { UI } from './ui.js';
import { Playback } from './playback.js';

const ui = new UI();
const game = new Game(document.getElementById('stage'), ui.gameCallbacks());
ui.game = game;

loadSettings();
const params = new URLSearchParams(location.search);
if (params.get('demo') === '1') settings.demo = true;
if (params.get('touch') === '1') settings.input = 'touch';

const playback = new Playback({ ui, game, hands, audio, settings });
ui.onPlaySong = (song, immediate = false) => playback.start(song, immediate);
ui.onFreePlay = () => playback.start();
ui.onExit = () => playback.cancel();
// Returning from the back/forward cache should restore a safe, usable menu.
window.addEventListener('pagehide', () => ui.exitToMenu());
ui.init();
ui.showScreen('menu');

window.addEventListener('error', (e) => {
  const msg = (e.message || '').slice(0, 120);
  if (msg) ui.toast('⚠️ ' + msg, 5000);
});
