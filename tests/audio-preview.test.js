import test from 'node:test';
import assert from 'node:assert/strict';
import { audio } from '../js/audio.js';
import { UI } from '../js/ui.js';
import { SONGS } from '../js/songs.js';

function audioContext() {
  const sources = [], outputs = [];
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} });
  const node = () => { const n = { gain:param(),frequency:param(),detune:param(),Q:param(),connect(){},disconnect(){this.disconnected=true;} }; outputs.push(n); return n; };
  const source = () => { const n = Object.assign(node(), { start(at){this.startAt=at;},stop(at){this.stopAt=at;} }); sources.push(n); return n; };
  return { currentTime:1, state:'running', sources, outputs, createGain:node,createBiquadFilter:node,createOscillator:source,createBufferSource:source };
}

test('piano cancellation stops future partials and hammer noise, idempotently', () => {
  const ctx = audioContext(); audio.ctx = ctx; audio.master = {}; audio.noiseBuf = {}; audio.voices = [];
  const voice = audio.piano(60,0.8,20,1); voice.kill(); voice.kill();
  assert.equal(ctx.sources.length,4); assert.ok(ctx.sources.every(s=>s.startAt===20 && s.stopAt===1));
  assert.equal(ctx.outputs.filter(n=>n.disconnected).length,2);
});

test('pad and tick return cancellable sources, including future events', () => {
  const ctx = audioContext(); audio.ctx = ctx; audio.master = {};
  audio.pad(48,0.5,20,1).kill(); audio.tick(20).kill();
  assert.equal(ctx.sources.length,4); assert.ok(ctx.sources.every(s=>s.stopAt===1));
});

const realInit = audio.init, realPiano = audio.piano, realPad = audio.pad;
function previewSetup() {
  const voices = [];
  audio.init = async () => {}; audio.ctx = { currentTime:0 };
  audio.piano = audio.pad = () => { const voice = {stopped:false,kill(){this.stopped=true;}}; voices.push(voice); return voice; };
  const ui = new UI(); ui.toast = () => {};
  return { ui, voices };
}

test('stopping preview cancels all of its melody and accompaniment voices', () => {
  return (async () => {
    const {ui,voices}=previewSetup(); await ui.preview(SONGS[0]); assert.ok(voices.length>1);
    ui.stopPreview(); assert.ok(voices.every(v=>v.stopped)); assert.equal(ui._previewVoices.length,0);
  })();
});

test('a stopped pending preview cannot schedule notes after audio unlock', async () => {
  const {ui,voices}=previewSetup(); let resolve;
  audio.init=()=>new Promise(r=>{resolve=r;}); const preview=ui.preview(SONGS[0]); ui.stopPreview(); resolve(); await preview;
  assert.equal(voices.length,0);
});

test('a newer preview replaces voices without stopping unrelated game voices', async () => {
  const {ui,voices}=previewSetup(); const unrelated=audio.piano();
  await ui.preview(SONGS[0]); const old=[...ui._previewVoices]; await ui.preview(SONGS[1]);
  assert.ok(old.every(v=>v.stopped)); assert.ok(ui._previewVoices.every(v=>!v.stopped)); assert.equal(unrelated.stopped,false);
  ui.stopPreview();
});

test('audio unlock failure is caught and preview remains retryable', async () => {
  const {ui,voices}=previewSetup(); let notices=0; ui.toast=()=>notices++;
  audio.init=async()=>{throw Error('blocked');}; await ui.preview(SONGS[0]); assert.equal(notices,1); assert.equal(voices.length,0);
  audio.init=async()=>{}; await ui.preview(SONGS[0]); assert.ok(voices.length>0); ui.stopPreview();
  audio.init=realInit;audio.piano=realPiano;audio.pad=realPad;
});
