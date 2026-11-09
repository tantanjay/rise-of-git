import type { CivilizationType } from "./types.js";
import { KIT_SIZES, UnitKit } from "./battleArts.js";
import { calculateMaxPopulation } from "./demographics.js";
import { marchCapacityFor, marchSlotsForLevel, maxSoldiersFor } from "./warConfig.js";

/**
 * 🪙 Mercenaries (GAME_GUIDE §13 *Mercenaries*): the pure rules, no database. A mercenary band is one whole march: it
 * takes one march slot on its own, fights as one full march of its hirer at hire time (`fullMarchFor`) × its rarity's
 * power, carries a Battle Arts kit of its rarity themed to its civilization, and counts
 * its losses as strength (a band of one can't lose "−320 soldiers"). `npm run sim:balance` holds every rarity on its
 * power, Arts included (BAND_COUNT_MULT).
 */

export type MercRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export const MERC_RARITIES: MercRarity[] = ["common", "uncommon", "rare", "epic", "legendary"];

/** Resources a hire, a heal or an upkeep costs */
export type MercCost = Partial<Record<"gold" | "iron" | "stone" | "lumber" | "food", number>>;

export interface MercRarityRule {
  /** Models walking in the band (each carries its share of the band's stats) */
  models: number;
  /** The band's power as a share of one full march of its hirer */
  power: number;
  /** March slots needed to hire one (`marchSlotsForLevel`) */
  minSlots: number;
  /** A camp gets a new recruit of this rarity this often… */
  restockMs: number;
  /** …up to this many waiting */
  maxStock: number;
  /** Time a band at 0% would take to heal to full (a band heals the share it lost × this) */
  healFullMs: number;
  /** Paid once, when hired */
  price: MercCost;
  /** Paid every harvest while the band is held (home, marching, defending, wounded or healing); each fight also costs its battle pay (BATTLE_PAY) */
  upkeep: MercCost;
}

const MIN = 60_000;
const HOUR = 60 * MIN;

export const MERC_RULES: Record<MercRarity, MercRarityRule> = {
  common: { models: 20, power: 0.9, minSlots: 1, restockMs: 15 * MIN, maxStock: 10, healFullMs: 1 * HOUR, price: { gold: 1_000, food: 20_000 }, upkeep: { gold: 3, food: 150 } },
  uncommon: { models: 15, power: 1.0, minSlots: 1, restockMs: 30 * MIN, maxStock: 7, healFullMs: 2 * HOUR, price: { gold: 3_000, food: 40_000, iron: 10_000 }, upkeep: { gold: 6, food: 300 } },
  rare: { models: 10, power: 1.1, minSlots: 1, restockMs: 1 * HOUR, maxStock: 4, healFullMs: 4 * HOUR, price: { gold: 8_000, food: 80_000, iron: 30_000 }, upkeep: { gold: 15, food: 600, iron: 80 } },
  epic: { models: 5, power: 1.25, minSlots: 4, restockMs: 4 * HOUR, maxStock: 2, healFullMs: 8 * HOUR, price: { gold: 20_000, food: 150_000, iron: 80_000 }, upkeep: { gold: 40, food: 1_500, iron: 200 } },
  legendary: { models: 1, power: 1.4, minSlots: 5, restockMs: 24 * HOUR, maxStock: 1, healFullMs: 12 * HOUR, price: { gold: 50_000, food: 300_000, iron: 200_000 }, upkeep: { gold: 100, food: 3_000, iron: 500 } }
};

/** Where a band won't march (none today: bands attack every target a ruler's soldiers can, world bosses included) */
export const BAND_TARGET_BLOCK: Partial<Record<string, string>> = {};

/**
 * The Sellsword's Oath: a band lands this share of its blows on a world boss (its Arts still weaken the beast). Bosses
 * are the realm's raid content, so a ruler's bands help their soldiers there without letting one ruler kill a boss
 * alone (sim:balance checks it)
 */
export const BAND_BOSS_DAMAGE = 0.3;
/**
 * 🪙 Battle pay: a band is paid on the spot every time it fights, on top of its upkeep: this many harvests of its
 * upkeep when it marches out to attack, and again when it takes its hirer's walls in a defence. A treasury that can't
 * pay keeps the band out of that fight (it won't march; it stays inside while the walls are attacked)
 */
