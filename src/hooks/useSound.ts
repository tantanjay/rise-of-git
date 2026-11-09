// Zero-dependency 8-Bit Web Audio Synthesizer Hook

class SoundEngine {
  private ctx: AudioContext | null = null;
  public enabled = true;

  private init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  playStep() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(120, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(60, this.ctx.currentTime + 0.04);

    gain.gain.setValueAtTime(0.03, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.04);
  }

  playHarvest() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, this.ctx!.currentTime + (i * 0.07));

      gain.gain.setValueAtTime(0.12, this.ctx!.currentTime + (i * 0.07));
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx!.currentTime + (i * 0.07) + 0.18);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(this.ctx!.currentTime + (i * 0.07));
      osc.stop(this.ctx!.currentTime + (i * 0.07) + 0.18);
    });
  }

  playWater() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const freqs = [350, 480, 410, 620];
    freqs.forEach((f, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, this.ctx!.currentTime + (i * 0.04));
      osc.frequency.exponentialRampToValueAtTime(f + 120, this.ctx!.currentTime + (i * 0.04) + 0.09);

      gain.gain.setValueAtTime(0.08, this.ctx!.currentTime + (i * 0.04));
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx!.currentTime + (i * 0.04) + 0.09);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(this.ctx!.currentTime + (i * 0.04));
      osc.stop(this.ctx!.currentTime + (i * 0.04) + 0.09);
    });
  }

  playSquash() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(280, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(70, this.ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  }

  playLevelUp() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(freq, this.ctx!.currentTime + (i * 0.1));

      gain.gain.setValueAtTime(0.14, this.ctx!.currentTime + (i * 0.1));
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx!.currentTime + (i * 0.1) + 0.25);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(this.ctx!.currentTime + (i * 0.1));
      osc.stop(this.ctx!.currentTime + (i * 0.1) + 0.25);
    });
  }

  /** Defeat: three falling notes like a fading horn */
  playDefeat() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const notes = [330, 262, 196];
    notes.forEach((freq, i) => {
      const at = this.ctx!.currentTime + i * 0.22;
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, at);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.94, at + 0.35);
      gain.gain.setValueAtTime(0.09, at);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.4);
      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(at);
      osc.stop(at + 0.4);
    });
  }

  /** Herald notice: a short rising fanfare on the horn */
  playHerald() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const notes = [392, 523.25, 659.25];
    notes.forEach((freq, i) => {
      const at = this.ctx!.currentTime + i * 0.14;
      const len = i === notes.length - 1 ? 0.5 : 0.16;
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, at);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.07, at + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, at + len);
      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(at);
      osc.stop(at + len);
    });
  }

  /** A short burst of white noise through a band-pass filter, swept from `f0` to `f1` Hz */
  private noise(at: number, len: number, f0: number, f1: number, q: number, peak: number) {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * len)), ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = q;
    filter.frequency.setValueAtTime(f0, at);
    filter.frequency.exponentialRampToValueAtTime(f1, at + len);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + len * 0.35);
    gain.gain.exponentialRampToValueAtTime(0.001, at + len);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(at);
    src.stop(at + len);
  }

  private tone(at: number, len: number, type: OscillatorType, f0: number, f1: number, peak: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, at);
    osc.frequency.exponentialRampToValueAtTime(f1, at + len);
    gain.gain.setValueAtTime(peak, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + len);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + len);
  }

  /**
   * Battle Arts (spell-effects kit): a whoosh as an Art is cast, a boom as it lands, a war horn over the whoosh for a
   * Finale. The voice colours it (fire roars low, frost rings high, thunder cracks).
   */
  playSpell(kind: "cast" | "impact" | "finale", voice: string) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const v = SPELL_VOICES[voice] ?? SPELL_VOICES.fire;
    const at = this.ctx.currentTime;
    if (kind === "impact") {
      this.tone(at, 0.28, "sine", v.boom, v.boom * 0.45, 0.16);
      this.noise(at, v.crack, v.hiss * 1.4, v.hiss * 0.5, 0.9, 0.12);
      if (v.ring) this.tone(at, 0.35, "triangle", v.ring, v.ring * 0.98, 0.04);
      return;
    }
    this.noise(at, 0.32, v.hiss * 0.4, v.hiss * 1.6, 1.4, 0.07);
    if (kind === "finale") {
      [196, 247, 294].forEach((f, i) => this.tone(at + i * 0.05, 0.7, "sawtooth", f, f * 0.99, 0.035));
    }
  }

  playClick() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(600, this.ctx.currentTime);
    gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.03);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.03);
  }
}

/** A spell's voice: the whoosh's hiss (Hz), the boom's pitch, how long the crack lasts, and a ringing overtone */
const SPELL_VOICES: Record<string, { hiss: number; boom: number; crack: number; ring?: number }> = {
  fire: { hiss: 900, boom: 90, crack: 0.35 },
  frost: { hiss: 2600, boom: 140, crack: 0.25, ring: 1760 },
  venom: { hiss: 700, boom: 120, crack: 0.3 },
  steel: { hiss: 1800, boom: 110, crack: 0.15, ring: 1320 },
  thunder: { hiss: 1500, boom: 60, crack: 0.6 },
  holy: { hiss: 1200, boom: 160, crack: 0.2, ring: 880 },
  war: { hiss: 600, boom: 80, crack: 0.25 },
  water: { hiss: 500, boom: 70, crack: 0.5 },
  sand: { hiss: 2000, boom: 70, crack: 0.6 },
  beast: { hiss: 400, boom: 65, crack: 0.35 }
};

export const sound = new SoundEngine();
