/**
 * City improvements: the resource sink. Every improvement has 5 tiers, is visible in the city view and grants
 * a permanent kingdom bonus (`improvementEffects`). Prices are tuned to the harvest economy (96 harvests/day):
 * a median developer earns roughly 6k gold, 45k iron, 85k stone, 130k lumber and 340k food per day, so saving
 * for one improvement takes about 2–3 hours at tier 1, 7–9 hours at tier 2, 1.5 days at tier 3, 6 days at
 * tier 4 and a month at tier 5 (City Walls 1.2× that). Tiers 1–2 are cheap; from tier 3 the price climbs
 * 4–5× per tier. Gems follow the rarity ladder: tier 3 asks a rare gem, tier 4 an epic gem plus half as much
 * of the rare one, tier 5 a legendary gem (dragon scale, titan tablet, phoenix feather) plus half as much of
 * the epic one, each sized to about 60% of the tier's saving time at the median gem drop.
 */

export type BaseResource = "gold" | "iron" | "stone" | "lumber" | "food";

export interface UpgradeTier {
  name: string;
  description: string;
  cost: Partial<Record<BaseResource, number>>;
  gems?: Record<string, number>;
}

export interface UpgradeDef {
  id: string;
  name: string;
  emblem: string;
  category: "defense" | "streets" | "landmark" | "life";
  tiers: UpgradeTier[];
}

