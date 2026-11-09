import { ActiveMarch, CivilizationType } from "@/types";

/** Banner colour and emblem of each civilization's armies */
export const CIV_WAR_COLOR: Record<CivilizationType, string> = {
  human: "#3b82f6",
  elf: "#10b981",
  dwarf: "#f97316",
  orc: "#ef4444",
  arcane: "#a855f7"
};

export const CIV_EMBLEM: Record<CivilizationType, string> = {
  human: "👑",
  elf: "🌸",
  dwarf: "⚒️",
  orc: "⚔️",
  arcane: "🔮"
};

export const BATTLE_FIGHT_MS = 6000;
export const BATTLE_OUTCOME_MS = 6000;
export const BATTLE_SHOWCASE_MS = BATTLE_FIGHT_MS + BATTLE_OUTCOME_MS;

export type MarchPhase = "marching" | "fighting" | "gathering" | "rallying" | "stationed" | "victory" | "defeat" | "returning" | "done";

/**
 * How this march's battle went for it: victory / defeat for the attackers (leader or rally members), defeat for
 * gatherers driven off their node; null when it fought no battle (scouts, gatherers left in peace or who won).
 */
function battleOutcome(m: ActiveMarch): "victory" | "defeat" | null {
  const r = m.battleResult;
  if (!r || m.kind === "scout") return null;
  if (r.attackerId === m.attackerId || r.participants?.includes(m.attackerId)) return r.attackerWon ? "victory" : "defeat";
  return marchLost(m) ? "defeat" : null;
}

/** The outcome stands on the battlefield for BATTLE_OUTCOME_MS after the battle ends, then the survivors set off home */
const outcomeHeld = (m: ActiveMarch, now: number) => battleOutcome(m) !== null && now - battleEndOf(m) < BATTLE_OUTCOME_MS;

/** When a returning army starts walking home: after its battle's outcome has been shown (never later than it gets home) */
export function returnStartOf(m: ActiveMarch): number {
  const end = battleEndOf(m);
  if (!battleOutcome(m)) return end;
  return Math.min(end + BATTLE_OUTCOME_MS, m.returnTime ?? end + BATTLE_OUTCOME_MS);
}

/** Where a march is in its life at `now`, honoring server `m.phase` (`outbound | acting | returning | done`) */
export function marchPhase(m: ActiveMarch, now: number): MarchPhase {
  const srvPhase = m.phase;
  if (srvPhase === "returning") {
    // The server turns the army home the moment the battle ends: show the outcome there first (also for a
    // Voidrift win, whose march ends where it stands)
    if (outcomeHeld(m, now)) return battleOutcome(m)!;
    const retEnd = m.returnTime ?? m.arrivalTime + BATTLE_OUTCOME_MS;
    return now < retEnd ? "returning" : "done";
  }
  if (srvPhase === "acting") {
    return m.gather ? "gathering" : "fighting";
  }
  // Waiting in a rally lobby at the leader's castle, or guarding an ally's walls
  if (srvPhase === "rallying") return "rallying";
  if (srvPhase === "stationed") return "stationed";
  if (srvPhase === "done" || m.status === "resolved") {
    // Wiped out (no one walks home): the outcome shows right after the battle; a march that came home showed it already
    return outcomeHeld(m, now) ? battleOutcome(m)! : "done";
  }
  // Scouts never fight: until the server turns them around they wait at the end of the road
  if (now < m.arrivalTime || m.kind === "scout") return "marching";
  // Gatherers never fight on arrival: they set to work as soon as the server claims the node for them
  if (m.kind === "gather") return "gathering";
  const sinceArrival = now - m.arrivalTime;
  if (sinceArrival < BATTLE_FIGHT_MS || !m.battleResult) return sinceArrival < BATTLE_SHOWCASE_MS * 6 ? "fighting" : "done";
  if (sinceArrival < BATTLE_SHOWCASE_MS) return m.battleResult.attackerWon ? "victory" : "defeat";
  return "done";
}

