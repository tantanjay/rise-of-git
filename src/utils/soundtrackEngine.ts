import { SOUNDTRACKS, SoundtrackTrack, Voice } from "./civSoundtracks";

/* ------------------------------------------------------------------------- */
/* The civilization soundtracks' orchestra: every instrument is synthesized   */
/* with the Web Audio API (no audio files). A track is a score of measures;   */
/* each measure's notes are scheduled on the audio clock a little ahead of    */
/* time, so tempo holds even when the page is busy. Everything of one play    */
/* runs through its own bus, so stopping fades the music out at once.         */
/* ------------------------------------------------------------------------- */

export type PlayMode = "loop" | "album";

export interface SoundtrackState {
  playing: boolean;
  trackId: string;
  /** Measure being heard (0-based) */
  step: number;
  mode: PlayMode;
  /** 0–1 */
  volume: number;
  /** 0–1 */
  reverb: number;
  /** performance.now() when the track started (for the elapsed timer) */
  startedAt: number;
}

const SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "F#4" / "Bb2" → Hz */
export function noteHz(name: string): number {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) return NaN;
  const midi = 12 * (Number(m[3]) + 1) + SEMITONE[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function harmonicWave(ctx: AudioContext, amps: number[]): PeriodicWave {
  const real = new Float32Array(amps.length + 1);
  const imag = new Float32Array(amps.length + 1);
  amps.forEach((a, i) => (imag[i + 1] = a));
  return ctx.createPeriodicWave(real, imag);
}

/** How far ahead (s) measures are put on the audio clock */
const LOOKAHEAD = 0.3;

/** Sounds the orchestra lets ring at once (the written tracks peak around 60) */
const MAX_SOURCES = 120;

class SoundtrackEngine {
  private ctx: AudioContext | null = null;
  private mix: DynamicsCompressorNode | null = null;
  private master: GainNode | null = null;
  private reverbSend: GainNode | null = null;
  /** Bus of the current play: faded out and dropped on stop */
  private bus: GainNode | null = null;
  /** Its send to the hall, faded with it */
  private wet: GainNode | null = null;
  private drone: OscillatorNode[] = [];
  private waves: Record<"cello" | "reed" | "horn" | "brass", PeriodicWave> | null = null;
  private noise: AudioBuffer | null = null;
  private timer: number | null = null;
  private uiTimers: number[] = [];
  private nextStepTime = 0;
  private nextStep = 0;
  /** Tracks "Play on" walks through (the list the player shows) */
  private queue: string[] = SOUNDTRACKS.map((t) => t.id);
  private listeners = new Set<() => void>();
  /** Nodes made for the note being scheduled; disconnected once its last sound ends, so the graph never grows */
  private made: AudioNode[] | null = null;
  private lastSource: AudioScheduledSourceNode | null = null;
  private lastEnd = 0;
  /** Oscillators and noise sources scheduled or sounding right now (the voice limit counts these) */
  private live = 0;
  /** Notes skipped by the voice limit since the page loaded */
  dropped = 0;

  analyser: AnalyserNode | null = null;
  state: SoundtrackState = { playing: false, trackId: SOUNDTRACKS[0].id, step: 0, mode: "loop", volume: 0.75, reverb: 0.55, startedAt: 0 };

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getState = () => this.state;

  private set(patch: Partial<SoundtrackState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  private init(): AudioContext | null {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      // Music needs no low latency: a bigger buffer rides out CPU spikes (the 3D map renders behind the Codex)
      this.ctx = new AudioCtx({ latencyHint: "playback" });
    }
    const ctx = this.ctx;
    if (ctx.state === "suspended") void ctx.resume();
    if (this.mix) return ctx;

    const t = ctx.currentTime;
    // Limiter → master volume → analyser (the radio's visualizer) → speakers
    this.mix = ctx.createDynamicsCompressor();
    this.mix.threshold.setValueAtTime(-14, t);
    this.mix.knee.setValueAtTime(6, t);
    this.mix.ratio.setValueAtTime(8, t);
    this.mix.attack.setValueAtTime(0.003, t);
    this.mix.release.setValueAtTime(0.2, t);
    this.master = ctx.createGain();
    this.master.gain.setValueAtTime(this.state.volume, t);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.82;
    this.mix.connect(this.master);
    this.master.connect(this.analyser);
    this.analyser.connect(ctx.destination);

    this.waves = {
      cello: harmonicWave(ctx, [1, 0.65, 0.42, 0.25, 0.15, 0.09, 0.05, 0.03, 0.015, 0.008]),
      reed: harmonicWave(ctx, [1, 0.28, 0.72, 0.15, 0.45, 0.08, 0.22, 0.04, 0.09, 0.02]),
      horn: harmonicWave(ctx, [1, 0.85, 0.6, 0.4, 0.25, 0.14, 0.07, 0.03, 0.01]),
      brass: harmonicWave(ctx, [1, 0.92, 0.78, 0.62, 0.45, 0.32, 0.22, 0.14, 0.08, 0.04])
    };

    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) nd[i] = Math.random() * 2 - 1;

    // Hall reverb: a convolver over a decaying, darkened noise impulse
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.setValueAtTime(this.state.reverb * 0.55, t);
    const irLen = Math.floor(ctx.sampleRate * 3.2);
    const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < irLen; i++) {
        const s = i / ctx.sampleRate;
        lp = lp * 0.82 + (Math.random() * 2 - 1) * 0.18;
        d[i] = lp * Math.min(1, s / 0.035) * Math.exp(-s * 2.1) * 0.45;
      }
    }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    const hall = ctx.createBiquadFilter();
    hall.type = "lowpass";
    hall.frequency.setValueAtTime(1500, t);
    this.reverbSend.connect(conv);
    conv.connect(hall);
    hall.connect(this.mix);
    return ctx;
  }

  /* ----------------------------------------------------------------------- */
  /* Mixing helpers                                                          */
  /* ----------------------------------------------------------------------- */

  private keep<T extends AudioNode>(n: T): T {
    this.made?.push(n);
    return n;
  }

  private gain() {
    return this.keep(this.ctx!.createGain());
  }

  /** Counts a scheduled sound until it ends, and remembers the current note's last one (its end frees the note's nodes) */
  private ends(src: AudioScheduledSourceNode, at: number) {
    this.live++;
    src.addEventListener("ended", () => this.live--);
    if (this.made && at >= this.lastEnd) {
      this.lastEnd = at;
      this.lastSource = src;
    }
  }

  /** Sends a voice to the current bus (dry) and the hall (wet) */
  private out(node: AudioNode, dry: number, wet: number) {
    const ctx = this.ctx!;
    const d = this.gain();
    d.gain.value = dry;
    node.connect(d);
    d.connect(this.bus!);
    if (wet > 0) {
      const w = this.gain();
      w.gain.value = wet;
      node.connect(w);
      w.connect(this.wet!);
    }
  }

  private env(g: GainNode, t: number, peak: number, attack: number, hold: number, end: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak * 0.85, t + Math.max(attack, hold));
    g.gain.exponentialRampToValueAtTime(0.0005, t + end);
  }

  private osc(type: OscillatorType | PeriodicWave, hz: number, t: number, stop: number, detune = 0) {
    const o = this.keep(this.ctx!.createOscillator());
    if (type instanceof PeriodicWave) o.setPeriodicWave(type);
    else o.type = type;
    o.frequency.setValueAtTime(hz, t);
    if (detune) o.detune.setValueAtTime(detune, t);
    o.start(t);
    o.stop(t + stop);
    this.ends(o, t + stop);
    return o;
  }

  private filter(type: BiquadFilterType, hz: number, t: number, q = 0.7) {
    const f = this.keep(this.ctx!.createBiquadFilter());
    f.type = type;
    f.frequency.setValueAtTime(hz, t);
    f.Q.setValueAtTime(q, t);
    return f;
  }

  private vibrato(t: number, dur: number, rate: number, depth: number, delay: number, targets: OscillatorNode[]) {
    const ctx = this.ctx!;
    const lfo = this.osc("sine", rate, t, dur + 0.1);
    const g = this.gain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0, t + delay);
    g.gain.linearRampToValueAtTime(depth, t + delay + 0.4);
    lfo.connect(g);
    targets.forEach((o) => g.connect(o.frequency));
  }

  private noiseBurst(t: number, dur: number, type: BiquadFilterType, hz: number, q: number, peak: number, decay: number, dry = 0.8, wet = 0.35) {
    const ctx = this.ctx!;
    const src = this.keep(ctx.createBufferSource());
    src.buffer = this.noise;
    const f = this.filter(type, hz, t, q);
    const g = this.gain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + decay);
    src.connect(f);
    f.connect(g);
    this.out(g, dry, wet);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur);
    this.ends(src, t + dur);
  }

  /* ----------------------------------------------------------------------- */
  /* The instruments                                                         */
  /* ----------------------------------------------------------------------- */

  /** Schedules one note (or chord) and frees its nodes once it has finished sounding */
  private play(voice: Voice, notes: number[], t: number, dur: number, vel: number) {
    // Voice limit: past the budget the quieter (accompanying) notes are skipped, past the hard cap every new note,
    // so even an overwritten score can't overload the audio thread
    if (this.live >= MAX_SOURCES * 1.25 || (this.live >= MAX_SOURCES && vel < 0.8)) {
      this.dropped++;
      return;
    }
    this.made = [];
    this.lastSource = null;
    this.lastEnd = 0;
    this.voice(voice, notes, t, dur, vel);
    const nodes = this.made;
    // Set by voice() through ends(); read back through a cast since TS can't see that
    const last = this.lastSource as AudioScheduledSourceNode | null;
    this.made = null;
    if (last)
      last.onended = () => {
        for (const n of nodes) n.disconnect();
      };
  }

  private voice(voice: Voice, notes: number[], t: number, dur: number, vel: number) {
    const ctx = this.ctx!;
    const w = this.waves!;
    switch (voice) {
      case "lead": {
        // Solo reed doubled by a cello, with a late vibrato (duduk-like)
        for (const hz of notes) {
          const a = this.osc(w.reed, hz, t, dur + 0.05);
          const b = this.osc(w.cello, hz, t, dur + 0.05, 3);
          this.vibrato(t, dur, 4.8, 3.2, 0.22, [a, b]);
          const f = this.filter("lowpass", 650, t);
          f.frequency.linearRampToValueAtTime(1250, t + Math.min(0.35, dur * 0.35));
          f.frequency.exponentialRampToValueAtTime(520, t + dur);
          const ga = this.gain();
          ga.gain.value = 0.65;
          const gb = this.gain();
          gb.gain.value = 0.35;
          a.connect(ga);
          b.connect(gb);
          ga.connect(f);
          gb.connect(f);
          const g = this.gain();
          this.env(g, t, 0.32 * vel, 0.12, dur * 0.72, dur);
          f.connect(g);
          this.out(g, 0.85, 0.65);
        }
        break;
      }
      case "flute": {
        for (const hz of notes) {
          const a = this.osc("sine", hz, t, dur + 0.05);
          const b = this.osc("triangle", hz * 2, t, dur + 0.05, 4);
          this.vibrato(t, dur, 5.4, hz * 0.006, 0.18, [a, b]);
          const gb = this.gain();
          gb.gain.value = 0.12;
          b.connect(gb);
          const g = this.gain();
          this.env(g, t, 0.22 * vel, 0.07, dur * 0.8, dur);
          a.connect(g);
          gb.connect(g);
          this.out(g, 0.8, 0.7);
          // Breath at the start of the note
          this.noiseBurst(t, 0.12, "bandpass", hz * 2, 2.5, 0.02 * vel, 0.08, 0.6, 0.2);
        }
        break;
      }
      case "harp": {
        notes.forEach((hz, i) => {
          const s = t + i * 0.035;
          const a = this.osc("triangle", hz, s, 2.6);
          const b = this.osc("sine", hz * 2, s, 1.2);
          const g = this.gain();
          g.gain.setValueAtTime(0.0001, s);
          g.gain.linearRampToValueAtTime(0.2 * vel, s + 0.006);
          g.gain.exponentialRampToValueAtTime(0.0005, s + 2.5);
          const gb = this.gain();
          gb.gain.value = 0.25;
          b.connect(gb);
          a.connect(g);
          gb.connect(g);
          this.out(g, 0.75, 0.8);
        });
        break;
      }
      case "lute": {
        notes.forEach((hz, i) => {
          const s = t + i * 0.025;
          const o = this.osc("sawtooth", hz, s, 1);
          const f = this.filter("lowpass", 2600, s, 1.2);
          f.frequency.exponentialRampToValueAtTime(420, s + 0.35);
          const g = this.gain();
          g.gain.setValueAtTime(0.0001, s);
          g.gain.linearRampToValueAtTime(0.13 * vel, s + 0.004);
          g.gain.exponentialRampToValueAtTime(0.0005, s + 0.9);
          o.connect(f);
          f.connect(g);
          this.out(g, 0.8, 0.45);
        });
        break;
      }
      case "strings": {
        notes.forEach((hz, i) => {
          for (const det of [-4, 4]) {
            const o = this.osc(w.cello, hz, t, dur + 0.05, det);
            const f = this.filter("lowpass", 320, t, 0.5);
            f.frequency.linearRampToValueAtTime(640, t + dur * 0.45);
            f.frequency.exponentialRampToValueAtTime(260, t + dur);
            const g = this.gain();
            this.env(g, t, (0.13 * vel) / (i * 0.6 + 1), Math.min(0.65, dur * 0.3), dur * 0.75, dur);
            o.connect(f);
            f.connect(g);
            this.out(g, 0.75, 0.6);
          }
        });
        break;
      }
      case "stacc": {
        const d = Math.min(dur, 0.3);
        notes.forEach((hz, i) => {
          for (const det of [-5, 5]) {
            const o = this.osc(w.cello, hz, t, d + 0.03, det);
            const f = this.filter("lowpass", 950, t, 0.8);
            f.frequency.exponentialRampToValueAtTime(280, t + d);
            const g = this.gain();
            g.gain.setValueAtTime(0.001, t);
            g.gain.linearRampToValueAtTime((0.2 * vel) / (i + 1), t + 0.025);
            g.gain.exponentialRampToValueAtTime(0.0005, t + d);
            o.connect(f);
            f.connect(g);
            this.out(g, 0.85, 0.35);
          }
        });
        break;
      }
      case "horns":
      case "brass": {
        const horn = voice === "horns";
        notes.forEach((hz, i) => {
          for (const det of [-3.5, 3.5]) {
            const o = this.osc(horn ? w.horn : w.brass, hz, t, dur + 0.05, det);
            const f = this.filter("lowpass", horn ? 380 : 450, t, horn ? 0.6 : 0.9);
            f.frequency.linearRampToValueAtTime(horn ? 950 : 1650, t + (horn ? Math.min(0.5, dur * 0.4) : Math.min(0.18, dur * 0.25)));
            f.frequency.exponentialRampToValueAtTime(horn ? 420 : 500, t + dur);
            const g = this.gain();
            this.env(g, t, ((horn ? 0.15 : 0.17) * vel) / (i * 0.5 + 1), horn ? 0.3 : 0.06, dur * 0.72, dur);
            o.connect(f);
            f.connect(g);
            this.out(g, 0.8, horn ? 0.7 : 0.78);
          }
        });
        break;
      }
      case "choir": {
        // Detuned saws through two vowel formants ("ah"), slow breath in and out
        notes.forEach((hz, i) => {
          const g = this.gain();
          this.env(g, t, (0.1 * vel) / (i * 0.4 + 1), Math.min(0.9, dur * 0.35), dur * 0.7, dur);
          const f1 = this.filter("bandpass", 730, t, 3);
          const f2 = this.filter("bandpass", 1150, t, 4);
          const lp = this.filter("lowpass", 2200, t);
          const saws = [-9, 0, 9].map((det) => this.osc("sawtooth", hz, t, dur + 0.05, det));
          this.vibrato(t, dur, 4.6, hz * 0.004, 0.3, saws);
          for (const o of saws) {
            o.connect(f1);
            o.connect(f2);
          }
          const g2 = this.gain();
          g2.gain.value = 0.6;
          f1.connect(lp);
          f2.connect(g2);
          g2.connect(lp);
          lp.connect(g);
          this.out(g, 0.7, 0.9);
        });
        break;
      }
      case "glass": {
        // Glassy shimmer: sine + bell partial with a slow tremolo
        notes.forEach((hz, i) => {
          const a = this.osc("sine", hz, t, dur + 0.05);
          const b = this.osc("sine", hz * 3.01, t, dur + 0.05);
          const gb = this.gain();
          gb.gain.value = 0.18;
          b.connect(gb);
          const trem = this.gain();
          trem.gain.value = 1;
          const lfo = this.osc("sine", 3.2 + i * 0.7, t, dur + 0.05);
          const depth = this.gain();
          depth.gain.value = 0.35;
          lfo.connect(depth);
          depth.connect(trem.gain);
          a.connect(trem);
          gb.connect(trem);
          const g = this.gain();
          this.env(g, t, (0.12 * vel) / (i * 0.3 + 1), Math.min(0.8, dur * 0.3), dur * 0.6, dur);
          trem.connect(g);
          this.out(g, 0.6, 0.95);
        });
        break;
      }
      case "drum": {
        const hz = notes[0] ?? 88;
        const o = this.osc("sine", hz, t, 1.45);
        o.frequency.exponentialRampToValueAtTime(36, t + 0.32);
        const g = this.gain();
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(0.75 * vel, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0005, t + 1.4);
        o.connect(g);
        this.out(g, 0.9, 0.55);
        this.noiseBurst(t, 0.09, "lowpass", 220, 0.7, 0.45 * vel, 0.08);
        break;
      }
      case "tick": {
        const hz = notes[0] ?? 480;
        const o = this.osc("triangle", hz, t, 0.09);
        o.frequency.exponentialRampToValueAtTime(hz * 0.45, t + 0.065);
        const g = this.gain();
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(0.26 * vel, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0005, t + 0.08);
        o.connect(g);
        this.out(g, 0.8, 0.35);
        break;
      }
      case "snare": {
        this.noiseBurst(t, 0.2, "bandpass", 1900, 0.8, 0.32 * vel, 0.16, 0.8, 0.35);
        const o = this.osc("triangle", 190, t, 0.1);
        const g = this.gain();
        g.gain.setValueAtTime(0.18 * vel, t);
        g.gain.exponentialRampToValueAtTime(0.0005, t + 0.09);
        o.connect(g);
        this.out(g, 0.8, 0.2);
        break;
      }
      case "anvil": {
        // Hammer on steel: inharmonic partials and a bright click
        const hz = notes[0] ?? 1180;
        [1, 2.76, 5.4, 8.9].forEach((r, i) => {
          const o = this.osc("sine", hz * r, t, 1.2);
          const g = this.gain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime((0.11 * vel) / (i + 1), t + 0.002);
          g.gain.exponentialRampToValueAtTime(0.0005, t + 1.1 / (i * 0.8 + 1));
          o.connect(g);
          this.out(g, 0.75, 0.55);
        });
        this.noiseBurst(t, 0.05, "highpass", 3000, 0.7, 0.2 * vel, 0.03, 0.7, 0.3);
        break;
      }
      case "chime": {
        for (const hz of notes) {
          [1, 2, 2.76, 3.98].forEach((r, i) => {
            const decay = Math.max(1.2, dur) / (i * 0.7 + 1);
            const o = this.osc("sine", hz * r, t, decay + 0.05);
            const g = this.gain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(0.15 * vel * [1, 0.55, 0.35, 0.18][i], t + 0.01);
            g.gain.exponentialRampToValueAtTime(0.0004, t + decay);
            o.connect(g);
            this.out(g, 0.65, 0.85);
          });
        }
        break;
      }
      case "gong": {
        // A struck tam-tam: inharmonic metal partials beating slowly against each other, and a soft mallet thump
        const d = Math.max(2.5, dur);
        [
          [1, 0.2],
          [1.48, 0.12],
          [2.09, 0.08],
          [2.63, 0.06],
          [3.51, 0.04]
        ].forEach(([r, a], i) => {
          for (const det of [-6, 6]) {
            const o = this.osc("sine", 72 * r, t, d, det);
            const g = this.gain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(a * vel, t + 0.02 + i * 0.05);
            g.gain.exponentialRampToValueAtTime(0.0005, t + d / (i * 0.35 + 1));
            o.connect(g);
            this.out(g, 0.6, 0.8);
          }
        });
        this.noiseBurst(t, 0.4, "lowpass", 600, 0.7, 0.1 * vel, 0.3, 0.6, 0.4);
        break;
      }
    }
  }

  /* ----------------------------------------------------------------------- */
  /* Transport                                                               */
  /* ----------------------------------------------------------------------- */

  track(id = this.state.trackId): SoundtrackTrack {
    return SOUNDTRACKS.find((t) => t.id === id) ?? SOUNDTRACKS[0];
  }

  /** Sets the tracks Prev / Next / Play on walk through */
  setQueue(ids: string[]) {
    if (ids.length) this.queue = ids;
  }

  start(id = this.state.trackId) {
    const ctx = this.init();
    if (!ctx) return;
    this.halt();
    const track = this.track(id);
    this.bus = ctx.createGain();
    this.bus.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.bus.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.15);
    this.bus.connect(this.mix!);
    this.wet = ctx.createGain();
    this.wet.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.wet.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.15);
    this.wet.connect(this.reverbSend!);

    // A low drone on the track's root holds the whole piece together
    const dg = ctx.createGain();
    dg.gain.setValueAtTime(0.0001, ctx.currentTime);
    dg.gain.linearRampToValueAtTime(0.24, ctx.currentTime + 1.2);
    this.out(dg, 0.75, 0.35);
    track.drone.map(noteHz).forEach((hz, i) => {
      const o = ctx.createOscillator();
      if (i === 0) o.type = "sine";
      else o.setPeriodicWave(this.waves!.cello);
      o.frequency.value = hz;
      const f = this.filter("lowpass", 190, ctx.currentTime, 0.5);
      o.connect(f);
      f.connect(dg);
      o.start();
      this.drone.push(o);
    });

    this.nextStep = 0;
    this.nextStepTime = ctx.currentTime + 0.08;
    this.set({ playing: true, trackId: track.id, step: 0, startedAt: performance.now() });
    this.pump();
    this.timer = window.setInterval(() => this.pump(), 100);
  }

  /** Puts every measure that starts within the lookahead on the audio clock */
  private pump() {
    const ctx = this.ctx;
    if (!ctx || !this.state.playing) return;
    const track = this.track();
    const spb = 60 / track.bpm;
    while (this.nextStepTime < ctx.currentTime + LOOKAHEAD) {
      if (this.nextStep >= track.steps.length) {
        if (this.state.mode === "album") {
          // Let the last measure ring, then move on
          const wait = Math.max(0, (this.nextStepTime - ctx.currentTime) * 1000);
          this.stopTimer();
          this.uiTimers.push(window.setTimeout(() => this.skip(1), wait));
          return;
        }
        this.nextStep = 0;
      }
      const index = this.nextStep;
      const step = track.steps[index];
      const t0 = this.nextStepTime;
      for (const [beat, voice, notes, dur, vel = 1] of step.events) {
        this.play(voice, notes ? notes.split(" ").map(noteHz).filter(Number.isFinite) : [], t0 + beat * spb, dur * spb, vel);
      }
      const delay = Math.max(0, (t0 - ctx.currentTime) * 1000);
      this.uiTimers.push(window.setTimeout(() => this.state.playing && this.set({ step: index }), delay));
      this.nextStep++;
      this.nextStepTime += (step.beats ?? track.beats) * spb;
    }
  }

  private stopTimer() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  /** Cuts the current play: fades its bus and drone, cancels pending measures */
  private halt() {
    this.stopTimer();
    this.uiTimers.forEach((id) => window.clearTimeout(id));
    this.uiTimers = [];
    const ctx = this.ctx;
    const buses = [this.bus, this.wet].filter((b): b is GainNode => b !== null);
    const drone = this.drone;
    this.bus = null;
    this.wet = null;
    this.drone = [];
    if (ctx && buses.length) {
      for (const bus of buses) {
        bus.gain.cancelScheduledValues(ctx.currentTime);
        bus.gain.setValueAtTime(bus.gain.value, ctx.currentTime);
        bus.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      }
      window.setTimeout(() => {
        drone.forEach((o) => {
          try {
            o.stop();
          } catch {
            /* already stopped */
          }
        });
        buses.forEach((b) => b.disconnect());
      }, 450);
    }
  }

  stop() {
    this.halt();
    if (this.state.playing) this.set({ playing: false });
  }

  toggle() {
    if (this.state.playing) this.stop();
    else this.start();
  }

  /** Next (+1) or previous (-1) track in the queue */
  skip(dir: 1 | -1) {
    const i = this.queue.indexOf(this.state.trackId);
    const next = this.queue[(i + dir + this.queue.length) % this.queue.length] ?? this.queue[0];
    this.start(next);
  }

  setMode(mode: PlayMode) {
    this.set({ mode });
  }

  setVolume(v: number) {
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.04);
    this.set({ volume: v });
  }

  setReverb(v: number) {
    if (this.reverbSend && this.ctx) this.reverbSend.gain.setTargetAtTime(v * 0.55, this.ctx.currentTime, 0.04);
    this.set({ reverb: v });
  }
}

/** The one soundtrack player of the game */
export const soundtrack = new SoundtrackEngine();
