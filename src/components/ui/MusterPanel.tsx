import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Crown, Hammer, ListOrdered, Minus, Plus, Swords, Users, X } from "lucide-react";
import type { ArmoryRarity, DeveloperKingdom, KingdomResources, MarchPreview, MercCost, MusterMarch } from "@/types";
import { CIV_DEMOGRAPHICS } from "@/utils/civDemographics";
import { formatDuration } from "@/utils/war";
import { armorySetFor, forgeCost, MAX_FORGE, setText } from "@/utils/armory";
import { battlePayFor, costText as mercCostText } from "@/utils/mercenaries";
import { boxPower, MUSTER_SPLITS, musterBoxes, strongestFirst } from "@/utils/muster";
import { Combobox } from "./Combobox";
import { Toggle } from "./GameSettingsModal";
import { costLine, forgeArmorySets } from "./ArmoryPanel";

/*
 * ⚔️ The Muster (GAME_GUIDE §13 *Launching marches: the Muster*): one screen to send several marches on one target at
 * once — the ruler's mercenary bands and boxes of soldiers, each box with its Armory loadout and maybe the champion.
 * Ticks are capped at the free march slots; the order is automatic, strongest first; one Launch sends them all and they
 * arrive together, so every march fights from round 1. A loadout short of sets can be forged right here. The server
 * checks and launches the whole muster (POST /marches/muster); this only builds the boxes and counts power with the
 * numbers the march preview sends.
 */

type Loadout = "standard" | ArmoryRarity;
interface SoldierBox {
  soldiers: number;
  ticked: boolean;
  loadout: Loadout;
  champion: boolean;
}

export interface MusterLaunchResult {
  success: boolean;
  error?: string;
  problems?: string[];
}

interface UseMusterArgs {
  preview: MarchPreview | null;
  /** Changes with the target and the kind of march: the muster starts over */
  resetKey: string;
  attacker: DeveloperKingdom | null;
  /** Raise a rally with the armies instead of attacking (bands don't rally) */
  rallying: boolean;
  /** Send the muster (the server checks it whole) */
  onLaunch: (marches: MusterMarch[]) => Promise<MusterLaunchResult>;
  /** Read the march preview again (after forging: the sets at home) */
  onRefresh: () => Promise<void>;
}

const RES_KEYS = ["gold", "iron", "stone", "lumber", "food"] as const;

/** The largest number of `rarity` sets the treasury can forge now (bulk resources and, for epic, the gem) */
function affordableSets(attacker: DeveloperKingdom, res: KingdomResources, rarity: ArmoryRarity): number {
  const fits = (n: number) => {
    const { cost, gems } = forgeCost(attacker.civilization, rarity, n);
    return RES_KEYS.every((k) => (cost[k] ?? 0) <= (res[k] ?? 0)) && Object.entries(gems).every(([k, v]) => v <= (res.scarce?.[k] ?? 0));
  };
  let lo = 0;
  let hi = MAX_FORGE;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(mid)) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** The Muster's state, kept by the march window so its footer can launch it */
