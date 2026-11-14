import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { audio } from '../js/audio.js';
import { SONGS } from '../js/songs.js';

function setup() {
  const events = {}, pauses = [], errors = [], voices = [];
  globalThis.window = { addEventListener() {} };
  globalThis.document = { hidden: false, addEventListener(type, fn) { events[type] = fn; } };
  audio.ctx = { currentTime: 10, state: 'running', async resume() { this.state = 'running'; } };
  audio.tick = () => { const v = { killed: false, kill() { this.killed = true; } }; voices.push(v); return v; };
  const ui = { onSongStart() {}, onPause(reason) { pauses.push(reason); }, onResume() {}, onResumeError() { errors.push('retry'); } };
  const g = new Game({ clientWidth: 0, getContext: () => ({}), addEventListener() {} }, ui);
  g.startLoop = () => {}; g.stopLoop = () => {};
  g.startSong(SONGS[0]);
  return { g, events, pauses, errors, voices };
}

test('hidden during count-in pauses, cancels scheduled ticks and freezes the timeline', () => {
  const { g, events, pauses, voices } = setup();
  document.hidden = true; events.visibilitychange();
  assert.equal(g.state, 'paused'); assert.deepEqual(pauses, ['hidden']); assert.ok(voices.every(v => v.killed));
  const time = g.songTime(); audio.ctx.currentTime += 20; assert.equal(g.songTime(), time);
});

test('hidden during play also pauses', () => {
  const { g, events } = setup(); g.state = 'play'; document.hidden = true; events.visibilitychange(); assert.equal(g.state, 'paused');
});

test('failed audio resume preserves pause and permits a successful retry with rebased timing', async () => {
  const { g, errors, voices } = setup(); g.pause('user'); const pausedTime = g.songTime();
  audio.ctx.state = 'suspended'; audio.ctx.resume = async () => { throw Error('blocked'); };
  await g.resume(); assert.equal(g.state, 'paused'); assert.deepEqual(errors, ['retry']);
  audio.ctx.resume = async function () { this.currentTime = 25; this.state = 'running'; };
  await g.resume(); assert.equal(g.state, 'countin'); assert.ok(Math.abs(g.songTime() - (pausedTime - 1)) < 1e-9);
  assert.ok(voices.slice(4).length > 0); g.quit(); assert.ok(voices.every(v => v.killed));
});

test('resolved resume that leaves audio suspended does not enter play', async () => {
  const { g, errors } = setup(); g.pause('user'); audio.ctx.state = 'suspended'; audio.ctx.resume = async () => {};
  await g.resume(); assert.equal(g.state, 'paused'); assert.equal(errors.length, 1);
});

test('quit while audio resume is pending cannot reopen gameplay', async () => {
  const { g } = setup(); g.pause('user'); audio.ctx.state = 'suspended';
  let resolve; audio.ctx.resume = () => new Promise(r => { resolve = r; });
  const resume = g.resume(); g.quit(); audio.ctx.state = 'running'; resolve(); await resume; assert.equal(g.state, 'idle');
});

test('hiding during pending audio resume keeps pause until another explicit retry', async () => {
  const { g, events } = setup(); g.pause('user'); audio.ctx.state = 'suspended';
  let resolve; audio.ctx.resume = () => new Promise(r => { resolve = r; });
  const resume = g.resume(); document.hidden = true; events.visibilitychange();
  audio.ctx.state = 'running'; resolve(); await resume; assert.equal(g.state, 'paused');
  document.hidden = false; await g.resume(); assert.equal(g.state, 'countin');
});

test('resume requeues cancelled future bass without replaying landed events', async () => {
  const { g } = setup(); g.state = 'play'; g.t0 = 5; g.leadIn = 0;
  g.chart.bass = [{t:2}, {t:7}, {t:9}]; g.bassIdx = 3; g.activeGold = [{t:2}, {t:7}];
  g.pause('user'); await g.resume(); assert.equal(g.bassIdx, 1); assert.deepEqual(g.activeGold, [{t:2}]);
});


test('a new song can resume even if an abandoned resume is still pending', async () => {
  const { g } = setup(); g.pause('user'); audio.ctx.state = 'suspended';
  let resolve; audio.ctx.resume = () => new Promise(r => { resolve = r; });
  const abandoned = g.resume(); g.quit();
  audio.ctx.state = 'running'; g.startSong(SONGS[0]); g.pause('user'); await g.resume();
  assert.equal(g.state, 'countin'); resolve(); await abandoned; assert.equal(g.state, 'countin');
});
