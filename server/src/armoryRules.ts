import type { ArmoryCost, ArmoryRarity, CivilizationType } from "./types.js";

export type { ArmoryCost, ArmoryRarity };

/**
 * 🗡️ The Armory (GAME_GUIDE §13 *The Armory*): the pure rules, no database. Every civilization forges three sets of war
 * gear of its own (uncommon, rare, epic). A ruler forges sets into their armory (a cost per set), keeps them (an upkeep
 * every harvest, or the unpaid ones rust back to the stock pile) and equips a whole attack or rally march in one set; the
 * home garrison defends in the best sets left at home. A set's stat gains (or its civilization's edge) are tuned with
 * `npm run sim:balance` so its power lands on its rarity's `power`, and its forging cost is what the same power would
 * cost in extra soldiers (`SOLDIER_WORTH`): quality over quantity, never free power.
 */

export const ARMORY_RARITIES: ArmoryRarity[] = ["uncommon", "rare", "epic"];
/** What a march wears: the stock gear every soldier is armed with, or one of the civilization's sets */
export type Loadout = "standard" | ArmoryRarity;

/** A civilization's edge on a set, on top of its stat gains (each changes that civilization's soldier trait the same way) */
export interface GearEdge {
  /** Share of the enemy's armor ignored, added to the soldiers' own */
  pierce?: number;
  /** Multiplier on all damage taken */
  taken?: number;
  /** Attack multiplier in round 1 only */
  firstAtk?: number;
  /** Multiplier on damage taken in round 1 only */
  firstTaken?: number;
  /** Attack bonus while outnumbering the enemy (scaled by the ratio, capped at 2:1), added to the soldiers' own */
  outnumber?: number;
}

export interface ArmorySet {
  rarity: ArmoryRarity;
  name: string;
  emblem: string;
  /** Shares added to the soldiers' HP / ATK / DEF (0.1 = +10%), multiplied on top of civilization buffs and titles */
  hp: number;
  atk: number;
  def: number;
  edge?: GearEdge;
  /** One line on what it is, for the books */
  story: string;
}

const set = (rarity: ArmoryRarity, name: string, emblem: string, stats: { hp?: number; atk?: number; def?: number }, story: string, edge?: GearEdge): ArmorySet => ({
  rarity,
  name,
  emblem,
  hp: stats.hp ?? 0,
  atk: stats.atk ?? 0,
  def: stats.def ?? 0,
  ...(edge ? { edge } : {}),
  story
});

/**
 * Each civilization's three sets, uncommon → epic. The rare and epic sets carry the civilization's edge: elves pierce more
 * armour, dwarves take less damage, orcs hit harder in round 1, humans swarm harder, Nethergarde's wards blunt the first
 * blows. Tuned with `npm run sim:balance` (each lands on ARMORY_RULES[rarity].power)
 */
