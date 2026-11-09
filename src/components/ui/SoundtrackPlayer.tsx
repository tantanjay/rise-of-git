import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Pause, Play, Repeat, Repeat1, SkipBack, SkipForward } from "lucide-react";
import { CivilizationType } from "@/types";
import { CIV_META } from "./TopHUD";
import { SOUNDTRACKS } from "@/utils/civSoundtracks";
import { soundtrack } from "@/utils/soundtrackEngine";

const CIVS: CivilizationType[] = ["human", "elf", "dwarf", "orc", "arcane"];

/** Each civilization's colours on the radio (Tailwind classes are written out so the build keeps them) */
const THEME: Record<
  CivilizationType,
  { text: string; chip: string; card: string; ring: string; button: string; bars: [string, string, string]; line: string; glow: string; idle: string }
> = {
  human: {
    text: "text-sky-300",
    chip: "bg-sky-950/80 text-sky-200 border-sky-700/60",
    card: "from-sky-900/60 via-slate-950/90 to-slate-950 border-sky-400/80",
    ring: "hover:border-sky-500/60",
    button: "from-sky-700 to-amber-600 hover:from-sky-600 hover:to-amber-500 border-sky-400/50",
    bars: ["rgba(251,191,36,0.95)", "rgba(56,189,248,0.8)", "rgba(12,74,110,0.2)"],
    line: "rgba(254,240,138,0.98)",
    glow: "rgba(56,189,248,0.9)",
    idle: "rgba(56,189,248,0.3)"
  },
  elf: {
    text: "text-teal-300",
    chip: "bg-teal-950/80 text-teal-200 border-teal-700/60",
    card: "from-teal-900/60 via-slate-950/90 to-slate-950 border-teal-400/80",
    ring: "hover:border-teal-500/60",
    button: "from-teal-700 to-emerald-500 hover:from-teal-600 hover:to-emerald-400 border-teal-400/50",
    bars: ["rgba(167,243,208,0.95)", "rgba(45,212,191,0.8)", "rgba(19,78,74,0.2)"],
    line: "rgba(236,253,245,0.98)",
    glow: "rgba(45,212,191,0.9)",
    idle: "rgba(45,212,191,0.3)"
  },
  dwarf: {
    text: "text-orange-300",
    chip: "bg-orange-950/80 text-orange-200 border-orange-700/60",
    card: "from-orange-900/60 via-slate-950/90 to-slate-950 border-orange-400/80",
    ring: "hover:border-orange-500/60",
    button: "from-orange-700 to-amber-500 hover:from-orange-600 hover:to-amber-400 border-orange-400/50",
    bars: ["rgba(253,230,138,0.95)", "rgba(249,115,22,0.85)", "rgba(124,45,18,0.2)"],
    line: "rgba(255,237,213,0.98)",
    glow: "rgba(249,115,22,0.9)",
    idle: "rgba(249,115,22,0.3)"
  },
  orc: {
    text: "text-red-300",
    chip: "bg-red-950/80 text-red-200 border-red-700/60",
    card: "from-red-900/60 via-slate-950/90 to-slate-950 border-red-400/80",
    ring: "hover:border-red-500/60",
    button: "from-red-700 to-amber-600 hover:from-red-600 hover:to-amber-500 border-red-400/50",
    bars: ["rgba(251,191,36,0.95)", "rgba(239,68,68,0.85)", "rgba(127,29,29,0.2)"],
    line: "rgba(254,240,138,0.98)",
    glow: "rgba(245,158,11,0.95)",
    idle: "rgba(239,68,68,0.3)"
  },
  arcane: {
    text: "text-purple-300",
    chip: "bg-purple-950/80 text-purple-200 border-purple-700/60",
    card: "from-purple-900/60 via-slate-950/90 to-slate-950 border-purple-400/80",
    ring: "hover:border-purple-500/60",
    button: "from-purple-700 to-fuchsia-600 hover:from-purple-600 hover:to-fuchsia-500 border-purple-400/50",
    bars: ["rgba(240,171,252,0.95)", "rgba(168,85,247,0.85)", "rgba(59,7,100,0.2)"],
    line: "rgba(250,232,255,0.98)",
    glow: "rgba(192,132,252,0.95)",
    idle: "rgba(168,85,247,0.3)"
  }
};

const pad = (n: number) => String(n).padStart(2, "0");
const clock = (ms: number) => `${pad(Math.floor(ms / 60000))}:${pad(Math.floor(ms / 1000) % 60)}`;

/**
 * The Codex's soundtrack radio: each civilization's three themes, played by the synthesized orchestra
 * (soundtrackEngine.ts) with a live spectrum and waveform in the civilization's colours.
 */
