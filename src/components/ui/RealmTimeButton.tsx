import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CivilizationType, type DayPhase, type SeasonKey } from "@/types";
import { sound } from "@/hooks/useSound";
import { CIV_EMBLEM } from "@/utils/war";
import { DAY_PART_EFFECTS, DAY_PHASES, GEM_TILT, SEASONS, SEASON_MODS, SEASON_SUN, hhmm, realmHourAtSun, useRealmClock } from "@/utils/realmTime";
import { Modal } from "./Modal";

/*
 * ☀️ / 🌙 Day & season (GAME_GUIDE §7 *Day, night & seasons*): a top-bar button showing whether this harvest window is
 * day or night and the countdown to the next harvest (it is the harvest clock), framed in the season's colour. It opens a panel with the
 * whole realm day on one bar (the season's sunrise and sunset over the harvest windows), what the day part and the
 * season do, which civilization flourishes and which struggles.
 */

const CIV_NAME: Record<CivilizationType, string> = { human: "Humans", elf: "Elves", dwarf: "Dwarves", orc: "Orcs", arcane: "Nethergarde" };
const GEM_NAME: Record<string, string> = {
  ruby: "🔴 Blood Ruby",
  obsidian: "🌌 Volcanic Obsidian",
  dragon_scale: "🐉 Molten Dragon Scale",
  mana: "🔮 Arcane Mana",
  aether: "⚡ Aether Shard",
  sapphire: "🔷 Tide Sapphire"
};
/** Each part of the day on the 24-hour bar */
const PHASE_TINT: Record<DayPhase, string> = {
  dawn: "#9d4b7a",
  morning: "#b7803a",
  midday: "#3b82c4",
  afternoon: "#b9772c",
  dusk: "#6d3f86",
  nightfall: "#2e2b6b",
  midnight: "#111632",
  small_hours: "#25275a"
};
const daylight = (k: SeasonKey) => SEASON_SUN[k].set - SEASON_SUN[k].rise;
/** Where a realm hour sits on the 24-hour bar, which starts with the day window at 05:00 (0…24) */
const barX = (h: number) => (((h - 5) % 24) + 24) % 24;

/** The parts of the day on the bar this season: each from its start to the next one's, split where it wraps */
function barSegments(season: SeasonKey) {
  const out: Array<{ key: string; phase: (typeof DAY_PHASES)[number]; from: number; to: number; start: number; end: number }> = [];
  for (const p of DAY_PHASES) {
    const start = realmHourAtSun(p.from, season);
    const end = realmHourAtSun(p.to, season);
    const a = barX(start);
    const b = a + ((end - start + 24) % 24);
    if (b <= 24) out.push({ key: p.key, phase: p, from: a, to: b, start, end });
    else out.push({ key: `${p.key}-a`, phase: p, from: a, to: 24, start, end }, { key: `${p.key}-b`, phase: p, from: 0, to: b - 24, start, end });
  }
  return out;
}

/**
 * The whole realm day on one bar, 05:00 → 05:00: the day and night harvest windows underneath (they never move), the
 * parts of the day over them as this season's sunrise and sunset lay them out, and where the clock is now
 */
