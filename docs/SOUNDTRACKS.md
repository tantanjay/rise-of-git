# Soundtracks

How the civilizations' music is written and played. Read before adding or changing a track or touching the soundtrack engine.

Each civilization's soundtracks are scores in `src/utils/civSoundtracks.ts`, played by the one Web Audio orchestra in `src/utils/soundtrackEngine.ts` (no audio files) and shown on the radio in `SoundtrackPlayer.tsx`. Static or crackling means the audio thread is overloaded: keep it light.

## Adding a track
- Write it as data in `SOUNDTRACKS` (measures of `[beat, instrument, notes, beats long, loudness]`, built with `at` / `seq` / `arp` / `hits`). Don't add per-track audio code to the engine. A new instrument goes in the engine's `voice()` switch and must follow the engine rules below.
- The number of tracks costs nothing (only one plays). What costs CPU is how many notes ring **at once** in one track. The written tracks peak at about 60 sounding sources; stay near that.
- Cost per note: `choir` is the heaviest (3 saws + 3 filters + a vibrato), `gong` is 10 tones (use it rarely, usually only on the last measure), `strings` / `horns` / `brass` / `stacc` are 2 voices per note (a 4-note chord is 8), and `harp` / `lute` / `tick` / `drum` / `snare` / `anvil` are cheap.
- At most one `choir` chord per measure, of 3–4 notes. Don't stack a long `strings`, `choir` and `horns` chord on the same notes in one measure; two of the three sound as full. Fast parts (8th-note harp, `stacc`, ticks) are fine because their notes are short.
- Accompaniment (pads, arpeggios, rattles) gets a loudness under 0.8; melody and downbeats get 0.8 or more. The voice limit drops the quiet ones first.
- Each civilization keeps its own sound: Valoria horns, trumpets and lute; Sylvandale harp, flute and choir; Ironforge low choir, anvils and horns; Drak'mar war drums, low brass and the raw `lead` reed; Nethergarde void `glass`, bells and choir.
- After adding a track, play it for at least a minute in the Codex and check `soundtrack.dropped` stays 0 and `soundtrack['live']` stays well under `MAX_SOURCES`. A track that hits the limit is too dense: thin it out, don't raise the limit.

## Engine rules (`soundtrackEngine.ts`)
- Every node of a note is made through `this.gain()` / `this.filter()` / `this.osc()` / `noiseBurst()` (or wrapped in `this.keep()`), so `play()` disconnects them all when the note's last sound ends. A node made with `ctx.create*()` inside an instrument is never freed. The graph grows, and the crackle gets worse the longer the music plays.
- Every oscillator or buffer source gets `this.ends(src, stopTime)`. That counts it for the voice limit (`MAX_SOURCES`: quieter notes are skipped past it, every new note past 1.25×) and marks when the note is freed.
- Schedule notes on the audio clock (`start(t)` / `stop(t)`), never with per-note `setTimeout`. Everything of one play goes through its bus (`this.bus` / `this.wet`, via `out()`), so a stop silences it at once.
- No raw white noise as a sustained sound: it reads as static (the old gong did). Keep noise to short, filtered transients (breath, drum click, mallet).
- The context runs with `latencyHint: "playback"`. Music needs no low latency, and the bigger buffer rides out CPU spikes from the 3D view behind the Codex.

