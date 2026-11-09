import { Fragment } from "react";
import { Modal } from "./Modal";
import { artEventText } from "@/utils/battleArts";
import { BattleReport, BattleRound, AuthUser, SCARCE_RESOURCES } from "@/types";
import { bandLossText, splitBands } from "@/utils/mercenaries";
import { CIV_DEMOGRAPHICS } from "@/utils/civDemographics";
import { CIV_EMBLEM } from "@/utils/war";
import { sound } from "@/hooks/useSound";
import { Swords, Shield, Sparkles, Coins, ScrollText, CheckCircle2, ArrowLeft } from "lucide-react";

interface BattleReportModalProps {
  report: BattleReport | null;
  onClose: () => void;
  /** Shown when the report was opened from the War Room list */
  onBack?: () => void;
  me?: AuthUser | null;
}

/** A round's attacker losses: soldiers as "−120", each mercenary band as "−18%" of its strength */
function lossText(lost: number, bands: BattleRound["bands"]): string {
  if (!bands?.length) return `−${lost.toLocaleString()}`;
  const soldiers = lost - bands.reduce((a, b) => a + b.lost, 0);
  return [...(soldiers > 0 ? [`−${soldiers.toLocaleString()}`] : []), ...bands.filter((b) => b.lost > 0).map((b) => bandLossText(b.lost, b.fullCount))].join(" ") || "−0";
}

