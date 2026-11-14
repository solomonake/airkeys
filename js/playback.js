// Owns asynchronous startup so cancelled work cannot start a later game.
export class Playback {
  constructor({ ui, game, hands, audio, settings, warmupTimeout = 15000 }) {
    Object.assign(this, { ui, game, hands, audio, settings, warmupTimeout });
    this.flow = null;
  }

  cancel() {
    this.flow?.abort();
    this.flow = null;
    this.hands.closeCamera();
  }

  async start(song = null, immediate = false) {
    if (this.flow) this.cancel();
    const flow = this.flow = new AbortController();
    const current = () => this.flow === flow && !flow.signal.aborted;
    this.ui.stopPreview();
    this.game.quit();
    this.ui.hidePause();
    try {
      await this.audio.init();
      if (!current()) return;
      if (this.settings.input === 'air' && !(immediate && this.hands.video)) {
        if (!await this.ensureAir(flow)) return;
      } else if (this.settings.input !== 'air') this.hands.closeCamera();
      if (!current()) return;
      if (song) {
        this.ui.showScreen('game');
        this.ui.setSongHeader(song);
        this.game.startSong(song);
      } else {
        this.ui.showFreePlay();
        this.game.startFreePlay();
      }
    } catch (err) {
      if (!current()) return;
      this.hands.closeCamera();
      this.game.quit();
      this.ui.showScreen('menu');
      this.ui.toast('Audio could not start. Press Play to retry.', 5000);
      console.warn('playback unavailable:', err);
    } finally {
      if (this.flow === flow) this.flow = null;
    }
  }

  async ensureAir(flow) {
    const warmup = new AbortController();
    let timer, onCancel, onTouch;
    this.ui.showScreen('warmup');
    this.game.startWarmup();
    const cancelled = new Promise(resolve => {
      onCancel = () => { warmup.abort(); resolve('cancel'); };
      flow.signal.addEventListener('abort', onCancel, { once: true });
    });
    const fallback = new Promise(resolve => {
      onTouch = this.ui.onWarmupTouch = () => resolve('touch');
      timer = setTimeout(() => resolve('timeout'), this.warmupTimeout);
    });
    try {
      const result = await Promise.race([
        this.warmup(warmup.signal).then(() => 'air', () => 'unavailable'),
        fallback, cancelled,
      ]);
      if (flow.signal.aborted || this.flow !== flow) return false;
      if (result === 'air') return true;
      if (result === 'cancel') return false;
      this.hands.closeCamera();
      // Fallback is session-only; Settings shows the effective mode and can retry Air.
      this.settings.input = 'touch';
      this.ui.buildSettings();
      this.ui.toast(result === 'touch'
        ? 'Touch mode: tap lanes or use the numbered keys. Choose Air in Settings to retry.'
        : 'Camera not ready. Using touch / keys for this session. Choose Air in Settings to retry.', 5000);
      return true;
    } finally {
      clearTimeout(timer);
      flow.signal.removeEventListener('abort', onCancel);
      warmup.abort();
      if (this.ui.onWarmupTouch === onTouch) this.ui.onWarmupTouch = null;
    }
  }

  async warmup(signal) {
    const check = () => { if (signal.aborted) throw new DOMException('Cancelled', 'AbortError'); };
    if (!this.hands.ready) {
      this.ui.setWarmupStatus('engine');
      await this.hands.init();
    }
    check();
    if (!this.hands.video) {
      this.ui.setWarmupStatus('camera');
      await this.hands.openCamera({ signal });
      check();
      this.game.onResize();
    }
    this.ui.setWarmupStatus('detect', 'You can continue with touch / keys at any time.');
    await new Promise((resolve, reject) => {
      let since = null;
      const cleanup = () => { clearInterval(poll); signal.removeEventListener('abort', abort); };
      const abort = () => { cleanup(); reject(new DOMException('Cancelled', 'AbortError')); };
      const poll = setInterval(() => {
        if (this.hands.tracking) {
          since ??= performance.now();
          if (performance.now() - since >= 650) { cleanup(); resolve(); }
        } else since = null;
      }, 80);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
    check();
    this.ui.setWarmupStatus('lock');
  }
}
