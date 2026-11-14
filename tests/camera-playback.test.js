import test from 'node:test';
import assert from 'node:assert/strict';
import { Hands } from '../js/hands.js';
import { Playback } from '../js/playback.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};
const flush = () => new Promise(setImmediate);
function stream() {
  const track = { readyState: 'live', stop() { this.readyState = 'ended'; } };
  return { track, getTracks: () => [track] };
}
function setup({ acquire = async () => stream(), play = async () => {}, timeout = 15000 } = {}) {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: acquire } } });
  globalThis.document = { createElement: () => ({ srcObject: null, play }) };
  const hands = new Hands(); hands.ready = true;
  const screens = [], notices = [], starts = [];
  const ui = {
    stopPreview() {}, hidePause() {}, showScreen(s) { screens.push(s); }, showFreePlay() { screens.push('free'); },
    setSongHeader() {}, setWarmupStatus() {}, buildSettings() { this.mode = settings.input; }, toast(s) { notices.push(s); },
  };
  const game = { quit() {}, startWarmup() {}, onResize() {}, startSong(s) { starts.push(s); }, startFreePlay() { starts.push('free'); } };
  const settings = { input: 'air' };
  const audio = { init: async () => {} };
  const playback = new Playback({ ui, game, hands, audio, settings, warmupTimeout: timeout });
  return { hands, ui, settings, audio, playback, starts, screens, notices };
}

test('late getUserMedia after Cancel stops the stream and cannot start a song', async () => {
  const request = deferred(), media = stream();
  const s = setup({ acquire: () => request.promise });
  const start = s.playback.start('song'); await flush();
  s.playback.cancel(); await start;
  request.resolve(media); await flush();
  assert.equal(media.track.readyState, 'ended'); assert.equal(s.hands.video, null); assert.deepEqual(s.starts, []);
});

test('video.play failure stops acquired tracks, falls back and refreshes effective mode', async () => {
  const media = stream();
  const s = setup({ acquire: async () => media, play: async () => { throw Error('decode failed'); } });
  await s.playback.start('song');
  assert.equal(media.track.readyState, 'ended'); assert.equal(s.hands.video, null);
  assert.equal(s.settings.input, 'touch'); assert.equal(s.ui.mode, 'touch'); assert.deepEqual(s.starts, ['song']);
});

test('Cancel while video.play is pending releases tracks immediately and ignores late play', async () => {
  const playing = deferred(), media = stream();
  const s = setup({ acquire: async () => media, play: () => playing.promise });
  const start = s.playback.start('song'); await flush();
  s.playback.cancel(); await start;
  assert.equal(media.track.readyState, 'ended');
  playing.resolve(); await flush(); assert.equal(s.hands.video, null); assert.deepEqual(s.starts, []);
});

test('denial continues to playable touch mode and refreshes the effective mode', async () => {
  const s = setup({ acquire: async () => { throw new DOMException('Denied', 'NotAllowedError'); } });
  await s.playback.start('song');
  assert.deepEqual(s.starts, ['song']); assert.equal(s.ui.mode, 'touch'); assert.match(s.notices[0], /Choose Air/);
});

test('Continue with touch unblocks a pending permission prompt and cleans late media', async () => {
  const request = deferred(), media = stream();
  const s = setup({ acquire: () => request.promise });
  const start = s.playback.start('song'); await flush(); s.ui.onWarmupTouch(); await start;
  assert.deepEqual(s.starts, ['song']); assert.equal(s.settings.input, 'touch');
  request.resolve(media); await flush(); assert.equal(media.track.readyState, 'ended'); assert.equal(s.hands.video, null);
});

test('no-hands warmup times out, releases camera, and starts touch', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const media = stream(), s = setup({ acquire: async () => media });
  const start = s.playback.start('song'); await flush();
  assert.ok(s.hands.video); t.mock.timers.tick(15000); await start;
  assert.equal(media.track.readyState, 'ended'); assert.deepEqual(s.starts, ['song']); assert.equal(s.settings.input, 'touch');
});

