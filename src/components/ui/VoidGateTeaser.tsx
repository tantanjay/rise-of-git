import { useEffect, useMemo, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import { Crown, Gem, Hourglass, Layers, Skull, Sparkles, X } from "lucide-react";
import { sound } from "@/hooks/useSound";
import { useHd } from "@/utils/graphics";
import { VOID_GATE_TEASER } from "@/utils/voidGate";
import { VOID_GATE_TYPE } from "@/components/3d/world/VoidGate";
import { ModelViewer, type Preview } from "./CodexPreview";

/*
 * 🌀 The Void Gate's teaser (GAME_GUIDE §10 *The Void Gate*): the gate already stands in the Voidrift, south of the Core,
 * and clicking it opens this window, built like Xal'Vorath's event window: the gate itself live in the header in the
 * viewer's graphics quality, embers rising, a slammed title and a glowing *Coming Soon*, then a taste of what waits behind
 * it. Nothing here can be played yet. Lazy, because it brings the Codex's model viewer.
 */

/** Fixed spots for the embers: [left %, delay s, seconds] */
const EMBERS = [
  [5, 0.3, 3.4], [12, 1.5, 2.8], [21, 0.8, 3.7], [29, 2.1, 3.1], [38, 0.1, 3.5], [46, 1.1, 2.9], [55, 2.4, 3.3], [63, 0.6, 3.8], [71, 1.8, 2.7], [80, 0.4, 3.2], [88, 2.2, 3.6], [95, 1.3, 3]
] as const;

const GLOW = "#a855f7";

function Tease({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="p-3 rounded-xl border border-violet-800/50 bg-slate-950/60">
      <div className="flex items-center gap-2 font-medieval text-sm text-violet-100">
        {icon}
        {title}
      </div>
      <p className="mt-1 text-xs text-slate-400 leading-relaxed">{children}</p>
    </div>
  );
}

export function VoidGateTeaser({ onClose }: { onClose: () => void }) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  const hd = useHd("models");
  const preview = useMemo<Preview>(() => ({ kind: "npc", type: VOID_GATE_TYPE, rarity: "mythical", scaled: false, boss: false, hd }), [hd]);
  const titleStyle: CSSProperties = {
    backgroundImage: "linear-gradient(0deg, #3b0764 0%, #7e22ce 30%, #c084fc 62%, #faf5ff 94%)",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
    filter: `drop-shadow(0 0 22px ${GLOW})`
  };
  const { levels, bossEvery, opensAtCityHall } = VOID_GATE_TEASER;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/85 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 pointer-events-none hv-vignette" style={{ background: `radial-gradient(70% 70% at 50% 45%, transparent 40%, ${GLOW}55 100%)` }} aria-hidden />
      <div
        role="dialog"
        aria-modal
        aria-labelledby="void-gate-title"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:max-w-3xl h-dvh sm:h-[min(48rem,94vh)] flex flex-col overflow-hidden bg-[#05030c] sm:rounded-2xl border-0 sm:border text-slate-200"
        style={{ borderColor: `${GLOW}aa`, boxShadow: `0 0 0 1px ${GLOW}44, 0 0 90px ${GLOW}77, 0 30px 90px rgba(0,0,0,0.8)` }}
      >
        <button type="button" onClick={onClose} aria-label="Close" className="absolute top-3 right-3 z-20 w-9 h-9 rounded-full bg-black/50 border border-white/15 flex items-center justify-center text-slate-300 hover:text-white">
          <X className="w-4 h-4" />
        </button>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* The gate itself */}
          <div className="relative h-[20rem] sm:h-[26rem] overflow-hidden">
            <div className="absolute inset-0">
              <ModelViewer preview={preview} civ="arcane" view="world" prestige={0} />
            </div>
            <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(180deg, #05030ccc 0%, transparent 22%, transparent 50%, #05030cf2 86%, #05030c 100%)" }} aria-hidden />
            <div className="absolute left-1/2 top-[42%] w-64 h-64 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none wn-shockwave" style={{ border: `2px solid ${GLOW}` }} aria-hidden />
            {EMBERS.map(([left, delay, secs], i) => (
              <span
                key={i}
                className="absolute w-1.5 h-1.5 rounded-full pointer-events-none wn-ember"
                style={{ left: `${left}%`, top: "100%", background: i % 3 ? "#e9d5ff" : "#f0abfc", boxShadow: `0 0 10px 3px ${GLOW}`, animationDelay: `${delay}s`, animationDuration: `${secs}s` }}
                aria-hidden
              />
            ))}

            <div className="absolute inset-x-0 top-0 pt-4 px-12 text-center pointer-events-none">
              <div className="text-[10px] sm:text-xs uppercase tracking-[0.14em] sm:tracking-[0.3em] whitespace-nowrap font-bold text-violet-200/90">The Nethergarde Voidrift · Mythic</div>
            </div>

            <div className="absolute inset-x-0 bottom-0 px-5 pb-3 text-center pointer-events-none">
              <h2 id="void-gate-title" className="whatsnew-title wn-enter-slam font-medieval text-5xl sm:text-7xl leading-none tracking-wide" style={titleStyle}>
                The Void Gate
              </h2>
              <p className="mt-1.5 text-sm sm:text-base font-semibold text-violet-100">A wound in the world has opened south of the Core</p>
              <div className="mt-2.5 inline-flex items-center gap-2 px-4 py-1.5 rounded-full border bg-black/60 animate-pulse" style={{ borderColor: `${GLOW}cc`, boxShadow: `0 0 24px ${GLOW}88` }}>
                <Hourglass className="w-4 h-4 text-violet-300" />
                <span className="font-medieval text-base sm:text-lg font-bold tracking-[0.2em] uppercase text-white">Coming Soon</span>
              </div>
            </div>
          </div>

          <div className="px-4 sm:px-7 py-5 space-y-5">
            <div className="p-4 rounded-xl border border-violet-500/60 bg-violet-950/30">
              <div className="font-medieval text-lg sm:text-xl text-violet-100">Something is climbing out</div>
              <p className="mt-1 text-sm text-slate-300 leading-relaxed">
                The broken arch of obsidian hums day and night, and the vortex inside it turns wilder every hour. The Voidrift's scouts swear they hear stone grinding on stone beneath it, and wings, and a voice counting. The gate will open soon. Until then, no army can pass it.
              </p>
            </div>

            <section className="space-y-2">
              <h3 className="text-[10px] uppercase tracking-[0.25em] font-bold text-violet-300/80">What waits behind it</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                <Tease icon={<Layers className="w-4 h-4 text-violet-300" />} title={`${levels} levels down`}>
                  A climb into the void, one level at a time. Every ruler climbs from their own level, and the climb is never lost.
                </Tease>
                <Tease icon={<Skull className="w-4 h-4 text-rose-400" />} title={`A boss every ${bossEvery}th level`}>
                  Each stage has a brood of void creatures that grows as you descend, and a mother of the brood waiting at its end.
                </Tease>
                <Tease icon={<Crown className="w-4 h-4 text-amber-300" />} title="The Gate Warden">
                  At the very bottom stands the gate's keeper, and two void koi circle him. Beat him, and they may follow you home.
                </Tease>
                <Tease icon={<Gem className="w-4 h-4 text-fuchsia-300" />} title="Spoils of the deep">
                  Gold, resources and scarce gems for every level beaten, with a chance at Armory parts. The bosses pay the most.
                </Tease>
              </div>
            </section>

            <div className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-800 bg-slate-950/60">
              <Sparkles className="w-4 h-4 text-violet-300 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-400 leading-relaxed">
                Get ready: the gate will let in rulers from City Hall {opensAtCityHall}, any civilization. Grow your armies, fill your march slots and forge your sets.
              </p>
            </div>
          </div>
        </div>

        <div className="shrink-0 flex items-center justify-end gap-2 px-4 sm:px-7 py-3 border-t border-white/10 bg-black/40">
          <button
            type="button"
            onClick={() => {
              sound.playClick();
              onClose();
            }}
            className="inline-flex items-center gap-2 px-5 h-10 rounded-lg text-sm font-bold text-white bg-linear-to-r from-violet-700 to-fuchsia-500 hover:brightness-110 transition"
            style={{ boxShadow: `0 0 22px ${GLOW}99` }}
          >
            I'll be ready
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default VoidGateTeaser;