function DayBar({ season, hour }: { season: SeasonKey; hour: number }) {
  const { rise, set } = SEASON_SUN[season];
  const pos = (x: number) => `${(x / 24) * 100}%`;
  return (
    <div className="space-y-1">
      <div className="relative h-8 rounded-lg overflow-hidden border border-slate-700 bg-slate-900">
        {barSegments(season).map((s) => (
          <div
            key={s.key}
            className="absolute top-0 bottom-0 flex items-center justify-center text-[11px] border-r border-slate-950/40 overflow-hidden"
            style={{ left: pos(s.from), width: pos(s.to - s.from), background: PHASE_TINT[s.phase.key] }}
            title={`${s.phase.emblem} ${s.phase.name} · ${hhmm(s.start)}–${hhmm(s.end)}`}
          >
            {s.to - s.from >= 1.2 && s.phase.emblem}
          </div>
        ))}
        {/* Sunrise and sunset */}
        {[rise, set].map((h) => (
          <div key={h} className="absolute top-0 bottom-0 w-px bg-amber-200/70" style={{ left: pos(barX(h)) }} aria-hidden />
        ))}
        <div className="absolute top-0 bottom-0 w-0.5 -ml-px bg-amber-300 shadow-[0_0_6px_#fcd34d]" style={{ left: pos(barX(hour)) }} title={`Now: ${hhmm(hour)}`} />
      </div>
      {/* The harvest windows: day 05:00 → 19:00, night 19:00 → 05:00 */}
      <div className="relative h-4 text-[10px] font-semibold">
        <div className="absolute top-0 bottom-0 flex items-center justify-center rounded bg-amber-500/15 text-amber-300 border border-amber-500/30" style={{ left: 0, width: pos(14) }}>
          ☀️ Day harvest
        </div>
        <div className="absolute top-0 bottom-0 flex items-center justify-center rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30" style={{ left: pos(14), width: pos(10) }}>
          🌙 Night harvest
        </div>
      </div>
      <div className="relative h-3.5 text-[10px] font-mono tabular-nums text-slate-500">
        {[5, 11, 17, 23].map((h) => (
          <span key={h} className="absolute -translate-x-1/2 first:translate-x-0" style={{ left: pos(barX(h)) }}>
            {hhmm(h)}
          </span>
        ))}
      </div>
    </div>
  );
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Ticks once a second while mounted (countdowns) */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function Countdown({ to }: { to: number }) {
  const now = useNow();
  return <>{to > now ? mmss(to - now) : "now"}</>;
}

/** How far the harvest window has run: a thin line along the bottom of the button */
function WindowProgress({ endsAt, lengthMs, color }: { endsAt: number; lengthMs: number; color: string }) {
  const now = useNow();
  const frac = Math.min(1, Math.max(0, 1 - (endsAt - now) / lengthMs));
  return (
    <span className="absolute left-1.5 right-1.5 bottom-0.5 h-0.5 rounded-full bg-slate-700/60 overflow-hidden" aria-hidden>
      <span className="block h-full rounded-full" style={{ width: `${frac * 100}%`, background: color, transition: "width 1s linear" }} />
    </span>
  );
}

export function RealmTimeButton({ myCiv }: { myCiv?: CivilizationType | null }) {
  const clock = useRealmClock();
  const [open, setOpen] = useState(false);
  const { season, phase, part } = clock;
  const mine = myCiv === season.buffed ? "up" : myCiv === season.debuffed ? "down" : null;
  const turnsTo = part === "day" ? "night" : "day";

  return (
    <>
      <button
        onClick={() => {
          sound.playClick();
          setOpen(true);
        }}
        className="relative flex items-center gap-1.5 h-9 px-2 rounded-xl border-2 bg-slate-900/80 hover:bg-slate-800 text-[11px] font-semibold text-slate-200 transition cursor-pointer"
        style={{ borderColor: season.color, boxShadow: `0 0 10px -4px ${season.color}` }}
        title={`Next harvest in the countdown: it pays as ${part === "day" ? "a day" : "a night"} harvest, then ${turnsTo} begins. ${phase.emblem} ${phase.name} · ${season.emblem} ${season.name}: tap for the harvest, the season's buffs and debuffs`}
        aria-label={`${part === "day" ? "Day" : "Night"}, ${season.name}: open the day and season panel`}
      >
        <span className="text-sm leading-none">{phase.emblem}</span>
        <span className="hidden 2xl:inline">{part === "day" ? "Day" : "Night"}</span>
        <span className="font-mono font-bold tabular-nums text-slate-300">
          <Countdown to={clock.windowEndsAt} />
        </span>
        <WindowProgress endsAt={clock.windowEndsAt} lengthMs={clock.windowMs} color={part === "day" ? "#fbbf24" : "#818cf8"} />
        {/* The season: a badge on the frame */}
        <span className="absolute -top-1.5 -right-1.5 text-[10px] leading-none rounded-full bg-slate-950 px-0.5" aria-hidden>
          {season.emblem}
        </span>
        {mine && (
          <span className={`absolute -bottom-1.5 -right-1 text-[9px] leading-none font-bold ${mine === "up" ? "text-emerald-400" : "text-rose-400"}`} aria-hidden>
            {mine === "up" ? "▲" : "▼"}
          </span>
        )}
      </button>
      {open && createPortal(<RealmTimeModal myCiv={myCiv} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function RealmTimeModal({ myCiv, onClose }: { myCiv?: CivilizationType | null; onClose: () => void }) {
  const clock = useRealmClock();
  const now = useNow();
  const { season, phase, part } = clock;
  const effects = DAY_PART_EFFECTS[part];
  const next = DAY_PART_EFFECTS[part === "day" ? "night" : "day"];
  const daysLeft = Math.max(0, Math.ceil((clock.seasonEndsAt - now) / 86_400_000));
  const seasonIndex = SEASONS.findIndex((s) => s.key === season.key);
  const nextSeason = SEASONS[(seasonIndex + 1) % SEASONS.length];
  const sun = SEASON_SUN[season.key];
  const nightHours = 24 - daylight(season.key);

  const civRow = (civ: CivilizationType, kind: "up" | "down" | "even") => (
    <div
      key={civ}
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
        kind === "up" ? "border-emerald-600/50 bg-emerald-950/40" : kind === "down" ? "border-rose-600/50 bg-rose-950/40" : "border-slate-700/70 bg-slate-800/40"
      } ${civ === myCiv ? "ring-2 ring-amber-400/70" : ""}`}
    >
      <span className="text-base">{CIV_EMBLEM[civ]}</span>
      <span className="font-semibold text-slate-100">{CIV_NAME[civ]}</span>
      {civ === myCiv && <span className="text-[10px] px-1.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">You</span>}
      <span className={`ml-auto text-right ${kind === "up" ? "text-emerald-300" : kind === "down" ? "text-rose-300" : "text-slate-400"}`}>
        {kind === "even"
          ? civ === "arcane"
            ? "Outside the seasons"
            : "No change"
          : `${kind === "up" ? "+" : "−"}${pct(SEASON_MODS.harvest)} harvest · ${kind === "up" ? "+" : "−"}${pct(SEASON_MODS.births)} births · ${kind === "up" ? "+" : "−"}${pct(SEASON_MODS.march)} march speed`}
      </span>
    </div>
  );
  const others = (["human", "elf", "dwarf", "orc"] as CivilizationType[]).filter((c) => c !== season.buffed && c !== season.debuffed);

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      accentBorder="border-amber-500/40"
      headerClassName="bg-linear-to-r from-slate-950 via-slate-900 to-slate-950"
      header={
        <div className="flex items-center gap-3">
          <span className="text-3xl leading-none">{phase.emblem}</span>
          <div className="min-w-0">
            <h2 className="font-medieval text-lg text-amber-200 leading-tight">
              {part === "day" ? "Day" : "Night"} in the realm · {season.emblem} {season.name}
            </h2>
            <p className="text-[11px] text-slate-400">
              {phase.name} · turns to {next.name.toLowerCase()} at the next harvest in{" "}
              <span className="font-mono tabular-nums text-slate-200">{mmss(clock.windowEndsAt - now)}</span>
            </p>
          </div>
        </div>
      }
    >
      <div className="p-4 sm:p-5 space-y-5 text-sm" style={{ borderTop: `3px solid ${season.color}` }}>
        {/* Day and night */}
        <section className="space-y-2">
          <h3 className="text-[11px] uppercase tracking-wider font-bold text-slate-400">This harvest</h3>
          <DayBar season={season.key} hour={clock.hour} />
          <p className="text-xs text-slate-300">
            {season.emblem} {season.name}: sunrise <span className="font-mono tabular-nums">{hhmm(sun.rise)}</span>, sunset{" "}
            <span className="font-mono tabular-nums">{hhmm(sun.set)}</span> · {daylight(season.key)} h of daylight, {nightHours} h of dark.{" "}
            <span className="text-slate-400">
              {sun.rise < 5
                ? "The summer light lingers into the night harvest: dusk comes late and dawn early."
                : sun.rise > 5
                  ? "The winter dark reaches into the day harvest: the sun rises late and sets early."
                  : "Sunrise and sunset fall on the harvests."}
            </span>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(["day", "night"] as const).map((k) => {
              const e = DAY_PART_EFFECTS[k];
              const active = k === part;
              return (
                <div key={k} className={`rounded-lg border px-3 py-2 ${active ? "border-amber-400/70 bg-amber-950/30" : "border-slate-700/70 bg-slate-800/30 opacity-75"}`}>
                  <div className="flex items-center gap-1.5 font-semibold text-slate-100">
                    {e.emblem} {e.name} harvest {active ? <span className="ml-auto text-[10px] text-amber-300">NOW</span> : <span className="ml-auto text-[10px] text-slate-400">NEXT</span>}
                  </div>
                  <ul className="mt-1 text-xs text-slate-300 space-y-0.5">
                    <li>Harvest {e.harvest === 1 ? "in full" : `×${e.harvest}`} (pool share, buildings, workforce)</li>
                    <li>Gem drop pool {e.scarcePool === 1 ? "as usual" : `×${e.scarcePool}`}</li>
                    <li>
                      {GEM_TILT}× as likely: {e.favoured.map((g) => GEM_NAME[g] ?? g).join(", ")}
                    </li>
                  </ul>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-500">
            Day and night take turns with every harvest: one harvest is day, the next is night, whatever the season. The season moves only the sun.
          </p>
        </section>

        {/* The season */}
        <section className="space-y-2">
          <h3 className="text-[11px] uppercase tracking-wider font-bold text-slate-400">
            {season.emblem} {season.name} — the Season of {season.title}
          </h3>
          <p className="text-xs text-slate-300 italic">{season.story}</p>
          <p className="text-xs text-slate-400">
            {season.weather} Ends in {daysLeft} day{daysLeft === 1 ? "" : "s"} (Sunday 00:00 UTC); {nextSeason.emblem} {nextSeason.name} follows.
          </p>
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold text-emerald-400">▲ Flourish</div>
            {civRow(season.buffed, "up")}
            <div className="text-[11px] font-bold text-rose-400 pt-1">▼ Struggle</div>
            {civRow(season.debuffed, "down")}
            <div className="text-[11px] font-bold text-slate-400 pt-1">Unchanged</div>
            {others.map((c) => civRow(c, "even"))}
            {civRow("arcane", "even")}
          </div>
          <p className="text-[11px] text-slate-500">Seasons never change combat stats.</p>
        </section>

        {/* The year */}
        <section className="space-y-2">
          <h3 className="text-[11px] uppercase tracking-wider font-bold text-slate-400">The four seasons</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {SEASONS.map((s) => (
              <div key={s.key} className="rounded-lg border-2 px-2 py-1.5 text-xs bg-slate-800/40" style={{ borderColor: s.key === season.key ? s.color : "rgb(51 65 85 / 0.6)" }}>
                <div className="font-semibold text-slate-100">
                  {s.emblem} {s.name}
                </div>
                <div className="text-emerald-300">▲ {CIV_NAME[s.buffed]}</div>
                <div className="text-rose-300">▼ {CIV_NAME[s.debuffed]}</div>
                <div className="text-slate-400 font-mono tabular-nums text-[10px]">
                  ☀️ {hhmm(SEASON_SUN[s.key].rise)}–{hhmm(SEASON_SUN[s.key].set)}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </Modal>
  );
}