export const UPGRADES: UpgradeDef[] = [
  {
    id: "walls",
    name: "City Walls",
    emblem: "🧱",
    category: "defense",
    tiers: [
      { name: "Wooden Palisade", description: "A ring of sharpened stakes around the whole city. (+40% Garrison DEF, −10% damage taken, 1.2× Wall HP)", cost: { lumber: 15_000, food: 10_000, gold: 100 } },
      { name: "Stone Walls", description: "Crenellated stone walls with corner towers. (+55% Garrison DEF, −20% damage taken, 1.4× Wall HP)", cost: { stone: 30_000, iron: 10_000, lumber: 20_000, gold: 400 } },
      {
        name: "Fortress Walls",
        description: "Towering fortress walls lined with watchtowers. (+70% Garrison DEF, −30% damage taken, 1.6× Wall HP)",
        cost: { stone: 150_000, iron: 75_000, gold: 3_000 },
        gems: { mithril: 20 }
      },
      {
        name: "Bastion Walls",
        description: "Iron-banded bastion curtain walls with twin-crenellated walkways and corner keeps. (+85% Garrison DEF, −40% damage taken, 1.8× Wall HP)",
        cost: { stone: 600_000, iron: 300_000, gold: 15_000 },
        gems: { diamond: 50, mithril: 45 }
      },
      {
        name: "Citadel Ramparts",
        description: "Mithril-veined obsidian ramparts crowned with glowing beacon braziers. (+100% Garrison DEF, −50% damage taken, 2.0× Wall HP)",
        cost: { stone: 3_000_000, iron: 1_500_000, gold: 85_000 },
        gems: { dragon_scale: 250, diamond: 150 }
      }
    ]
  },
  {
    id: "roads",
    name: "Roads",
    emblem: "🛣️",
    category: "streets",
    tiers: [
      { name: "Gravel Byways", description: "Packed gravel roads lined with small stone markers. (+2% march speed)", cost: { stone: 8_500, lumber: 8_500, gold: 85 } },
      { name: "Cobblestone Streets", description: "Smooth cobblestone avenues with kerbs. (+4% march speed)", cost: { stone: 25_000, lumber: 20_000, gold: 350 } },
      {
        name: "Paved Boulevards",
        description: "Wide stone-flagged boulevards with a centre line. (+6% march speed)",
        cost: { stone: 100_000, iron: 70_000, gold: 2_500 },
        gems: { ancient_rune: 10 }
      },
      {
        name: "Gilded High-Roads",
        description: "Gilt-curbed boulevards with ceremonial arches over the main roads. (+8% march speed)",
        cost: { stone: 450_000, iron: 300_000, gold: 10_000 },
        gems: { aether: 65, ancient_rune: 25 }
      },
      {
        name: "Imperial Highway",
        description: "Radiant granite causeways set with glowing speed runes. (+10% march speed)",
        cost: { stone: 2_500_000, iron: 1_500_000, gold: 70_000 },
        gems: { titan_tablet: 200, aether: 150 }
      }
    ]
  },
  {
    id: "lanterns",
    name: "Lantern Streets",
    emblem: "🏮",
    category: "streets",
    tiers: [
      { name: "Torchlit Pathways", description: "Iron braziers at the plaza crossroads. (−2% march rations, +3% scout speed)", cost: { stone: 3_500, iron: 4_500, gold: 85 } },
      { name: "Brass Streetlamps", description: "Twice as many polished lamps along every road. (−4% rations, +6% scout speed)", cost: { stone: 10_000, iron: 15_000, gold: 350 } },
      {
        name: "Arcane Lanterns",
        description: "Lamps holding glowing mana flames. (−6% rations, +9% scout speed)",
        cost: { stone: 75_000, iron: 70_000, gold: 2_500 },
        gems: { mana: 45 }
      },
      {
        name: "Everburning Beacons",
        description: "Tall gilded lampposts with intense amber radiance. (−8% rations, +12% scout speed)",
        cost: { stone: 350_000, iron: 300_000, gold: 10_000 },
        gems: { sapphire: 40, mana: 100 }
      },
      {
        name: "Celestial Nightlights",
        description: "Starlight orbs floating above every lamp. (−10% rations, +15% scout speed)",
        cost: { stone: 2_000_000, iron: 1_500_000, gold: 70_000 },
        gems: { phoenix_feather: 150, sapphire: 100 }
      }
    ]
  },
  {
    id: "gardens",
    name: "Royal Gardens",
    emblem: "🌷",
    category: "life",
    tiers: [
      { name: "Flower Beds & Hedges", description: "Clipped hedges and flower beds along the cross road. (+2% births, −4% famine desertion)", cost: { food: 20_000, lumber: 15_000, gold: 85 } },
      { name: "Royal Arboretum", description: "Fruit trees shade the garden beds. (+4% births, −8% famine desertion)", cost: { food: 60_000, lumber: 40_000, gold: 350 } },
      {
        name: "Sylvan Conservatory",
        description: "Glass-domed nurseries of healing herbs in the plaza corners. (+6% births, −12% famine desertion)",
        cost: { food: 350_000, lumber: 200_000, gold: 2_500 },
        gems: { mana: 45 }
      },
      {
        name: "Eden Promenades",
        description: "Crystal irrigation canals run beside the garden beds. (+8% births, −16% famine desertion)",
        cost: { food: 1_500_000, lumber: 800_000, gold: 10_000 },
        gems: { emerald: 45, mana: 100 }
      },
      {
        name: "Paradise of the Realm",
        description: "Enchanted blossoms glow above every bed. (+10% births, −20% famine desertion)",
        cost: { food: 8_500_000, lumber: 4_000_000, gold: 70_000 },
        gems: { phoenix_feather: 150, emerald: 100 }
      }
    ]
  },
  {
    id: "market",
    name: "Market Square",
    emblem: "🛒",
    category: "life",
    tiers: [
      { name: "Open Bazaar Stalls", description: "Striped merchant stalls and traders around the plaza. (+2% gathering speed & haul)", cost: { lumber: 15_000, food: 20_000, gold: 85 } },
      { name: "Merchant Quarter", description: "Every stall gets stacked crates and weighing scales. (+4% gathering speed & haul)", cost: { lumber: 40_000, food: 50_000, gold: 350 } },
      {
        name: "Grand Guildhall",
        description: "Stone-footed stalls under tiled roofs. (+6% gathering speed & haul)",
        cost: { lumber: 200_000, food: 200_000, gold: 2_500 },
        gems: { obsidian: 20 }
      },
      {
        name: "Continental Exchange",
        description: "Gilded counters and strongbox vaults. (+8% gathering speed & haul)",
        cost: { lumber: 800_000, food: 850_000, gold: 10_000 },
        gems: { diamond: 45, obsidian: 45 }
      },
      {
        name: "Sovereign Emporium",
        description: "Glowing trade lanterns over a realm-wide caravan market. (+10% gathering speed & haul)",
        cost: { lumber: 4_000_000, food: 4_000_000, gold: 70_000 },
        gems: { titan_tablet: 200, diamond: 100 }
      }
    ]
  },
  {
    id: "banners",
    name: "Kingdom Banners",
    emblem: "🚩",
    category: "life",
    tiers: [
      { name: "Street Pennants", description: "Civilization standards line all four main roads. (+2% march capacity, +1% rally ATK)", cost: { food: 15_000, lumber: 15_000, gold: 85 } },
      { name: "Heraldic Standards", description: "Two grand standards flank the plaza and hangings drape the city gate. (+4% march capacity, +2% rally ATK)", cost: { food: 55_000, lumber: 40_000, gold: 350 } },
      {
        name: "Grand War Banners",
        description: "Gilded finials crown every standard. (+6% march capacity, +3% rally ATK)",
        cost: { food: 300_000, lumber: 200_000, gold: 2_500 },
        gems: { ancient_rune: 10 }
      },
      {
        name: "Sovereign Regalia",
        description: "Twice as many standards along every road. (+8% march capacity, +4% rally ATK)",
        cost: { food: 1_000_000, lumber: 800_000, gold: 10_000 },
        gems: { ruby: 40, ancient_rune: 25 }
      },
      {
        name: "Legendary War Standards",
        description: "Glowing heraldic sigils above every standard. (+10% march capacity, +5% rally ATK)",
        cost: { food: 6_500_000, lumber: 4_000_000, gold: 70_000 },
        gems: { dragon_scale: 200, ruby: 100 }
      }
    ]
  },
  {
    id: "plaza",
    name: "Plaza Fountain",
    emblem: "⛲",
    category: "landmark",
    tiers: [
      { name: "Grand Stone Fountain", description: "A three-tier fountain at the heart of the plaza. (+1% army DEF)", cost: { stone: 8_000, iron: 4_500, gold: 85 } },
      { name: "Hero Monument", description: "A golden hero statue crowns the fountain. (+2% army DEF)", cost: { stone: 25_000, iron: 15_000, gold: 350 } },
      {
        name: "Aegis Cascade",
        description: "Iron-banded tiers ringed by ceremonial bulwarks. (+3% army DEF)",
        cost: { stone: 100_000, iron: 70_000, gold: 2_500 },
        gems: { mithril: 15 }
      },
      {
        name: "Sanctuary Basin",
        description: "A blessed basin ringed with glowing tranquility runes. (+4% army DEF)",
        cost: { stone: 500_000, iron: 300_000, gold: 10_000 },
        gems: { diamond: 45, mithril: 35 }
      },
      {
        name: "Sovereign Spring",
        description: "A consecrated fountain radiating a golden bulwark aura. (+5% army DEF)",
        cost: { stone: 2_500_000, iron: 1_500_000, gold: 70_000 },
        gems: { phoenix_feather: 150, diamond: 100 }
      }
    ]
  },
  {
    id: "dragon_statue",
    name: "Dragon Statue",
    emblem: "🐉",
    category: "landmark",
    tiers: [
      { name: "Wyrmling Effigy", description: "A small carved drake on the plaza plinth. (+1% army ATK)", cost: { stone: 8_500, iron: 4_000, gold: 85 } },
      { name: "Drakebone Shrine", description: "The full red dragon rises on its plinth. (+2% army ATK)", cost: { stone: 25_000, iron: 15_000, gold: 350 } },
      {
        name: "Elder Dragon Statue",
        description: "A towering dragon on a gilded plinth. (+3% army ATK)",
        cost: { stone: 100_000, iron: 70_000, gold: 2_500 },
        gems: { obsidian: 20 }
      },
      {
        name: "Ancient Wyrm Citadel",
        description: "Burning braziers flank the great dragon. (+4% army ATK)",
        cost: { stone: 450_000, iron: 300_000, gold: 10_000 },
        gems: { ruby: 40, obsidian: 45 }
      },
      {
        name: "Mythic Sovereign",
        description: "A colossal dragon bathed in eternal embers. (+5% army ATK)",
        cost: { stone: 2_000_000, iron: 1_500_000, gold: 70_000 },
        gems: { dragon_scale: 200, ruby: 100 }
      }
    ]
  },
  {
    id: "mana_spire",
    name: "Mana Spire",
    emblem: "🔮",
    category: "landmark",
    tiers: [
      { name: "Resonant Monolith", description: "A standing stone humming with ley-line power. (+1% army HP)", cost: { stone: 8_500, lumber: 7_000, gold: 85 } },
      {
        name: "Crystal Conduit",
        description: "A glowing runic crystal crowns the monolith. (+2% army HP)",
        cost: { stone: 25_000, lumber: 20_000, gold: 350 },
        gems: { mana: 5 }
      },
      {
        name: "Arcane Mana Spire",
        description: "A floating crystal spire humming with arcane power. (+3% army HP)",
        cost: { stone: 150_000, lumber: 90_000, gold: 2_500 },
        gems: { mana: 45 }
      },
      {
        name: "Ethereal Nexus",
        description: "A taller spire on a runed pedestal. (+4% army HP)",
        cost: { stone: 500_000, lumber: 350_000, gold: 10_000 },
        gems: { aether: 65, mana: 100 }
      },
      {
        name: "Astral Apex Spire",
        description: "An ascended astral pillar circled by celestial orbits. (+5% army HP)",
        cost: { stone: 2_500_000, lumber: 1_500_000, gold: 70_000 },
        gems: { titan_tablet: 200, aether: 150 }
      }
    ]
  },
  {
    id: "spymaster",
    name: "Spymaster's Tower",
    emblem: "🦉",
    category: "defense",
    tiers: [
      { name: "Watchers' Loft", description: "A timber lookout behind the castle, a lamp and a spyglass at its window. (+3% catch, +2% false intel, +3% own scouts)", cost: { stone: 8_500, lumber: 7_500, gold: 85 } },
      { name: "Owlery Tower", description: "A stone tower whose owls carry word of every stranger on the roads. (+6% catch, +4% false intel, +6% own scouts)", cost: { stone: 25_000, lumber: 20_000, gold: 350 } },
      {
        name: "Cipher Tower",
        description: "Taller, with a sapphire scrying lens under a slate cap. (+9% catch, +6% false intel, +9% own scouts)",
        cost: { stone: 150_000, lumber: 90_000, gold: 2_500 },
        gems: { ancient_rune: 10 }
      },
      {
        name: "Shadow Archive",
        description: "A dark spire of sealed ledgers, its lens glowing with aether. (+12% catch, +8% false intel, +12% own scouts)",
        cost: { stone: 500_000, iron: 200_000, lumber: 350_000, gold: 10_000 },
        gems: { sapphire: 40, ancient_rune: 25 }
      },
      {
        name: "Eye of the Night Court",
        description: "A crowned spire where an ever-open eye watches every road of the realm. (+15% catch, +10% false intel, +15% own scouts)",
        cost: { stone: 2_500_000, iron: 1_000_000, lumber: 1_500_000, gold: 70_000 },
        gems: { titan_tablet: 200, sapphire: 100 }
      }
    ]
  }
];

