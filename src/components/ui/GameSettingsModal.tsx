import { ReactNode, useState } from "react";
import { Settings, Volume2, VolumeX, MonitorSmartphone, Sparkles, Mountain, Waves, Scan } from "lucide-react";
import { Modal } from "./Modal";
import { sound } from "@/hooks/useSound";
import { loadHdModels } from "@/components/3d/world/hdModelsLoader";
import { graphics, useGraphics, GraphicsQuality } from "@/utils/graphics";

/*
 * Game Settings (☰ menu): sound on/off, Graphics 1 – Normal / Graphics 2 – HD, and HD's own switches (the textured
 * ground with swaying grass). Graphics choices are saved in this browser (utils/graphics.ts).
 */

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative shrink-0 w-11 h-6 rounded-full border transition ${on ? "bg-emerald-500/80 border-emerald-400" : "bg-slate-700 border-slate-600"}`}
    >
      <span className={`absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white shadow transition-all ${on ? "left-5.5" : "left-0.5"}`} />
    </button>
  );
}

function Row({ icon, title, hint, children }: { icon: ReactNode; title: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <span className="shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-slate-100">{title}</div>
        <div className="text-[11px] text-slate-400">{hint}</div>
      </div>
      {children}
    </div>
  );
}

const QUALITIES: Array<{ id: GraphicsQuality; label: string; hint: string }> = [
  { id: "normal", label: "1 · Normal", hint: "Runs smoothly on any laptop" },
  { id: "hd", label: "2 · HD", hint: "Bloom, reflections, richer effects and detailed ground" }
];

export function GameSettingsModal({ onClose }: { onClose: () => void }) {
  const g = useGraphics();
  const [soundOn, setSoundOn] = useState(sound.enabled);
  // Changing graphics recompiles the realm's materials (a second or two of stutter): say so first, switch once painted
  const [applying, setApplying] = useState(false);
  // `ready` is what must arrive first (HD's hero models are fetched while the notice is up)
  const apply = (change: () => void, ready?: Promise<unknown>) => {
    if (applying) return;
    sound.playClick();
    setApplying(true);
    const painted = new Promise((resolve) => setTimeout(resolve, 60));
    Promise.all([painted, ready?.catch(() => {})]).then(() => {
      change();
      setTimeout(() => setApplying(false), 300);
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      header={
        <div className="flex items-center gap-3">
          <Settings className="w-6 h-6 text-amber-300" />
          <div>
            <h2 className="font-medieval text-lg text-amber-200 leading-tight">Game Settings</h2>
            <p className="text-[11px] text-slate-400">Saved in this browser</p>
          </div>
        </div>
      }
    >
      <div className="px-5 py-2 text-sm divide-y divide-slate-800">
        <Row
          icon={soundOn ? <Volume2 className="w-5 h-5 text-emerald-400" /> : <VolumeX className="w-5 h-5 text-slate-500" />}
          title="Sound"
          hint="Clicks, battle cues and the realm's sounds"
        >
          <Toggle
            on={soundOn}
            label="Sound"
            onChange={() => {
              const next = sound.toggle();
              setSoundOn(next);
              if (next) sound.playClick();
            }}
          />
        </Row>

        <div className="py-3 space-y-2">
          <div className="flex items-center gap-3">
            {g.quality === "hd" ? <Sparkles className="w-5 h-5 text-amber-300" /> : <MonitorSmartphone className="w-5 h-5 text-slate-400" />}
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-slate-100">Graphics</div>
              <div className="text-[11px] text-slate-400">{applying ? "Applying graphics…" : QUALITIES.find((q) => q.id === g.quality)?.hint}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Graphics">
            {QUALITIES.map((q) => {
              const on = g.quality === q.id;
              return (
                <button
                  key={q.id}
                  role="radio"
                  aria-checked={on}
                  disabled={applying}
                  onClick={() => !on && apply(() => graphics.setQuality(q.id), q.id === "hd" ? loadHdModels() : undefined)}
                  className={`rounded-lg border px-3 py-2 text-left transition ${on ? "border-amber-400 bg-amber-500/15 text-amber-100" : "border-slate-700 bg-slate-800/60 text-slate-300 hover:bg-slate-800"}`}
                >
                  <div className="font-semibold">{q.label}</div>
                </button>
              );
            })}
          </div>

          {g.quality === "hd" && (
            <div className="ml-2 pl-3 border-l border-slate-700">
              <Row icon={<Mountain className="w-5 h-5 text-emerald-300" />} title="HD terrain" hint="Textured ground up close and grass swaying in the wind">
                <Toggle on={g.features.terrain} label="HD terrain" onChange={(on) => apply(() => graphics.setFeature("terrain", on))} />
              </Row>
              <Row icon={<Waves className="w-5 h-5 text-sky-300" />} title="HD water" hint="Waves that catch the sun, clear shallows and lacy foam">
                <Toggle on={g.features.water} label="HD water" onChange={(on) => apply(() => graphics.setFeature("water", on))} />
              </Row>
              <Row icon={<Scan className="w-5 h-5 text-violet-300" />} title="Antialiasing" hint="Smooth, crisp edges on every model; the heaviest HD setting (slower on laptops)">
                <Toggle on={g.features.antialias} label="Antialiasing" onChange={(on) => apply(() => graphics.setFeature("antialias", on))} />
              </Row>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
