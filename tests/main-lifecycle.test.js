import test from 'node:test';
import assert from 'node:assert/strict';
import { UI } from '../js/ui.js';
import { audio } from '../js/audio.js';
import { SONGS } from '../js/songs.js';

test('pagehide cancels pending startup and leaves a usable menu for back/forward restore', async () => {
  const listeners = {}, screens = []; let ui, unlock;
  globalThis.window = { addEventListener(type, fn) { listeners[type] = fn; } };
  globalThis.document = { getElementById: () => ({ getContext: () => ({}) }) };
  globalThis.location = { search: '?touch=1' };
  globalThis.localStorage = { getItem: () => null };
  UI.prototype.init = function () { ui = this; };
  UI.prototype.showScreen = name => screens.push(name);
  UI.prototype.hidePause = UI.prototype.buildSongGrid = () => {};
  audio.init = () => new Promise(resolve => { unlock = resolve; });
  await import('../js/main.js');
  const pending = ui.onPlaySong(SONGS[0]);
  listeners.pagehide(); unlock(); await pending;
  assert.equal(ui.game.state, 'idle'); assert.equal(screens.at(-1), 'menu'); assert.equal(ui._previewVoices.length, 0);
});