export const BATTLE_PAY = { harvests: 1, emblem: "🪙", name: "Battle pay" } as const;
/** What one fight costs a band of `rarity` (BATTLE_PAY) */
export const battlePayFor = (rarity: MercRarity): MercCost =>
  Object.fromEntries(Object.entries(MERC_RULES[rarity].upkeep).map(([k, v]) => [k, Math.ceil((v ?? 0) * BATTLE_PAY.harvests)])) as MercCost;

/** Healing costs the share of strength lost × this share of the hire price */
export const HEAL_PRICE_SHARE = 0.5;

/** Bands a ruler may hold: 1 with 1–3 march slots, 2 with 4–5 */
export const bandCapForSlots = (slots: number) => (slots >= 4 ? 2 : 1);

/** Why a ruler with `slots` march slots holding `held` bands can't hire a band of `rarity` (null = they can) */
export function hireBlockReason(rarity: MercRarity, slots: number, held: number): string | null {
  const need = MERC_RULES[rarity].minSlots;
  if (slots < need) return `Needs ${need} march slots (City Hall ${need * 5 - 4}+)`;
  const cap = bandCapForSlots(slots);
  if (held >= cap) return cap === 1 ? "You already hold a band (a second needs 4 march slots)" : `You already hold ${cap} bands`;
  return null;
}

/** Every resource of a cost × `share`, rounded up */
export const scaleCost = (cost: MercCost, share: number): MercCost =>
  Object.fromEntries(Object.entries(cost).map(([k, v]) => [k, Math.ceil((v ?? 0) * Math.max(0, share))]).filter(([, v]) => (v as number) > 0));

/** What healing a band from `strength` to full costs, and how long it takes */
export function healPlan(rarity: MercRarity, strength: number): { cost: MercCost; ms: number } {
  const lost = Math.max(0, Math.min(1, 1 - strength));
  const r = MERC_RULES[rarity];
  return { cost: scaleCost(r.price, lost * HEAL_PRICE_SHARE), ms: Math.round(lost * r.healFullMs) };
}

/* ------------------------------------------------------------------------- */
/* Pools: one mercenary per rarity per civilization, slot for slot alike      */
/* ------------------------------------------------------------------------- */

export interface MercDef {
  /** Model key (the client's MERCENARY_RIGS) */
  type: string;
  name: string;
  emblem: string;
  rarity: MercRarity;
}

const def = (type: string, name: string, emblem: string, rarity: MercRarity): MercDef => ({ type, name, emblem, rarity });

/** Each civilization's pool, common → legendary (the client's MERCENARY_POOLS holds the looks; sim:balance checks they agree) */
export const MERC_POOLS: Record<CivilizationType, MercDef[]> = {
  human: [
    def("merc-human-levy", "Village Levy", "🌾", "common"),
    def("merc-human-shieldbearer", "Dawn Banner Shieldbearer", "🛡️", "uncommon"),
    def("merc-human-friar", "Lantern Friar", "🏮", "rare"),
    def("merc-human-paladin", "Dawnbreaker Paladin", "☀️", "epic"),
    def("merc-human-champion", "Ser Aldric, Champion of the Dawn Banner", "👑", "legendary")
  ],
  elf: [
    def("merc-elf-initiate", "Grove Initiate", "🌿", "common"),
    def("merc-elf-warden", "Leafward Warden", "🍃", "uncommon"),
    def("merc-elf-oracle", "Moonwell Oracle", "🌙", "rare"),
    def("merc-elf-bladesinger", "Thousand-Year Bladesinger", "🌀", "epic"),
    def("merc-elf-archer", "The White Archer", "🏹", "legendary")
  ],
  dwarf: [
    def("merc-dwarf-delver", "Tunnel Delver", "⛏️", "common"),
    def("merc-dwarf-hearthguard", "Hearthguard", "🛡️", "uncommon"),
    def("merc-dwarf-runesmith", "Runesmith", "⚒️", "rare"),
    def("merc-dwarf-ironbreaker", "Ironbreaker in Steam Plate", "🔥", "epic"),
    def("merc-dwarf-holdking", "The Bronze Hold-King", "🔨", "legendary")
  ],
  orc: [
    def("merc-orc-raider", "Grunt Raider", "🪵", "common"),
    def("merc-orc-brute", "Bonewall Brute", "🦴", "uncommon"),
    def("merc-orc-shaman", "Blood Shaman", "🩸", "rare"),
    def("merc-orc-berserker", "Ravager Berserker", "💢", "epic"),
    def("merc-orc-warlord", "Warlord of Drak'mar", "🪓", "legendary")
  ],
  arcane: [
    def("merc-void-acolyte", "Rift Acolyte", "🕯️", "common"),
    def("merc-void-riftguard", "Riftguard Sentinel", "🛡️", "uncommon"),
    def("merc-void-seer", "Astral Seer", "🔭", "rare"),
    def("merc-void-reaver", "Eclipse Reaver", "🌑", "epic"),
    def("merc-void-archmage", "Archmage of the Voidrift", "🧙", "legendary")
  ]
};

