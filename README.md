# 🎹 AirKeys — play piano in thin air

A piano-tiles rhythm game you play **with your bare hands**. Your webcam tracks
all ten fingertips; falling notes rain onto a piano keybed Synthesia-style, and
you strike them by tapping the air. Flick harder and the note plays louder —
real dynamics, like a real piano.

## Run it

Double-click **`serve.command`** — it starts a tiny local server and opens the
game. (Browsers only allow camera access over `localhost` or HTTPS, so the game
can't run from a double-clicked `index.html`.)

Or from a terminal:

```sh
cd "piano tiles ai"
python3 -m http.server 8417
# then open http://localhost:8417
```

Chrome / Edge / Safari 17+ work; Chrome has the fastest hand tracking. Allow
the camera when asked. **Everything runs on-device — no video ever leaves your
machine.** The hand-tracking engine and model are vendored in `/vendor`, the
piano is synthesized live, so the game also works fully offline.

## How to play

- 🖐️ Show your hands — glowing dots appear on your fingertips (gold = one hand, blue = the other).
- 🎵 When a falling tile reaches the glowing line above the piano, **flick a fingertip down** in that lane.
- 🎹 Lanes follow the melody: low notes left, high notes right — your hands trace the tune.
- 💪 Flick speed = note volume. Clean flicks on the line score **PERFECT**; resting a finger on a tile as it crosses still hits (assist) but caps at GREAT. Turn assist off in Settings for pro mode.
- ✨ The golden rain is the game playing the accompaniment under your melody.
- 🫥 Hands out of frame? The game auto-pauses and waits for you.
- 👆 No camera? It falls back to touch mode — tap lanes or use `D F J K` (or `1–6`).

Extras: **Free Play** turns the screen into an air piano (raise your hand for
the upper octave). Settings → **Demo autoplay** lets the game play itself
(also via `?demo=1` in the URL). `?touch=1` forces touch mode.

## The songbook

Starter — First Steps, Ode to Joy, Happy Birthday ·
Classical — Für Elise, Turkish March, Canon in D ·
Romance — Nocturne Op.9 No.2, Greensleeves, Gymnopédie No.1 ·
Grand — Moonlight Sonata, Bach Prelude in C ·
Pop — Neon Skyline, Falling For You, Midnight Run (AirKeys originals)

All melodies are note-encoded arrangements played by the built-in synth — no
audio files, so the whole game (minus the 8 MB vision model) is ~60 KB.

## Tech, briefly

- **MediaPipe HandLandmarker** (GPU/WASM) for 21-point hand tracking at camera rate
- **One-Euro filtering + velocity prediction** to cancel ~70–100 ms of camera latency (trim further in Settings)
- **Web Audio piano** — layered inharmonic partials, hammer noise, key-tracked decay, convolution hall
- **Canvas 2D with pre-baked sprites** (tiles, keybed, glows) — the frame loop is pure `drawImage`, no per-frame gradients on the hot path
- Tiles are lane-mapped by **pitch contour**, chords need two fingers, accompaniment is scheduled sample-accurately on the audio clock