export const ARMORY_SETS: Record<CivilizationType, Record<ArmoryRarity, ArmorySet>> = {
  human: {
    uncommon: set("uncommon", "Pikes & Brigandines", "🔱", { hp: 0.05, atk: 0.05, def: 0.2 }, "Long ash pikes and riveted brigandines in the Dawn Banner's gold: the levy stands in a hedge of points."),
    rare: set("rare", "Knightly Plate", "🛡️", { hp: 0.1, atk: 0.06, def: 0.45 }, "Steel plate from the cathedral forges, a knight's harness for every footman who can bear it."),
    epic: set("epic", "Sunforged Arms", "☀️", { hp: 0.17, atk: 0.2, def: 0.34 }, "Blades quenched at dawn in the Banner's light; they burn brightest where the host is thickest.", { outnumber: 0.17 })
  },
  elf: {
    uncommon: set("uncommon", "Living-wood Bows", "🏹", { hp: 0.04, atk: 0.1 }, "Bows grown, not carved, from the Heart-Oak's saplings: they bend further and never crack."),
    rare: set("rare", "Moonsilver Mail", "🌙", { hp: 0.12, atk: 0.04, def: 0.3 }, "Mail woven from moonsilver wire, light as linen, that turns a blade aside.", { pierce: 0.05 }),
    epic: set("epic", "Starshot Quivers", "✨", { hp: 0.3, atk: 0.12 }, "Arrows fletched with starlight: they find the gap in any armour.", { pierce: 0.08 })
  },
  dwarf: {
    uncommon: set("uncommon", "Riveted Axes", "🪓", { hp: 0.04, atk: 0.1 }, "Broad axes riveted cheek to cheek at the Anvil, heavy enough to split a shield."),
    rare: set("rare", "Runeforged Plate", "⚒️", { hp: 0.08, atk: 0.04, def: 0.2 }, "Plate stamped with warding runes: blows that should break bone only dent it.", { taken: 0.93 }),
    epic: set("epic", "Anvil-of-Ages Hammers", "🔨", { hp: 0.1, atk: 0.24 }, "War-hammers struck on the Anvil of the Gods; every swing rings like the forge.", { taken: 0.9 })
  },
  orc: {
    uncommon: set("uncommon", "Bone Cleavers", "🦴", { hp: 0.04, atk: 0.1 }, "Cleavers hafted in great-beast bone, notched for every kill."),
    rare: set("rare", "Blackiron Hides", "🛡️", { hp: 0.12, atk: 0.04, def: 0.3 }, "Hides sewn with blackiron scales, stiff with old blood.", { firstAtk: 1.05 }),
    epic: set("epic", "Bloodfire War-gear", "🔥", { hp: 0.24, atk: 0.19 }, "Blades hammered in the Bloodfire's coals: the first charge lands like a landslide.", { firstAtk: 1.05 })
  },
  arcane: {
    uncommon: set("uncommon", "Void-touched Blades", "🗡️", { hp: 0.04, atk: 0.1 }, "Edges dipped in the rift, cold enough to burn."),
    rare: set("rare", "Riftglass Wards", "🔮", { hp: 0.1, atk: 0.04, def: 0.2 }, "Plates of riftglass that drink the first blows of a battle.", { firstTaken: 0.8 }),
    epic: set("epic", "Eclipse Panoply", "🌑", { hp: 0.19, atk: 0.19, def: 0.19 }, "Full harness of the eclipse knights, black on black with a prismatic edge.")
  }
};

export interface ArmoryRarityRule {
  /** A march in this set fights like this many plain marches of the same soldiers (sim:balance holds every set on it) */
  power: number;
  /** City Hall level needed to forge it (the smiths of a young kingdom can't); sets already forged are kept */
  minLevel: number;
  /** Forging 100 sets costs this (bulk resources; the total is rounded up) */
  forge: ArmoryCost;
  /** Keeping 100 sets costs this every harvest, at home or on a march (rounded up) */
  upkeep: ArmoryCost;
}

export const ARMORY_RULES: Record<ArmoryRarity, ArmoryRarityRule> = {
  uncommon: { power: 1.08, minLevel: 6, forge: { iron: 150, lumber: 300, gold: 2 }, upkeep: { food: 8 } },
  rare: { power: 1.16, minLevel: 11, forge: { iron: 300, lumber: 400, gold: 5 }, upkeep: { food: 12, iron: 0.4 } },
  epic: { power: 1.25, minLevel: 16, forge: { iron: 400, lumber: 300, gold: 6 }, upkeep: { food: 15, iron: 1 } }
};

/** Each civilization's epic set also takes a scarce gem of its own (per 100 sets; the total is rounded up) */
export const EPIC_GEM: Record<CivilizationType, { key: string; per100: number }> = {
  human: { key: "diamond", per100: 0.07 },
  elf: { key: "emerald", per100: 0.07 },
  dwarf: { key: "mithril", per100: 0.21 },
  orc: { key: "ruby", per100: 0.07 },
  arcane: { key: "aether", per100: 0.18 }
};

/** The best set a City Hall can forge (null below every gate) */
export const bestSetAt = (cityHallLevel: number): ArmoryRarity | null => [...ARMORY_RARITIES].reverse().find((r) => cityHallLevel >= ARMORY_RULES[r].minLevel) ?? null;

/** Why a City Hall can't forge `rarity` (null = it can) */
export const forgeBlockReason = (rarity: ArmoryRarity, cityHallLevel: number): string | null =>
  cityHallLevel >= ARMORY_RULES[rarity].minLevel ? null : `Needs City Hall ${ARMORY_RULES[rarity].minLevel}`;

/** Most sets one forging may make (a guard on the request, not a game limit: the treasury is) */
export const MAX_FORGE = 100_000;

/* ------------------------------------------------------------------------- */
/* Worth: what the resources would buy in soldiers                           */
/* ------------------------------------------------------------------------- */