export const UPGRADE_BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));

/** Every improvement at its top tier (Special Overseers) */
export const MAXED_UPGRADES: Record<string, number> = Object.fromEntries(UPGRADES.map((u) => [u.id, u.tiers.length]));

/** Bonus per owned tier (walls are handled by wallDefMultForTier / wallMaxHpFor in warConfig.ts) */
export const IMPROVEMENT_EFFECT_PER_TIER = {
  dragon_statue: { atk: 0.01 },
  mana_spire: { hp: 0.01 },
  plaza: { def: 0.01 },
  roads: { marchSpeed: 0.02 },
  lanterns: { rations: 0.02, scoutSpeed: 0.03 },
  gardens: { births: 0.02, famine: 0.04 },
  market: { gather: 0.02 },
  banners: { marchCap: 0.02, rallyAtk: 0.01 }
} as const;

/** Permanent kingdom bonuses from the improvement tiers a ruler owns */
export interface ImprovementEffects {
  /** Soldier stat bonuses (fractions): Dragon Statue ATK, Mana Spire HP, Plaza Fountain DEF */
  atkBonus: number;
  hpBonus: number;
  defBonus: number;
  /** Roads: march travel time is divided by this */
  marchSpeedMult: number;
  /** Lantern Streets: march food rations are multiplied by this */
  rationMult: number;
  /** Lantern Streets: scout travel time is divided by this (on top of roads) */
  scoutSpeedMult: number;
  /** Royal Gardens: natural births are multiplied by this */
  birthMult: number;
  /** Royal Gardens: famine desertion is multiplied by this */
  famineMult: number;
  /** Market Square: gathering rate and haul per worker are multiplied by this */
  gatherMult: number;
  /** Kingdom Banners: single-march troop capacity is multiplied by this */
  marchCapMult: number;
  /** Kingdom Banners: extra ATK for every army of a rally this ruler leads (fraction) */
  rallyAtkBonus: number;
}

export function improvementEffects(upgrades: Record<string, number> | undefined): ImprovementEffects {
  const tier = (id: keyof typeof IMPROVEMENT_EFFECT_PER_TIER) => Math.max(0, Math.min(5, upgrades?.[id] ?? 0));
  const E = IMPROVEMENT_EFFECT_PER_TIER;
  const r = (n: number) => Math.round(n * 10000) / 10000;
  return {
    atkBonus: r(tier("dragon_statue") * E.dragon_statue.atk),
    hpBonus: r(tier("mana_spire") * E.mana_spire.hp),
    defBonus: r(tier("plaza") * E.plaza.def),
    marchSpeedMult: r(1 + tier("roads") * E.roads.marchSpeed),
    rationMult: r(1 - tier("lanterns") * E.lanterns.rations),
    scoutSpeedMult: r(1 + tier("lanterns") * E.lanterns.scoutSpeed),
    birthMult: r(1 + tier("gardens") * E.gardens.births),
    famineMult: r(1 - tier("gardens") * E.gardens.famine),
    gatherMult: r(1 + tier("market") * E.market.gather),
    marchCapMult: r(1 + tier("banners") * E.banners.marchCap),
    rallyAtkBonus: r(tier("banners") * E.banners.rallyAtk)
  };
}