function SideCard({
  title,
  icon,
  name,
  civ,
  isYou,
  initial,
  losses,
  tag,
  emblem,
  unitName,
  bandFull,
  bands,
  wounded
}: {
  title: string;
  icon: React.ReactNode;
  name: string;
  civ: BattleReport["attackerCiv"];
  isYou: boolean;
  initial: number;
  losses: number;
  tag: string;
  /** Overrides the civ emblem (world NPC packs) */
  emblem?: string;
  unitName?: string;
  /** 🪙 The side is one mercenary band: its numbers are strength (% of this full count) */
  bandFull?: number;
  /** 🪙 Bands that fought beside the side's soldiers: shown as strength under the soldier numbers */
  bands?: Array<{ name: string; emblem: string; start: number; lost: number }>;
  /** 🌙 Of `losses`, soldiers carried home wounded (Moonwell Healers) */
  wounded?: number;
}) {
  const unit = unitName ?? CIV_DEMOGRAPHICS[civ]?.soldierUnit.name ?? "Soldier";
  const n = (v: number) => (bandFull ? `${Math.round((v / bandFull) * 100)}%` : v.toLocaleString());
  return (
    <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/70 space-y-2">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-bold text-slate-300 flex items-center gap-1.5">
          {icon}
          {title}
        </span>
        <span className="text-slate-500 uppercase">{tag}</span>
      </div>
      <div className="text-sm font-bold text-slate-100 flex items-center gap-2 min-w-0">
        <span>{emblem ?? CIV_EMBLEM[civ]}</span>
        <span className="truncate">{name}</span>
        {isYou && <span className="shrink-0 text-[10px] px-1.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">You</span>}
      </div>
      <div className="grid grid-cols-3 gap-1.5 text-center text-xs">
        <div className="p-1.5 rounded bg-slate-950 border border-slate-800">
          <div className="text-[9px] text-slate-400" title={bandFull ? "Strength it set off with" : unit}>{bandFull ? "Strength" : "Deployed"}</div>
          <div className="font-bold text-slate-200">{n(initial)}</div>
        </div>
        <div className="p-1.5 rounded bg-slate-950 border border-slate-800">
          <div className="text-[9px] text-slate-400">{bandFull ? "Lost" : "Fallen"}</div>
          <div className="font-bold text-rose-400">-{n(losses)}</div>
          {wounded ? (
            <div className="text-[9px] text-indigo-300" title="Carried home wounded to the Moonwell: they rejoin the garrison when healed">
              🌙 {wounded.toLocaleString()} wounded
            </div>
          ) : null}
        </div>
        <div className="p-1.5 rounded bg-slate-950 border border-slate-800">
          <div className="text-[9px] text-slate-400">{bandFull ? "Left" : "Standing"}</div>
          <div className="font-bold text-emerald-400">{n(Math.max(0, initial - losses))}</div>
        </div>
      </div>
      {bands?.map((b, i) => (
        <div key={i} className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
          <span className="truncate">
            {b.emblem} {b.name}
          </span>
          <span className="shrink-0 font-mono">
            {Math.round(b.start * 100)}% <span className="text-rose-400">{bandLossText(b.lost, 1)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}


export function BattleReportModal({ report, onClose, onBack, me }: BattleReportModalProps) {
  // 🪙 The attackers were one mercenary band: the attacker card shows its strength
  const attackers = report?.armies?.filter((a) => a.side === "attacker") ?? [];
  const soloBand = attackers.length === 1 ? attackers[0].band ?? null : null;
  if (!report) return null;

  const isAttacker = Boolean(me && (me.id === report.attackerId || report.armies?.some((a) => a.side === "attacker" && a.ownerId === me.id)));
  const isDefender = Boolean(me && me.id === report.defenderId);
  const involved = isAttacker || isDefender;
  const playerWon = (isAttacker && report.attackerWon) || (isDefender && !report.attackerWon);
  // Uninvolved viewers see it from the attacker's side
  const good = involved ? playerWon : report.attackerWon;

  const isNpc = report.targetType === "spire";
  const attackerSplit = splitBands(attackers, report.attackerInitialSoldiers, report.attackerCasualties);
  const defenderSplit = splitBands(report.armies?.filter((a) => a.side === "defender") ?? [], report.defenderInitialSoldiers, report.defenderCasualties);
  const garrisonMax = report.defenderMaxGarrison ?? report.defenderInitialSoldiers;
  const garrisonLeft = Math.max(0, report.defenderInitialSoldiers - report.defenderCasualties);
  const rounds = report.rounds ?? [];
  const peakDamage = Math.max(1, ...rounds.flatMap((r) => [r.attackerDamage, r.defenderDamage]));

  const title = report.usurpedSlot
    ? isDefender
      ? "Your citadel has fallen"
      : "The Voidrift slot is taken!"
    : report.attackerWon
      ? "Victory"
      : isAttacker
        ? "Assault repelled"
        : isDefender
          ? "Siege repelled"
          : "Assault repelled";

  return (
    <Modal
      open
      onClose={onClose}
      accentBorder={good ? "border-amber-500/70" : "border-rose-500/70"}
      headerClassName={good ? "bg-linear-to-b from-amber-950 via-slate-900 to-slate-950" : "bg-linear-to-b from-rose-950 via-slate-900 to-slate-950"}
      header={
        <div className="flex items-center gap-3">
          <span
            className={`text-3xl w-12 h-12 shrink-0 rounded-xl border flex items-center justify-center shadow-lg ${
              good ? "bg-amber-950/80 border-amber-500/60" : "bg-rose-950/80 border-rose-500/60"
            }`}
          >
            {report.usurpedSlot ? "👑" : good ? "🏆" : "💀"}
          </span>
          <div className="min-w-0">
            <h2 className={`font-medieval text-lg tracking-wide ${good ? "text-amber-200" : "text-rose-200"}`}>{title}</h2>
            <p className="text-xs text-slate-400 font-mono truncate">
              {report.attackerName} vs {report.defenderName} · {new Date(report.timestamp).toLocaleString()}
            </p>
          </div>
        </div>
      }
      footer={
        <div className="flex items-center justify-between w-full">
          {onBack ? (
            <button
              onClick={() => {
                sound.playClick();
                onBack();
              }}
              className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> War Room
            </button>
          ) : (
            <span />
          )}
          <button
            onClick={() => {
              sound.playClick();
              onClose();
            }}
            className="px-5 py-2 rounded-xl text-xs font-bold transition shadow-lg flex items-center gap-2 bg-linear-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950"
          >
            <CheckCircle2 className="w-4 h-4" />
            Acknowledge
          </button>
        </div>
      }
    >
      <div className="p-4 space-y-4 text-sm font-mono">
        {report.civilizationSwapped && (
          <div className="p-3 rounded-xl border border-purple-500/50 bg-linear-to-r from-purple-950/80 via-slate-900 to-purple-950/80 space-y-1">
            <div className="flex items-center gap-2 text-purple-300 font-medieval font-bold">
              <Sparkles className="w-4 h-4 text-purple-400" />
              Ascension to Nethergarde Voidrift
            </div>
            <p className="text-xs text-purple-200/90">
              <strong className="text-amber-300">{report.attackerName}</strong> now rules a Voidrift citadel as Nethergarde.
              {report.newDefenderCiv && (
                <>
                  {" "}
                  {report.defenderName} is cast down and becomes <strong>{report.newDefenderCiv}</strong>.
                </>
              )}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <SideCard
            title="Attacker"
            icon={<Swords className="w-3.5 h-3.5 text-amber-400" />}
            name={report.attackerName}
            civ={report.attackerCiv}
            isYou={isAttacker}
            initial={attackerSplit.initial}
            losses={attackerSplit.losses}
            bands={attackerSplit.bands}
            wounded={report.attackerWounded}
            tag={soloBand ? `${soloBand.rarity} mercenaries` : report.attackerCiv}
            emblem={soloBand?.emblem}
            bandFull={soloBand?.fullCount}
          />
          <SideCard
            title="Defender"
            icon={<Shield className="w-3.5 h-3.5 text-slate-400" />}
            name={report.defenderName}
            civ={report.defenderCiv}
            isYou={isDefender}
            initial={defenderSplit.initial}
            losses={defenderSplit.losses}
            bands={defenderSplit.bands}
            wounded={report.defenderWounded}
            tag={
              report.defenderNpc
                ? `${report.defenderNpc.category}${report.defenderNpc.rarity ? ` · ${report.defenderNpc.rarity}` : ""}`
                : isNpc
                  ? "NPC void kingdom"
                  : report.targetType === "npc"
                    ? `${report.defenderCiv} · workers`
                    : report.defenderCiv === "arcane"
                      ? "Void citadel"
                      : report.defenderCiv
            }
            emblem={report.defenderNpc?.emblem}
            unitName={report.defenderNpc?.unitName}
          />
        </div>

        {/* Every army: rally / swarm stacks (with the round they joined) and reinforcements on the walls */}
        {report.armies && (report.armies.length > 1 || report.armies.some((a) => a.champion)) && (
          <div className="p-2.5 rounded-xl border border-slate-800 bg-slate-900/60 text-[11px] font-mono space-y-1">
            <div className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Armies</div>
            {report.armies.map((a, i) => (
              <div key={`${a.ownerId}-${i}`} className="flex items-center justify-between gap-2">
                <span className={`truncate ${me && a.ownerId === me.id ? "text-amber-200 font-bold" : "text-slate-200"}`}>
                  {a.side === "attacker" ? "⚔️" : "🛡️"} {CIV_EMBLEM[a.civ]} {a.name}
                  {a.joinedRound && a.joinedRound > 1 ? <span className="text-slate-500"> · joined round {a.joinedRound}</span> : null}
                  {a.atkBonusPct ? <span className="text-amber-300"> · +{a.atkBonusPct}% ATK</span> : null}
                  {a.armory ? (
                    <span className="text-sky-300">
                      {" "}
                      · {a.armory.emblem} {a.armory.name}
                    </span>
                  ) : null}
                  {a.champion ? (
                    <span className="text-amber-300">
                      {" "}
                      · 🦸 {a.champion.name} (Lv{a.champion.level}){a.champion.fell ? " fell" : ""}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-slate-300">
                  {a.band ? (
                    <>
                      {Math.round((a.initial / a.band.fullCount) * 100)}% <span className="text-rose-300">{bandLossText(a.losses, a.band.fullCount)}</span>
                      {a.band.dead ? " 💀" : ""}
                    </>
                  ) : (
                    <>
                      {a.initial.toLocaleString()} <span className="text-rose-300">−{a.losses.toLocaleString()}</span>
                      {a.wounded ? <span className="text-indigo-300"> ({a.wounded.toLocaleString()} wounded)</span> : null}
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* World boss: shared HP before / after this battle */}
        {report.bossHp && (
          <div className="p-2.5 rounded-xl border border-red-500/40 bg-red-950/20 text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-red-200 font-bold">🐉 Shared HP {report.bossHp.after <= 0 ? "· FALLEN" : ""}</span>
              <span className="text-red-300 font-bold">
                {report.bossHp.before.toLocaleString()} → {report.bossHp.after.toLocaleString()} / {report.bossHp.max.toLocaleString()}
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-950 border border-slate-800 overflow-hidden flex">
              <div className="h-full bg-red-500" style={{ width: `${(report.bossHp.after / Math.max(1, report.bossHp.max)) * 100}%` }} />
              <div className="h-full bg-amber-400/70" style={{ width: `${((report.bossHp.before - report.bossHp.after) / Math.max(1, report.bossHp.max)) * 100}%` }} title="Taken in this battle" />
            </div>
          </div>
        )}
        {report.bossBounty && report.bossBounty.length > 0 && (
          <div className="p-2.5 rounded-xl border border-amber-500/30 bg-amber-950/15 text-xs space-y-1">
            <div className="text-amber-200 font-bold">🎖️ Bounty — shared by damage dealt this life (paid into each treasury)</div>
            {report.bossBounty.map((b) => (
              <div key={b.userId} className="flex justify-between gap-2 font-mono text-[11px] text-slate-300">
                <span className="truncate">
                  {b.name} · {b.damage.toLocaleString()} dmg
                </span>
                <span className="text-amber-300 shrink-0">
                  {(["gold", "iron", "stone", "lumber", "food"] as const)
                    .filter((k) => b.loot[k])
                    .map((k) => `${b.loot[k]!.toLocaleString()} ${k}`)
                    .join(" · ")}
                </span>
              </div>
            ))}
          </div>
        )}
        {report.realmHoard && report.realmHoard.length > 0 && (
          <div className="p-2.5 rounded-xl border border-amber-500/30 bg-amber-950/15 text-xs space-y-1">
            <div className="text-amber-200 font-bold">👑 Conquest hoard — shared by damage dealt in this battle (paid into each treasury)</div>
            {report.realmHoard.map((b) => (
              <div key={b.userId} className="flex justify-between gap-2 font-mono text-[11px] text-slate-300">
                <span className="truncate">
                  {b.name} · {b.damage.toLocaleString()} dmg
                </span>
                <span className="text-amber-300 shrink-0">
                  {[
                    ...(["gold", "iron", "stone", "lumber", "food"] as const).filter((k) => b.loot[k]).map((k) => `${b.loot[k]!.toLocaleString()} ${k}`),
                    ...Object.entries(b.loot.scarce ?? {}).map(([k, v]) => `${v}× ${k.replace("_", " ")}`)
                  ].join(" · ")}
                </span>
              </div>
            ))}
          </div>
        )}
        {/* 🦸 Champions: the one who led the garrison, and the Renown every champion earned */}
        {report.defenderChampion || report.championRenown?.length ? (
          <div className="p-2 rounded-xl border border-amber-500/40 bg-amber-950/20 text-[11px] text-amber-200 space-y-0.5">
            {report.defenderChampion && (
              <div>
                🦸 {report.defenderChampion.name} (level {report.defenderChampion.level}) led the garrison{report.defenderChampion.fell ? " and fell with it, wounded" : ""}.
              </div>
            )}
            {(report.championRenown ?? []).map((c) => (
              <div key={c.userId}>
                🦸 {c.name} earned {c.renown} Renown (level {c.levelAfter}).
              </div>
            ))}
          </div>
        ) : null}
        {report.defenderGrudgeStacks ? (
          <div className="p-2 rounded-xl border border-purple-500/40 bg-purple-950/20 text-[11px] text-purple-200">
            🔱 Overseer's Resolve ×{report.defenderGrudgeStacks}: the garrison fought with +{report.defenderGrudgeStacks * 20}% HP, ATK and DEF.
          </div>
        ) : null}

        {/* Wall damage & burning status */}
        {report.wallHpBefore !== undefined && report.wallHpAfter !== undefined && report.wallMaxHp ? (
          <div className={`p-2.5 rounded-xl border text-xs space-y-1.5 ${report.defenderBurning ? "border-orange-500/50 bg-orange-950/25" : "border-slate-800 bg-slate-900/60"}`}>
            <div className="flex items-center justify-between">
              <span className="text-slate-300 font-bold">
                🧱 Defender Walls {report.defenderBurning ? "· 🔥 BURNING (≤25% HP)" : ""}
              </span>
              <span className={report.defenderBurning ? "text-orange-300 font-bold" : "text-sky-300 font-bold"}>
                {report.wallHpBefore.toLocaleString()} → {report.wallHpAfter.toLocaleString()} / {report.wallMaxHp.toLocaleString()} HP
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
              <div
                className={`h-full ${report.defenderBurning ? "bg-linear-to-r from-red-600 to-orange-400" : "bg-linear-to-r from-emerald-500 to-sky-400"}`}
                style={{ width: `${Math.min(100, Math.max(0, (report.wallHpAfter / Math.max(1, report.wallMaxHp)) * 100))}%` }}
              />
            </div>
          </div>
        ) : null}

        {/* Siege progress against an NPC void kingdom */}
        {isNpc && !report.usurpedSlot && garrisonMax > 0 && (
          <div className="space-y-1 text-xs">
            <div className="flex justify-between text-slate-400">
              <span>Garrison left after this assault</span>
              <span className="text-purple-300 font-bold">
                {garrisonLeft.toLocaleString()} / {garrisonMax.toLocaleString()}
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-900 border border-purple-900/60 overflow-hidden flex">
              <div className="h-full bg-purple-500" style={{ width: `${(garrisonLeft / garrisonMax) * 100}%` }} />
              <div className="h-full bg-rose-500/70" style={{ width: `${(report.defenderCasualties / garrisonMax) * 100}%` }} title="Destroyed in this assault" />
            </div>
          </div>
        )}

        {report.loot && report.attackerWon && (
          <div className="p-3 rounded-xl border border-amber-500/40 bg-amber-950/20 space-y-2">
            <div className="font-bold text-amber-300 text-xs flex items-center gap-1.5">
              <Coins className="w-4 h-4 text-amber-400" /> Spoils of war (carried home by surviving troops)
            </div>
            <div className="flex items-center gap-1.5 flex-wrap text-xs">
              {report.loot.gold ? <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-amber-300">🪙 +{report.loot.gold.toLocaleString()}</span> : null}
              {report.loot.iron ? <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-200">⚙️ +{report.loot.iron.toLocaleString()}</span> : null}
              {report.loot.stone ? <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-stone-300">🪨 +{report.loot.stone.toLocaleString()}</span> : null}
              {report.loot.lumber ? <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-orange-300">🪵 +{report.loot.lumber.toLocaleString()}</span> : null}
              {report.loot.food ? <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-lime-300">🌾 +{report.loot.food.toLocaleString()}</span> : null}
              {Object.entries(report.loot.scarce ?? {}).map(([k, amt]) => {
                const def = SCARCE_RESOURCES.find((r) => r.key === k);
                return (
                  <span key={k} className="px-2 py-0.5 rounded bg-purple-950/60 border border-purple-500/40 text-purple-200">
                    {def?.emblem ?? "💎"} +{amt} {def?.name ?? k}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Round by round */}
        {rounds.length > 0 ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <ScrollText className="w-3.5 h-3.5" /> Round by round
            </div>
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-slate-500 text-[10px]">
                  <th className="text-left font-normal py-1">#</th>
                  <th className="text-left font-normal">Attackers: lost · dealt</th>
                  <th className="text-left font-normal">Defenders: lost · dealt</th>
                  <th className="text-right font-normal">Standing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {rounds.map((r) => (
                  <Fragment key={r.round}>
                    <tr>
                      <td className="py-1 text-slate-500">{r.round}</td>
                      {/* Each side as its numbers rise over it on the map: soldiers lost (red), damage dealt (gold) */}
                      {[
                        { lost: r.attackerLosses, dealt: r.attackerDamage, bar: "bg-amber-400/80", text: lossText(r.attackerLosses, r.bands) },
                        { lost: r.defenderLosses, dealt: r.defenderDamage, bar: "bg-purple-400/80", text: `−${r.defenderLosses.toLocaleString()}` }
                      ].map((side, i) => (
                        <td key={i} className="pr-2">
                          <div className="flex items-center gap-1.5">
                            <span className={`min-w-12 shrink-0 font-semibold tabular-nums whitespace-nowrap ${side.lost > 0 ? "text-rose-400" : "text-slate-600"}`}>{side.text}</span>
                            <div className={`h-1.5 rounded ${side.bar}`} style={{ width: `${(side.dealt / peakDamage) * 45}%` }} />
                            <span className="text-[10px] text-amber-200/80 tabular-nums whitespace-nowrap">⚔ {side.dealt.toLocaleString()}</span>
                          </div>
                        </td>
                      ))}
                      <td className="text-right text-slate-300 whitespace-nowrap">
                        {r.attackerRemaining.toLocaleString()} / {r.defenderRemaining.toLocaleString()}
                      </td>
                    </tr>
                    {/* Battle Arts this round: casts and Instincts by side (attackers gold, defenders violet), ticks on the side they hurt, Finales on their own line */}
                    {r.arts?.length ? (
                      <tr className="border-t-0">
                        <td />
                        <td colSpan={3} className="pb-1.5">
                          <div className="flex flex-wrap gap-1">
                            {r.arts.map((e, i) => (
                              <span
                                key={i}
                                className={`rounded px-1.5 py-0.5 text-[10px] leading-tight ${
                                  e.kind === "finale"
                                    ? "basis-full bg-amber-500/15 text-amber-200 font-semibold"
                                    : e.kind === "tick"
                                      ? "bg-slate-800/80 text-orange-200/90"
                                      : e.side === "attacker"
                                        ? "bg-amber-400/10 text-amber-100/90"
                                        : "bg-purple-400/10 text-purple-100/90"
                                }`}
                              >
                                {artEventText(e)}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <details className="text-xs">
          <summary className="cursor-pointer text-slate-400 hover:text-slate-200">Battle log ({report.combatLog.length})</summary>
          <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/90 p-2.5 space-y-1 text-slate-300">
            {report.combatLog.map((line, idx) => (
              <div key={idx}>{line}</div>
            ))}
          </div>
        </details>
      </div>
    </Modal>
  );
}
