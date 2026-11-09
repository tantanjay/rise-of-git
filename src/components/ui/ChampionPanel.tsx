import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { Crown, Lock, Hourglass, Dices, GraduationCap, ScrollText } from "lucide-react";
import { API_BASE } from "@/config";
import type { ChampionView, DeveloperKingdom } from "@/types";
import { CHAMPION_ART_SHARE, CHAMPION_SLOTS, CHAMPION_TARGET_SHARE, DAILY_RENOWN, championModelType } from "@/utils/champion";
import type { BossActionId } from "@/components/3d/world/heroRig";

/** The 3D preview pane (the Royal Codex's), fetched only when a champion's portrait is first shown */
const ModelViewer = lazy(() => import("./CodexPreview").then((m) => ({ default: m.ModelViewer })));

const PORTRAIT_ACTIONS: Array<{ id: BossActionId; label: string }> = [
  { id: "idle", label: "Idle" },
  { id: "walk", label: "March" },
  { id: "roar", label: "Battle cry" },
  { id: "attack", label: "Strike" }
];

/** 🦸 The champion as it looks, in high graphics (its rolled look in its civilization's parts), with its actions */
export function ChampionPortrait({ champion }: { champion: ChampionView }) {
  const [action, setAction] = useState<BossActionId>("idle");
  const type = championModelType(champion.civ, champion.looks);
  return (
    <div className="relative h-72 sm:h-80 rounded-xl overflow-hidden border border-amber-600/40 bg-slate-950">
      <Suspense fallback={<div className="absolute inset-0 flex items-center justify-center text-[11px] text-slate-500">Summoning your champion…</div>}>
        <ModelViewer preview={{ kind: "boss_hd", type, action }} civ={champion.civ} view="world" prestige={0} />
      </Suspense>
      <div className="absolute left-2 top-2 right-2 flex flex-wrap justify-end gap-1">
        {PORTRAIT_ACTIONS.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setAction(a.id)}
            className={`px-2 h-7 rounded-md text-[11px] font-semibold border transition ${action === a.id ? "bg-amber-900/80 border-amber-500/60 text-amber-200" : "bg-slate-900/80 border-slate-700 text-slate-300 hover:text-slate-100"}`}
          >
            {a.label}
          </button>
        ))}
      </div>
      <div className="absolute left-2 bottom-2 text-[10px] text-slate-400 bg-slate-950/70 rounded px-1.5 py-0.5">Drag to turn · scroll to zoom</div>
    </div>
  );
}
import { sound } from "@/hooks/useSound";
import { Combobox } from "./Combobox";
import { costLine } from "./ArmoryPanel";

/** The signed-in ruler's champion (GET /champion), and a way to refresh it */
export function useChampion(enabled: boolean) {
  const [champion, setChampion] = useState<ChampionView | null>(null);
  const reload = useCallback(() => {
    if (!enabled) return Promise.resolve();
    return fetch(`${API_BASE}/champion`)
      .then((r) => (r.ok ? r.json() : null))
      .then((v: ChampionView | null) => setChampion(v))
      .catch(() => undefined);
  }, [enabled]);
  useEffect(() => {
    if (!enabled) {
      setChampion(null);
      return;
    }
    void reload();
  }, [enabled, reload]);
  return { champion, reload, setChampion };
}