/**
 * A resource's worth in food, by how scarce the harvest pool makes it (GAME_GUIDE §7: 250,000 food, 100,000 lumber,
 * 50,000 stone, 25,000 iron and 1,000 gold a harvest)
 */
export const RESOURCE_WORTH = { food: 1, lumber: 2.5, stone: 5, iron: 10, gold: 250 } as const;
/** A scarce gem's worth in food: the food pool over its expected share of a harvest's one drop (§7 pools, 12 gems) */
const GEM_POOLS: Record<string, number> = { diamond: 100, emerald: 100, ruby: 100, mithril: 300, aether: 250 };
export const gemWorth = (key: string) => (250_000 * 12) / (GEM_POOLS[key] ?? 100);

/**
 * One more soldier, in food: a Paid Settler (60 food + 1 gold) armed (2 iron + 5 food), who then eats 1 food a harvest
 * in the garrison (warConfig SETTLERS, MOBILIZATION_COST, SOLDIER_FOOD_UPKEEP)
 */
export const SOLDIER_WORTH = { price: 60 + 250 + 2 * 10 + 5, upkeep: 1 } as const;

export const costWorth = (c: ArmoryCost) => Object.entries(c).reduce((a, [k, v]) => a + (v ?? 0) * RESOURCE_WORTH[k as keyof typeof RESOURCE_WORTH], 0);

/** What forging `n` sets of a civilization's `rarity` costs: bulk resources and, for epic, its gem */
export function forgeCost(civ: CivilizationType, rarity: ArmoryRarity, n: number): { cost: ArmoryCost; gems: Record<string, number> } {
  const cost = scaleCost(ARMORY_RULES[rarity].forge, n / 100);
  const gem = rarity === "epic" ? EPIC_GEM[civ] ?? EPIC_GEM.human : null;
  return { cost, gems: gem && n > 0 ? { [gem.key]: Math.ceil((gem.per100 * n) / 100) } : {} };
}

/** A harvest's upkeep of `n` sets of `rarity` */
export const upkeepCost = (rarity: ArmoryRarity, n: number): ArmoryCost => scaleCost(ARMORY_RULES[rarity].upkeep, n / 100);

/** Every resource of a cost × `share`, rounded up (nothing for a share of 0) */
export const scaleCost = (cost: ArmoryCost, share: number): ArmoryCost =>
  Object.fromEntries(Object.entries(cost).map(([k, v]) => [k, Math.ceil((v ?? 0) * Math.max(0, share) - 1e-9)]).filter(([, v]) => (v as number) > 0));

/* ------------------------------------------------------------------------- */
/* Gear in battle                                                            */
/* ------------------------------------------------------------------------- */

/** What an army's gear adds in battle (combat.ts reads it): stat shares and its trait changes */
export interface GearStats {
  hp: number;
  atk: number;
  def: number;
  pierce: number;
  taken: number;
  firstAtk: number;
  firstTaken: number;
  outnumber: number;
}

export const armorySetFor = (civ: CivilizationType, rarity: ArmoryRarity): ArmorySet => (ARMORY_SETS[civ] ?? ARMORY_SETS.human)[rarity];

/** A set's gear (its gains × `share`: a share of the soldiers wearing it, or a target's share, ARMORY_TARGET_SHARE) */
export function gearOf(civ: CivilizationType, rarity: ArmoryRarity, share = 1): GearStats {
  const s = armorySetFor(civ, rarity);
  const e = s.edge ?? {};
  const k = Math.max(0, Math.min(1, share));
  return {
    hp: s.hp * k,
    atk: s.atk * k,
    def: s.def * k,
    pierce: (e.pierce ?? 0) * k,
    taken: 1 + ((e.taken ?? 1) - 1) * k,
    firstAtk: 1 + ((e.firstAtk ?? 1) - 1) * k,
    firstTaken: 1 + ((e.firstTaken ?? 1) - 1) * k,
    outnumber: (e.outnumber ?? 0) * k
  };
}

/** Two gears worn side by side (each already scaled by its share) */
function addGear(a: GearStats, b: GearStats): GearStats {
  return { hp: a.hp + b.hp, atk: a.atk + b.atk, def: a.def + b.def, pierce: a.pierce + b.pierce, taken: a.taken + b.taken - 1, firstAtk: a.firstAtk + b.firstAtk - 1, firstTaken: a.firstTaken + b.firstTaken - 1, outnumber: a.outnumber + b.outnumber };
}