/** Next moment marchPhase(m) can change (for scheduling a re-render instead of re-rendering every frame) */
export function nextPhaseChange(m: ActiveMarch, now: number): number | null {
  const marks: number[] = [m.arrivalTime, m.arrivalTime + BATTLE_FIGHT_MS, m.arrivalTime + BATTLE_SHOWCASE_MS];
  if (m.actUntil) marks.push(m.actUntil, m.actUntil + BATTLE_OUTCOME_MS);
  if (m.returnTime) marks.push(m.returnTime, m.returnTime + BATTLE_OUTCOME_MS);
  const upcoming = marks.filter((t) => t > now).sort((a, b) => a - b);
  return upcoming[0] ?? null;
}

/** Current interpolated world-map (x, z) of an outbound, fighting, or returning march */
export function interpolateMarchPosition(m: ActiveMarch, now = Date.now()): { x: number; z: number } {
  const phase = marchPhase(m, now);
  if (phase === "marching") {
    const t = Math.min(1, Math.max(0, (now - m.departTime) / Math.max(1, m.arrivalTime - m.departTime)));
    return {
      x: m.startX + (m.targetX - m.startX) * t,
      z: m.startZ + (m.targetZ - m.startZ) * t
    };
  }
  if (phase === "returning") {
    const t0 = returnStartOf(m);
    const t1 = m.returnTime ?? t0 + 30_000;
    const t = Math.min(1, Math.max(0, (now - t0) / Math.max(1, t1 - t0)));
    return {
      x: m.targetX + (m.startX - m.targetX) * t,
      z: m.targetZ + (m.startZ - m.targetZ) * t
    };
  }
  return { x: m.targetX, z: m.targetZ };
}

/** "4m 05s" / "42s" */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}