test('engine load timeout never opens a camera when engine finishes late', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  let requests = 0;
  const s = setup({ acquire: async () => { requests++; return stream(); } }), engine = deferred();
  s.hands.ready = false; s.hands.init = () => engine.promise;
  const start = s.playback.start('song'); await flush(); t.mock.timers.tick(15000); await start;
  engine.resolve(); await flush(); assert.equal(requests, 0); assert.deepEqual(s.starts, ['song']);
});

test('newer camera request owns the video and is not closed by older late acquisition', async () => {
  const a = deferred(), b = deferred(), old = stream(), newer = stream(); let calls = 0;
  const s = setup({ acquire: () => (++calls === 1 ? a.promise : b.promise) });
  const first = s.hands.openCamera(); const rejected = assert.rejects(first, { name: 'AbortError' });
  const second = s.hands.openCamera(); b.resolve(newer); const video = await second;
  a.resolve(old); await rejected;
  assert.equal(old.track.readyState, 'ended'); assert.equal(newer.track.readyState, 'live'); assert.equal(s.hands.video, video);
  s.hands.closeCamera(); assert.equal(newer.track.readyState, 'ended'); assert.equal(video.srcObject, null);
});

test('a cancelled audio startup cannot resurrect a song', async () => {
  const s = setup(), init = deferred(); s.audio.init = () => init.promise;
  const start = s.playback.start('song'); s.playback.cancel(); init.resolve(); await start;
  assert.deepEqual(s.starts, []);
});

test('successful Air warmup retains camera until explicit exit', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const media = stream(), s = setup({ acquire: async () => media });
  const start = s.playback.start('song'); await flush();
  s.hands.tracking = true;
  const originalPerformance = globalThis.performance;
  try {
    Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => now } });
    let now = 0; t.mock.timers.tick(80); now = 700; t.mock.timers.tick(80); await start;
    assert.equal(s.settings.input, 'air'); assert.equal(media.track.readyState, 'live'); assert.deepEqual(s.starts, ['song']);
    s.playback.cancel(); assert.equal(media.track.readyState, 'ended');
  } finally { Object.defineProperty(globalThis, 'performance', { configurable: true, value: originalPerformance }); }
});

test('touch mode never requests a camera and audio startup failure stays recoverable', async () => {
  let requests = 0; const s = setup({ acquire: async () => { requests++; return stream(); } });
  s.settings.input = 'touch'; await s.playback.start('song'); assert.equal(requests, 0);
  s.starts.length = 0; s.audio.init = async () => { throw Error('blocked'); };
  await s.playback.start('song'); assert.deepEqual(s.starts, []); assert.equal(s.screens.at(-1), 'menu');
  s.audio.init = async () => {}; await s.playback.start('song'); assert.deepEqual(s.starts, ['song']);
});


test('pending permission times out and any late grant is stopped', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const request = deferred(), media = stream();
  const s = setup({ acquire: () => request.promise });
  const start = s.playback.start('song'); await flush(); t.mock.timers.tick(15000); await start;
  assert.equal(s.settings.input, 'touch'); assert.deepEqual(s.starts, ['song']);
  request.resolve(media); await flush(); assert.equal(media.track.readyState, 'ended'); assert.equal(s.hands.video, null);
});

test('a newer startup wins even when the previous camera resolves late', async () => {
  const request = deferred(), media = stream(); const s = setup({ acquire: () => request.promise });
  const old = s.playback.start('old'); await flush();
  s.settings.input = 'touch'; const newer = s.playback.start('new'); await Promise.all([old,newer]);
  request.resolve(media); await flush(); assert.deepEqual(s.starts, ['new']); assert.equal(media.track.readyState, 'ended');
});

test('engine initialization is shared and can retry after failure', async () => {
  const hands = new Hands(), engine = deferred(); let attempts = 0;
  hands.initEngine = () => { attempts++; return engine.promise; };
  const a = hands.init(), b = hands.init(); assert.equal(a,b); assert.equal(attempts,1);
  const rejected = assert.rejects(a, /engine failed/); engine.reject(Error('engine failed')); await rejected;
  hands.initEngine = async () => { attempts++; hands.ready = true; };
  await hands.init(); await hands.init(); assert.equal(attempts,2); assert.equal(hands.ready,true);
});