export function useMuster({ preview, resetKey, attacker, rallying, onLaunch, onRefresh }: UseMusterArgs) {
  const [split, setSplit] = useState<number>(1);
  const [bandTicks, setBandTicks] = useState<string[]>([]);
  const [boxes, setBoxes] = useState<SoldierBox[]>([]);
  const [forgeAt, setForgeAt] = useState<{ box: number; qty: number } | null>(null);
  const [busy, setBusy] = useState<"launch" | "forge" | null>(null);
  const [problems, setProblems] = useState<string[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /** The treasury a forge just reported (fresher than the realm's copy until it next refreshes) */
  const [treasury, setTreasury] = useState<KingdomResources | null>(null);
  useEffect(() => setTreasury(null), [attacker?.resources]);
  const funds = treasury ?? attacker?.resources ?? null;

  // A new target (or switching attack ↔ rally) starts a fresh muster
  useEffect(() => {
    setSplit(1);
    setBandTicks([]);
    setBoxes([]);
    setForgeAt(null);
    setProblems(null);
    setNote(null);
  }, [resetKey]);

  const freeSlots = preview?.muster?.freeSlots ?? 0;
  const slots = preview?.marchSlots ?? 0;
  const capacity = preview?.marchCapacity ?? 0;
  const home = preview?.availableSoldiers ?? 0;
  const bands = useMemo(() => preview?.bands ?? [], [preview]);
  const sets = useMemo(() => preview?.armory ?? [], [preview]);
  const champion = preview?.champion ?? null;
  const setPower = preview?.muster?.setPower ?? {
    standard: 1,
    uncommon: 1,
    rare: 1,
    epic: 1
  };

  // Picking a split (or a change in soldiers at home / free slots) rebuilds the boxes; each keeps its tick and picks
  useEffect(() => {
    const sizes = musterBoxes(split, home, capacity, freeSlots);
    setBoxes((prev) => {
      let room = Math.max(0, freeSlots - bandTicks.length);
      return sizes.map((soldiers, i) => {
        const want = prev[i]?.ticked ?? (prev.length === 0 && i === 0);
        const ticked = want && room > 0;
        if (ticked) room--;
        return {
          soldiers,
          ticked,
          loadout: prev[i]?.loadout ?? "standard",
          champion: prev[i]?.champion ?? false
        };
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [split, home, capacity, freeSlots, resetKey]);

  // A band that can't march any more (or a rally, which bands don't join) drops its tick
  useEffect(() => {
    setBandTicks((t) => t.filter((id) => !rallying && bands.some((b) => b.id === id && !b.blocked)));
  }, [bands, rallying]);

  const ticked = bandTicks.length + boxes.filter((b) => b.ticked).length;
  const canTickMore = ticked < freeSlots;
  const unit = attacker ? CIV_DEMOGRAPHICS[attacker.civilization].soldierUnit.name : "soldier";
  const champPower = champion && !champion.blocked ? champion.power : null;

  /** Sets the ticked boxes need, by rarity, and how many are short */
  const need = useMemo(() => {
    const out = { uncommon: 0, rare: 0, epic: 0 } as Record<ArmoryRarity, number>;
    for (const b of boxes) if (b.ticked && b.loadout !== "standard") out[b.loadout] += b.soldiers;
    return out;
  }, [boxes]);
  const shortOf = (r: ArmoryRarity) => Math.max(0, need[r] - (sets.find((s) => s.rarity === r)?.home ?? 0));

  const order = strongestFirst([
    ...bands
      .filter((b) => bandTicks.includes(b.id))
      .map((b) => ({
        key: b.id,
        label: `${b.emblem} ${b.name}`,
        sub: `${b.rarity} band · ${Math.round(b.strength * 100)}%`,
        power: b.power
      })),
    ...boxes.flatMap((b, i) =>
      b.ticked
        ? [
            {
              key: `box${i}`,
              label: `${b.soldiers.toLocaleString()} ${unit}s`,
              sub: [b.loadout === "standard" ? "standard gear" : armorySetFor(attacker?.civilization ?? "human", b.loadout).name, b.champion && champion ? `led by ${champion.name}` : ""]
                .filter(Boolean)
                .join(" · "),
              power: boxPower(b.soldiers, setPower[b.loadout], b.champion ? champPower : null)
            }
          ]
        : []
    )
  ]);
  const totalPower = order.reduce((a, m) => a + m.power, 0);

  // What the muster costs together: rations for every soldier box, battle pay for every band
  const rations = boxes.reduce((a, b) => a + (b.ticked ? Math.ceil(b.soldiers * (preview?.foodPerSoldier ?? 0)) : 0), 0);
  const pay = bands
    .filter((b) => bandTicks.includes(b.id))
    .reduce<MercCost>((acc, b) => {
      for (const [k, v] of Object.entries(battlePayFor(b.rarity))) acc[k as keyof MercCost] = (acc[k as keyof MercCost] ?? 0) + (v ?? 0);
      return acc;
    }, {});
  const totalCost: MercCost = { ...pay, food: (pay.food ?? 0) + rations };

  const errors: string[] = [];
  if (preview && ticked === 0) errors.push("Tick at least one march.");
  for (const s of sets) {
    const short = shortOf(s.rarity);
    if (short > 0)
      errors.push(
        s.forgeBlocked
          ? `${s.name}: ${need[s.rarity].toLocaleString()} needed, ${s.home.toLocaleString()} at home, and your City Hall can't forge more yet (${s.forgeBlocked}) — send fewer, or pick another loadout or a smaller split.`
          : `${s.name}: ${need[s.rarity].toLocaleString()} needed, ${s.home.toLocaleString()} at home — forge ${short.toLocaleString()} more, or pick another loadout or a smaller split.`
      );
  }
  if (boxes.some((b) => b.ticked && b.champion) && champion?.blocked) errors.push(champion.blocked);
  if (attacker) {
    const short = RES_KEYS.filter((k) => (totalCost[k] ?? 0) > (funds?.[k] ?? 0)).map((k) => `${((totalCost[k] ?? 0) - (funds?.[k] ?? 0)).toLocaleString()} ${k}`);
    if (short.length) errors.push(`Not enough in the treasury for the rations${bandTicks.length ? " and the bands' battle pay" : ""}: still need ${short.join(", ")}.`);
  }

  const toggleBand = (id: string) => {
    setProblems(null);
    setBandTicks((t) => (t.includes(id) ? t.filter((x) => x !== id) : canTickMore ? [...t, id] : t));
  };
  const editBox = (i: number, patch: Partial<SoldierBox>) => {
    setProblems(null);
    setBoxes((list) =>
      list.map((b, j) => {
        if (j === i) return { ...b, ...patch };
        // One box at a time follows the champion
        return patch.champion ? { ...b, champion: false } : b;
      })
    );
  };
  const toggleBox = (i: number) => {
    const b = boxes[i];
    if (!b) return;
    if (b.ticked) editBox(i, { ticked: false, champion: false });
    else if (canTickMore) editBox(i, { ticked: true });
  };
  const pickSplit = (s: number) => {
    setProblems(null);
    setForgeAt(null);
    setSplit(s);
  };

  const openForge = (i: number) => {
    const b = boxes[i];
    if (!b || b.loadout === "standard") return;
    setForgeAt({ box: i, qty: Math.max(1, shortOf(b.loadout)) });
  };
  const forge = async () => {
    const b = forgeAt ? boxes[forgeAt.box] : null;
    if (!forgeAt || !b || b.loadout === "standard" || !attacker) return;
    setBusy("forge");
    setProblems(null);
    const res = await forgeArmorySets(b.loadout, forgeAt.qty);
    if (!res.success) {
      setBusy(null);
      setProblems([res.error || "Failed to forge"]);
      return;
    }
    if (res.kingdom?.resources) setTreasury(res.kingdom.resources);
    await onRefresh();
    setBusy(null);
    setForgeAt(null);
    setNote(`Forged ${forgeAt.qty.toLocaleString()} ${armorySetFor(attacker.civilization, b.loadout).name}.`);
  };

  const launch = async (): Promise<boolean> => {
    if (errors.length || busy) return false;
    setBusy("launch");
    setProblems(null);
    setNote(null);
    const marches: MusterMarch[] = [
      ...bandTicks.map((bandId) => ({ bandId })),
      ...boxes
        .filter((b) => b.ticked)
        .map((b) => ({
          soldiers: b.soldiers,
          ...(b.loadout !== "standard" ? { loadout: b.loadout } : {}),
          ...(b.champion ? { champion: true } : {})
        }))
    ];
    const res = await onLaunch(marches);
    setBusy(null);
    if (!res.success) setProblems(res.problems?.length ? res.problems : [res.error || "The muster could not set off."]);
    else {
      // Those marches have left: the next muster starts fresh, so a second press can't send the same ticks again
      setBandTicks([]);
      setBoxes((list) => list.map((b, i) => ({ ...b, ticked: i === 0, loadout: "standard", champion: false })));
    }
    return res.success;
  };

  return {
    preview,
    attacker,
    funds,
    rallying,
    split,
    pickSplit,
    bands,
    bandTicks,
    toggleBand,
    boxes,
    toggleBox,
    editBox,
    sets,
    champion,
    setPower,
    champPower,
    shortOf,
    forgeAt,
    setForgeAt,
    openForge,
    forge,
    busy,
    problems,
    note,
    errors,
    order,
    totalPower,
    rations,
    pay,
    ticked,
    freeSlots,
    slots,
    canTickMore,
    capacity,
    home,
    unit,
    launch,
    canLaunch: Boolean(preview) && errors.length === 0 && !busy && ticked > 0,
    tickedBandNames: bands.filter((b) => bandTicks.includes(b.id)).map((b) => b.name)
  };
}

export type MusterState = ReturnType<typeof useMuster>;

/** A square tick box (a button, so it is one tap on a phone) */
function Tick({ on, disabled, onClick, label }: { on: boolean; disabled?: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`shrink-0 w-6 h-6 rounded-md border flex items-center justify-center transition disabled:opacity-35 disabled:cursor-not-allowed ${
        on ? "bg-amber-500 border-amber-400 text-slate-950" : "bg-slate-950 border-slate-600 text-transparent hover:border-amber-400"
      }`}
    >
      <Check className="w-4 h-4" strokeWidth={3} />
    </button>
  );
}

const RARITY_CHIP: Record<string, string> = {
  common: "bg-slate-800 text-slate-300 border-slate-600",
  uncommon: "bg-emerald-950 text-emerald-300 border-emerald-700",
  rare: "bg-sky-950 text-sky-300 border-sky-700",
  epic: "bg-violet-950 text-violet-300 border-violet-700",
  legendary: "bg-amber-950 text-amber-300 border-amber-600"
};

const Power = ({ n, dim }: { n: number; dim?: boolean }) => (
  <span className={`shrink-0 text-right tabular-nums ${dim ? "text-slate-500" : "text-amber-200"}`}>
    <span className="block font-bold text-sm leading-tight">{n.toLocaleString()}</span>
    <span className="block text-[9px] uppercase tracking-wide text-slate-500">power</span>
  </span>
);

/** The Muster window's body: bands, soldiers and their boxes, the order and what's wrong */
export function MusterPanel({ m }: { m: MusterState }) {
  const { preview, attacker } = m;
  if (!preview || !attacker) return <div className="text-xs text-slate-500">Mustering the army…</div>;
  const civ = attacker.civilization;
  const usedSlots = m.slots - m.freeSlots;

  return (
    <div className="space-y-3 text-xs">
      {/* Header: slots used / total, and what the ticks add */}
      <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-amber-500/30 bg-amber-950/15">
        <span className="font-bold text-amber-300 flex items-center gap-1.5">
          <Swords className="w-4 h-4" /> {m.rallying ? "Muster the rally" : "Muster"}
        </span>
        <span className="text-slate-300 text-right">
          March slots{" "}
          <strong className={m.freeSlots === 0 ? "text-rose-400" : "text-sky-300"}>
            {usedSlots}/{m.slots}
          </strong>{" "}
          used
          {m.ticked > 0 && (
            <>
              {" "}
              · <strong className="text-amber-200">+{m.ticked}</strong> ticked
            </>
          )}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="space-y-3 min-w-0">
          {/* Mercenary bands */}
          {m.bands.length > 0 && (
            <section className="space-y-1.5">
              <div className="font-bold text-slate-200 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-amber-300" /> Mercenary bands
              </div>
              {m.rallying && <p className="text-[11px] text-slate-400">Mercenary bands only attack: they don&apos;t rally.</p>}
              {m.bands.map((b) => {
                const on = m.bandTicks.includes(b.id);
                const blocked = m.rallying ? "Bands don't rally" : b.blocked;
                return (
                  <div
                    key={b.id}
                    className={`flex items-center gap-2.5 p-2 rounded-lg border ${on ? "border-amber-500/50 bg-amber-950/20" : "border-slate-700/70 bg-slate-900/40"} ${blocked ? "opacity-60" : ""}`}
                  >
                    <Tick on={on} disabled={Boolean(blocked) || (!on && !m.canTickMore)} onClick={() => m.toggleBand(b.id)} label={`Send ${b.name}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-bold text-slate-100 truncate">
                          {b.emblem} {b.name}
                        </span>
                        <span className={`shrink-0 text-[9px] font-mono px-1.5 py-px rounded-full border uppercase ${RARITY_CHIP[b.rarity]}`}>{b.rarity}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <div className="h-1.5 w-16 sm:w-24 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full ${b.strength >= 0.75 ? "bg-emerald-400" : b.strength >= 0.4 ? "bg-amber-400" : "bg-rose-500"}`}
                            style={{
                              width: `${Math.round(b.strength * 100)}%`
                            }}
                          />
                        </div>
                        <span className={`text-[11px] ${b.strength < 1 ? "text-amber-300" : "text-slate-400"}`}>
                          {Math.round(b.strength * 100)}%{b.strength < 1 ? " wounded" : ""}
                        </span>
                      </div>
                      {blocked && <div className="text-[10px] text-slate-500 mt-0.5">{blocked}</div>}
                    </div>
                    <Power n={b.power} dim={!on} />
                  </div>
                );
              })}
              {m.bandTicks.length > 0 && (
                <p className="text-[10px] text-slate-500">Each band is paid its battle pay as it marches out ({mercCostText(m.pay)} in all). The defenders strike your own soldiers before any band.</p>
              )}
            </section>
          )}

          {/* Soldiers: the split chips and the boxes */}
          <section className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-bold text-slate-200 flex items-center gap-1.5">
                <Swords className="w-4 h-4 text-amber-300" /> Soldiers
              </span>
              <span className="text-slate-400">
                <strong className="text-amber-200">{m.home.toLocaleString()}</strong> at home · a full march carries <strong className="text-slate-200">{m.capacity.toLocaleString()}</strong>
              </span>
            </div>
            <div className="flex gap-1.5" role="radiogroup" aria-label="Soldiers per march">
              {MUSTER_SPLITS.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={m.split === s}
                  onClick={() => m.pickSplit(s)}
                  className={`flex-1 py-1.5 rounded-lg border font-bold ${m.split === s ? "bg-amber-500 border-amber-400 text-slate-950" : "bg-slate-900 border-slate-700 text-slate-300 hover:text-white"}`}
                >
                  {Math.round(s * 100)}%
                </button>
              ))}
            </div>
            {m.boxes.length === 0 && (
              <p className="text-[11px] text-amber-200/90">
                {m.freeSlots === 0 ? "Every march slot is in use: wait for an army to come home." : "No soldiers at home. Assign civilians to the garrison from the Kingdom panel first."}
              </p>
            )}
            {m.boxes.map((b, i) => {
              const set = b.loadout === "standard" ? null : (m.sets.find((s) => s.rarity === b.loadout) ?? null);
              const short = set ? m.shortOf(set.rarity) : 0;
              const forging = m.forgeAt?.box === i;
              const champBlocked = !m.champion || Boolean(m.champion.blocked);
              return (
                <div key={i} className={`p-2 rounded-lg border space-y-2 ${b.ticked ? "border-amber-500/50 bg-amber-950/20" : "border-slate-700/70 bg-slate-900/40"}`}>
                  <div className="flex items-center gap-2.5">
                    <Tick on={b.ticked} disabled={!b.ticked && !m.canTickMore} onClick={() => m.toggleBox(i)} label={`Send march ${i + 1}`} />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-slate-100">
                        {b.soldiers.toLocaleString()} {m.unit}s
                      </div>
                      <div className="text-[10px] text-slate-500">March {i + 1}</div>
                    </div>
                    <Power n={boxPower(b.soldiers, m.setPower[b.loadout], b.champion ? m.champPower : null)} dim={!b.ticked} />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                    <div className="flex-1 min-w-[10rem]">
                      <Combobox
                        ariaLabel={`Armory loadout of march ${i + 1}`}
                        size="sm"
                        value={b.loadout}
                        onChange={(v) => {
                          m.editBox(i, { loadout: v as Loadout });
                          if (forging) m.setForgeAt(null);
                        }}
                        options={[
                          {
                            value: "standard",
                            label: "Standard gear",
                            sublabel: "the stock pile every soldier is armed from",
                            hint: "×1"
                          },
                          ...m.sets.map((s) => ({
                            value: s.rarity,
                            label: `${s.emblem} ${s.name}`,
                            sublabel: `${s.rarity} · ${s.home.toLocaleString()} at home${s.forgeBlocked ? ` · can't forge more: ${s.forgeBlocked}` : s.home === 0 ? " · forge them here" : ""}`,
                            hint: `×${m.setPower[s.rarity]}`,
                            // A set the City Hall can't forge yet is only usable while some are at home
                            disabled: Boolean(s.forgeBlocked) && s.home === 0
                          }))
                        ]}
                      />
                    </div>
                    <label
                      className={`flex items-center gap-1.5 shrink-0 ${champBlocked ? "opacity-40" : ""}`}
                      title={m.champion?.blocked ?? (m.champion ? `${m.champion.name} leads this march` : "You have no champion")}
                    >
                      <Crown className="w-3.5 h-3.5 text-amber-300" />
                      <span className="text-[11px] text-slate-300">Lead with champion</span>
                      {champBlocked ? (
                        <span className="w-9 h-5 rounded-full bg-slate-800 border border-slate-700" aria-label="Champion unavailable" />
                      ) : (
                        <Toggle
                          on={b.champion}
                          onChange={(on) =>
                            m.editBox(
                              i,
                              on
                                ? {
                                    champion: true,
                                    ticked: b.ticked || m.canTickMore
                                  }
                                : { champion: false }
                            )
                          }
                          label={`Lead march ${i + 1} with your champion`}
                        />
                      )}
                    </label>
                  </div>
                  {set && b.ticked && short > 0 && !forging && (
                    <div className="flex items-start gap-2 text-[11px] text-rose-300">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span className="flex-1">
                        {set.home === 0
                          ? `No ${set.name} at home`
                          : `${set.home.toLocaleString()} ${set.name} at home for ${m.boxes
                              .filter((x) => x.ticked && x.loadout === set.rarity)
                              .reduce((a, x) => a + x.soldiers, 0)
                              .toLocaleString()} soldiers`}
                        : short <strong>{short.toLocaleString()}</strong>.{set.forgeBlocked && ` Forging more: ${set.forgeBlocked} — send fewer or pick another loadout.`}
                      </span>
                      {!set.forgeBlocked && (
                        <button type="button" onClick={() => m.openForge(i)} className="shrink-0 px-2 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold flex items-center gap-1">
                          <Hammer className="w-3 h-3" /> Forge
                        </button>
                      )}
                    </div>
                  )}
                  {set && forging && m.forgeAt && <ForgePanel m={m} rarity={set.rarity} civ={civ} />}
                  {set && b.ticked && !forging && short === 0 && <p className="text-[10px] text-amber-200/80">{setText(armorySetFor(civ, set.rarity))}</p>}
                </div>
              );
            })}
            {m.champion?.blocked && <p className="text-[10px] text-slate-500">Champion: {m.champion.blocked}</p>}
          </section>
        </div>

        <div className="space-y-3 min-w-0 sm:sticky sm:top-0 self-start">
          {/* Order: automatic, strongest first */}
          {m.order.length === 0 && (
            <div className="p-2.5 rounded-xl border border-dashed border-slate-700 text-slate-500 text-[11px]">Tick the bands and soldier marches to send: they line up here, strongest first.</div>
          )}
          {m.order.length > 0 && (
            <section className="p-2.5 rounded-xl border border-slate-600/50 bg-slate-950/50 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-slate-200 flex items-center gap-1.5">
                  <ListOrdered className="w-4 h-4 text-amber-300" /> Order of battle
                </span>
                <span className="text-[10px] text-slate-500">strongest first</span>
              </div>
              <ol className="space-y-1">
                {m.order.map((o, i) => (
                  <li key={o.key} className="flex items-center gap-2">
                    <span className="w-5 h-5 shrink-0 rounded-full bg-slate-800 text-slate-300 text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                    <span className="flex-1 min-w-0">
                      <span className="text-slate-100 font-bold truncate block">{o.label}</span>
                      <span className="text-[10px] text-slate-500 truncate block">{o.sub}</span>
                    </span>
                    <span className="tabular-nums text-amber-200 font-bold">{o.power.toLocaleString()}</span>
                  </li>
                ))}
              </ol>
              <div className="flex items-center justify-between pt-1.5 border-t border-slate-800">
                <span className="text-slate-400">Total power</span>
                <strong className="text-amber-300 text-sm tabular-nums">{m.totalPower.toLocaleString()}</strong>
              </div>
              <p className="text-[10px] text-slate-500">
                {m.rallying
                  ? "They wait in the rally lobby together and set off with the rally: every one of them fights from round 1."
                  : `They set off together and arrive together${preview.durationMs ? ` in ${formatDuration(preview.durationMs)}` : ""}: every one fights from round 1.`}{" "}
                Rations: {m.rations.toLocaleString()} food, paid on launch (no refund on recall).
              </p>
            </section>
          )}

          {m.note && <div className="p-2 rounded-lg text-[11px] border bg-emerald-950/70 text-emerald-300 border-emerald-800">{m.note}</div>}
          {(m.problems ?? m.errors).length > 0 && (
            <ul className="p-2.5 rounded-lg bg-rose-950/50 border border-rose-800/70 text-rose-200 text-[11px] space-y-1">
              {(m.problems ?? m.errors).map((e) => (
                <li key={e} className="flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-400" /> {e}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/** Forge in place: how many (the shortfall by default), what it costs, what the treasury can pay, and a confirm */
function ForgePanel({ m, rarity, civ }: { m: MusterState; rarity: ArmoryRarity; civ: DeveloperKingdom["civilization"] }) {
  const qty = m.forgeAt?.qty ?? 1;
  const short = m.shortOf(rarity);
  const can = m.attacker && m.funds ? affordableSets(m.attacker, m.funds, rarity) : 0;
  const { cost, gems } = forgeCost(civ, rarity, qty);
  const set = armorySetFor(civ, rarity);
  const setQty = (n: number) =>
    m.setForgeAt({
      box: m.forgeAt!.box,
      qty: Math.max(1, Math.min(MAX_FORGE, Math.floor(n) || 1))
    });
  return (
    <div className="p-2.5 rounded-lg border border-amber-500/40 bg-slate-950/70 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-amber-200 flex items-center gap-1.5">
          <Hammer className="w-3.5 h-3.5" /> Forge {set.emblem} {set.name}
        </span>
        <button type="button" onClick={() => m.setForgeAt(null)} className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800" aria-label="Close the forge">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setQty(qty - 10)} className="p-1.5 rounded bg-slate-800 hover:bg-slate-700" aria-label="Ten fewer">
          <Minus className="w-3.5 h-3.5" />
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_FORGE}
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
          className="w-24 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-100 text-center tabular-nums"
          aria-label="Sets to forge"
        />
        <button type="button" onClick={() => setQty(qty + 10)} className="p-1.5 rounded bg-slate-800 hover:bg-slate-700" aria-label="Ten more">
          <Plus className="w-3.5 h-3.5" />
        </button>
        {short > 0 && qty !== short && (
          <button type="button" onClick={() => setQty(short)} className="text-[10px] text-amber-300 hover:underline">
            the shortfall ({short.toLocaleString()})
          </button>
        )}
      </div>
      <div className="text-[11px] text-slate-300">
        Cost: <strong className="text-amber-200">{costLine(cost, gems)}</strong>
      </div>
      <div className={`text-[11px] ${can >= qty ? "text-emerald-300" : "text-rose-300"}`}>
        {can >= qty ? `Your treasury can forge up to ${can.toLocaleString()}.` : can > 0 ? `Your treasury can forge only ${can.toLocaleString()}.` : "Your treasury can't pay for a single set."}
        {can > 0 && can < qty && (
          <button type="button" onClick={() => setQty(can)} className="ml-1.5 text-amber-300 hover:underline">
            forge {can.toLocaleString()}
          </button>
        )}
      </div>
      <p className="text-[10px] text-slate-500">The same forge as the Armory: each set costs upkeep every harvest from now on, at home or on a march (unpaid, it rusts back to the stock pile).</p>
      <button
        type="button"
        onClick={() => void m.forge()}
        disabled={m.busy !== null || can < qty}
        className="w-full py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
      >
        <Hammer className="w-3.5 h-3.5" /> {m.busy === "forge" ? "Forging…" : `Forge ${qty.toLocaleString()}`}
      </button>
    </div>
  );
}