/**
 * A home garrison of `count` soldiers in the sets at home: the best first, each worn by as many soldiers as there are
 * sets (the rest in standard gear), blended by the share wearing each. Undefined when nobody wears a set
 */
export function garrisonGear(civ: CivilizationType, stock: Partial<Record<ArmoryRarity, number>>, count: number, share = 1): GearStats | undefined {
  if (count <= 0) return undefined;
  let left = count;
  let gear: GearStats | undefined;
  for (const r of [...ARMORY_RARITIES].reverse()) {
    const n = Math.min(left, Math.max(0, Math.floor(stock[r] ?? 0)));
    if (n <= 0) continue;
    const g = gearOf(civ, r, (n / count) * share);
    gear = gear ? addGear(gear, g) : g;
    left -= n;
  }
  return gear;
}

/** Which set covers most of a garrison (for the battle log), and how many wear sets at all */
export function garrisonWear(stock: Partial<Record<ArmoryRarity, number>>, count: number): { rarity: ArmoryRarity; worn: number } | null {
  let left = Math.max(0, count);
  let best: ArmoryRarity | null = null;
  let worn = 0;
  for (const r of [...ARMORY_RARITIES].reverse()) {
    const n = Math.min(left, Math.max(0, Math.floor(stock[r] ?? 0)));
    if (n <= 0) continue;
    best ??= r;
    worn += n;
    left -= n;
  }
  return best ? { rarity: best, worn } : null;
}

/** Kinds of target a set's gains count less against (ARMORY_TARGET_SHARE) */
export type ArmoryTarget = "boss" | "gate";

/**
 * Share of a set's gains that count against a kind of target (1 when missing), like the bosses' Colossus Hide and the
 * mercenaries' Sellsword's Oath. sim:balance holds every PvE ceiling with a ruler in their best set: a lone City Hall 25
 * ruler never kills a world boss in one battle, and a full frontier gate that holds against a lone ruler in standard gear
 * still holds against them in their best set
 */
export const ARMORY_TARGET_SHARE: Partial<Record<ArmoryTarget, { share: number; name: string; emblem: string; description: string }>> = {
  boss: {
    share: 0.3,
    name: "Forged for Armies",
    emblem: "🐉",
    description: "a set counts 30% of its gains against a world boss (steel made to break shield walls only scratches a colossus)"
  },
  gate: {
    share: 0.1,
    name: "Murder Holes",
    emblem: "🏯",
    description: "a set counts a tenth of its gains against a frontier gate (boiling pitch from the gatehouse finds the gaps in any harness)"
  }
};
/** The share of a set's gains that counts against `target` */
export const armoryShareVs = (target: ArmoryTarget | null | undefined) => (target ? (ARMORY_TARGET_SHARE[target]?.share ?? 1) : 1);

/** Sets lost when `fallen` of a march's soldiers fall on the enemy's field (all of theirs: one set each) */
export const setsLostWith = (fallen: number) => Math.max(0, Math.floor(fallen));

/** What a set adds, in words ("+10% HP, +12% ATK, +20% DEF · +10% swarm") */
export function setText(s: Pick<ArmorySet, "hp" | "atk" | "def" | "edge">): string {
  const pct = (v: number) => `+${Math.round(v * 100)}%`;
  const parts = [s.hp ? `${pct(s.hp)} HP` : "", s.atk ? `${pct(s.atk)} ATK` : "", s.def ? `${pct(s.def)} DEF` : ""].filter(Boolean);
  const e = s.edge ?? {};
  const edge = [
    e.pierce ? `pierces ${Math.round(e.pierce * 100)}% more armour` : "",
    e.taken ? `takes ${Math.round((1 - e.taken) * 100)}% less damage` : "",
    e.firstAtk ? `+${Math.round((e.firstAtk - 1) * 100)}% ATK in round 1` : "",
    e.firstTaken ? `takes ${Math.round((1 - e.firstTaken) * 100)}% less damage in round 1` : "",
    e.outnumber ? `+${Math.round(e.outnumber * 100)}% ATK while outnumbering the foe` : ""
  ].filter(Boolean);
  return [parts.join(", "), edge.join(", ")].filter(Boolean).join(" · ");
}
