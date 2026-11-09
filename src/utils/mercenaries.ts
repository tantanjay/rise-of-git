import type { ActiveMarch, BattleReport, CivilizationType, MercCost, MercRarity } from "@/types";

/**
 * Client copy of the mercenary rules the books and the camp quote (server/src/mercenaryRules.ts; `npm run sim:balance`
 * checks they match). The server hires, heals and fights; the client only shows what it is told.
 */

export const MERC_RARITIES: MercRarity[] = ["common", "uncommon", "rare", "epic", "legendary"];

const MIN = 60_000;
const HOUR = 60 * MIN;

export const MERC_RULES: Record<
  MercRarity,
  { models: number; power: number; minSlots: number; restockMs: number; maxStock: number; healFullMs: number; price: MercCost; upkeep: MercCost }
> = {
  common: { models: 20, power: 0.9, minSlots: 1, restockMs: 15 * MIN, maxStock: 10, healFullMs: 1 * HOUR, price: { gold: 1_000, food: 20_000 }, upkeep: { gold: 3, food: 150 } },
  uncommon: { models: 15, power: 1.0, minSlots: 1, restockMs: 30 * MIN, maxStock: 7, healFullMs: 2 * HOUR, price: { gold: 3_000, food: 40_000, iron: 10_000 }, upkeep: { gold: 6, food: 300 } },
  rare: { models: 10, power: 1.1, minSlots: 1, restockMs: 1 * HOUR, maxStock: 4, healFullMs: 4 * HOUR, price: { gold: 8_000, food: 80_000, iron: 30_000 }, upkeep: { gold: 15, food: 600, iron: 80 } },
  epic: { models: 5, power: 1.25, minSlots: 4, restockMs: 4 * HOUR, maxStock: 2, healFullMs: 8 * HOUR, price: { gold: 20_000, food: 150_000, iron: 80_000 }, upkeep: { gold: 40, food: 1_500, iron: 200 } },
  legendary: { models: 1, power: 1.4, minSlots: 5, restockMs: 24 * HOUR, maxStock: 1, healFullMs: 12 * HOUR, price: { gold: 50_000, food: 300_000, iron: 200_000 }, upkeep: { gold: 100, food: 3_000, iron: 500 } }
};

/** The Sellsword's Oath: a band lands this share of its blows on a world boss (its Arts still weaken the beast) */
export const BAND_BOSS_DAMAGE = 0.3;

/** 🪙 Battle pay: a band is paid this many harvests of its upkeep each time it fights (marching out, or defending its hirer's walls); unpaid, it stays out of the fight (mirrors BATTLE_PAY) */
export const BATTLE_PAY = { harvests: 1, emblem: "🪙", name: "Battle pay" } as const;
/** What one fight costs a band of `rarity` */
export const battlePayFor = (rarity: MercRarity): MercCost =>
  Object.fromEntries(Object.entries(MERC_RULES[rarity].upkeep).map(([k, v]) => [k, Math.ceil((v ?? 0) * BATTLE_PAY.harvests)])) as MercCost;

/** Healing costs the share of strength lost × this share of the hire price */
export const HEAL_PRICE_SHARE = 0.5;

/** Bands a ruler may hold: 1 with 1–3 march slots, 2 with 4–5 */
export const bandCapForSlots = (slots: number) => (slots >= 4 ? 2 : 1);

/** The map NPCs that hold a Mercenary Camp, by the civilization whose rulers hire there: each mortal province's legendary landmark and the Nethergarde Core */
export const MERC_CAMP_CIV: Record<string, CivilizationType> = {
  "legend-human": "human",
  "legend-elf": "elf",
  "legend-dwarf": "dwarf",
  "legend-orc": "orc",
  "npc-void-monolith": "arcane"
};

/** A ruler's own camp: the landmark that opens as their Mercenary Camp (any other landmark is scouted, as before) */
export const isOwnCamp = (npcId: string | undefined, civ: CivilizationType | null | undefined) => Boolean(npcId && civ && MERC_CAMP_CIV[npcId] === civ);

const RES_EMBLEM: Record<string, string> = { gold: "🪙", iron: "⛓️", stone: "🪨", lumber: "🪵", food: "🌾" };

/** "50k 🪙 · 300k 🌾 · 200k ⛓️" */
export function costText(c: MercCost | null | undefined, compact = true): string {
  const fmt = (n: number) => (compact && n >= 10_000 ? `${Math.round(n / 1000)}k` : n.toLocaleString("en-US"));
  return Object.entries(c ?? {})
    .filter(([, v]) => (v ?? 0) > 0)
    .map(([k, v]) => `${fmt(v as number)} ${RES_EMBLEM[k] ?? k}`)
    .join(" · ");
}

/** "1h" / "15m" / "a day" */
export function mercDurationText(ms: number): string {
  if (ms >= 24 * HOUR) return ms === 24 * HOUR ? "a day" : `${Math.round(ms / (24 * HOUR))} days`;
  if (ms >= HOUR) return `${Math.round((ms / HOUR) * 10) / 10}h`;
  return `${Math.max(1, Math.round(ms / MIN))}m`;
}

/** "−18%" for a band's loss of `lost` soldier-equivalents out of `fullCount` */
export const bandLossText = (lost: number, fullCount: number) => (lost > 0 ? `−${Math.max(1, Math.round((lost / Math.max(1, fullCount)) * 100))}%` : "−0%");

/** How a march's force reads in a line: "1,240" soldiers, or a band as "Ironbreakers 82%" */
export const marchForceText = (m: Pick<ActiveMarch, "soldiersCount" | "band" | "fogged">) => (m.band ? `${m.band.name} ${Math.round(m.band.strength * 100)}%` : m.fogged ? "?" : m.soldiersCount.toLocaleString());

export type ReportArmy = NonNullable<BattleReport["armies"]>[number];
/**
 * 🪙 A side's soldiers apart from its bands: a band's soldier-equivalents aren't soldiers, so the card counts soldiers and
 * lists each band by strength. Only when the side's armies add up to its totals (older reports keep their totals).
 */
export function splitBands(armies: ReportArmy[], initial: number, losses: number) {
  const bandArmies = armies.filter((a) => a.band);
  const sum = armies.reduce((t, a) => t + a.initial, 0);
  if (!bandArmies.length || bandArmies.length === armies.length || sum !== initial) return { initial, losses, bands: undefined };
  const soldiers = armies.filter((a) => !a.band);
  return {
    initial: soldiers.reduce((t, a) => t + a.initial, 0),
    losses: soldiers.reduce((t, a) => t + a.losses, 0),
    bands: bandArmies.map((a) => {
      const full = Math.max(1, a.band!.fullCount);
      const name = a.name.includes("'s ") ? a.name.slice(a.name.lastIndexOf("'s ") + 3) : a.name;
      return { name, emblem: a.band!.emblem, start: a.initial / full, lost: a.losses / full };
    })
  };
}

/** A report side's losses in a line: soldiers "70", each band by strength "−2%" ("70 −2% −2%") */
export function sideLossText(armies: ReportArmy[], initial: number, losses: number): string {
  // A side of bands only (a lone band's march): each by strength
  if (armies.length && armies.every((a) => a.band)) return armies.map((a) => bandLossText(a.losses, a.band!.fullCount)).join(" ");
  const split = splitBands(armies, initial, losses);
  return [split.losses.toLocaleString(), ...(split.bands ?? []).map((b) => bandLossText(b.lost, 1))].join(" ");
}