export function SoundtrackPlayer() {
  const st = useSyncExternalStore(soundtrack.subscribe, soundtrack.getState);
  const [filter, setFilter] = useState<CivilizationType | "all">("all");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timerRef = useRef<HTMLSpanElement>(null);

  const list = useMemo(() => (filter === "all" ? SOUNDTRACKS : SOUNDTRACKS.filter((t) => t.civ === filter)), [filter]);
  useEffect(() => soundtrack.setQueue(list.map((t) => t.id)), [list]);

  const track = soundtrack.track(st.trackId);
  const step = track.steps[st.step] ?? track.steps[0];
  const theme = THEME[track.civ];
  const civ = CIV_META[track.civ];
  const number = SOUNDTRACKS.indexOf(track) + 1;

  // Spectrum bars + waveform and the elapsed timer, drawn every frame straight to the canvas (no React state)
  const themeRef = useRef(theme);
  themeRef.current = theme;
  useEffect(() => {
    const canvas = canvasRef.current;
    const g = canvas?.getContext("2d");
    if (!canvas || !g) return;
    let raf = 0;
    let freq = new Uint8Array(0);
    let wave = new Uint8Array(0);
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const th = themeRef.current;
      const s = soundtrack.state;
      if (timerRef.current) timerRef.current.textContent = s.playing ? clock(performance.now() - s.startedAt) : "00:00";
      g.clearRect(0, 0, w, h);
      g.fillStyle = "rgba(2, 6, 23, 0.95)";
      g.fillRect(0, 0, w, h);
      const an = soundtrack.analyser;
      if (!an || !s.playing) {
        g.strokeStyle = th.idle;
        g.lineWidth = 2 * dpr;
        g.beginPath();
        g.moveTo(0, h / 2);
        g.lineTo(w, h / 2);
        g.stroke();
        return;
      }
      if (freq.length !== an.frequencyBinCount) {
        freq = new Uint8Array(an.frequencyBinCount);
        wave = new Uint8Array(an.frequencyBinCount);
      }
      an.getByteFrequencyData(freq);
      an.getByteTimeDomainData(wave);

      const bars = 56;
      const bw = w / bars;
      for (let i = 0; i < bars; i++) {
        // Bins spread on a curve: the orchestra lives low, so the low end gets most bars
        const bh = (freq[Math.floor(1 + Math.pow(i / bars, 1.8) * 150)] / 255) * h * 0.88;
        const y = h - bh;
        const grad = g.createLinearGradient(0, y, 0, h);
        grad.addColorStop(0, th.bars[0]);
        grad.addColorStop(0.4, th.bars[1]);
        grad.addColorStop(1, th.bars[2]);
        g.fillStyle = grad;
        g.fillRect(i * bw + 1.5 * dpr, y, bw - 3 * dpr, bh);
      }

      g.lineWidth = 2.4 * dpr;
      g.strokeStyle = th.line;
      g.shadowColor = th.glow;
      g.shadowBlur = 14;
      g.beginPath();
      const sw = w / wave.length;
      for (let i = 0; i < wave.length; i++) {
        const y = ((wave[i] / 128) * h) / 2;
        if (i === 0) g.moveTo(0, y);
        else g.lineTo(i * sw, y);
      }
      g.stroke();
      g.shadowBlur = 0;
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  const pick = (id: string) => {
    if (st.playing && st.trackId === id) soundtrack.stop();
    else soundtrack.start(id);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3">
      {/* The radio */}
      <div className="shrink-0 rounded-xl border border-slate-700 bg-black/80 p-3 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="relative flex w-2.5 h-2.5 shrink-0">
              {st.playing && <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping" />}
              <span className={`relative w-2.5 h-2.5 rounded-full ${st.playing ? "bg-emerald-400" : "bg-slate-600"}`} />
            </span>
            <span className={`font-bold uppercase tracking-wider ${st.playing ? "text-emerald-400" : "text-slate-400"}`}>{st.playing ? "Playing" : "Standby"}</span>
            <span className={`px-2 py-0.5 rounded border font-semibold truncate ${theme.chip}`}>
              {civ.icon} {civ.realm} · {track.title}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded border border-slate-800 bg-slate-900 text-slate-400 font-mono">
              {track.key} · {track.bpm} BPM
            </span>
            <span className="px-2 py-0.5 rounded border border-amber-600/40 bg-amber-950/50 text-amber-400 font-bold uppercase tracking-wider">
              {st.playing ? step.instrument : "Orchestra ready"}
            </span>
          </div>
        </div>

        <div className="relative">
          <canvas ref={canvasRef} className="block w-full h-16 sm:h-36 rounded-lg border border-slate-800" />
          <span ref={timerRef} className="absolute right-2 bottom-1.5 font-mono text-[11px] font-bold text-slate-300/90 tabular-nums">
            00:00
          </span>
        </div>

        <div className="mt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] font-mono">
          <span className={`font-bold shrink-0 ${theme.text}`}>
            Track {pad(number)} / {SOUNDTRACKS.length} · Measure {st.playing ? st.step + 1 : 0} of {track.steps.length}
          </span>
          <span className="italic text-slate-300 truncate">“{st.playing ? step.desc : track.summary}”</span>
        </div>
      </div>

      {/* Transport and mix */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => soundtrack.skip(-1)} title="Previous track" className="flex items-center justify-center w-9 h-9 rounded-lg border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 active:scale-95 transition">
            <SkipBack className="w-4 h-4" />
          </button>
          <button
            onClick={() => soundtrack.toggle()}
            className={`flex items-center gap-2 px-4 h-9 rounded-lg border bg-gradient-to-r font-medieval font-bold text-sm text-white shadow-lg active:scale-95 transition ${
              st.playing ? "from-emerald-700 to-emerald-500 border-emerald-400/50" : theme.button
            }`}
          >
            {st.playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {st.playing ? "Pause" : "Play"}
          </button>
          <button onClick={() => soundtrack.skip(1)} title="Next track" className="flex items-center justify-center w-9 h-9 rounded-lg border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 active:scale-95 transition">
            <SkipForward className="w-4 h-4" />
          </button>
          <button
            onClick={() => soundtrack.setMode(st.mode === "loop" ? "album" : "loop")}
            title={st.mode === "loop" ? "Repeats this track" : "Plays on through the list below"}
            className={`flex items-center gap-1.5 px-3 h-9 rounded-lg border text-xs font-semibold active:scale-95 transition ${
              st.mode === "loop" ? "border-amber-700/50 bg-amber-950/40 text-amber-300" : "border-emerald-600/50 bg-emerald-950/50 text-emerald-300"
            }`}
          >
            {st.mode === "loop" ? <Repeat1 className="w-3.5 h-3.5" /> : <Repeat className="w-3.5 h-3.5" />}
            {st.mode === "loop" ? "Repeat track" : "Play on"}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-[11px]">
          {(
            [
              ["Volume", st.volume, (v: number) => soundtrack.setVolume(v)],
              ["Hall echo", st.reverb, (v: number) => soundtrack.setReverb(v)]
            ] as const
          ).map(([label, value, set]) => (
            <label key={label} className="flex flex-col gap-0.5">
              <span className="flex justify-between text-slate-400">
                {label} <span className="font-mono font-bold text-amber-300">{Math.round(value * 100)}%</span>
              </span>
              <input type="range" min={0} max={100} value={Math.round(value * 100)} onChange={(e) => set(Number(e.target.value) / 100)} className="w-28 accent-amber-500" />
            </label>
          ))}
        </div>
      </div>

      {/* Civilization filter */}
      <div className="shrink-0 flex gap-1 overflow-x-auto pb-0.5">
        {(["all", ...CIVS] as const).map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={`shrink-0 flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-[11px] font-semibold border transition ${
              filter === c ? "bg-amber-900/60 border-amber-500/60 text-amber-200" : "bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200"
            }`}
          >
            {c === "all" ? "🎼 All realms" : `${CIV_META[c].icon} ${CIV_META[c].realm}`}
          </button>
        ))}
      </div>

      {/* Tracks, by civilization: the only part that scrolls (the body takes over only below its minimum height) */}
      <div className="flex-1 min-h-[10rem] flex flex-col gap-3 overflow-y-auto overscroll-contain pr-1 pb-3">
        {CIVS.filter((c) => filter === "all" || filter === c).map((c) => (
          <section key={c}>
            <h4 className={`font-medieval text-sm font-bold mb-1.5 ${THEME[c].text}`}>
              {CIV_META[c].icon} {CIV_META[c].realm} <span className="text-[11px] text-slate-500 font-sans font-normal">· {CIV_META[c].label}</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {SOUNDTRACKS.filter((t) => t.civ === c).map((t) => {
                const active = t.id === st.trackId;
                const playing = active && st.playing;
                return (
                  <button
                    key={t.id}
                    onClick={() => pick(t.id)}
                    className={`text-left flex flex-col justify-between gap-1.5 p-2.5 rounded-xl border-2 transition active:scale-[0.98] ${
                      active ? `bg-gradient-to-br shadow-lg ${THEME[c].card}` : `bg-slate-900/70 border-slate-800 ${THEME[c].ring}`
                    }`}
                  >
                    <span className="flex items-center justify-between gap-1.5">
                      <span className={`font-medieval font-bold text-sm truncate ${active ? "text-amber-200" : "text-slate-200"}`}>
                        {pad(SOUNDTRACKS.indexOf(t) + 1)}. {t.title}
                      </span>
                      <span
                        className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded font-mono font-bold border ${
                          playing ? "bg-emerald-500/20 text-emerald-300 border-emerald-400/50" : active ? "bg-amber-500/20 text-amber-300 border-amber-400/50" : "bg-slate-800 text-slate-400 border-transparent"
                        }`}
                      >
                        {playing ? "PLAYING" : active ? "READY" : "PLAY"}
                      </span>
                    </span>
                    <span className="text-[11px] text-slate-300 leading-snug line-clamp-2">{t.summary}</span>
                    <span className="flex items-center justify-between text-[10px] font-mono pt-1 border-t border-slate-800/80 text-slate-400">
                      <span>▶ {t.mood}</span>
                      <span className="text-amber-400/80">
                        {t.key} · {t.bpm} BPM
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