/** A civilization's mercenary of a rarity (a civ change carries a band over as this counterpart) */
export const mercDefFor = (civ: CivilizationType, rarity: MercRarity): MercDef => (MERC_POOLS[civ] ?? MERC_POOLS.human).find((d) => d.rarity === rarity)!;

/**
 * Each civilization's mercenary Battle Arts, themed to its traits: a band carries the first slots by its rarity
 * (KIT_SIZES: common 1 Instinct, uncommon + 1 Art, rare + a second Instinct, epic + a second Art, legendary + the Finale)
 */
export const MERC_CIV_KITS: Record<CivilizationType, { instincts: [string, string]; arts: [string, string]; finale: string }> = {
  // Valoria: many hands, a shield wall, and the dawn
  human: { instincts: ["stoneskin", "bloodlust"], arts: ["shield_wall", "second_wind"], finale: "dawnbreaker" },
  // Sylvandale: sharp eyes, frost and the forest that grips
  elf: { instincts: ["keen_eye", "light_footed"], arts: ["frost_lance", "venom_volley"], finale: "grasping_roots" },
  // Ironforge: stone skin, broken armour, blackpowder, and the mountain coming down
  dwarf: { instincts: ["stoneskin", "thick_hide"], arts: ["armor_break", "blackpowder"], finale: "avalanche" },
  // Drak'mar: blood, rage and the first charge (its Arts strike for the band itself: a war cry would lift every march beside it)
  orc: { instincts: ["bloodlust", "enrage"], arts: ["rending_blow", "ambush"], finale: "wild_hunt" },
  // Nethergarde: the undying and fire from the void
  arcane: { instincts: ["undying", "keen_eye"], arts: ["fireball", "thunderclap"], finale: "cataclysm" }
};

/** A band's kit as it fights, named for the reports */
export function mercKitFor(civ: CivilizationType, rarity: MercRarity, name = mercDefFor(civ, rarity).name): UnitKit {
  const all = MERC_CIV_KITS[civ] ?? MERC_CIV_KITS.human;
  const size = KIT_SIZES[rarity];
  return {
    name,
    rarity,
    instincts: all.instincts.slice(0, size.instincts),
    arts: all.arts.slice(0, size.arts),
    ...(size.finale ? { finale: all.finale } : {})
  };
}

/**
 * Soldier-equivalents a band fields per soldier of its hirer's full march, by civilization and rarity: its power less
 * what its kit adds, so the band with its Arts lands on its power (measured by `npm run sim:balance`)
 */
export const BAND_COUNT_MULT: Record<CivilizationType, Record<MercRarity, number>> = {
  human: { common: 0.889, uncommon: 0.865, rare: 0.88, epic: 0.845, legendary: 0.797 },
  elf: { common: 0.862, uncommon: 0.843, rare: 0.87, epic: 0.904, legendary: 0.911 },
  dwarf: { common: 0.815, uncommon: 0.816, rare: 0.778, epic: 0.814, legendary: 0.807 },
  orc: { common: 0.856, uncommon: 0.858, rare: 0.928, epic: 0.973, legendary: 0.99 },
  arcane: { common: 0.791, uncommon: 0.802, rare: 0.824, epic: 0.821, legendary: 0.814 }
};