/** Longer timers: "3d 4h" / "5h 12m" / "4m 05s" (boss respawn, weekly rotation, burning walls) */
export function formatLongDuration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  if (total < 3600) return formatDuration(ms);
  const h = Math.floor(total / 3600);
  if (h < 24) return `${h}h ${Math.floor((total % 3600) / 60)}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/** "just now" / "12m ago" / "3h ago" / "2d ago" */
export function formatAgo(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - at) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

/** Icon of each march kind (March Queue, War Room, target panel) */
export const MARCH_KIND_ICON: Record<string, string> = {
  attack: "⚔️",
  rally: "🚩",
  rally_join: "🚩",
  scout: "👁️",
  gather: "⛏️",
  reinforce: "🛡️"
};

/** Scouting parties are this small, in civilians (mirror of server SCOUT_MAX_SOLDIERS) */
export const SCOUT_MAX_SOLDIERS = 5;

/** The mount each civilization's scouts ride (GAME_GUIDE §13 Scouting; the actor `mount_<civ>`) */
export const SCOUT_MOUNT: Record<CivilizationType, { name: string; blurb: string }> = {
  human: { name: "Courser", blurb: "a bay riding horse under a saddle cloth in the kingdom's colours, saddlebags packed for the road" },
  elf: { name: "Moonstag", blurb: "a pale stag with silver-tipped antlers, ridden bareback on a leaf-green cloth" },
  dwarf: { name: "War Ram", blurb: "a shaggy mountain ram with great curled horns, sure-footed on any pass" },
  orc: { name: "Warg", blurb: "a hulking grey wolf with a bone-and-hide saddle, ears always pricked" },
  arcane: { name: "Voidmare", blurb: "a night-black mare with a violet mane whose eyes glow like embers of the Void" }
};

/** A routed army's broken standard stays on the map this long after its battle ends */
export const DEFEAT_MARKER_MS = 45_000;

/**
 * True when this march lost its battle: attackers (leader or rally member) that were repelled, or gatherers
 * driven off their node. Scouts never fight.
 */
export function marchLost(m: ActiveMarch): boolean {
  const r = m.battleResult;
  if (!r || m.kind === "scout") return false;
  const onAttack = r.attackerId === m.attackerId || Boolean(r.participants?.includes(m.attackerId));
  if (onAttack) return !r.attackerWon;
  return Boolean(m.gather) && r.defenderId === m.attackerId && r.attackerWon;
}

/** When a march's battle ended (the server sets act_until as it turns the army home) */
export const battleEndOf = (m: ActiveMarch) => m.actUntil ?? m.returnTime ?? m.arrivalTime;

/** The live battle at a target, if any: its current round (for "In combat" banners) */
export function combatAt(targetId: string | undefined, marches: ActiveMarch[]): { round: number; maxRounds: number } | null {
  if (!targetId) return null;
  const m = marches.find((x) => x.targetId === targetId && x.phase === "acting" && !x.gather && x.kind !== "scout");
  if (!m) {
    // Gatherers on this node fighting off an attack
    const g = marches.find((x) => x.targetId === targetId && x.phase === "acting" && x.gather?.pausedAt);
    return g ? { round: g.currentBattleRound ?? 1, maxRounds: g.maxBattleRounds ?? 6 } : null;
  }
  return { round: m.currentBattleRound ?? 1, maxRounds: m.maxBattleRounds ?? 6 };
}

/** World bosses' Colossus Hide (mirrors bossHideMult in server/src/warConfig.ts): share of their blows an army lands, by its ruler's City Hall */
export function bossHideMult(cityHallLevel: number): number {
  return Math.min(1, Math.max(1, cityHallLevel) / 25) ** 2;
}

/** A civilization's share of its blows that lands on a world boss, on top of Colossus Hide (mirrors CIV_BOSS_DAMAGE in server/src/warConfig.ts) */
export const CIV_BOSS_DAMAGE: Partial<Record<CivilizationType, { mult: number; emblem: string; name: string; description: string }>> = {
  orc: { mult: 0.5, emblem: "🪓", name: "Frenzy Breaks on Colossi", description: "−50% damage to world bosses (the war-drums can't drown a colossus's roar)" },
  elf: { mult: 2, emblem: "🏹", name: "Heartseeker Volleys", description: "+100% damage to world bosses (an elven arrow finds the one soft seam in a colossus's hide)" },
  dwarf: { mult: 1.8, emblem: "⚒️", name: "Giant-Felling Runes", description: "+80% damage to world bosses (the old runes on dwarven steel were cut for giants)" }
};

/**
 * 🌙 Moonwell Healers (mirrors MOONWELL in server/src/warConfig.ts): the share of an elf army's battle losses carried home
 * wounded, how many heal at each harvest, and what hastening one costs (plus one Sylvan Emerald per HASTEN_SOLDIERS_PER_EMERALD)
 */
export const MOONWELL = {
  CIVS: ["elf"] as CivilizationType[],
  WOUNDED_SHARE: 0.5,
  HEAL_SHARE_PER_HARVEST: 0.02,
  HEAL_MIN_PER_HARVEST: 1,
  HASTEN_PER_SOLDIER: { food: 20, gold: 2 },
  HASTEN_SOLDIERS_PER_EMERALD: 25,
  HASTEN_GEM: "emerald"
} as const;
/** The trait's line on the elf civ card (traitModifiers in civLore.ts appends it after the buffs) */
export const MOONWELL_TRAIT = {
  name: "Moonwell Healers",
  emblem: "🌙",
  description: `${MOONWELL.WOUNDED_SHARE * 100}% of the soldiers lost in battle come home wounded instead of dying (${MOONWELL.HEAL_SHARE_PER_HARVEST * 100}% of the soldier cap rejoins the garrison at each harvest, or hastened for ${MOONWELL.HASTEN_PER_SOLDIER.food} food + ${MOONWELL.HASTEN_PER_SOLDIER.gold} gold each and an emerald per ${MOONWELL.HASTEN_SOLDIERS_PER_EMERALD})`
} as const;
/** What hastening `count` wounded soldiers costs (mirrors hastenCostFor) */
export function hastenCostFor(count: number): { food: number; gold: number; gems: Record<string, number> } {
  const n = Math.max(0, Math.floor(count));
  return {
    food: n * MOONWELL.HASTEN_PER_SOLDIER.food,
    gold: n * MOONWELL.HASTEN_PER_SOLDIER.gold,
    gems: n > 0 ? { [MOONWELL.HASTEN_GEM]: Math.ceil(n / MOONWELL.HASTEN_SOLDIERS_PER_EMERALD) } : {}
  };
}

/** 🗿 Titan's Endurance: the most of a world boss's max HP one battle can take (mirrors BOSS_BATTLE_CAP in server/src/warConfig.ts) */
export const BOSS_BATTLE_CAP = { share: 0.6, emblem: "🗿", name: "Titan's Endurance" } as const;
/** 🌋 Colossus's Wrath: one ruler past `trigger` of a boss's max HP in a battle, and it rages (mirrors BOSS_WRATH) */
export const BOSS_WRATH = { trigger: 0.3, atkMult: 2, emblem: "🌋", name: "Colossus's Wrath" } as const;

/** Frontier gates belong to their province's civilization, whose rulers can't attack or rally on them (mirrors NPC_GATE_CIV in server/src/warConfig.ts) */
export const NPC_GATE_CIV: Record<string, CivilizationType> = {
  "npc-gate-valoria": "human",
  "npc-gate-drakmar": "orc",
  "npc-gate-sylvandale": "elf",
  "npc-gate-ironforge": "dwarf"
};

/** Frontier gates (mirror of GATE in server/src/warConfig.ts): the province seal, gate duty and Watched Borders (scouts caught) */
export const GATE_LEVEL = 20;
export const GATE_WALL_TIER = 3;
export const GATE_WALL_HP = 12_000;
export const GATE_BASE_GARRISON: Record<CivilizationType, number> = { human: 430, orc: 490, dwarf: 95, elf: 45, arcane: 0 };
/** Base garrison + troops on gate duty never exceed this (human / orc: their population at City Hall 20; dwarf / elf trimmed) */
export const GATE_REINFORCE_CAP: Record<CivilizationType, number> = { human: 4000, orc: 2800, dwarf: 800, elf: 380, arcane: 0 };
/** Per soldier on gate duty per harvest, on top of the normal 1 food upkeep */
export const GATE_DUTY_UPKEEP = { food: 1, lumber: 1, stone: 1, iron: 1 } as const;
export const GATE_DUTY_TEXT = "1 food, 1 lumber, 1 stone and 1 iron";
/** Catch chance for scouts heading into a sealed province: base, rising to max as its gate fills up */
export const GATE_SCOUT_CATCH = { base: 0.15, max: 0.3 } as const;
/** Spies & Counterspies: base odds and per-tier / per-scout modifiers (mirror of SCOUT_ODDS in server/src/warConfig.ts) */
export const SCOUT_ODDS = {
  caughtBase: 0.12,
  deceivedBase: 0.1,
  perExtraScout: 0.02,
  perLanternTier: 0.02,
  elfBonus: 0.05,
  spySuccessPerTier: 0.03,
  spyCatchPerTier: 0.03,
  spyDeceivePerTier: 0.02,
  minSuccess: 0.5,
  maxSuccess: 0.95,
  lieMin: 0.3,
  lieMax: 0.6
} as const;

/** One ruler's troops stationed at a castle or frontier gate */
export interface StationedGroup {
  ownerId: string;
  ownerName: string;
  civ: CivilizationType;
  count: number;
}

/**
 * Reinforcements at a host (a castle or a frontier gate) from the live marches: stationed troops summed per sender
 * (biggest first), split into the viewer's own and their allies', plus troops still on the road there
 */
export function stationedAt(marches: ActiveMarch[], hostId: string, viewerId: string | null | undefined) {
  const live = (m: ActiveMarch) => m.kind === "reinforce" && m.status === "marching" && m.targetId === hostId && !m.fogged;
  const byOwner = new Map<string, StationedGroup>();
  let onTheWay = 0;
  for (const m of marches) {
    if (!live(m)) continue;
    if ((m.phase ?? "outbound") === "outbound") {
      onTheWay += m.soldiersCount;
      continue;
    }
    if (m.phase !== "stationed") continue;
    const g = byOwner.get(m.attackerId) ?? { ownerId: m.attackerId, ownerName: m.attackerName, civ: m.attackerCiv, count: 0 };
    g.count += m.soldiersCount;
    byOwner.set(m.attackerId, g);
  }
  const groups = [...byOwner.values()].sort((a, b) => b.count - a.count);
  const total = groups.reduce((s, g) => s + g.count, 0);
  const yours = groups.find((g) => g.ownerId === viewerId)?.count ?? 0;
  return { total, yours, allies: total - yours, groups, onTheWay };
}