async function championAction(path: string, body?: unknown): Promise<{ success: boolean; error?: string; champion?: ChampionView }> {
  try {
    const res = await fetch(`${API_BASE}/champion/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, error: data.error || "Failed" };
    sound.playLevelUp();
    return { success: true, champion: data.champion };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

/** How each Renown ledger reason reads */
const REASON_TEXT: Record<string, string> = {
  battle_damage: "Rounds fought",
  battle_kills: "Enemies slain",
  battle_win: "Victory",
  boss_felled: "World boss felled",
  realm_felled: "Realm felled",
  finale_kill: "Finale broke an army",
  daily_diminish: "Renown thins (daily)",
  admin_adjust: "Royal adjustment",
  capped_by_city_hall: "Banked at the City Hall's cap"
};

/** "3h", "2h 40m", "35m" */
const hoursText = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(m / 60);
  return h ? `${h}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`;
};

const SLOT_LABEL: Record<string, string> = { head: "Head", face: "Face", body: "Body", armour: "Armour", cloak: "Cloak", weapon: "Weapon", aura: "Aura", mark: "Mark" };

/**
 * 🦸 Kingdom → Champion tab (with `portrait`, the 3D model above it): who it is, where it is, its level and Renown, the bonus and the kit it
 * brings the march it leads, healing, re-rolling its looks, retraining an Art, and its Renown ledger
 */
export function ChampionPanel({ kingdom, onOpenCodex, portrait = false }: { kingdom: DeveloperKingdom; onOpenCodex?: () => void; portrait?: boolean }) {
  const { champion: c, setChampion } = useChampion(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [retrainSlot, setRetrainSlot] = useState<string>("art1");
  const [retrainTo, setRetrainTo] = useState<string>("");
  const [showLedger, setShowLedger] = useState(false);
  // The wound's countdown is read when the card opens (and after each action)
  const [openedAt, setOpenedAt] = useState(() => Date.now());
  if (!c) return null;

  const act = async (key: string, path: string, body?: unknown, done?: string) => {
    setBusy(key);
    setStatus(null);
    const res = await championAction(path, body);
    setBusy(null);
    if (res.success && res.champion) {
      setChampion(res.champion);
      setOpenedAt(Date.now());
      setStatus({ ok: true, text: done ?? "Done." });
    } else setStatus({ ok: false, text: res.error ?? "Failed" });
  };

  const slot = c.kit.find((k) => k.slot === retrainSlot) ?? c.kit[0];
  const pct = c.need ? Math.min(100, Math.round((c.into / c.need) * 100)) : 100;
  const statPct = Math.round(c.stats.hp * 1000) / 10;
  const where =
    c.status === "away" ? "at the head of a march" : c.status === "wounded" ? `wounded, whole again in ${hoursText((c.woundedUntil ?? openedAt) - openedAt)}` : "at home: it leads the garrison's defence";

  return (
    <div className="space-y-2.5">
    {portrait && <ChampionPortrait champion={c} />}
    <div className="p-3 rounded-xl border border-amber-600/40 bg-gradient-to-b from-amber-950/30 to-slate-950/60 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-amber-100 flex items-center gap-1.5">
          <Crown className="w-4 h-4 text-amber-300" /> Your Champion
        </span>
        <span className="shrink-0 px-1.5 py-0.5 rounded border text-[9px] uppercase font-bold bg-amber-950 text-amber-300 border-amber-600">legendary</span>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-base font-bold text-amber-50 truncate">{c.name}</span>
        <span className="text-amber-200 text-xs shrink-0">
          Level {c.level}
          <span className="text-slate-500"> / {Math.min(c.maxLevel, c.cityHallLevel)}</span>
        </span>
      </div>
      <div className="space-y-0.5">
        <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
          <div className="h-full bg-amber-400" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex justify-between text-[10px] text-slate-400">
          <span>
            {c.need ? `${c.into.toLocaleString()} / ${c.need.toLocaleString()} Renown to level ${c.level + 1}` : c.level >= c.maxLevel ? "The peak of renown" : `At the City Hall's cap`}
          </span>
          {c.banked > 0 && <span className="text-amber-300">🏦 {c.banked.toLocaleString()} banked</span>}
        </div>
        <div className="text-[10px] text-slate-500">
          Today: {c.today.raw.toLocaleString()} Renown earned (full to {DAILY_RENOWN.full}, half to {DAILY_RENOWN.half}, then a quarter)
        </div>
      </div>
      <p className={`text-[11px] ${c.status === "wounded" ? "text-rose-300" : c.status === "away" ? "text-sky-300" : "text-emerald-300"}`}>Now {where}.</p>
      <p className="text-[11px] text-amber-200">
        The army it leads fights with +{statPct}% HP, ATK and DEF and its Battle Arts. Turn on <strong>Lead with your champion</strong> when you send an attack or lead or join a rally.
      </p>

      {/* Its kit, slot by slot (a hero's arm: each at CHAMPION_ART_SHARE of what it does for a whole band) */}
      <p className="text-[10px] text-slate-500">Its Battle Arts, below as they work for a whole band; a champion is one hero, so each works at {Math.round(CHAMPION_ART_SHARE * 100)}% of that for the army it leads.</p>
      <ul className="space-y-1 text-[11px]">
        {c.kit.map((k) => (
          <li key={k.slot} className={`flex items-start gap-1.5 ${k.unlocked ? "text-slate-200" : "text-slate-500"}`}>
            {k.unlocked ? <span className="shrink-0">{k.emblem}</span> : <Lock className="w-3 h-3 mt-0.5 shrink-0" />}
            <span className="flex-1">
              <strong>{k.label}</strong> · {k.name}: {k.text}
              {!k.unlocked && <span className="text-slate-500"> (level {k.unlockLevel})</span>}
            </span>
          </li>
        ))}
      </ul>

      {/* Its look */}
      <div className="text-[10px] text-slate-400">
        Rolled look: {CHAMPION_SLOTS.map((s) => `${SLOT_LABEL[s]} ${String.fromCharCode(65 + (c.looks[s] ?? 0))}`).join(" · ")}
        {onOpenCodex && (
          <button type="button" onClick={onOpenCodex} className="ml-1 underline text-amber-300 hover:text-amber-200">
            See it in the Royal Codex
          </button>
        )}
      </div>

      <div className="grid gap-2 grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] text-[11px]">
        {c.status === "wounded" && c.hasten && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => act("hasten", "hasten", undefined, `${c.name} is whole again.`)}
            className="flex items-center justify-center text-center gap-1.5 px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold disabled:opacity-40"
          >
            <Hourglass className="w-3.5 h-3.5 shrink-0" />
            <span className="flex flex-col leading-tight">
              <span>Hasten healing</span>
              <span className="text-[10px] font-normal opacity-90">{costLine(c.hasten.cost, c.hasten.gems)}</span>
            </span>
          </button>
        )}
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => act("reroll", "reroll", undefined, `${c.name} wears a new look.`)}
          className="flex items-center justify-center text-center gap-1.5 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 font-bold disabled:opacity-40"
        >
          <Dices className="w-3.5 h-3.5 shrink-0" />
          <span className="flex flex-col leading-tight">
            <span>Re-roll its look</span>
            <span className="text-[10px] font-normal opacity-90">{costLine({}, c.rerollGems)}</span>
          </span>
        </button>
      </div>

      {/* Retraining: swap one slot of its kit */}
      <div className="p-2 rounded-lg border border-slate-700 bg-slate-900/60 space-y-1.5 text-[11px]">
        <div className="font-bold text-slate-200 flex items-center gap-1.5">
          <GraduationCap className="w-3.5 h-3.5 text-amber-300" /> Retraining <span className="font-normal text-slate-500">({costLine(c.retrainCost)} a slot; its Arts stay through a civilization change)</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Combobox
            ariaLabel="Kit slot"
            size="sm"
            className="w-40"
            value={retrainSlot}
            onChange={(v) => {
              setRetrainSlot(v);
              setRetrainTo("");
            }}
            options={c.kit.map((k) => ({ value: k.slot, label: k.label, sublabel: `${k.emblem} ${k.name}` }))}
          />
          <Combobox
            ariaLabel="Learn instead"
            size="sm"
            className="flex-1 min-w-0 basis-40"
            value={retrainTo || null}
            placeholder="Learn instead…"
            onChange={setRetrainTo}
            options={slot.pool.map((p) => ({ value: p.id, label: `${p.emblem} ${p.name}`, sublabel: p.text, disabled: c.kit.some((k) => k.id === p.id && (k.slot === slot.slot || k.slot.slice(0, -1) === slot.slot.slice(0, -1))) }))}
          />
          <button
            type="button"
            disabled={busy !== null || !retrainTo}
            onClick={() => act("retrain", "retrain", { slot: slot.slot, id: retrainTo }, `${c.name} has learned something new.`)}
            className="px-2 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold disabled:opacity-40"
          >
            Retrain
          </button>
        </div>
      </div>

      <p className="text-[10px] text-slate-500">
        It leads soldiers only: never a mercenary band, scouts, gatherers or reinforcements. When the army it leads is wiped out it falls, wounded, and heals by itself.{" "}
        {Object.values(CHAMPION_TARGET_SHARE)
          .map((t) => `${t.emblem} ${t.name}: ${t.description}.`)
          .join(" ")}
      </p>

      {/* The Renown ledger */}
      <button type="button" onClick={() => setShowLedger((v) => !v)} className="flex items-center gap-1.5 text-[11px] text-amber-300 hover:text-amber-200 font-bold">
        <ScrollText className="w-3.5 h-3.5" /> {showLedger ? "Hide" : "Show"} the Renown ledger ({c.ledger.length})
      </button>
      {showLedger && (
        <ul className="max-h-48 overflow-y-auto space-y-0.5 text-[10px] font-mono">
          {c.ledger.length === 0 && <li className="text-slate-500">No battles led yet.</li>}
          {c.ledger.map((e) => (
            <li key={e.id} className="flex items-start gap-2">
              <span className={`w-10 shrink-0 text-right ${e.delta > 0 ? "text-emerald-300" : e.delta < 0 ? "text-rose-300" : "text-slate-500"}`}>
                {e.delta > 0 ? `+${e.delta}` : e.delta}
              </span>
              <span className="flex-1 text-slate-300">
                {REASON_TEXT[e.reason] ?? e.reason}
                {e.detail && <span className="text-slate-500"> · {e.detail}</span>}
                {e.levelAfter > e.levelBefore && <span className="text-amber-300"> · level {e.levelAfter}!</span>}
              </span>
              <span className="shrink-0 text-slate-600">{new Date(e.createdAt).toLocaleDateString()}</span>
            </li>
          ))}
        </ul>
      )}
      {status && <div className={`px-2 py-1 rounded border text-[11px] ${status.ok ? "border-emerald-700 bg-emerald-950/60 text-emerald-300" : "border-rose-700 bg-rose-950/60 text-rose-300"}`}>{status.text}</div>}
    </div>
    </div>
  );
}