/**
 * "A full march" of a ruler, the base a band's power is counted from: the march they field from every slot, i.e. their
 * soldier cap (at full population) shared over their march slots, never more than their march capacity. At high City
 * Halls the soldier cap binds (a City Hall 25 human fills 5 slots with 500 each, not their 1,000 capacity), so this
 * keeps a band on its rarity's power against the marches the ruler really sends.
 */
export function fullMarchFor(maxPopulation: number, civ: CivilizationType, slots: number): number {
  return Math.max(1, Math.min(marchCapacityFor(maxPopulation, civ), Math.floor(maxSoldiersFor(maxPopulation, civ) / Math.max(1, slots))));
}

/**
 * Soldier-equivalents of a band at full strength: it fights as this many of its civilization's soldiers (their traits and
 * civilization buffs, never its ruler's titles or landmarks), with its kit
 */
export function bandFullCount(civ: CivilizationType, rarity: MercRarity, fullMarch: number): number {
  return Math.max(MERC_RULES[rarity].models, Math.round(Math.max(1, fullMarch) * (BAND_COUNT_MULT[civ]?.[rarity] ?? 1)));
}

/**
 * A civilization change carries a band over as its counterpart, wounds included: the same rarity of the new pool, at the
 * same strength and the same power, i.e. the soldier-equivalents of the new civilization that make the same share of
 * a full march at the ruler's City Hall
 */
export function bandCountOnCivChange(fullCount: number, rarity: MercRarity, from: CivilizationType, to: CivilizationType, cityHallLevel: number): number {
  if (from === to) return fullCount;
  const cap = (civ: CivilizationType) => fullMarchFor(calculateMaxPopulation(cityHallLevel, civ), civ, marchSlotsForLevel(cityHallLevel));
  const marches = fullCount / Math.max(1e-9, cap(from) * (BAND_COUNT_MULT[from]?.[rarity] ?? 1));
  return bandFullCount(to, rarity, Math.round(marches * cap(to)));
}

/* ------------------------------------------------------------------------- */
/* Camps: each region's legendary landmark                                   */
/* ------------------------------------------------------------------------- */

/** Mercenary camps by the map NPC they stand at (each mortal province's legendary landmark, the Nethergarde Core): only rulers of `civ` hire there, from its pool */
export const MERC_CAMPS: Record<string, { name: string; region: string; civ: CivilizationType }> = {
  "legend-human": { name: "The Cathedral of the Dawn Banner", region: "Valoria", civ: "human" },
  "legend-elf": { name: "The Heart-Oak", region: "Sylvandale", civ: "elf" },
  "legend-dwarf": { name: "The Anvil of the Gods", region: "Ironforge", civ: "dwarf" },
  "legend-orc": { name: "The Bloodfire Throne", region: "Drak'mar", civ: "orc" },
  "npc-void-monolith": { name: "The Nethergarde Core", region: "Nethergarde Voidrift", civ: "arcane" }
};

/**
 * A camp's stock now: `available` recruits of a rarity last counted at `updatedAt`, one more every `restockMs` up to
 * `maxStock`. Returns the count and the clock to store (it keeps the time towards the next recruit)
 */
export function stockNow(rarity: MercRarity, available: number, updatedAt: number, now: number): { available: number; updatedAt: number; nextAt: number | null } {
  const r = MERC_RULES[rarity];
  if (available >= r.maxStock) return { available: r.maxStock, updatedAt: now, nextAt: null };
  const gained = Math.max(0, Math.floor((now - updatedAt) / r.restockMs));
  const n = Math.min(r.maxStock, available + gained);
  if (n >= r.maxStock) return { available: n, updatedAt: now, nextAt: null };
  const at = updatedAt + gained * r.restockMs;
  return { available: n, updatedAt: at, nextAt: at + r.restockMs };
}

/** "1h" / "15m" / "1 day" */
export function mercDurationText(ms: number): string {
  if (ms >= 24 * HOUR) return ms === 24 * HOUR ? "a day" : `${Math.round(ms / (24 * HOUR))} days`;
  if (ms >= HOUR) return `${Math.round((ms / HOUR) * 10) / 10}h`;
  return `${Math.round(ms / MIN)}m`;
}
