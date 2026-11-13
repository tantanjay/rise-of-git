import { FlatWorldMapData, MapNPC, GeneratedNPCType } from "@/types";
import { Rng, mulberry32, range, rngFor } from "@/utils/random";
import { Builder, Gait, IDLE_KIND, IdleKind, Part, PartIdle, RIDER_IDLES, Surface, emptyScene, isWalkKind } from "@/components/3d/city/parts";
import { RegionKind, SEA_LEVEL, Terrain } from "./terrain";
import { LANDMARK_MODEL_TYPES, buildLandmarkModel } from "./landmarks";
import { Add, AddOpts, V3, along, arc, bone, coins, lanternFrame, skull, tail, wheel } from "./kitParts";
import { buildRealmModel } from "./realms";
import { REALM_MODEL_TYPES } from "./realmTypes";
import { LEGENDARY_LANDMARK_TYPES } from "./legendaryLandmarks";
import { GATE_MODEL_TYPES, gateWallPoints, gateYaw } from "./gates";
import { FJORD_WATER, PLAY_HALF } from "@/utils/worldGeometry";
import { landmarkStepOf, ruinGate, stageLandmark } from "./landmarkStages";
import { LEGEND_TYPES, buildLadderSpawn, buildLegend, faceAt, isLadderSpawn, isLegend, shade } from "./spawnModels";

/**
 * Wandering NPC territories that scale with the realm: one per four developers.
 * Each type only spawns where the terrain suits it (krakens in deep water,
 * yetis on snow, sandworms in the dunes…), so the world reads as a living map.
 */

interface Site {
  x: number;
  z: number;
  h: number;
  dom: RegionKind;
  w: Record<RegionKind, number>;
  coast: boolean; // land right next to water
  flat: boolean;
}

interface NPCKind {
  type: GeneratedNPCType;
  emblem: string;
  subtitle: string;
  names: string[];
  descriptions: string[];
  /** Royal Codex (Wilds tab): where it is found, in plain words; none = never placed as scenery */
  habitat?: string;
  water?: boolean; // floats at sea level
  fits: (s: Site) => boolean;
}

const land = (s: Site) => s.h > SEA_LEVEL + 0.35 && s.flat;

export const NPC_KINDS: NPCKind[] = [
  {
    type: "kraken",
    emblem: "🐙",
    subtitle: "Abyssal Sea Monster",
    habitat: "The deep open sea",
    names: ["The Leviathan of the Deep", "Old Tentacle Tom", "The Drowned Maw", "Kraken of the Outer Sea"],
    descriptions: [
      "Barnacled tentacles break the surface of the dark water, coiling around anything that drifts too close.",
      "Sailors swear the sea boils here at dusk when the beast rises to feed."
    ],
    water: true,
    fits: (s) => s.h < SEA_LEVEL - 1.2
  },
  {
    type: "mermaid_rock",
    emblem: "🧜",
    subtitle: "Siren Lagoon Rock",
    habitat: "Shallow lagoons off the coasts and the elven shores",
    names: ["Siren's Perch", "Pearl Lagoon Rock", "The Singing Shoals", "Coral Maiden's Rest"],
    descriptions: [
      "Merfolk lounge on sun-warmed rocks in the shallows, trading pearls for stories of the dry world.",
      "A haunting song drifts across the lagoon — follow it carefully."
    ],
    water: true,
    fits: (s) => s.h < SEA_LEVEL - 0.3 && s.h > SEA_LEVEL - 1.4 && (s.w.elf > 0.25 || s.w.sea > 0.25 || s.coast)
  },
  {
    type: "lighthouse",
    emblem: "🗼",
    subtitle: "Coastal Beacon",
    habitat: "Coasts everywhere but the arcane lands",
    names: ["Stormwatch Lighthouse", "The Last Light", "Gullcliff Beacon", "Saltwind Tower"],
    descriptions: [
      "A striped stone tower whose great lamp guides merchant ships safely around the jagged coast.",
      "The old keeper logs every sail that passes — and a few that shouldn't exist."
    ],
    fits: (s) => land(s) && s.coast && s.dom !== "arcane"
  },
  {
    type: "fishing_village",
    emblem: "🎣",
    subtitle: "Seaside Fishing Hamlet",
    habitat: "Coasts of the human, elven, forest and desert lands",
    names: ["Driftwood Cove", "Netmender's Landing", "Brinebottom Docks", "Herring Hollow"],
    descriptions: [
      "Fisherfolk mend nets on a creaking wooden pier while gulls squabble over the morning catch.",
      "Smoked fish, salted tales and the freshest gossip on the coast."
    ],
    fits: (s) => land(s) && s.coast && (s.dom === "human" || s.dom === "elf" || s.dom === "forest" || s.dom === "desert")
  },
  {
    type: "treant",
    emblem: "🌳",
    subtitle: "Ancient Living Tree",
    habitat: "Forests and the elven woods",
    names: ["Elder Oakheart", "Grandfather Bark", "The Mossbeard Treant", "Rootwarden"],
    descriptions: [
      "A towering treant with glowing amber eyes keeps watch over the old woods, slow to anger and slower to forget.",
      "Its roots run deep enough to hear every footstep in the forest."
    ],
    fits: (s) => land(s) && (s.dom === "forest" || s.dom === "elf")
  },
  {
    type: "fairy_ring",
    emblem: "🍄",
    subtitle: "Enchanted Mushroom Circle",
    habitat: "Inland meadows of the elven, forest and human lands",
    names: ["The Glimmer Ring", "Pixie Hollow", "Moonshroom Circle", "Fae Dancing Ground"],
    descriptions: [
      "A perfect circle of spotted mushrooms glows softly at night — step inside and you may lose a day.",
      "Tiny lights flit between the caps, giggling at passing travellers."
    ],
    fits: (s) => land(s) && !s.coast && (s.dom === "elf" || s.dom === "forest" || s.dom === "human")
  },
  {
    type: "hunter_lodge",
    emblem: "🦌",
    subtitle: "Woodland Hunting Lodge",
    habitat: "Forests, dwarven valleys and the lower mountains",
    names: ["Antler Lodge", "Stag's Rest", "Pinecone Cabin", "Trapper's Hollow"],
    descriptions: [
      "A sturdy log cabin where rangers trade pelts, tracks and warnings about what prowls beyond the treeline.",
      "Venison stew is always on the fire for anyone who knocks."
    ],
    fits: (s) => land(s) && s.h < 5 && (s.dom === "forest" || s.dom === "dwarf" || s.dom === "mountains")
  },
  {
    type: "yeti_cave",
    emblem: "❄️",
    subtitle: "Frozen Yeti Den",
    habitat: "High snowy peaks",
    names: ["Frostfang Cave", "The Yeti's Larder", "Whiteout Hollow", "Rimeback Den"],
    descriptions: [
      "Huge footprints lead into an ice-rimmed cave high on the peaks. Something big snores inside.",
      "Climbers leave offerings of dried fish at the entrance — just in case."
    ],
    fits: (s) => s.h > 5.6 && s.flat
  },
  {
    type: "dragon_nest",
    emblem: "🐉",
    subtitle: "Wyrm's Eyrie",
    names: ["Emberclaw's Eyrie", "The Scorched Nest", "Cinderwing Roost", "Ashpeak Hatchery"],
    descriptions: [
      "A red dragon guards a nest of glittering eggs on a scorched crag, smoke curling from its nostrils.",
      "The rocks around the nest are fused into glass from centuries of dragonfire."
    ],
    fits: () => false // Reserved exclusively for Ignis Molten Greatwyrm boss
  },
  {
    type: "sandworm",
    emblem: "🪱",
    subtitle: "Colossal Dune Burrower",
    habitat: "Deserts",
    names: ["Shai the Devourer", "The Dune Maw", "Great Sand Serpent", "Grit-Eater"],
    descriptions: [
      "Ridges of sand ripple and heave as a colossal worm surfaces, its ringed mouth wide enough to swallow a caravan.",
      "Desert nomads walk without rhythm here so the worm cannot hear them."
    ],
    fits: (s) => land(s) && s.dom === "desert"
  },
  {
    type: "pyramid",
    emblem: "🔺",
    subtitle: "Half-Buried Pyramid",
    habitat: "Deserts and the low orc steppes",
    names: ["Tomb of the Sun King", "The Sandstone Sepulchre", "Pyramid of Lost Commits", "Obelisk of Ra'git"],
    descriptions: [
      "A sandstone pyramid half-swallowed by dunes, its golden capstone still catching the sun.",
      "Hieroglyphs on the obelisk describe a merge conflict that lasted a thousand years."
    ],
    fits: (s) => land(s) && (s.dom === "desert" || (s.dom === "orc" && s.h < 3))
  },
  {
    type: "caravan",
    emblem: "🐪",
    subtitle: "Wandering Trade Caravan",
    habitat: "Deserts, orc steppes and the human lands",
    names: ["The Silk Road Caravan", "Spice Merchants' Camp", "Dunewalker Traders", "Camelback Bazaar"],
    descriptions: [
      "Striped tents and laden camels — merchants selling spices, silks and suspiciously cheap maps.",
      "The caravan master trades news from every province for a single gold coin."
    ],
    fits: (s) => land(s) && (s.dom === "desert" || s.dom === "orc" || s.dom === "human")
  },
  {
    type: "goblin_camp",
    emblem: "👺",
    subtitle: "Goblin War Camp",
    habitat: "Orc lands and the mountains",
    names: ["Snaggletooth Camp", "Grubnik's Warren", "The Rusty Blade Mob", "Skullpile Outpost"],
    descriptions: [
      "Spiky hide huts around a roaring bonfire — goblins sharpen crude blades and argue over loot.",
      "A totem of stacked skulls warns travellers to keep their purses close."
    ],
    fits: (s) => land(s) && (s.dom === "orc" || s.dom === "mountains")
  },
  {
    type: "beast_skeleton",
    emblem: "💀",
    subtitle: "Fallen Colossus Remains",
    habitat: "Orc lands and deserts",
    names: ["Bones of the Titan Beast", "The Great Ribcage", "Behemoth's Grave", "Ivory Graveyard"],
    descriptions: [
      "The sun-bleached ribs of a creature larger than a castle arch out of the ground.",
      "Scavengers say its skull still hums when the wind blows through the eye sockets."
    ],
    fits: (s) => land(s) && (s.dom === "orc" || s.dom === "desert")
  },
  {
    type: "wizard_tower",
    emblem: "🧙",
    subtitle: "Hermit Wizard's Tower",
    habitat: "Human, arcane and elven lands",
    names: ["Tower of Mordecai the Odd", "The Starlit Spire", "Wobblecap Tower", "Hall of the Hedge Mage"],
    descriptions: [
      "A crooked tower crowned by a floating orb — the hermit inside sells questionable potions.",
      "Lights flicker in the windows at all hours, followed by small explosions."
    ],
    fits: (s) => land(s) && (s.dom === "human" || s.dom === "arcane" || s.dom === "elf")
  },
  {
    type: "tavern",
    emblem: "🍺",
    subtitle: "Crossroads Inn",
    habitat: "Inland roads of the human, forest and desert lands",
    names: ["The Prancing Pull Request", "The Merged Mug", "The Rebased Barrel", "Ye Olde Hotfix Inn"],
    descriptions: [
      "A cosy two-storey inn where travellers swap rumours over frothy ale and warm bread.",
      "The bard knows exactly one song, and it's about a force push."
    ],
    fits: (s) => land(s) && !s.coast && (s.dom === "human" || s.dom === "forest" || s.dom === "desert")
  },
  {
    type: "portal",
    emblem: "🌀",
    subtitle: "Unstable Void Gate",
    habitat: "The arcane lands and high mountain passes",
    names: ["The Shimmering Gate", "Rift of Echoes", "Nexus Portal", "The Astral Doorway"],
    descriptions: [
      "A ring of floating runestones frames a swirling violet void that hums with raw arcane energy.",
      "Whatever goes through comes back… mostly."
    ],
    fits: (s) => land(s) && (s.dom === "arcane" || (s.dom === "mountains" && s.h > 3))
  }
];

const KIND_BY_TYPE = new Map(NPC_KINDS.map((k) => [k.type, k]));

export const isGeneratedNPC = (type: string): type is GeneratedNPCType => KIND_BY_TYPE.has(type as GeneratedNPCType);

/** Server-spawned 15-minute roving encounters that have their own instanced model */
export const SPAWN_MODEL_TYPES = new Set<string>([
  "mob-slime",
  "mob-wolf",
  "mob-bat",
  "mob-goblin",
  "mob-skeleton",
  "mob-scorpion",
  "mob-troll",
  "mob-chimera",
  "mob-werewolf",
  "mob-rat",
  "mob-spider",
  "mob-harpy",
  "mob-lizardfolk",
  "mob-ogre",
  "mob-wraith",
  "mob-basilisk",
  "mob-lich",
  "bandit-poacher",
  "bandit-riverpirate",
  "bandit-cultist",
  "bandit-warlord",
  "bandit-saboteur",
  "treasure-cart",
  "treasure-orecache",
  "treasure-reliquary",
  "treasure-dragonhoard",
  "mob-drake",
  "mob-aberration",
  "mob-magma",
  "bandit-highwayman",
  "bandit-pickpocket",
  "bandit-smuggler",
  "bandit-raider",
  "bandit-corsair",
  "bandit-syndicate",
  "bandit-mercenary",
  "bandit-looters",
  "treasure-stash",
  "treasure-lockbox",
  "treasure-strongbox",
  "treasure-seachest",
  "treasure-relic",
  "res-timber",
  "res-grain",
  "res-quarry",
  "res-iron",
  "res-cattle",
  "res-gold",
  "res-vineyard",
  "res-mithril",
  "res-mana",
  "res-fleece",
  "res-dragonstone",
  "res-motherlode",
  ...LEGEND_TYPES
]);

/** Higher tiers stand a little larger on the map so rarity reads at a glance */
export const RARITY_SCALE: Record<string, number> = {
  common: 0.9,
  uncommon: 1.0,
  rare: 1.1,
  epic: 1.22,
  legendary: 1.36,
  mythical: 1.5
};

/** True when `buildNPCModel` has an instanced model for this NPC type */
export const hasNPCModel = (type: string) => isGeneratedNPC(type) || SPAWN_MODEL_TYPES.has(type) || LANDMARK_MODEL_TYPES.has(type);

export const HOSTILE_NPC_TYPES = new Set<string>([
  "kraken",
  "dragon_nest",
  "sandworm",
  "goblin_camp",
  "yeti_cave",
  "boss-kraken",
  "boss-leviathan",
  "boss-siren",
  "boss-sandworm",
  "boss-sphinx",
  "boss-scorpion",
  "boss-treant",
  "boss-wolf",
  "boss-fae",
  "boss-dragon",
  "boss-yeti",
  "boss-gorgon"
]);

function regionName(dom: RegionKind, worldMap: FlatWorldMapData, x: number, z: number, h: number): string {
  if (h < SEA_LEVEL - 0.3 || dom === "sea") {
    if (Math.max(Math.abs(x), Math.abs(z)) > 62) return "The Outer Sea";
    if (dom === "sea") return "The Sunken Fjord";
  }
  if (dom === "human" || dom === "elf" || dom === "dwarf" || dom === "orc" || dom === "arcane") {
    const name = worldMap.provinces[dom].name;
    return h < SEA_LEVEL - 0.3 ? `Lagoons of ${name}` : name;
  }
  const buffer = worldMap.bufferZones.find((b) =>
    dom === "desert" ? b.type === "desert" : dom === "forest" ? b.type === "forest" : b.type === "mountains"
  );
  return buffer?.name ?? "The Wilds";
}

/** The scenery site that suits a region when no kind's own rules fit the spot (a slope, a shore, the Wild Rim) */
const FALLBACK_KIND: Partial<Record<RegionKind, GeneratedNPCType>> = {
  human: "tavern",
  elf: "fairy_ring",
  forest: "hunter_lodge",
  dwarf: "hunter_lodge",
  mountains: "goblin_camp",
  orc: "goblin_camp",
  desert: "caravan",
  arcane: "wizard_tower",
  sea: "fishing_village"
};

/**
 * Deterministic scenery sites. On land they stand on the spots the server picked (`worldMap.scenery`, on the map's
 * occupancy list, so no spawn ever lands on one), each given the kind that fits its ground, in a type order from the map
 * seed so the kinds stay varied; at sea (sea monsters, mermaid rocks) they are picked here, off the fjord's open water
 * where the crews afloat rove. Adding developers appends new sites without moving existing ones.
 */
export function generateTerrainNPCs(terrain: Terrain, worldMap: FlatWorldMapData | null, count: number): MapNPC[] {
  if (!worldMap || count <= 0) return [];
  const rng = mulberry32(worldMap.seed + 4242);

  const dominant = (w: Record<RegionKind, number>) => {
    let best: RegionKind = "human";
    for (const k in w) if (w[k as RegionKind] > w[best]) best = k as RegionKind;
    return best;
  };
  const siteAt = (x: number, z: number): Site => {
    const h = terrain.height(x, z);
    const w = terrain.weights(x, z);
    const ring = [
      [3.5, 0],
      [-3.5, 0],
      [0, 3.5],
      [0, -3.5]
    ].map(([dx, dz]) => terrain.height(x + dx, z + dz));
    const coast = h > SEA_LEVEL && ring.some((rh) => rh < SEA_LEVEL - 0.2);
    const flat = ring.every((rh) => Math.abs(rh - h) < 1.1);
    return { x, z, h, dom: dominant(w), w, coast, flat };
  };

  // Land: the server's spots, in order (a new spot is appended as the realm grows)
  const landSites = (worldMap.scenery ?? []).slice(0, count).map((p) => siteAt(p.x, p.z));
  // Sea: candidates in open water, clear of the fjord's open middle, the castles and the map's NPCs
  const blockers: Array<{ x: number; z: number; r: number }> = [
    ...Object.values(worldMap.kingdomPlacements).map((p) => ({ x: p.x, z: p.z, r: 10 })),
    ...worldMap.npcs.map((n) => ({ x: n.x, z: n.z, r: 16 })),
    ...(worldMap.scenery ?? []).map((p) => ({ x: p.x, z: p.z, r: 9 }))
  ];
  const seaSites: Site[] = [];
  for (let i = 0; i < 900; i++) {
    const x = range(rng, -PLAY_HALF - 8, PLAY_HALF + 8);
    const z = range(rng, -PLAY_HALF - 8, PLAY_HALF + 8);
    if (z < -FJORD_WATER.from + 3 && z > -FJORD_WATER.to - 3 && Math.abs(x) < FJORD_WATER.across + 3) continue;
    const s = siteAt(x, z);
    if (s.h < SEA_LEVEL - 0.3) seaSites.push(s);
  }

  // Shuffle type order once so diversity is spread evenly
  const order = [...NPC_KINDS];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  const usedLand = new Set<number>();
  const usedSea = new Set<number>();
  const nameUse = new Map<GeneratedNPCType, number>();
  const result: MapNPC[] = [];
  const add = (kind: NPCKind, site: Site) => {
    const n = nameUse.get(kind.type) ?? 0;
    nameUse.set(kind.type, n + 1);
    const x = Math.round(site.x * 10) / 10;
    const z = Math.round(site.z * 10) / 10;
    result.push({
      id: `npc-gen-${kind.type}-${n}`,
      name: kind.names[n % kind.names.length],
      type: kind.type,
      emblem: kind.emblem,
      subtitle: kind.subtitle,
      description: kind.descriptions[n % kind.descriptions.length],
      x,
      z,
      region: regionName(site.dom, worldMap, x, z, site.h)
    });
  };

  // Round the kinds: each takes the first free site that fits it (land kinds the server's spots, sea kinds open water)
  let misses = 0;
  for (let i = 0; result.length < count && misses < order.length * 2; i++) {
    const kind = order[i % order.length];
    const pool = kind.water ? seaSites : landSites;
    const used = kind.water ? usedSea : usedLand;
    const idx = pool.findIndex((s, si) => !used.has(si) && kind.fits(s) && (!kind.water || blockers.every((b) => Math.hypot(b.x - s.x, b.z - s.z) > b.r)));
    if (idx < 0) {
      misses++;
      continue;
    }
    misses = 0;
    used.add(idx);
    add(kind, pool[idx]);
    if (kind.water) blockers.push({ x: pool[idx].x, z: pool[idx].z, r: 9 });
  }
  // A land spot no kind's rules fit (a slope, a shore, the Wild Rim) still gets the site that suits its region
  landSites.forEach((site, si) => {
    if (usedLand.has(si) || result.length >= count) return;
    const kind = KIND_BY_TYPE.get(FALLBACK_KIND[site.dom] ?? "tavern");
    if (kind) add(kind, site);
  });

  return result;
}

/** Ground height an NPC model should stand on */
export function npcBaseHeight(npc: MapNPC, terrain: Terrain): number {
  const kind = KIND_BY_TYPE.get(npc.type as GeneratedNPCType);
  if (kind?.water) return SEA_LEVEL - 0.05;
  return terrain.height(npc.x, npc.z) - 0.05;
}

/* ========================================================================= */
/* MODELS                                                                    */
/* ========================================================================= */

const BONE = "#efe6cf";

/** HD: a segment of an arching tentacle or worm drawn as a capsule along the arc, overlapping its neighbours, so the
 * beads of the Normal arc read as one smooth limb (riding the segment's sway) */
function arcBody(add: Add, c: V3, dir: V3, len: number, s: number, color: string, mat: Surface, ride: AddOpts) {
  const h = len * 0.75;
  along(add, "capsule", [c[0] - dir[0] * h, c[1] - dir[1] * h, c[2] - dir[2] * h], [c[0] + dir[0] * h, c[1] + dir[1] * h, c[2] + dir[2] * h], s * 0.92, s * 0.92, color, hdo(mat, ride));
}

/**
 * A tentacle / worm arching out of the ground, its segments swaying. HD: each segment is made of `mat`, and `rider`
 * adds HD detail on a segment (centre, size, how far along) that sways exactly with it (`ride`)
 */
function stackedArc(b: Builder, rng: Rng, angle: number, radius: number, color: string, mat?: Surface, rider?: (c: V3, s: number, t: number, ride: AddOpts, dir: V3, len: number) => void) {
  const segments = 7;
  for (let i = 0; i < segments; i++) {
    const t = i / (segments - 1);
    const r = radius * (0.4 + t * 0.6);
    const y = Math.sin(t * Math.PI) * 2.2;
    const s = 0.55 * (1 - t * 0.6);
    const sync = rider ? b.out.parts.length + 1 : undefined;
    b.add("sphere", Math.cos(angle) * r, y - s / 2, Math.sin(angle) * r, s, s, s, color, { idle: IDLE_KIND.sway, phase: 0.01 + angle + t * 1.4, mat, sync });
    if (!rider) continue;
    // The arc's direction here and the length of one segment along it
    const [dr, dy] = [radius * 0.6, 2.2 * Math.PI * Math.cos(t * Math.PI)];
    const l = Math.hypot(dr, dy);
    rider([Math.cos(angle) * r, y, Math.sin(angle) * r], s, t, { idle: IDLE_KIND.sway, sync }, [(Math.cos(angle) * dr) / l, dy / l, (Math.sin(angle) * dr) / l], l / (segments - 1));
  }
}

/* --- Small creature / prop helpers for the roving spawns ----------------- */

/** A creature of a model that gets about on its own (see `Builder.walker`): loop radius, gait (default walk), tempo */
interface Walk {
  radius: number;
  gait?: Gait;
  pace?: number;
}

const placeOf = (b: Builder, x: number, z: number, rot: number, walk?: Walk, biped = false) =>
  walk ? b.walker(x, z, rot, walk.gait ?? "walk", walk.radius, { pace: walk.pace, biped }) : b.child(x, z, rot);

type Pose = NonNullable<AddOpts["pose"]>;

/** HD-only options: a part drawn only in HD, made of `mat` */
const hdo = (mat: Surface, o: AddOpts = {}): AddOpts => ({ ...o, mat, hd: true });
const adder = (f: Builder): Add => f.add.bind(f);

/** Bipedal figure, ~1.2 units tall at s = 1. Returns its local builder for weapons/hats. A walker swings its legs and arms. */
function humanoid(b: Builder, x: number, z: number, rot: number, skin: string, cloth: string, legs: string, s = 1, walk?: Walk, look: { head?: Surface; arm?: (side: -1 | 1) => Pose } = {}): Builder {
  const h = placeOf(b, x, z, rot, walk, true);
  h.add("box", -0.12 * s, 0, 0, 0.15 * s, 0.45 * s, 0.17 * s, legs, { leg: 1, mat: "cloth", hdShape: "limb" });
  h.add("box", 0.12 * s, 0, 0, 0.15 * s, 0.45 * s, 0.17 * s, legs, { leg: -1, mat: "cloth", hdShape: "limb" });
  h.add("box", 0, 0.45 * s, 0, 0.44 * s, 0.5 * s, 0.26 * s, cloth, { torso: true, mat: "cloth", hdShape: "limb" });
  h.add("box", -0.3 * s, 0.47 * s, 0, 0.13 * s, 0.46 * s, 0.13 * s, cloth, { arm: -1, mat: "cloth", hdShape: "limb", pose: look.arm?.(-1) });
  h.add("box", 0.3 * s, 0.47 * s, 0, 0.13 * s, 0.46 * s, 0.13 * s, cloth, { arm: 1, mat: "cloth", hdShape: "limb", pose: look.arm?.(1) });
  h.add("sphere", 0, 0.94 * s, 0, 0.32 * s, 0.32 * s, 0.32 * s, skin, { head: { y: 0.9 * s }, mat: look.head ?? "skin", hdShape: "egg" });
  return h;
}

/**
 * Four-legged animal facing local +Z, ~0.7 units tall at s = 1. A walker steps its legs in diagonal pairs. HD: a hide
 * body and tapered legs on hooves, a head narrowing to its muzzle (turned by `neck`, its rest pose), a tufted tail.
 */
function quadruped(b: Builder, x: number, z: number, rot: number, color: string, s = 1, walk?: Walk, neck?: Pose): Builder {
  const q = placeOf(b, x, z, rot, walk);
  if (!walk) q.alive();
  q.add("box", 0, 0.32 * s, 0, 0.42 * s, 0.36 * s, 0.95 * s, color, { mat: "hide", hdShape: "pod" });
  for (const [lx, lz, leg] of [
    [-0.15, 0.33, 1],
    [0.15, 0.33, -1],
    [-0.15, -0.33, -1],
    [0.15, -0.33, 1]
  ] as const) {
    q.add("box", lx * s, 0, lz * s, 0.11 * s, 0.34 * s, 0.11 * s, color, { leg, mat: "hide", hdShape: "limb" });
    q.add("cyl", lx * s, 0, lz * s, 0.15 * s, 0.07 * s, 0.15 * s, "#292524", { leg, hip: 0.34 * s, mat: "bone", hd: true }); // HD: a hoof
  }
  q.add("box", 0, 0.5 * s, 0.55 * s, 0.32 * s, 0.3 * s, 0.38 * s, color, { head: { y: 0.55 * s, z: 0.4 * s }, mat: "hide", hdShape: "snout", pose: neck });
  q.add("cone", 0, (0.47 - 0.225) * s, -0.55 * s, 0.1 * s, 0.45 * s, 0.1 * s, color, { rx: -2.2, trail: { lag: 0.2, damp: 0.3, root: [0, 0.5 * s, -0.47 * s] }, hd: false }); // tail, hanging from the rump
  // HD: the tail in segments, hanging and swishing, its tuft dark
  tail(q.add.bind(q), [0, 0.5 * s, -0.47 * s], { len: 0.48 * s, w0: 0.1 * s, w1: 0.05 * s, n: 3, pitch: 1.05, curl: -0.5, lag: 0.14, step: 0.09, damp: 0.2, color, tip: "#292524" }, { mat: "hide", hd: true });
  return q;
}

/** A chimney or fire's smoke: three puffs rising one after another */
function smoke(b: Builder, x: number, y: number, z: number, s = 1, color = "#a8a29e") {
  for (let i = 0; i < 3; i++) b.add("sphere", x, y, z, 0.38 * s, 0.34 * s, 0.38 * s, color, { idle: IDLE_KIND.smoke, phase: 0.01 + (i * Math.PI * 2) / 3 });
}

/** Flag on a pole */
function flag(b: Builder, x: number, z: number, h: number, color: string) {
  b.add("cyl", x, 0, z, 0.06, h, 0.06, "#3f2a1a");
  b.add("box", x + 0.28, h - 0.45, z, 0.55, 0.4, 0.03, color, { idle: IDLE_KIND.flutter });
}

/** How a chest is made in HD: its wood and metal, how rich its fittings are (0 common … 4 legendary), what spills from it */
interface ChestLook {
  wood?: Surface;
  metal?: Surface;
  tier?: number;
  /** The padlock (uncommon and up; default the trim) */
  lock?: string;
  /** Coins on the hoard and spilled before it */
  coin?: string;
  coinMat?: Surface;
  /** Gems on the hoard (epic: lit) */
  gems?: string[];
  /** Nothing spills onto the ground (a chest on a pedestal or floating) */
  noSpill?: boolean;
}

/**
 * Treasure chest; `open` tilts the lid back and spills a glowing hoard. HD: board seams, handles at its ends, a domed
 * lid with the bands running over it; by tier a padlock on its hasp, studded bands, a jewel in front; open, coins
 * (and gems) on the hoard and spilled before it.
 */
function chest(b: Builder, x: number, z: number, rot: number, wood: string, trim: string, s = 1, open = false, hoard = "#fbbf24", look: ChestLook = {}) {
  const c = b.child(x, z, rot);
  const wm = look.wood ?? "wood";
  const mm = look.metal ?? "dull";
  const tier = look.tier ?? 0;
  c.add("box", 0, 0, 0, 1.1 * s, 0.6 * s, 0.7 * s, wood, { mat: wm });
  c.add("box", 0, 0, 0, 1.14 * s, 0.1 * s, 0.74 * s, trim, { mat: mm });
  c.add("box", -0.42 * s, 0, 0, 0.1 * s, 0.62 * s, 0.74 * s, trim, { mat: mm });
  c.add("box", 0.42 * s, 0, 0, 0.1 * s, 0.62 * s, 0.74 * s, trim, { mat: mm });
  const add = adder(c);
  const r = mulberry32(Math.floor(Math.abs(b.ox * 71.3 + b.oz * 37.9 + b.oy * 19.7 + x * 13.1 + z * 7.7 + rot * 11.1) * 1000) + 17);
  // HD: board seams between the bands, front and back; a handle at each end (rope on a common chest)
  for (const y of [0.24, 0.43]) add("box", 0, y * s, 0, 0.74 * s, 0.025 * s, 0.7 * s + 0.1, shade(wood, 0.6), hdo(wm));
  for (const side of [-1, 1]) {
    if (tier > 0) add("box", side * (0.55 * s + 0.025), 0.33 * s, 0, 0.05, 0.16 * s, 0.22 * s, trim, hdo(mm)); // its mount
    arc(add, [side * (0.55 * s + 0.06), 0.42 * s, 0], [0, 0, 1], [0, 1, 0], 0.09 * s, Math.PI, Math.PI * 2, 5, 0.03 * s + 0.01, tier > 0 ? trim : "#a8a29e", hdo(tier > 0 ? mm : "cloth"));
  }
  // Studs along the bands (rare and up)
  if (tier >= 2) for (const side of [-1, 1]) for (const y of [0.12, 0.3, 0.48]) add("sphere", side * 0.42 * s, (y - 0.03) * s, 0.37 * s, 0.06 * s, 0.06 * s, 0.06 * s, trim, hdo(mm));
  if (open) {
    c.add("sphere", 0, 0.45 * s, 0, 0.95 * s, 0.4 * s, 0.6 * s, hoard, { glow: true });
    c.add("box", 0, 0.6 * s, -0.42 * s, 1.1 * s, 0.6 * s, 0.12 * s, wood, { rx: -0.35, mat: wm });
    // HD: the bands run on over the open lid
    for (const side of [-1, 1]) add("box", side * 0.42 * s, 0.9 * s - (0.6 * s + 0.1) / 2, -0.42 * s, 0.1 * s, 0.6 * s + 0.1, 0.12 * s + 0.1, trim, hdo(mm, { rx: -0.35 }));
    // Coins lying on the hoard's crown, more on a richer chest, and spilled over the front onto the ground
    const cc = look.coin ?? "#fbbf24";
    const cm = look.coinMat ?? (tier >= 2 ? "gold" : "dull");
    for (let i = 0; i < 4 + tier * 2; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * 0.8;
      const y = 0.65 * s + 0.2 * s * Math.sqrt(Math.max(0, 1 - d * d));
      add("cyl", Math.cos(a) * d * 0.45 * s, y - 0.012 * s, Math.sin(a) * d * 0.28 * s, 0.13 * s, 0.024 * s, 0.13 * s, cc, hdo(cm, { rx: (r() - 0.5) * 0.7, rz: (r() - 0.5) * 0.7 }));
    }
    if (!look.noSpill) coins(add, r, 0, 0, 0.62 * s, 0.32 * s, 3 + tier, cc, hdo(cm), 0.13 * s);
    (look.gems ?? []).forEach((g) => {
      for (let k = 0; k < 2; k++) {
        const [gx, gz] = [(r() - 0.5) * 0.6 * s, (r() - 0.5) * 0.3 * s];
        add("octa", gx, 0.78 * s, gz, 0.11 * s, 0.15 * s, 0.11 * s, g, hdo("gem", { glow: tier >= 3, rz: (r() - 0.5) * 0.8 }));
      }
    });
    // A jewel set in the front (epic and up)
    if (tier >= 3 && look.gems) add("sphere", 0, 0.22 * s, 0.35 * s - 0.01, 0.12 * s, 0.12 * s, 0.08 * s, look.gems[0], hdo("gem"));
  } else {
    c.add("cyl", 0, (0.6 - 0.55) * s, 0, 0.36 * s, 1.1 * s, 0.36 * s, wood, { rz: Math.PI / 2, mat: wm, hd: false }); // rounded lid on the box
    c.add("box", 0, 0.42 * s, 0.37 * s, 0.18 * s, 0.22 * s, 0.05 * s, trim, { mat: mm });
    // HD: a domed lid over the whole chest, the bands running over it
    add("cyl", 0, 0.05 * s, 0, 0.36 * s, 1.1 * s, 0.7 * s, wood, hdo(wm, { rz: Math.PI / 2 }));
    for (const side of [-1, 1]) add("cyl", side * 0.42 * s, 0.55 * s, 0, 0.36 * s + 0.1, 0.1 * s, 0.7 * s + 0.1, trim, hdo(mm, { rz: Math.PI / 2 }));
    if (tier > 0) {
      // A padlock hanging from the hasp: its body, keyhole and shackle
      const lk = look.lock ?? trim;
      add("box", 0, 0.24 * s, 0.4 * s, 0.13 * s, 0.13 * s, 0.05 * s, lk, hdo(mm));
      add("box", 0, 0.27 * s, 0.4 * s + 0.03 * s, 0.02 * s, 0.05 * s, 0.02 * s, "#0c0a09", hdo("dull"));
      arc(add, [0, 0.37 * s, 0.4 * s], [1, 0, 0], [0, 1, 0], 0.045 * s, 0, Math.PI, 4, 0.02 * s, lk, hdo(mm));
    }
  }
}

/** HD: a pickaxe, its haft from `grip` to `top` and its head across the top, pointing both ways along `dir` */
function pickaxe(add: Add, grip: V3, top: V3, dir: V3, metal: string, mat: Surface) {
  along(add, "cyl", grip, top, 0.05, 0.05, "#78350f", hdo("wood"));
  const l = Math.hypot(dir[0], dir[1], dir[2]);
  for (const k of [-1, 1]) along(add, "cone", top, [top[0] + (dir[0] / l) * 0.26 * k, top[1] + (dir[1] / l) * 0.26 * k, top[2] + (dir[2] / l) * 0.26 * k], 0.07, 0.07, metal, hdo(mat));
}

/** HD: battens standing proud at a crate's four corners (a crate `w` × `h` × `d` from y0) */
function battens(add: Add, x: number, y0: number, z: number, w: number, h: number, d: number, color: string) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add("box", x + sx * (w / 2 + 0.01), y0 + 0.03, z + sz * (d / 2 + 0.01), 0.08, h - 0.09, 0.08, color, hdo("wood"));
}

/** HD: iron bands round a box `w` wide and `h` tall (`d` deep) from y0, at the given offsets along x */
function bands(add: Add, x: number, y0: number, z: number, h: number, d: number, at: number[], color: string, mat: Surface) {
  for (const o of at) add("box", x + o, y0, z, 0.06, h + 0.05, d + 0.1, color, hdo(mat));
}

/** HD: a split-rail fence between posts in a ring (`n` posts at radius `r`), two rails a span, a gap left at `gate` */
function rails(add: Add, n: number, r: number, gate: number, ys: number[], color: string) {
  for (let i = 0; i < n; i++) {
    if (i === gate) continue;
    const [a, a2] = [(i / n) * Math.PI * 2, ((i + 1) / n) * Math.PI * 2];
    for (const y of ys) along(add, "box", [Math.cos(a) * r, y, Math.sin(a) * r], [Math.cos(a2) * r, y, Math.sin(a2) * r], 0.06, 0.05, color, hdo("wood"));
  }
}

/** HD: a cart's iron rails on wooden sleepers, along z from z0 to z1 at x (the gauge 0.4) */
function track(add: Add, x: number, z0: number, z1: number, rail: string, mat: Surface) {
  for (let z = z0 + 0.1; z < z1; z += 0.38) add("box", x, 0, z, 0.72, 0.05, 0.12, "#5b3b22", hdo("wood"));
  for (const sx of [-1, 1]) add("box", x + sx * 0.2, 0.05, (z0 + z1) / 2, 0.05, 0.06, z1 - z0, rail, hdo(mat));
}

/** HD: an ore cart's wheels and its rim (the cart a box 0.75 × 0.45 × 0.9 from y0 0.12, centred at x, z) */
function cartWheels(add: Add, x: number, z: number, metal: string, mat: Surface) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add("cyl", x + sx * 0.41, 0.17 - 0.025, z + sz * 0.27, 0.2, 0.05, 0.2, metal, hdo(mat, { rz: Math.PI / 2 }));
  add("box", x, 0.52, z, 0.85, 0.1, 1.0, metal, hdo(mat));
}

function buildSpawnModel(type: string, b: Builder, rng: Rng) {
  // Spawns already redesigned on the rarity ladder
  if (isLadderSpawn(type)) return buildLadderSpawn(type, b, rng);
  // The wandering legends (the Royal Codex only, for now)
  if (isLegend(type)) return buildLegend(type, b, rng);
  const add = adder(b);
  switch (type) {
    /* ---------------------------- TREASURES --------------------------- */
    case "treasure-stash": {
      // Common: a pine chest, a bedroll, a pack and a cold campfire; HD matte, rope handles, straps and a stick
      chest(b, 0, 0, 0.3, "#8b5a2b", "#57534e", 0.9);
      b.add("cyl", -1.0, 0.15 - 0.55, 0.5, 0.3, 1.1, 0.3, "#a16207", { rx: Math.PI / 2, mat: "cloth" }); // bedroll, rolled up on the ground
      b.add("box", 0.9, 0, 0.6, 0.45, 0.6, 0.3, "#78350f", { mat: "leather" }); // backpack
      b.add("cone", -0.6, 0, -0.9, 0.4, 0.4, 0.4, "#f97316", { glow: true }); // old campfire
      // HD: straps round the bedroll; the pack's flap, buckle, straps and a blanket rolled on top; a waterskin
      for (const z of [0.2, 0.8]) add("cyl", -1.0, 0.15 - 0.03, z, 0.38, 0.06, 0.38, "#57534e", hdo("leather", { rx: Math.PI / 2 }));
      add("box", 0.9, 0.42, 0.6 + 0.05, 0.55, 0.23, 0.3, "#5b2a0e", hdo("leather"));
      add("box", 0.9, 0.36, 0.6 + 0.22, 0.08, 0.1, 0.04, "#78716c", hdo("dull"));
      for (const sx of [-1, 1]) add("box", 0.9 + sx * 0.12, 0.05, 0.6 - 0.17, 0.06, 0.5, 0.05, "#57534e", hdo("leather"));
      add("cyl", 0.9, 0.7 - 0.25, 0.6, 0.18, 0.5, 0.18, "#7c2d12", hdo("cloth", { rz: Math.PI / 2 }));
      add("egg", 1.3, 0, 0.2, 0.22, 0.3, 0.16, "#92400e", hdo("leather", { rz: 1.2 }));
      // A ring of stones round the campfire, charred logs crossed in its embers; a walking stick against the chest
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        add("boulder", -0.6 + Math.cos(a) * 0.34, 0, -0.9 + Math.sin(a) * 0.34, 0.16, 0.12, 0.14, "#78716c", hdo("stone", { ry: a }));
      }
      for (const a of [0.4, 2.5, 4.4]) along(add, "cyl", [-0.6 + Math.cos(a) * 0.3, 0.03, -0.9 + Math.sin(a) * 0.3], [-0.6 + Math.cos(a) * 0.04, 0.16, -0.9 + Math.sin(a) * 0.04], 0.07, 0.07, "#292524", hdo("wood"));
      along(add, "cyl", [-0.62, 0, 0.42], [-0.42, 1.1, 0.22], 0.05, 0.05, "#5b3b22", hdo("wood"));
      break;
    }
    case "treasure-lockbox": {
      // Uncommon: an iron-banded chest dug up in the underbrush; HD: the padlock in brass, a shovel stuck in the earth
      chest(b, 0, 0, -0.2, "#475569", "#1e293b", 1.0, false, undefined, { tier: 1, lock: "#b45309" });
      b.add("sphere", 0, -0.25, 0, 2.0, 0.5, 1.6, "#78716c", { mat: "hide" }); // dug-up earth
      b.add("sphere", 1.2, 0, -0.8, 1.0, 0.8, 1.0, "#3f6212", { mat: "leaf", hdShape: "canopy" });
      b.add("sphere", -1.1, 0, 0.7, 0.8, 0.7, 0.8, "#4d7c0f", { mat: "leaf", hdShape: "canopy" });
      b.add("cyl", -0.9, 0, -0.6, 0.05, 1.0, 0.05, "#57534e", { rz: 0.6, hd: false }); // shovel
      // HD: clods of turned earth, and the shovel: its blade in the ground, the haft and a grip
      const hr = mulberry32(4411);
      for (let i = 0; i < 7; i++) {
        const a = hr() * Math.PI * 2;
        const d = 0.95 + hr() * 0.35;
        add("boulder", Math.cos(a) * d, 0, Math.sin(a) * d * 0.8, 0.14 + hr() * 0.12, 0.1 + hr() * 0.08, 0.14 + hr() * 0.1, "#57534e", hdo("stone", { ry: a }));
      }
      along(add, "box", [-1.0, -0.12, -0.62], [-0.97, 0.2, -0.64], 0.24, 0.03, "#57534e", hdo("dull"));
      along(add, "cyl", [-0.97, 0.18, -0.64], [-0.78, 1.05, -0.7], 0.05, 0.05, "#78350f", hdo("wood"));
      arc(add, [-0.77, 1.1, -0.7], [0.2, 0.98, 0], [0, 0, 1], 0.07, -1.2, 4.4, 5, 0.025, "#78350f", hdo("wood"));
      break;
    }
    case "treasure-strongbox": {
      // Rare: a crimson chest with gold fittings, gold spilling; HD: real gold, the crown's gems and pearls, bullion
      chest(b, 0, 0, 0.2, "#991b1b", "#fbbf24", 1.15, true, undefined, { metal: "gold", tier: 2 });
      const piles: V3[] = [];
      for (let i = 0; i < 4; i++) {
        const x = range(rng, -1.0, 1.0);
        const z = range(rng, 0.6, 1.2);
        const h = range(rng, 0.15, 0.4);
        b.add("cyl", x, 0, z, 0.45, h, 0.45, "#fbbf24", { glow: true });
        piles.push([x, h, z]);
      }
      b.add("cyl", 0.9, 0, -0.5, 0.45, 0.3, 0.45, "#fbbf24", { glow: true, mat: "gold" }); // crown band
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        b.add("cone", 0.9 + Math.cos(a) * 0.18, 0.3, -0.5 + Math.sin(a) * 0.18, 0.08, 0.18, 0.08, "#fbbf24", { mat: "gold" });
        // HD: a pearl on each point, a gem round the band below it
        add("sphere", 0.9 + Math.cos(a) * 0.18, 0.46, -0.5 + Math.sin(a) * 0.18, 0.06, 0.06, 0.06, "#f8fafc", hdo("gem"));
        add("sphere", 0.9 + Math.cos(a + 0.6) * 0.235, 0.12, -0.5 + Math.sin(a + 0.6) * 0.235, 0.07, 0.07, 0.05, i % 2 ? "#dc2626" : "#2563eb", hdo("gem", { ry: -(a + 0.6) + Math.PI / 2 }));
      }
      // HD: minted coins in little stacks round each pile, and gold bars stacked by the chest
      const hr = mulberry32(5303);
      for (const [x, , z] of piles) coins(add, hr, x, 0, z, 0.38, 3, "#fbbf24", hdo("gold"), 0.13);
      for (const [x, y0, z, ry] of [
        [-0.95, 0, -0.55, 0.3],
        [-0.75, 0, -0.75, 0.3],
        [-0.85, 0.12, -0.65, 0.35]
      ])
        add("block", x, y0, z, 0.34, 0.12, 0.16, "#fbbf24", hdo("gold", { ry }));
      break;
    }
    case "treasure-seachest": {
      // Epic: a jewelled sea trunk from a wreck; HD: gold fittings, sapphires and pearls, a real anchor, barnacles, weed
      chest(b, 0, 0, -0.4, "#115e59", "#a16207", 1.1, true, "#38bdf8", { metal: "gold", tier: 3, gems: ["#2563eb", "#f0f9ff"] });
      for (let i = 0; i < 5; i++) {
        b.add("octa", range(rng, -1.1, 1.1), 0, range(rng, 0.6, 1.3), 0.25, 0.35, 0.25, i % 2 ? "#60a5fa" : "#f0f9ff", { glow: true, mat: "gem" });
      }
      b.add("cyl", -1.3, 0, -0.6, 0.12, 1.4, 0.12, "#57534e", { rz: 0.3, hd: false }); // anchor
      b.add("box", -1.1, 0, -0.6, 0.8, 0.12, 0.12, "#57534e", { rz: 0.3, hd: false });
      const barnacles: Array<[number, number]> = [
        [0.5, -0.4],
        [-0.4, -0.5],
        [1.2, 0.2]
      ];
      barnacles.forEach(([x, z], i) => {
        // (the third stands off the chest: in HD it lies on the sand)
        b.add("sphere", x, 0.55, z, 0.2, 0.15, 0.2, "#d6d3d1", { mat: "stone", hd: i === 2 ? false : undefined }); // barnacles
      });
      add("sphere", 1.2, 0, 0.2, 0.24, 0.16, 0.24, "#d6d3d1", hdo("stone"));
      const hr = mulberry32(7717);
      const IRON = "#5b4a3f";
      // HD: an iron anchor lying on the sand: shank, stock, curved arms with flukes, its ring and a few links of chain
      {
        const an = b.child(-1.25, -0.75, 0.5);
        const aa = adder(an);
        const y = 0.07;
        along(aa, "capsule", [0, y, -0.52], [0, y, 0.62], 0.1, 0.1, IRON, hdo("iron"));
        along(aa, "capsule", [-0.38, y + 0.02, 0.48], [0.38, y + 0.02, 0.48], 0.07, 0.07, IRON, hdo("iron"));
        arc(aa, [0, y, -0.22], [1, 0, 0], [0, 0, 1], 0.34, Math.PI, Math.PI * 2, 6, 0.09, IRON, hdo("iron"));
        for (const sx of [-1, 1]) along(aa, "drop", [sx * 0.34, y, -0.26], [sx * 0.4, y, 0.02], 0.17, 0.06, IRON, hdo("iron"));
        arc(aa, [0, y, 0.72], [1, 0, 0], [0, 0, 1], 0.1, 0, Math.PI * 2, 8, 0.04, IRON, hdo("iron"));
        for (let k = 0; k < 4; k++) {
          const c: V3 = [0.06 * k, 0.04, 0.88 + 0.13 * k];
          arc(aa, c, k % 2 ? [0, 1, 0] : [1, 0, 0], [0, 0, 1], [0.04, 0.07], 0, Math.PI * 2, 6, 0.022, IRON, hdo("iron"));
        }
      }
      // Barnacle cones clustered on the chest, a starfish or two, pearls in the sand and weed swaying in the current
      barnacles.forEach(([x, z], i) => {
        for (let k = 0; k < 4; k++) {
          const a = hr() * Math.PI * 2;
          add("cone", x + Math.cos(a) * 0.13, i === 2 ? 0 : 0.55, z + Math.sin(a) * 0.13, 0.08, 0.07, 0.08, "#e7e5e4", hdo("stone"));
        }
      });
      for (const [x, z, s] of [
        [0.9, 0.9, 1],
        [-0.6, 1.1, 0.8]
      ])
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2 + x;
          along(add, "capsule", [x, 0.03, z], [x + Math.cos(a) * 0.17 * s, 0.03, z + Math.sin(a) * 0.17 * s], 0.06 * s, 0.05 * s, "#f97316", hdo("hide"));
        }
      for (let i = 0; i < 6; i++) add("sphere", (hr() - 0.5) * 2.2, 0, 0.5 + hr() * 0.9, 0.07, 0.07, 0.07, "#f8fafc", hdo("gem"));
      for (let i = 0; i < 9; i++) {
        const a = hr() * Math.PI * 2;
        const d = 0.7 + hr() * 0.7;
        const [x, z] = [Math.cos(a) * d, Math.sin(a) * d];
        along(add, "capsule", [x, 0, z], [x + (hr() - 0.5) * 0.2, 0.35 + hr() * 0.35, z + (hr() - 0.5) * 0.2], 0.05, 0.03, i % 2 ? "#166534" : "#3f6212", hdo("leaf", { idle: IDLE_KIND.sway }));
      }
      break;
    }
    case "treasure-cart": {
      // Common: a broken-down merchant wagon; HD: plank sides and stakes, spoked wheels, battened crates, a sack, rope
      const c = b.child(0, 0, 0.3);
      const ca = adder(c);
      c.add("box", 0, 0.45, 0, 1.4, 0.6, 2.2, "#8b5a2b", { mat: "wood" }); // wagon bed
      c.add("cyl", 0.75, 0.375 - 0.05, 0.7, 0.75, 0.1, 0.75, "#5b3b22", { rz: Math.PI / 2, hd: false }); // wheels, standing on the ground
      c.add("cyl", -0.75, 0.375 - 0.05, -0.7, 0.75, 0.1, 0.75, "#5b3b22", { rz: Math.PI / 2, hd: false });
      c.add("cyl", -0.95, 0.37 - 0.05, 0.9, 0.75, 0.1, 0.75, "#5b3b22", { rz: 1.2, rx: 0.4, hd: false }); // the broken one
      c.add("box", 0, 1.05, -0.5, 0.6, 0.5, 0.6, "#a16207", { mat: "wood" }); // crates
      c.add("box", 0.2, 1.05, 0.4, 0.5, 0.45, 0.5, "#92400e", { mat: "wood" });
      c.add("cyl", -0.3, 1.05, 0.3, 0.4, 0.5, 0.4, "#ca8a04", { mat: "cloth", hdShape: "egg" }); // grain sack
      c.add("cyl", 0, 0.64 - 0.7, 1.6, 0.08, 1.4, 0.08, "#5b3b22", { rx: Math.PI / 2, mat: "wood" }); // shaft, out of the wagon bed
      b.add("box", 1.2, 0, 1.0, 0.5, 0.4, 0.5, "#a16207", { mat: "wood" }); // spilled crate
      b.add("cyl", 1.6, 0, 0.4, 0.4, 0.15, 0.4, "#fbbf24", { glow: true }); // coin purse spill
      // HD: stakes and a top rail along the bed's sides, the board seams; spoked wheels on the right and back-left, the
      // broken one fallen flat beside the snapped axle
      const WOOD = "#6b4423";
      for (const sx of [-1, 1]) {
        for (const z of [-0.9, 0, 0.9]) ca("box", sx * 0.74, 0.45, z, 0.08, 0.92, 0.08, WOOD, hdo("wood"));
        ca("box", sx * 0.74, 1.24, 0, 0.06, 0.1, 2.2, WOOD, hdo("wood"));
        for (const y of [0.64, 0.85]) ca("box", sx * 0.7, y, 0, 0.1, 0.025, 2.1, shade("#8b5a2b", 0.6), hdo("wood"));
      }
      wheel(ca, [0.78, 0.375, 0.7], [0, 1, 0], [0, 0, 1], 0.375, 0.07, "#5b3b22", hdo("wood"), 8);
      wheel(ca, [-0.78, 0.375, -0.7], [0, 1, 0], [0, 0, 1], 0.375, 0.07, "#5b3b22", hdo("wood"), 8);
      wheel(ca, [-1.25, 0.1, 1.05], [Math.cos(0.25), Math.sin(0.25), 0], [0, 0, 1], 0.375, 0.07, "#5b3b22", hdo("wood"), 8, 0.6, 5.6);
      for (const sx of [-1, 1]) along(ca, "cyl", [sx * 0.6, 0.375, 0.7 * sx], [sx * 0.86, 0.375, 0.7 * sx], 0.08, 0.08, "#3f3f46", hdo("dull")); // axle ends
      // Battens on the crates; the sack's tied neck; a coil of rope; the yoke at the shaft's end
      battens(ca, 0, 1.05, -0.5, 0.6, 0.5, 0.6, "#78350f");
      battens(ca, 0.2, 1.05, 0.4, 0.5, 0.45, 0.5, "#5b2a0e");
      ca("taper", -0.3, 1.52, 0.3, 0.14, 0.12, 0.14, "#ca8a04", hdo("cloth"));
      ca("cyl", -0.3, 1.6, 0.3, 0.16, 0.04, 0.16, "#78350f", hdo("cloth"));
      for (const y of [1.08, 1.13]) arc(ca, [-0.38, y, 0.85], [1, 0, 0], [0, 0, 1], 0.17, 0, Math.PI * 2, 8, 0.05, "#a8a29e", hdo("cloth"));
      along(ca, "cyl", [-0.42, 0.66, 2.25], [0.42, 0.66, 2.25], 0.07, 0.07, "#5b3b22", hdo("wood"));
      // The spilled crate's battens and a split plank, the purse the coins spilled from
      battens(add, 1.2, 0, 1.0, 0.5, 0.4, 0.5, "#78350f");
      along(add, "box", [0.85, 0.03, 1.45], [1.45, 0.03, 1.6], 0.12, 0.04, "#a16207", hdo("wood"));
      add("egg", 1.42, 0, 0.3, 0.24, 0.16, 0.2, "#7c2d12", hdo("leather", { rz: 1.3 }));
      coins(add, mulberry32(6203), 1.65, 0.0, 0.5, 0.3, 4, "#ca8a04", hdo("dull"), 0.12);
      break;
    }
    case "treasure-orecache": {
      // Uncommon: ore crates behind a rune-sealed door in the rock; HD: a stone frame, iron bands, ore lumps, a pick
      b.add("box", 0, 0, -0.9, 2.4, 2.0, 0.6, "#57534e", { mat: "stone" }); // rock face
      b.add("box", 0, 0, -0.58, 1.1, 1.5, 0.08, "#44403c", { mat: "stone", hdShape: "block" }); // rune door
      b.add("box", 0, 0.9, -0.53, 0.5, 0.3, 0.02, "#38bdf8", { glow: true }); // rune
      const heaps: Array<[number, number, string]> = [
        [-0.8, 0.4, "#71717a"],
        [0.1, 0.6, "#a16207"],
        [0.9, 0.3, "#71717a"]
      ];
      for (const [x, z, c] of heaps) {
        b.add("box", x, 0, z, 0.7, 0.6, 0.6, "#5b3b22", { mat: "wood" }); // ore crates
        b.add("sphere", x, 0.55, z, 0.6, 0.3, 0.5, c, { glow: c === "#a16207", mat: "stone" });
      }
      b.add("box", 0.1, 0.6, 0.6, 0.7, 0.5, 0.6, "#5b3b22", { mat: "wood" });
      b.add("box", -1.4, 0, 1.0, 0.1, 0.9, 0.1, "#78350f", { rz: 0.4, hd: false }); // pickaxe
      b.add("box", -1.25, 0.8, 1.0, 0.5, 0.08, 0.08, "#a8a29e", { rz: 0.4, hd: false });
      // HD: rocks round the face; the door's stone jambs and lintel, its iron studs and ring
      const hr = mulberry32(8807);
      for (const [x, y0, z, s] of [
        [-1.2, 0, -0.7, 0.7],
        [1.25, 0, -0.75, 0.6],
        [-0.7, 1.75, -0.9, 0.6],
        [0.6, 1.8, -0.95, 0.7],
        [1.0, 0, -0.45, 0.4]
      ])
        add("boulder", x, y0, z, s, s * 0.75, s * 0.8, "#57534e", hdo("stone", { ry: hr() * 3 }));
      for (const sx of [-1, 1]) add("block", sx * 0.66, 0, -0.55, 0.22, 1.62, 0.2, "#78716c", hdo("stone"));
      add("block", 0, 1.55, -0.55, 1.6, 0.26, 0.24, "#78716c", hdo("stone"));
      for (const x of [-0.35, 0.35]) for (const y of [0.25, 0.6, 1.25]) add("sphere", x, y - 0.03, -0.54, 0.06, 0.06, 0.06, "#27272a", hdo("dull"));
      arc(add, [0.32, 0.88, -0.5], [1, 0, 0], [0, 1, 0], 0.07, Math.PI, Math.PI * 3, 6, 0.022, "#27272a", hdo("dull"));
      // Iron bands round each crate and ore lumps on the open heaps
      for (const [x, z] of heaps) bands(add, x, 0, z, 0.6, 0.6, [-0.25, 0.25], "#3f3f46", "dull");
      bands(add, 0.1, 0.6, 0.6, 0.5, 0.6, [-0.25, 0.25], "#3f3f46", "dull");
      for (const [x, z, c] of [heaps[0], heaps[2]])
        for (let k = 0; k < 3; k++) add("boulder", x + (hr() - 0.5) * 0.35, 0.72, z + (hr() - 0.5) * 0.25, 0.16, 0.13, 0.15, shade(c, 0.85), hdo("dull", { ry: hr() * 3 }));
      pickaxe(add, [-1.55, 0, 1.0], [-1.3, 0.85, 1.0], [0.4, -0.15, 0.1], "#a8a29e", "dull");
      break;
    }
    case "treasure-reliquary": {
      // Rare: a moonsilver casket on a vine-wrapped pedestal; HD: polished silver, a fluted pedestal, real vines, a crescent
      b.add("cyl", 0, 0, 0, 1.0, 0.9, 1.0, "#e2e8f0", { mat: "stone" }); // pedestal
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        b.add("box", Math.cos(a) * 0.5, 0.1, Math.sin(a) * 0.5, 0.08, 0.8, 0.08, "#4d7c0f", { ry: -a, rz: 0.3, hd: false }); // vines
      }
      chest(b.child(0, 0, 0, 0.9), 0, 0, 0.3, "#cbd5e1", "#a5b4fc", 0.8, true, "#e0e7ff", { wood: "steel", metal: "steel", tier: 2, coin: "#e2e8f0", coinMat: "steel", noSpill: true });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        b.add("octa", Math.cos(a) * 1.4, 1.3 + (i % 2) * 0.5, Math.sin(a) * 1.4, 0.18, 0.28, 0.18, "#c7d2fe", { glow: true }); // starlight motes
      }
      b.add("sphere", 0, 2.7, -0.4, 0.5, 0.5, 0.12, "#f8fafc", { glow: true, hd: false }); // crescent glow
      // HD: the pedestal's base and capital, flutes round its shaft; three vines climbing it in leaf, with moonflowers
      add("cyl", 0, 0, 0, 1.14, 0.12, 1.14, "#e2e8f0", hdo("stone"));
      add("cyl", 0, 0.78, 0, 1.14, 0.12, 1.14, "#e2e8f0", hdo("stone"));
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + 0.3;
        add("capsule", Math.cos(a) * 0.49, 0.12, Math.sin(a) * 0.49, 0.06, 0.66, 0.06, "#cbd5e1", hdo("stone"));
      }
      for (let v = 0; v < 3; v++) {
        const at = (t: number): V3 => {
          const a = (v / 3) * Math.PI * 2 + t * 2.4;
          return [Math.cos(a) * 0.55, 0.04 + t * 0.82, Math.sin(a) * 0.55];
        };
        for (let k = 0; k < 6; k++) {
          const [p, q] = [at(k / 6), at((k + 1) / 6)];
          along(add, "capsule", p, q, 0.045, 0.045, "#4d7c0f", hdo("leaf"));
          along(add, "egg", q, [q[0] * 1.25, q[1] + 0.06, q[2] * 1.25], 0.1, 0.03, "#65a30d", hdo("leaf"));
          if (k % 2) add("sphere", p[0] * 1.08, p[1], p[2] * 1.08, 0.06, 0.06, 0.06, "#f8fafc", hdo("gem"));
        }
      }
      // A crescent moon of light where the flat glow was
      arc(add, [0, 2.95, -0.4], [1, 0, 0], [0, 1, 0], 0.24, Math.PI * 0.35, Math.PI * 1.65, 7, 0.09, "#f8fafc", hdo("gem", { glow: true }));
      break;
    }
    case "treasure-dragonhoard": {
      // Epic: a mountain of gold round a shed dragon skull; HD: coins over its slopes, gem-set goblets, the skull's
      // embers still glowing, a sword driven into the gold, a shield, bones
      b.add("cone", 0, 0, 0, 3.6, 1.0, 3.6, "#fbbf24", { glow: true }); // mountain of coins
      const cups: V3[] = [];
      for (let i = 0; i < 6; i++) {
        const x = range(rng, -1.4, 1.4);
        const y = range(rng, 0, 0.4);
        const z = range(rng, -1.4, 1.4);
        b.add("cyl", x, y, z, 0.25, 0.35, 0.25, "#eab308", { hd: false }); // goblets
        cups.push([x, y, z]);
      }
      const sk = b.child(-1.3, -0.6, 0.6); // shed dragon skull
      sk.add("box", 0, 0, 0, 1.0, 0.8, 1.6, BONE, { hd: false });
      sk.add("box", 0, 0, 0.9, 0.7, 0.4, 0.6, BONE, { hd: false });
      sk.add("box", -0.3, 0.45, 0.4, 0.22, 0.22, 0.2, "#1c1917", { hd: false });
      sk.add("box", 0.3, 0.45, 0.4, 0.22, 0.22, 0.2, "#1c1917", { hd: false });
      sk.add("cone", -0.35, 0.6, -0.5, 0.18, 1.0, 0.18, BONE, { rx: -0.8, hd: false });
      sk.add("cone", 0.35, 0.6, -0.5, 0.18, 1.0, 0.18, BONE, { rx: -0.8, hd: false });
      for (let i = 0; i < 4; i++) b.add("octa", range(rng, -1, 1.4), range(rng, 0.4, 0.9), range(rng, -1, 1.2), 0.25, 0.35, 0.25, i % 2 ? "#ef4444" : "#22d3ee", { glow: true, mat: "gem" }); // gems
      const hr = mulberry32(9901);
      // HD: coins lying over the hoard's slopes and strewn round its foot
      for (let i = 0; i < 40; i++) {
        const a = hr() * Math.PI * 2;
        const d = Math.sqrt(hr()) * 1.75;
        const y = Math.max(0, 1 - d / 1.8);
        add("cyl", Math.cos(a) * d, y - 0.005, Math.sin(a) * d, 0.16, 0.03, 0.16, hr() < 0.3 ? "#eab308" : "#fbbf24", hdo("gold", { rx: (d < 1.75 ? 0.5 : 0.1) + (hr() - 0.5) * 0.5, ry: Math.PI / 2 - a }));
      }
      coins(add, hr, 0, 0, 0, 2.2, 10, "#fbbf24", hdo("gold"), 0.15);
      // Goblets: foot, stem and bowl in gold, a ruby on each bowl
      for (const [x, , z] of cups) {
        // Standing on the hoard's slope
        const y = Math.max(0, 1 - Math.hypot(x, z) / 1.8) - 0.02;
        add("cyl", x, y, z, 0.2, 0.04, 0.2, "#eab308", hdo("gold"));
        add("cyl", x, y + 0.04, z, 0.05, 0.15, 0.05, "#eab308", hdo("gold"));
        add("cone", x, y + 0.17, z, 0.28, 0.2, 0.28, "#eab308", hdo("gold", { rx: Math.PI }));
        add("sphere", x, y + 0.26, z + 0.11, 0.06, 0.06, 0.05, "#dc2626", hdo("gem"));
      }
      // The dragon skull: cranium, crested brows over deep sockets with embers in them, a long snout with nostrils and
      // teeth, the jaw fallen a little open, swept horns and cheek spikes
      {
        const ka = adder(sk);
        ka("sphere", 0, 0.05, -0.15, 1.0, 0.72, 1.15, BONE, hdo("bone"));
        ka("snout", 0, 0.24, 0.85, 0.62, 0.36, 1.1, BONE, hdo("bone"));
        ka("snout", 0.05, 0, 0.8, 0.55, 0.18, 1.05, BONE, hdo("bone", { ry: 0.08 }));
        for (const sx of [-1, 1]) {
          ka("sphere", sx * 0.27, 0.36, 0.3, 0.26, 0.24, 0.22, "#1c1917", hdo("stone"));
          ka("sphere", sx * 0.27, 0.42, 0.4, 0.09, 0.09, 0.07, "#f97316", hdo("lava", { glow: true }));
          along(ka, "capsule", [sx * 0.42, 0.6, 0.08], [sx * 0.12, 0.66, 0.5], 0.12, 0.1, BONE, hdo("bone"));
          ka("sphere", sx * 0.13, 0.45, 1.33, 0.08, 0.06, 0.07, "#1c1917", hdo("stone"));
          along(ka, "horn", [sx * 0.32, 0.55, -0.45], [sx * 0.48, 0.95, -1.25], 0.2, 0.2, BONE, hdo("bone"));
          along(ka, "horn", [sx * 0.46, 0.3, 0.05], [sx * 0.78, 0.28, -0.25], 0.1, 0.1, BONE, hdo("bone"));
          for (let k = 0; k < 4; k++) {
            const z = 0.55 + k * 0.22;
            ka("cone", sx * (0.24 - k * 0.025), 0.12, z, 0.06, 0.14, 0.06, "#e7e5e4", hdo("bone", { rx: Math.PI }));
            ka("cone", sx * (0.21 - k * 0.025), 0.15, z + 0.1, 0.05, 0.11, 0.05, "#e7e5e4", hdo("bone"));
          }
        }
      }
      // A sword driven point-first into the gold, a round shield leaning on the hoard, a few bones
      along(add, "blade", [0.62, 1.05, 0.36], [0.54, 0.25, 0.3], 0.05, 0.14, "#cbd5e1", hdo("steel"));
      along(add, "box", [0.47, 1.06, 0.36], [0.77, 1.08, 0.37], 0.06, 0.06, "#eab308", hdo("gold"));
      along(add, "cyl", [0.62, 1.08, 0.365], [0.63, 1.32, 0.37], 0.05, 0.05, "#3f2a1a", hdo("leather"));
      add("sphere", 0.63, 1.32, 0.37, 0.08, 0.08, 0.08, "#dc2626", hdo("gem", { glow: true }));
      add("cyl", 1.55, 0.45 - 0.03, 0.95, 0.85, 0.06, 0.85, "#7f1d1d", hdo("iron", { rx: 1.15, ry: -0.9 }));
      add("sphere", 1.58, 0.42, 0.98, 0.16, 0.16, 0.16, "#eab308", hdo("gold"));
      bone(add, [1.4, 0.04, -1.3], [1.95, 0.04, -1.0], 0.07, BONE, hdo("bone"));
      bone(add, [-0.3, 0.04, 1.75], [0.25, 0.04, 1.95], 0.06, BONE, hdo("bone"));
      break;
    }

    /* ---------------------------- RESOURCES --------------------------- */
    case "res-timber": {
      // Common: a timber camp among pines; HD: layered pines on flared trunks, log ends, stakes, an axe in the stump
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.4;
        const t = b.child(Math.cos(a) * 2.0, Math.sin(a) * 2.0 - 0.4, 0);
        t.add("cyl", 0, 0, 0, 0.25, 0.8, 0.25, "#5b3b22", { mat: "wood", hdShape: "trunk" });
        t.add("cone", 0, 0.6, 0, 1.1, 1.6, 1.1, "#166534", { idle: IDLE_KIND.sway, hd: false });
        t.add("cone", 0, 1.4, 0, 0.8, 1.2, 0.8, "#15803d", { idle: IDLE_KIND.sway, hd: false });
        // HD: one layered pine crown bending with the wind
        t.add("pine", 0, 0.5, 0, 1.25, 2.15, 1.25, i % 2 ? "#166534" : "#15803d", hdo("leaf", { idle: IDLE_KIND.sway }));
      }
      for (let i = 0; i < 4; i++) b.add("cyl", 0.3, 0.15 + (i % 2) * 0.26 - 0.9, 0.4 + i * 0.15, 0.3, 1.8, 0.3, "#92400e", { rz: Math.PI / 2, mat: "wood" }); // log pile
      b.add("cyl", -0.9, 0, 0.6, 0.55, 0.45, 0.55, "#a16207", { mat: "wood", hdShape: "trunk" }); // stump with axe
      b.add("box", -0.85, 0.45, 0.6, 0.06, 0.6, 0.06, "#78350f", { rz: 0.4, hd: false });
      b.add("box", -0.75, 0.75, 0.6, 0.25, 0.18, 0.04, "#cbd5e1", { rz: 0.4, hd: false });
      // HD: pale cut ends on the logs, stakes holding the pile; the stump's cut face and rings, the axe bitten into it
      for (let i = 0; i < 4; i++) {
        const y = 0.15 + (i % 2) * 0.26;
        for (const x of [-0.6, 1.2]) add("cyl", x, y - 0.05, 0.4 + i * 0.15, 0.24, 0.1, 0.24, "#d6b98c", hdo("wood", { rz: Math.PI / 2 }));
      }
      for (const x of [-0.45, 1.05]) add("cyl", x, 0, 1.08, 0.07, 0.62, 0.07, "#5b3b22", hdo("wood"));
      add("cyl", -0.9, 0.44, 0.6, 0.42, 0.06, 0.42, "#d6b98c", hdo("wood"));
      along(add, "box", [-0.94, 0.42, 0.6], [-0.74, 0.5, 0.6], 0.05, 0.2, "#a8a29e", hdo("dull"));
      along(add, "cyl", [-0.84, 0.48, 0.6], [-0.42, 1.0, 0.6], 0.05, 0.05, "#78350f", hdo("wood"));
      const hr = mulberry32(3131);
      for (let i = 0; i < 8; i++) {
        const a = hr() * Math.PI * 2;
        const d = 0.4 + hr() * 0.35;
        add("box", -0.9 + Math.cos(a) * d, 0, 0.6 + Math.sin(a) * d, 0.1, 0.03, 0.06, "#d6b98c", hdo("wood", { ry: hr() * 3 }));
      }
      break;
    }
    case "res-grain": {
      // Common: a wheat field; HD: furrowed soil, clumps of stalks each with its ear, bending as one in the wind; a
      // straw-hatted scarecrow hung on its post with its arms out
      b.add("box", 0, 0, 0, 3.6, 0.08, 3.0, "#854d0e", { mat: "hide" });
      let clump = 0;
      for (let r = 0; r < 4; r++) {
        const z = -1.1 + r * 0.72;
        // HD: a furrow under the row
        along(add, "capsule", [-1.72, 0.09, z], [1.72, 0.09, z], 0.16, 0.16, "#713f12", hdo("hide"));
        for (let c = 0; c < 5; c++) {
          const x = -1.4 + c * 0.7;
          const h = range(rng, 0.6, 0.85);
          // Wheat ripples across the field in a wave
          b.add("cone", x, 0.08, z, 0.42, h, 0.42, "#facc15", { idle: IDLE_KIND.sway, phase: 0.01 + c * 0.6 + r * 0.25, hd: false, sync: ++clump });
          // HD: stalks fanning from the clump's root, an ear of grain on each, all riding the clump's sway
          const hr = mulberry32(clump * 7919 + 13);
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2 + hr() * 0.8;
            const d = 0.04 + hr() * 0.1;
            const top: V3 = [x + Math.cos(a) * (d + 0.05), 0.08 + h * (0.85 + hr() * 0.25), z + Math.sin(a) * (d + 0.05)];
            const ride: AddOpts = { idle: IDLE_KIND.sway, sync: clump };
            along(add, "cyl", [x + Math.cos(a) * d * 0.4, 0.08, z + Math.sin(a) * d * 0.4], top, 0.022, 0.022, "#c8a03a", hdo("leaf", ride));
            along(add, "capsule", top, [top[0] + Math.cos(a) * 0.03, top[1] + 0.17, top[2] + Math.sin(a) * 0.03], 0.055, 0.055, "#facc15", hdo("leaf", ride));
          }
        }
      }
      b.add("cyl", 2.2, 0, 0.8, 0.6, 0.7, 0.6, "#ca8a04", { mat: "fur" }); // haystack
      b.add("cone", 2.2, 0.7, 0.8, 0.65, 0.5, 0.65, "#eab308", { mat: "fur" });
      const s = humanoid(b, -2.2, 0.6, 0.5, "#e0b48a", "#7c2d12", "#3f2a1a", 0.9, undefined, { head: "cloth", arm: (side) => ({ at: [side * 0.27, 0.837, 0], rz: side * 1.4 }) }); // scarecrow
      s.add("cone", 0, 1.0, 0, 0.5, 0.3, 0.5, "#a16207", { mat: "fur" });
      // HD: the scarecrow's post and the crossbar through its sleeves, its hat brim, stitched eyes and mouth on its sack
      // head, straw poking from its cuffs and collar
      const sa = adder(s);
      along(sa, "cyl", [0, 0, -0.15], [0, 1.18, -0.15], 0.07, 0.07, "#5b3b22", hdo("wood"));
      along(sa, "cyl", [-0.74, 0.84, -0.1], [0.74, 0.84, -0.1], 0.05, 0.05, "#5b3b22", hdo("wood"));
      sa("cyl", 0, 0.99, 0, 0.74, 0.035, 0.74, "#a16207", hdo("fur"));
      for (const sx of [-1, 1]) sa("sphere", sx * 0.05, 0.995, 0.125, 0.035, 0.035, 0.03, "#1c1917", hdo("cloth"));
      along(sa, "capsule", [-0.055, 0.935, 0.12], [0.055, 0.935, 0.12], 0.018, 0.018, "#1c1917", hdo("cloth"));
      for (const sx of [-1, 1]) for (const dz of [-0.04, 0.04]) along(sa, "drop", [sx * 0.66, 0.81, dz], [sx * 0.82, 0.78 + dz, dz * 2], 0.08, 0.08, "#ca8a04", hdo("fur"));
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        along(sa, "drop", [Math.cos(a) * 0.1, 0.84, Math.sin(a) * 0.08], [Math.cos(a) * 0.2, 0.74, Math.sin(a) * 0.15], 0.07, 0.07, "#ca8a04", hdo("fur"));
      }
      // A band of twine round the haystack, loose straw at its foot, a pitchfork leaning on it
      add("cyl", 2.2, 0.33, 0.8, 0.7, 0.05, 0.7, "#a16207", hdo("cloth"));
      const hr = mulberry32(2207);
      for (let i = 0; i < 6; i++) {
        const a = hr() * Math.PI * 2;
        along(add, "drop", [2.2 + Math.cos(a) * 0.32, 0, 0.8 + Math.sin(a) * 0.32], [2.2 + Math.cos(a) * 0.55, 0.05, 0.8 + Math.sin(a) * 0.55], 0.12, 0.05, "#ca8a04", hdo("fur"));
      }
      along(add, "cyl", [1.6, 0, 0.35], [1.9, 1.1, 0.62], 0.05, 0.05, "#78350f", hdo("wood"));
      along(add, "cyl", [1.84, 1.1, 0.6], [1.98, 1.12, 0.66], 0.03, 0.03, "#57534e", hdo("dull"));
      for (let k = 0; k < 3; k++) along(add, "cone", [1.85 + k * 0.06, 1.11, 0.61 + k * 0.025], [1.92 + k * 0.06, 1.36, 0.67 + k * 0.025], 0.025, 0.025, "#57534e", hdo("dull"));
      break;
    }
    case "res-quarry": {
      // Common: a stone quarry; HD: cut benches, rubble, dressed blocks, a block hanging from the crane, a sledgehammer
      b.add("cyl", 0, -0.2, 0, 3.8, 0.3, 3.8, "#a8a29e", { mat: "stone" });
      b.add("box", -0.8, 0, -1.0, 1.6, 1.6, 1.2, "#d6d3d1", { mat: "stone" }); // cut cliff face
      b.add("box", 0.9, 0, -1.2, 1.2, 1.1, 1.0, "#e7e5e4", { mat: "stone" });
      for (const [x, z] of [
        [0.5, 0.6],
        [1.3, 0.4],
        [0.9, 1.1],
        [-0.6, 0.9]
      ]) {
        b.add("box", x, 0, z, 0.55, 0.4, 0.4, "#f5f5f4", { ry: range(rng, -0.4, 0.4), mat: "stone", hdShape: "block" }); // ashlar blocks
      }
      b.add("box", 0.9, 0.4, 0.75, 0.55, 0.4, 0.4, "#e7e5e4", { mat: "stone", hdShape: "block" });
      b.add("cyl", -1.6, 0, 1.0, 0.08, 2.0, 0.08, "#78350f", { rz: 0.25, mat: "wood" }); // crane
      b.add("box", -1.2, 1.9, 1.0, 1.2, 0.08, 0.08, "#78350f", { mat: "wood" });
      smoke(b, -0.2, 0.3, -0.2, 0.9, "#e7e5e4"); // stone dust
      // HD: a cut bench stepping down from each face, rubble at their feet
      add("box", -0.8, 0, -0.3, 1.5, 0.55, 0.3, "#d6d3d1", hdo("stone"));
      add("box", 0.9, 0, -0.6, 1.1, 0.4, 0.25, "#e7e5e4", hdo("stone"));
      const hr = mulberry32(1709);
      for (let i = 0; i < 9; i++) {
        const x = -1.5 + hr() * 3.0;
        const z = -0.1 + hr() * 0.5;
        const s = 0.12 + hr() * 0.2;
        add("boulder", x, 0, z, s, s * 0.7, s * 0.9, i % 2 ? "#d6d3d1" : "#a8a29e", hdo("stone", { ry: hr() * 3 }));
      }
      // The crane: a brace, a pulley at the jib's end, a rope down to a block in its sling
      along(add, "cyl", [-1.7, 1.4, 1.0], [-1.2, 1.92, 1.0], 0.07, 0.07, "#78350f", hdo("wood"));
      add("cyl", -0.68, 1.8, 1.0, 0.14, 0.06, 0.14, "#57534e", hdo("dull", { rx: Math.PI / 2 }));
      along(add, "cyl", [-0.68, 1.83, 1.0], [-0.68, 1.12, 1.0], 0.02, 0.02, "#a8a29e", hdo("cloth"));
      add("block", -0.68, 0.72, 1.0, 0.45, 0.36, 0.38, "#f5f5f4", hdo("stone"));
      for (const sx of [-1, 1]) along(add, "cyl", [-0.68, 1.12, 1.0], [-0.68 + sx * 0.2, 1.08, 1.0], 0.02, 0.02, "#a8a29e", hdo("cloth"));
      // A sledgehammer laid against a block, chisels on it
      along(add, "box", [0.02, 0.07, 1.42], [0.28, 0.07, 1.42], 0.13, 0.13, "#57534e", hdo("dull"));
      along(add, "cyl", [0.15, 0.07, 1.42], [0.42, 0.62, 1.28], 0.045, 0.045, "#78350f", hdo("wood"));
      for (const dz of [-0.06, 0.06]) along(add, "cyl", [0.75, 0.43, 0.65 + dz], [1.02, 0.43, 0.7 + dz], 0.025, 0.025, "#71717a", hdo("dull"));
      break;
    }
    case "res-iron": {
      // Uncommon: an iron mine; HD: braced timbers, rails on sleepers, the ore cart's wheels, a brass lantern, a chimney
      b.add("sphere", 0, -0.8, -0.6, 3.6, 2.8, 2.8, "#57534e", { mat: "hide" });
      b.add("box", 0, 0, 0.75, 1.1, 1.3, 0.3, "#0c0a09"); // shaft
      b.add("box", -0.62, 0, 0.82, 0.16, 1.45, 0.16, "#78350f", { mat: "wood" });
      b.add("box", 0.62, 0, 0.82, 0.16, 1.45, 0.16, "#78350f", { mat: "wood" });
      b.add("box", 0, 1.35, 0.82, 1.4, 0.18, 0.18, "#78350f", { mat: "wood" });
      b.add("box", 0, 0, 1.9, 0.5, 0.04, 2.2, "#44403c", { hd: false }); // rails
      b.add("box", 0, 0.12, 2.3, 0.75, 0.45, 0.9, "#3f3f46", { mat: "dull" }); // ore cart
      b.add("sphere", 0, 0.5, 2.3, 0.65, 0.35, 0.75, "#1f2937", { mat: "stone" });
      b.add("sphere", 0.7, 1.25, 1.0, 0.2, 0.25, 0.2, "#fde68a", { glow: true }); // lantern
      smoke(b, -0.9, 1.6, 0.2, 0.8, "#57534e"); // smelter fumes
      // HD: braces in the mouth's corners; rails on sleepers; the cart's wheels and rim, black ore heaped in it
      for (const sx of [-1, 1]) along(add, "box", [sx * 0.62, 1.05, 0.84], [sx * 0.32, 1.36, 0.84], 0.1, 0.1, "#78350f", hdo("wood"));
      track(add, 0, 0.8, 3.0, "#57534e", "dull");
      cartWheels(add, 0, 2.3, "#27272a", "dull");
      const hr = mulberry32(2609);
      for (let i = 0; i < 6; i++) {
        const [x, z] = [(hr() - 0.5) * 0.5, 2.3 + (hr() - 0.5) * 0.6];
        add("boulder", x, 0.6 + hr() * 0.1, z, 0.18, 0.14, 0.17, i % 2 ? "#1f2937" : "#374151", hdo("dull", { ry: hr() * 3 }));
      }
      for (let i = 0; i < 4; i++) add("boulder", 0.7 + hr() * 0.4, 0, 2.6 + hr() * 0.5, 0.2, 0.15, 0.18, "#1f2937", hdo("dull", { ry: hr() * 3 }));
      // The lantern in a brass frame on its bracket, a stone chimney under the fumes, a pick against the hill
      lanternFrame(add, 0.7, 1.23, 1.0, 0.2, 0.27, "#b45309", { mat: "dull" });
      along(add, "box", [0.62, 1.47, 0.9], [0.7, 1.72, 1.0], 0.04, 0.04, "#27272a", hdo("dull"));
      along(add, "capsule", [0.7, 1.72, 1.0], [0.7, 1.62, 1.0], 0.025, 0.025, "#27272a", hdo("dull"));
      add("cyl", -0.9, 1.2, 0.2, 0.42, 0.5, 0.42, "#44403c", hdo("stone"));
      add("cyl", -0.9, 1.66, 0.2, 0.5, 0.08, 0.5, "#292524", hdo("stone"));
      pickaxe(add, [-1.0, 0, 1.2], [-0.82, 0.88, 0.95], [0.5, 0.2, 0.6], "#71717a", "dull");
      break;
    }
    case "res-cattle": {
      // Uncommon: a cattle pasture; HD: a split-rail fence, cows with horns, ears, eyes, a pink muzzle and udder, hooves
      // and a tufted tail, one grazing; the lead cow's brass bell; a plank trough of water
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        b.add("box", Math.cos(a) * 2.5, 0, Math.sin(a) * 2.5, 0.12, 0.7, 0.12, "#78350f", { mat: "wood" }); // fence posts
      }
      rails(add, 10, 2.5, 7, [0.3, 0.58], "#8b5a2b");
      const cows: Array<[number, number, number]> = [
        [-0.8, 0.3, 0.4],
        [0.8, -0.4, -1.2],
        [0.3, 1.1, 2.4]
      ];
      cows.forEach(([x, z, r], k) => {
        const s = 1.4;
        const rr = mulberry32(Math.floor(Math.abs(x * 91.7 + z * 53.3 + 7) * 1000));
        // HD rest pose: one grazes, head down; the others look about
        const neck: Pose = { at: [0, 0.55 * s, 0.4 * s], rx: k === 1 ? 0.75 + rr() * 0.15 : (rr() - 0.6) * 0.25, ry: (rr() - 0.5) * 0.5, rz: (rr() - 0.5) * 0.12 };
        const cow = quadruped(b, x, z, r, "#f5f5f4", s, undefined, neck);
        const ca = adder(cow);
        const head: AddOpts = { pose: neck };
        cow.add("box", 0.12, 0.62, -0.05, 0.25, 0.22, 0.4, "#1c1917", { hd: false }); // patches
        cow.add("cone", -0.16, 0.95, 0.72, 0.05, 0.16, 0.05, BONE, { rz: 0.8, hd: false });
        cow.add("cone", 0.16, 0.95, 0.72, 0.05, 0.16, 0.05, BONE, { rz: -0.8, hd: false });
        // HD: black patches over its hide
        for (let p = 0; p < 4; p++) {
          const side = p % 2 ? 1 : -1;
          const pz = (rr() - 0.5) * 0.8;
          ca("sphere", side * 0.275, 0.52 + rr() * 0.12, pz, 0.1, 0.26 + rr() * 0.12, 0.3 + rr() * 0.15, "#1c1917", hdo("hide"));
        }
        ca("sphere", (rr() - 0.5) * 0.2, 0.92, (rr() - 0.5) * 0.6, 0.3, 0.08, 0.36, "#1c1917", hdo("hide"));
        // Its head: horns curving forward, ears out to the sides, eyes under pale lids, a pink muzzle with nostrils
        for (const sx of [-1, 1]) {
          along(ca, "horn", [sx * 0.15, 1.06, 0.62], [sx * 0.34, 1.15, 0.6], 0.07, 0.07, "#e7e5e4", hdo("bone", head));
          along(ca, "egg", [sx * 0.2, 0.99, 0.56], [sx * 0.4, 0.95, 0.52], 0.15, 0.05, "#f5f5f4", hdo("hide", head));
          ca("sphere", sx * 0.19, 0.95, 0.66, 0.075, 0.075, 0.075, "#1c1917", hdo("gem", head));
          along(ca, "capsule", [sx * 0.2, 0.99, 0.62], [sx * 0.2, 0.99, 0.71], 0.035, 0.03, "#e7e5e4", hdo("hide", head));
          ca("sphere", sx * 0.06, 0.82, 1.05, 0.05, 0.04, 0.03, "#7f1d1d", hdo("skin", head));
        }
        ca("egg", 0, 0.74, 1.0, 0.27, 0.2, 0.1, "#f9a8d4", hdo("skin", head));
        // An udder under its belly; a collar, and on the lead cow a brass bell
        ca("egg", 0, 0.34, -0.28, 0.24, 0.16, 0.22, "#f9a8d4", hdo("skin"));
        for (const tx of [-0.05, 0.05]) for (const tz of [-0.33, -0.23]) ca("capsule", tx, 0.28, tz, 0.03, 0.08, 0.03, "#f9a8d4", hdo("skin"));
        arc(ca, [0, 0.82, 0.58], [1, 0, 0], [0, 1, 0], 0.22, 0, Math.PI * 2, 10, 0.045, "#57534e", hdo("leather"));
        if (k === 0) {
          ca("taper", 0, 0.47, 0.6, 0.12, 0.14, 0.12, "#ca8a04", hdo("dull"));
          ca("sphere", 0, 0.45, 0.6, 0.04, 0.04, 0.04, "#57534e", hdo("dull"));
        }
      });
      b.add("box", -1.6, 0, -1.2, 0.9, 0.25, 0.4, "#78350f", { hd: false }); // trough
      // HD: the trough of planks with water standing in it; a small stack of hay
      add("box", -1.6, 0, -1.2, 0.9, 0.05, 0.4, "#78350f", hdo("wood"));
      for (const sz of [-1, 1]) add("box", -1.6, 0, -1.2 + sz * 0.175, 0.9, 0.25, 0.05, "#78350f", hdo("wood"));
      for (const sx of [-1, 1]) add("box", -1.6 + sx * 0.425, 0, -1.2, 0.05, 0.25, 0.3, "#78350f", hdo("wood"));
      add("box", -1.6, 0.05, -1.2, 0.78, 0.15, 0.27, "#4b7f9e", hdo("gel"));
      add("egg", 1.5, 0, -1.3, 0.7, 0.55, 0.6, "#ca8a04", hdo("fur"));
      break;
    }
    case "res-gold": {
      // Rare: a gold mine; HD: timbers with iron brackets, quartz round the seams, the cart on iron rails with real gold
      // nuggets, a lantern on its post, a steel pick
      b.add("sphere", 0, -0.8, -0.6, 3.6, 2.8, 2.8, "#78716c", { mat: "hide" });
      b.add("box", 0, 0, 0.75, 1.1, 1.3, 0.3, "#1c1917");
      b.add("box", 0, 1.35, 0.82, 1.4, 0.18, 0.18, "#a16207", { mat: "wood" });
      const seams: V3[] = [];
      for (let i = 0; i < 6; i++) {
        const x = range(rng, -1.4, 1.4);
        const y = range(rng, 0.4, 1.4);
        const z = range(rng, -0.3, 0.6);
        b.add("octa", x, y, z, 0.3, 0.4, 0.3, "#fbbf24", { glow: true, mat: "gold" }); // gold seams
        seams.push([x, y, z]);
      }
      b.add("box", 0.9, 0, 1.6, 0.75, 0.45, 0.9, "#3f3f46", { mat: "iron" });
      b.add("sphere", 0.9, 0.38, 1.6, 0.65, 0.4, 0.75, "#fbbf24", { glow: true }); // cart of nuggets
      // HD: the posts holding the lintel, iron brackets at the joints
      for (const sx of [-1, 1]) {
        add("box", sx * 0.62, 0, 0.82, 0.16, 1.35, 0.16, "#78350f", hdo("wood"));
        add("box", sx * 0.62, 1.25, 0.82, 0.26, 0.14, 0.28, "#3f3f46", hdo("iron"));
      }
      // White quartz crystals clustered round each seam
      const hr = mulberry32(4507);
      for (const [x, y, z] of seams)
        for (const sx of [-1, 1]) add("octa", x + sx * (0.17 + hr() * 0.06), y - 0.05, z + (hr() - 0.5) * 0.15, 0.13, 0.26 + hr() * 0.1, 0.13, "#f8fafc", hdo("gem", { rz: -sx * (0.3 + hr() * 0.4) }));
      // The cart on its rails, its wheels and rim in iron, gold nuggets heaped in it and fallen beside it
      track(add, 0.9, 0.9, 2.5, "#3f3f46", "iron");
      cartWheels(add, 0.9, 1.6, "#3f3f46", "iron");
      for (let i = 0; i < 8; i++) {
        // On the heap's crown (a dome 0.65 × 0.4 × 0.75 centred 0.58 up)
        const [dx, dz] = [(hr() - 0.5) * 0.45, (hr() - 0.5) * 0.55];
        const y = 0.58 + 0.2 * Math.sqrt(Math.max(0, 1 - (dx / 0.325) ** 2 - (dz / 0.375) ** 2));
        add("boulder", 0.9 + dx, y - 0.05, 1.6 + dz, 0.13, 0.11, 0.12, "#fbbf24", hdo("gold", { ry: hr() * 3 }));
      }
      for (let i = 0; i < 4; i++) add("boulder", 1.5 + hr() * 0.4, 0, 1.3 + hr() * 0.6, 0.12, 0.1, 0.11, "#fbbf24", hdo("gold", { ry: hr() * 3 }));
      // A lantern on its post by the mouth; a pick with a steel head
      add("cyl", -1.2, 0, 1.3, 0.1, 1.2, 0.1, "#78350f", hdo("wood"));
      add("sphere", -1.2, 1.24, 1.3, 0.14, 0.16, 0.14, "#fde68a", hdo("plain", { glow: true }));
      lanternFrame(add, -1.2, 1.22, 1.3, 0.18, 0.22, "#3f3f46", { mat: "iron" });
      pickaxe(add, [1.35, 0, 0.75], [1.15, 0.85, 0.55], [0.6, 0.25, -0.5], "#cbd5e1", "steel");
      break;
    }
    case "res-vineyard": {
      // Rare: terraced vines; HD: dry-stone walls under the terraces, trellis wires, leafy vines with hanging bunches,
      // iron-hooped barrels with a brass tap, a basket of grapes
      let vine = 0;
      for (let r = 0; r < 3; r++) {
        b.add("box", 0, r * 0.3, -1.0 + r * 0.9, 3.4, 0.3, 0.9, "#65a30d", { mat: "leaf" }); // terraces
        for (let c = 0; c < 5; c++) {
          const x = -1.4 + c * 0.7;
          b.add("box", x, r * 0.3 + 0.3, -1.0 + r * 0.9, 0.06, 0.7, 0.06, "#78350f", { mat: "wood" });
          b.add("sphere", x, r * 0.3 + 0.55, -1.0 + r * 0.9, 0.45, 0.4, 0.3, "#15803d", { idle: IDLE_KIND.sway, mat: "leaf", hdShape: "canopy", sync: ++vine });
          b.add("sphere", x + 0.1, r * 0.3 + 0.5, -0.85 + r * 0.9, 0.18, 0.22, 0.14, "#7e22ce", { hd: false });
          // HD: a bunch of grapes hanging in rows from its stem, swaying with its vine
          const ride: AddOpts = { idle: IDLE_KIND.sway, sync: vine };
          const [gx, gy, gz] = [x + 0.1, r * 0.3 + 0.5, -0.82 + r * 0.9];
          along(add, "capsule", [gx, gy + 0.24, gz - 0.03], [gx, gy + 0.17, gz], 0.025, 0.025, "#3f6212", hdo("leaf", ride));
          for (const [dx, dy, dz] of [
            [-0.045, 0.12, 0],
            [0.045, 0.12, 0],
            [0, 0.12, 0.045],
            [-0.025, 0.06, 0.02],
            [0.03, 0.06, 0.015],
            [0, 0.0, 0.01]
          ])
            add("sphere", gx + dx, gy + dy, gz + dz, 0.07, 0.07, 0.07, c % 2 ? "#6b21a8" : "#7e22ce", hdo("gem", ride));
        }
        // HD: two trellis wires along the row
        for (const y of [0.62, 0.9]) along(add, "cyl", [-1.6, r * 0.3 + y, -1.0 + r * 0.9], [1.6, r * 0.3 + y, -1.0 + r * 0.9], 0.015, 0.015, "#a8a29e", hdo("dull"));
        // A dry-stone wall under the raised terraces and along their fronts
        if (r > 0) {
          add("box", 0, 0, -1.0 + r * 0.9, 3.4, r * 0.3, 0.9, "#a8a29e", hdo("stone"));
          add("box", 0, r * 0.3, -1.47 + r * 0.9, 3.5, 0.28, 0.06, "#a8a29e", hdo("stone"));
        }
      }
      b.add("cyl", 2.0, 0.275 - 0.35, 1.4, 0.55, 0.7, 0.55, "#92400e", { rz: Math.PI / 2, mat: "wood" }); // wine barrels, one stacked on the other
      b.add("cyl", 2.0, 0.825 - 0.35, 1.4, 0.55, 0.7, 0.55, "#92400e", { rz: Math.PI / 2, mat: "wood" });
      // HD: iron hoops and pale heads on the barrels, a brass tap in the lower one, chocks under it
      for (const cy of [0.275, 0.825]) {
        for (const x of [1.72, 1.9, 2.1, 2.28]) add("cyl", x, cy - 0.025, 1.4, 0.65, 0.05, 0.65, "#3f3f46", hdo("iron", { rz: Math.PI / 2 }));
        for (const x of [1.65, 2.35]) add("cyl", x, cy - 0.05, 1.4, 0.45, 0.1, 0.45, "#b45309", hdo("wood", { rz: Math.PI / 2 }));
      }
      along(add, "cyl", [1.6, 0.22, 1.4], [1.48, 0.22, 1.4], 0.05, 0.05, "#ca8a04", hdo("gold"));
      along(add, "cyl", [1.5, 0.22, 1.4], [1.5, 0.3, 1.4], 0.03, 0.03, "#ca8a04", hdo("gold"));
      for (const x of [1.8, 2.2]) for (const sz of [-1, 1]) add("box", x, 0, 1.4 + sz * 0.24, 0.1, 0.1, 0.12, "#78350f", hdo("wood"));
      add("cyl", 2.55, 0, 0.55, 0.5, 0.28, 0.5, "#a16207", hdo("wood"));
      const hr = mulberry32(6607);
      for (let i = 0; i < 9; i++) add("sphere", 2.55 + (hr() - 0.5) * 0.32, 0.25 + hr() * 0.08, 0.55 + (hr() - 0.5) * 0.32, 0.08, 0.08, 0.08, i % 2 ? "#6b21a8" : "#7e22ce", hdo("gem"));
      break;
    }
    case "res-mithril": {
      // Epic: a meteorite crater; HD: rubble round the rim, a metal meteorite laced with glowing mithril veins, smaller
      // crystals clustered at each spire's foot, flakes circling the floating shard, shards glinting on the floor
      b.add("cyl", 0, -0.1, 0, 4.2, 0.4, 4.2, "#334155", { mat: "stone" }); // impact crater rim
      b.add("cyl", 0, 0.05, 0, 3.0, 0.3, 3.0, "#0f172a", { mat: "hide" });
      b.add("sphere", 0, 0, 0, 1.3, 0.9, 1.3, "#475569", { mat: "iron" }); // meteorite
      const hr = mulberry32(1303);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        b.add("octa", Math.cos(a) * 1.2, 0.2, Math.sin(a) * 1.2, 0.35, range(rng, 0.8, 1.4), 0.35, "#e0f2fe", { glow: true, rx: Math.sin(a) * 0.4, rz: -Math.cos(a) * 0.4 });
        // HD: two smaller crystals leaning out from its foot, and a dark rock it breaks from
        for (const k of [-1, 1]) {
          const b2 = a + k * 0.22;
          const t = 0.55 + hr() * 0.25;
          add("octa", Math.cos(b2) * 1.3, 0.25, Math.sin(b2) * 1.3, 0.2, 0.45 + hr() * 0.25, 0.2, "#bae6fd", hdo("gem", { rx: Math.sin(b2) * t, rz: -Math.cos(b2) * t }));
        }
        add("boulder", Math.cos(a) * 1.25, 0.2, Math.sin(a) * 1.25, 0.4, 0.3, 0.36, "#1e293b", hdo("stone", { ry: a }));
      }
      b.add("octa", 0, 0.8, 0, 0.5, 1.0, 0.5, "#bae6fd", { glow: true, idle: IDLE_KIND.spin });
      // Mithril veins glowing round the meteorite
      for (const t of [0.3, 1.4, 2.5]) arc(add, [0, 0.45, 0], [Math.cos(t), 0, Math.sin(t)], [0, 1, 0], [0.665, 0.46], -0.25, Math.PI + 0.25, 8, 0.05, "#bae6fd", hdo("gem", { glow: true }));
      // Rubble thrown up round the rim, shards glinting on the crater floor
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2 + hr() * 0.3;
        const d = 1.85 + hr() * 0.3;
        const s = 0.25 + hr() * 0.3;
        add("boulder", Math.cos(a) * d, 0.22, Math.sin(a) * d, s, s * 0.6, s * 0.9, i % 2 ? "#334155" : "#475569", hdo("stone", { ry: a }));
      }
      for (let i = 0; i < 8; i++) {
        const a = hr() * Math.PI * 2;
        const d = 0.8 + hr() * 0.6;
        add("octa", Math.cos(a) * d, 0.3, Math.sin(a) * d, 0.08, 0.13, 0.08, "#e0f2fe", hdo("gem", { rz: (hr() - 0.5) * 1.2 }));
      }
      // Flakes of mithril circling the shard
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        add("octa", Math.cos(a) * 0.6, 1.2 + (i % 2) * 0.3, Math.sin(a) * 0.6, 0.08, 0.12, 0.08, "#e0f2fe", hdo("gem", { glow: true, idle: IDLE_KIND.spin, pivot: [0, 0], phase: 0.01 + a }));
      }
      break;
    }
    case "res-mana": {
      // Epic: a split crystal geode; HD: a jagged rock rim, amethyst studding the shell, smaller crystals clustered at
      // each spire's foot, chips circling the floating shard
      b.add("sphere", 0, -0.7, 0, 3.6, 2.2, 3.4, "#3b0764", { mat: "stone", hdShape: "boulder" }); // split geode shell
      b.add("sphere", 0, -0.2, 0.2, 2.6, 1.6, 2.4, "#1e1b4b", { mat: "gem" });
      const hr = mulberry32(2203);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const r = range(rng, 0.3, 1.0);
        const h = range(rng, 0.9, 1.8);
        b.add("octa", Math.cos(a) * r, 0.2, Math.sin(a) * r, 0.35, h, 0.35, i % 3 ? "#c084fc" : "#e879f9", { glow: true });
        // HD: two smaller amethysts leaning out from its foot
        for (const k of [-1, 1]) {
          const b2 = a + k * 0.5;
          const t = 0.4 + hr() * 0.3;
          add("octa", Math.cos(a) * r + Math.cos(b2) * 0.2, 0.9 + hr() * 0.25, Math.sin(a) * r + Math.sin(b2) * 0.2, 0.18, 0.5 + hr() * 0.3, 0.18, i % 2 ? "#a855f7" : "#c084fc", hdo("gem", { rx: Math.sin(b2) * t, rz: -Math.cos(b2) * t }));
        }
      }
      b.add("octa", 0, 2.4, 0, 0.35, 0.55, 0.35, "#f5d0fe", { glow: true, idle: IDLE_KIND.spin }); // floating shard
      for (let i = 0; i < 3; i++) b.add("octa", 1.3, 1.4 + i * 0.35, 0, 0.16, 0.24, 0.16, "#f0abfc", { glow: true, idle: IDLE_KIND.spin, pivot: [0, 0], phase: 0.01 + i * 2.1 }); // motes
      // HD: jagged rock round the shell's foot, amethyst points studding its dome
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + hr() * 0.2;
        const s = 0.35 + hr() * 0.35;
        add("boulder", Math.cos(a) * 1.68, 0, Math.sin(a) * 1.58, s, s * 0.8, s * 0.9, i % 2 ? "#3b0764" : "#2e1065", hdo("stone", { ry: a }));
      }
      for (let i = 0; i < 12; i++) {
        const a = hr() * Math.PI * 2;
        const e = 0.25 + hr() * 0.9;
        const n: V3 = [Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)];
        const p: V3 = [n[0] * 1.8 * 0.97, 0.4 + n[1] * 1.1 * 0.97, n[2] * 1.7 * 0.97];
        const l = 0.18 + hr() * 0.18;
        along(add, "octa", p, [p[0] + n[0] * l, p[1] + n[1] * l, p[2] + n[2] * l], 0.12, 0.12, "#a855f7", hdo("gem"));
      }
      // Chips of crystal circling the floating shard
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        add("octa", Math.cos(a) * 0.45, 2.35 + (i % 2) * 0.25, Math.sin(a) * 0.45, 0.08, 0.12, 0.08, "#f5d0fe", hdo("gem", { glow: true, idle: IDLE_KIND.spin, pivot: [0, 0], phase: 0.01 + a }));
      }
      break;
    }
    case "res-fleece": {
      // Epic: golden-fleeced sheep; HD: wool of golden curls glowing through, black faces with amber eyes, the ram's
      // gold horns, hooves and wagging tails, a white rail fence and a shepherd's crook
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        b.add("box", Math.cos(a) * 2.5, 0, Math.sin(a) * 2.5, 0.12, 0.6, 0.12, "#f5f5f4", { mat: "wood" }); // white fence
      }
      rails(add, 10, 2.5, 3, [0.25, 0.5], "#f5f5f4");
      const sheep: Array<[number, number, number]> = [
        [-0.8, 0.2, 0.5],
        [0.7, -0.5, -0.9],
        [0.3, 1.0, 2.2],
        [-0.4, -1.2, 1.4]
      ];
      sheep.forEach(([x, z, r], k) => {
        const sh = b.child(x, z, r).alive();
        const sa = adder(sh);
        const rr = mulberry32(Math.floor(Math.abs(x * 47.3 + z * 29.1 + 3) * 1000));
        // HD rest pose: the head turned, one grazing
        const neck: Pose = { at: [0, 0.55, 0.38], rx: k === 2 ? 0.7 + rr() * 0.15 : (rr() - 0.6) * 0.25, ry: (rr() - 0.5) * 0.6, rz: (rr() - 0.5) * 0.12 };
        const head: AddOpts = { pose: neck };
        sh.add("sphere", 0, 0.25, 0, 0.75, 0.6, 0.95, "#fbbf24", { glow: true, hd: false }); // golden fleece
        sh.add("box", 0, 0.45, 0.5, 0.25, 0.28, 0.3, "#292524", { mat: "hide", hdShape: "snout", pose: neck });
        for (const [lx, lz] of [
          [-0.18, 0.25],
          [0.18, 0.25],
          [-0.18, -0.25],
          [0.18, -0.25]
        ]) {
          sh.add("box", lx, 0, lz, 0.08, 0.3, 0.08, "#292524", { mat: "hide", hdShape: "limb" });
          sa("cyl", lx, 0, lz, 0.11, 0.05, 0.11, "#1c1917", hdo("bone")); // HD: a hoof
        }
        // HD: a golden glow at the heart of the fleece, curls of golden wool all over it
        sa("sphere", 0, 0.34, 0, 0.5, 0.42, 0.7, "#fcd34d", hdo("plain", { glow: true }));
        for (let p = 0; p < 16; p++) {
          // Round the body in rings from the belly up, each curl jittered
          const a = ((p % 8) / 8) * Math.PI * 2 + rr() * 0.6;
          const e = p < 8 ? -0.35 + rr() * 0.5 : 0.45 + rr() * 0.9;
          const [px, py, pz] = [Math.cos(e) * Math.sin(a) * 0.33, 0.55 + Math.sin(e) * 0.26, Math.cos(e) * Math.cos(a) * 0.43];
          const s = 0.23 + rr() * 0.08;
          // Most curls soft wool, every third one shining like beaten gold
          sa("sphere", px, py - s / 2, pz, s, s * 0.85, s, p % 3 ? "#fcd34d" : "#fbbf24", hdo(p % 3 ? "fur" : "gold"));
        }
        // Its face: a woolly crown, ears out to the sides, amber eyes with their bar pupils; the ram's curled gold horns
        sa("sphere", 0, 0.68, 0.44, 0.17, 0.12, 0.15, "#fbbf24", hdo("fur", head));
        for (const sx of [-1, 1]) {
          along(sa, "egg", [sx * 0.1, 0.66, 0.44], [sx * 0.25, 0.62, 0.42], 0.1, 0.04, "#292524", hdo("hide", head));
          sa("sphere", sx * 0.105, 0.6, 0.55, 0.05, 0.05, 0.05, "#d97706", hdo("gem", head));
          sa("box", sx * 0.105, 0.62, 0.575, 0.03, 0.012, 0.012, "#0c0a09", hdo("gem", head));
          if (k === 0) arc(sa, [sx * 0.16, 0.6, 0.44], [0, 1, 0], [0, 0, -1], 0.09, -0.4, Math.PI * 1.6, 8, 0.06, "#eab308", hdo("gold", head));
        }
        // A woolly tail that wags
        sa("sphere", 0, 0.5, -0.5, 0.14, 0.16, 0.14, "#fbbf24", hdo("fur", { trail: { lag: 0.2, damp: 0.3, root: [0, 0.6, -0.45] } }));
      });
      // HD: a shepherd's crook leaning on the fence
      along(add, "cyl", [1.75, 0, 1.2], [2.0, 1.25, 1.45], 0.05, 0.05, "#78350f", hdo("wood"));
      arc(add, [2.06, 1.32, 1.5], [0.7, 0, 0.7], [0, 1, 0], 0.09, Math.PI, -0.3, 5, 0.045, "#78350f", hdo("wood"));
      break;
    }
    case "res-dragonstone": {
      b.add("cone", 0, -0.2, 0, 4.4, 2.6, 4.4, "#292524"); // volcanic vent
      b.add("cyl", 0, 2.25, 0, 1.2, 0.2, 1.2, "#f97316", { glow: true }); // molten mouth
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.2;
        b.add("octa", Math.cos(a) * 2.2, 0, Math.sin(a) * 2.2, 0.45, range(rng, 0.9, 1.5), 0.45, "#dc2626", { glow: true }); // dragonstone
      }
      smoke(b, 0, 2.45, 0, 2.2, "#78716c"); // smoke plume
      break;
    }
    case "res-motherlode": {
      b.add("sphere", 0, -1.0, -0.6, 4.4, 3.6, 3.4, "#57534e");
      b.add("box", 0, 0, 0.95, 1.5, 1.7, 0.3, "#0c0a09");
      b.add("box", -0.85, 0, 1.0, 0.22, 1.9, 0.22, "#fbbf24", { glow: true }); // gilded frame
      b.add("box", 0.85, 0, 1.0, 0.22, 1.9, 0.22, "#fbbf24", { glow: true });
      b.add("box", 0, 1.8, 1.0, 1.9, 0.25, 0.22, "#fbbf24", { glow: true });
      b.add("pyramid", 0, 2.05, 1.0, 0.5, 0.45, 0.3, "#fbbf24", { glow: true }); // crown crest
      for (let i = 0; i < 8; i++) {
        b.add("octa", range(rng, -1.8, 1.8), range(rng, 0.5, 2.0), range(rng, -0.4, 0.6), 0.3, 0.45, 0.3, i % 3 ? "#fbbf24" : "#f0f9ff", { glow: true });
      }
      for (const x of [-1.2, 1.2]) {
        b.add("cyl", x, 0, 2.0, 0.7, 0.35, 0.7, "#fbbf24", { glow: true }); // gold heaps
        b.add("cone", x, 0.35, 2.0, 0.55, 0.35, 0.55, "#fbbf24", { glow: true });
      }
      break;
    }
    case "treasure-relic": {
      b.add("cyl", 0, 0, 0, 2.6, 0.3, 2.6, "#1e1b4b");
      b.add("cyl", 0, 0.3, 0, 1.6, 0.5, 1.6, "#312e81");
      b.add("cyl", 0, 0.31, 0, 2.2, 0.03, 2.2, "#c084fc", { glow: true });
      chest(b.child(0, 0, 0, 1.4), 0, 0, 0.4, "#1e1b4b", "#fbbf24", 1.0, true, "#e879f9");
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        b.add("octa", Math.cos(a) * 1.6, 1.4 + (i % 2) * 0.6, Math.sin(a) * 1.6, 0.3, 0.5, 0.3, "#a5f3fc", { glow: true, idle: IDLE_KIND.spin, pivot: [0, 0], phase: 0.01 });
      }
      break;
    }
  }
}

/* ------------------------------------------------------------------------- */
/* Z-fighting guard                                                          */
/* ------------------------------------------------------------------------- */

/** Faces closer than this (in the same direction) shimmer at map distance */
const COPLANAR_EPS = 0.025;
/** How far a later part is pushed out past the earlier part it would fight with */
const COPLANAR_PUSH = 0.05;

const isFlat = (p: Part) => !p.rx && !p.rz;
const isAxisAligned = (p: Part) => isFlat(p) && Math.abs((p.ry ?? 0) % (Math.PI / 2)) < 1e-6;
const spans = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0) > 0.02;

function footprint(p: Part) {
  const [hx, hz] = isAxisAligned(p)
    ? Math.abs((p.ry ?? 0) % Math.PI) > 1e-6
      ? [p.d / 2, p.w / 2] // rotated a quarter turn
      : [p.w / 2, p.d / 2]
    : [Math.max(p.w, p.d) / 2, Math.max(p.w, p.d) / 2];
  return { x0: p.x - hx, x1: p.x + hx, z0: p.z - hz, z1: p.z + hz };
}

/**
 * Models are built from overlapping primitives; where two differently coloured parts share a face pointing the
 * same way (a stripe on a wall, a disc on a base, a mane on a back) the depth buffer can't decide and the face
 * flickers. This nudges the later part (usually the detail) outward so the faces are clearly apart.
 */
function separateCoplanar(parts: Part[]): Part[] {
  const out = parts.map((p) => ({ ...p }));
  // A nudge can line a part up with a third one, so repeat until nothing moves
  for (let pass = 0; pass < 3 && separatePass(out); pass++);
  return out;
}

function separatePass(out: Part[]): boolean {
  let moved = false;
  for (let j = 1; j < out.length; j++) {
    const b = out[j];
    for (let i = 0; i < j; i++) {
      const a = out[i];
      if (a.color === b.color && !!a.glow === !!b.glow) continue;
      // Normal never changes for an HD-only part (only the HD part moves), and a Normal-only part never meets an HD-only one
      if (a.hd === true && b.hd !== true) continue;
      if (a.hd === false && b.hd === true) continue;
      const A = footprint(a);
      const B = footprint(b);
      const overXZ = spans(A.x0, A.x1, B.x0, B.x1) && spans(A.z0, A.z1, B.z0, B.z1);
      // Top faces (boxes and cylinders with flat tops)
      if ((a.shape === "box" || a.shape === "cyl") && (b.shape === "box" || b.shape === "cyl") && isFlat(a) && isFlat(b) && overXZ) {
        const topA = a.y + a.h / 2;
        const topB = b.y + b.h / 2;
        if (Math.abs(topA - topB) < COPLANAR_EPS) {
          const grow = topA - topB + COPLANAR_PUSH; // lift B's top just above A's
          b.h += grow;
          b.y += grow / 2;
          moved = true;
          continue;
        }
      }
      // Side faces of axis-aligned boxes
      if (a.shape === "box" && b.shape === "box" && isAxisAligned(a) && isAxisAligned(b)) {
        if (!spans(a.y - a.h / 2, a.y + a.h / 2, b.y - b.h / 2, b.y + b.h / 2)) continue;
        const sameX = (Math.abs(A.x0 - B.x0) < COPLANAR_EPS || Math.abs(A.x1 - B.x1) < COPLANAR_EPS) && spans(A.z0, A.z1, B.z0, B.z1);
        const sameZ = (Math.abs(A.z0 - B.z0) < COPLANAR_EPS || Math.abs(A.z1 - B.z1) < COPLANAR_EPS) && spans(A.x0, A.x1, B.x0, B.x1);
        const quarter = Math.abs((b.ry ?? 0) % Math.PI) > 1e-6;
        // A quarter-turned box swaps its width and depth axes
        if ((sameX && !quarter) || (sameZ && quarter)) b.w += COPLANAR_PUSH * 2;
        if ((sameZ && !quarter) || (sameX && quarter)) b.d += COPLANAR_PUSH * 2;
        if (sameX || sameZ) moved = true;
      }
    }
  }
  return moved;
}

/** Roving spawns that fly: they float instead of breathing on the ground */
export const FLYING_SPAWNS = new Set(["mob-bat", "mob-harpy", "mob-drake", "mob-wraith", "mob-aberration"]);

/**
 * Living creatures: each one walks, hops, slithers or flies about on its own (`Builder.walker`), or else the whole
 * model breathes (NPCModel / the roving batch); their other parts don't move on their own
 */
export const isCreatureNPC = (type: string) => type.startsWith("mob-") || type.startsWith("bandit-") || CREATURE_TYPES.has(type);
const CREATURE_TYPES = new Set(["kraken", "sandworm", "treant", "mythic-singularity"]);

/**
 * Brings a model's parts to life, seeded by the NPC's id so no two copies move alike: every part cycle the model
 * authored (flags, trees, smoke, spinning rings) gets its own phase, tempo and size, and on sites and structures every
 * glowing part (crystals, runes, braziers, windows) pulses unless it already moves.
 */
function animateParts(npc: MapNPC, parts: Part[]): Part[] {
  const rng = rngFor(`${npc.id}:life`);
  const base = rng() * Math.PI * 2;
  const tempo = 0.8 + rng() * 0.4;
  const creature = isCreatureNPC(npc.type);
  // Normal parts are seeded by their place among Normal parts (HD-only parts by theirs), so HD detail never changes
  // how a Normal model moves
  let normal = 0;
  let hd = 0;
  // The first part of each `sync` group sets the idle the rest of the group moves with
  const leads = new Map<number, PartIdle>();
  return parts.map((p) => {
    const i = p.hd === true ? 1e5 + hd++ : normal++;
    let idle = p.idle;
    if (!idle && p.glow && !creature) idle = { x: p.x, y: p.y, z: p.z, kind: IDLE_KIND.pulse, phase: 0 };
    // A walker's legs, arms, wings, head, tail and torso keep its heading and tempo
    if (!idle || RIDER_IDLES.has(idle.kind)) return p;
    const lead = p.sync !== undefined ? leads.get(p.sync) : undefined;
    if (lead) return { ...p, idle: lead };
    const r = mulberry32((i + 1) * 2654435761 + Math.floor(base * 1e6));
    // Smoke puffs and orbiting parts keep their spacing (one tempo); everything else drifts apart a little
    const lockstep = idle.kind === IDLE_KIND.smoke || idle.kind === IDLE_KIND.spin;
    const out = { ...idle, phase: idle.phase + base + (lockstep ? 0 : r() * 1.2), speed: tempo * (lockstep ? 1 : 0.85 + r() * 0.3), amp: 0.75 + r() * 0.5 };
    if (p.sync !== undefined) leads.set(p.sync, out);
    return { ...p, idle: out };
  });
}

export interface NPCModelState {
  /** A frontier gate whose walls burn: broken open (its flames come from FireFx) */
  ruined?: boolean;
}

/** Sites whose whole model moves on the GPU (`Part.model`): the wreck rocks on the water. Structures otherwise stand
 * still as a whole (their glowing parts pulse, their flags flutter) */
const MODEL_IDLES: Record<string, IdleKind> = {
  "lm-shipwreck": IDLE_KIND.rock
};

/** Models with an idle of their own, unlike any other, moved on the CPU by NPCModel (so the map draws them one each) */
export const HAND_TUNED_NPCS = new Set(["kraken", "sandworm", "dragon_nest", "mermaid_rock", "portal", "fairy_ring"]);

/** Some creature of the model walks about on its own (the model then doesn't move as a whole) */
export const hasWalkers = (parts: Part[]) => parts.some((p) => isWalkKind(p.model?.kind));


/**
 * The whole-model idle of a creature or treasure that doesn't walk about on its own, the same in the map's batch and
 * in the Codex (GPU, InstancedParts): treasure bobs, flyers float, mobs prowl, bandits and other living things breathe
 * and look round, with a seeded event now and then (sniff, shake, shift). Phase, tempo and size come from the id, so
 * two copies never move in step. `roving`: any other roving spawn breathes too. Models unlike these (the kraken, the
 * sandworm) keep a hand-tuned idle in NPCModel.
 */
export function wholeModelIdle(n: Pick<MapNPC, "id" | "type"> & { category?: string }, x: number, y: number, z: number, roving = false): PartIdle | undefined {
  const t = n.type;
  const kind =
    n.category === "treasure" || t.startsWith("treasure-")
      ? IDLE_KIND.bob
      : FLYING_SPAWNS.has(t)
        ? IDLE_KIND.float
        : n.category === "mob" || t.startsWith("mob-")
          ? IDLE_KIND.prowl
          : roving || t.startsWith("bandit-")
            ? IDLE_KIND.breathe
            : undefined;
  if (kind === undefined) return undefined;
  const r = rngFor(n.id);
  return { x, y, z, kind, phase: r() * Math.PI * 2, speed: 0.75 + r() * 0.55, amp: 0.8 + r() * 0.5 };
}

/**
 * Each part's whole-model idle, the same in the map's batch and in the Codex (model-local): none where a creature of the
 * model walks about on its own; otherwise treasure bobs, flyers float, mobs prowl and bands breathe as a whole
 * (`wholeModelIdle`), and in a site only its living things breathe (`Part.breath`: the treant, the yeti, camels, cows,
 * sheep, the lodge's stag), each about its own feet with a tempo of its own, while the cave, tents and fences stand still
 */
export function wholeModelIdles(n: Pick<MapNPC, "id" | "type"> & { category?: string }, parts: Part[], roving = false): Array<PartIdle | undefined> {
  if (hasWalkers(parts)) return parts.map(() => undefined);
  const whole = wholeModelIdle(n, 0, 0, 0, roving);
  if (whole) return parts.map(() => whole);
  const lives = new Map<string, PartIdle>();
  return parts.map((p) => {
    if (!p.breath) return undefined;
    const [x, y, z] = p.breath;
    const key = `${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}`;
    let life = lives.get(key);
    if (!life) {
      const r = rngFor(`${n.id}:${key}`);
      life = { x, y, z, kind: IDLE_KIND.breathe, phase: r() * Math.PI * 2, speed: 0.75 + r() * 0.55, amp: 0.8 + r() * 0.5 };
      lives.set(key, life);
    }
    return life;
  });
}

export function buildNPCModel(npc: MapNPC, state: NPCModelState = {}): Part[] {
  // The HD model kit's contact shadow darkens everything near the model's ground
  const parts = animateParts(npc, separateCoplanar(buildRawNPCModel(npc, state))).map((p) => ({ ...p, base: 0 }));
  const kind = MODEL_IDLES[npc.type];
  if (kind === undefined) return parts;
  // About the model's ground point, with a phase, tempo and size from the id
  const r = rngFor(`${npc.id}:idle`);
  const model: PartIdle = { x: 0, y: 0, z: 0, kind, phase: r() * Math.PI * 2, speed: 0.8 + r() * 0.45, amp: 0.75 + r() * 0.55 };
  return parts.map((p) => ({ ...p, model }));
}

/** Parts built facing +z, turned about the origin by `yaw` (the same turn a Builder with that rotation applies) */
function turnParts(parts: Part[], yaw: number): Part[] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const at = (x: number, z: number): [number, number] => [x * c + z * s, -x * s + z * c];
  return parts.map((p) => {
    const [x, z] = at(p.x, p.z);
    const idle = p.idle && (() => {
      const [ix, iz] = at(p.idle!.x, p.idle!.z);
      return { ...p.idle!, x: ix, z: iz };
    })();
    return { ...p, x, z, ry: (p.ry ?? 0) + yaw, idle };
  });
}

/** The model's seeded rng (a realm's building day rebuilds the stage before with the same one) */
const realmRng = (npc: MapNPC) => mulberry32(npc.id.length * 7919 + npc.x * 13 + npc.z * 31);

function buildRawNPCModel(npc: MapNPC, state: NPCModelState = {}): Part[] {
  const out = emptyScene();
  const b = new Builder(out);
  // Its walkers' tempo comes from the id, so two packs of one kind never walk in step
  b.seed = rngFor(`${npc.id}:walk`)() * 1000;
  const rng = realmRng(npc);

  if (GATE_MODEL_TYPES.has(npc.type)) {
    // A frontier gate turns its front toward the Voidrift (its border wall is terrain: see scatter.ts); burning, it lies broken open
    buildLandmarkModel(npc.type, b, rng);
    return turnParts(state.ruined ? ruinGate(npc.id, out.parts) : out.parts, gateYaw(npc.x, npc.z));
  }

  if (REALM_MODEL_TYPES.has(npc.type)) {
    // A buffer realm at its stage (epic when it carries none: a leaving realm, the Codex default)
    const stage = npc.realm?.stage ?? 3;
    buildRealmModel(npc.type, b, rng, stage);
    if (!npc.landmarkState) return out.parts;
    // Building day: the stage's new parts rise in scaffolding over the finished stage before it (stage 0: from the ground)
    let finished = 0;
    if (npc.landmarkState.phase === "rising" && stage > 0) {
      const before = emptyScene();
      buildRealmModel(npc.type, new Builder(before), realmRng(npc), stage - 1);
      finished = before.parts.length;
    }
    return stageLandmark(npc.id, npc.type, out.parts, npc.landmarkState, npc.landmarkStep ?? landmarkStepOf(npc.landmarkState, Date.now()), finished);
  }

  if (LANDMARK_MODEL_TYPES.has(npc.type)) {
    buildLandmarkModel(npc.type, b, rng);
    // On a rotation day an epic landmark is still rising or already crumbling
    if (npc.landmarkState) return stageLandmark(npc.id, npc.type, out.parts, npc.landmarkState, npc.landmarkStep ?? landmarkStepOf(npc.landmarkState, Date.now()));
    return out.parts;
  }

  if (SPAWN_MODEL_TYPES.has(npc.type)) {
    buildSpawnModel(npc.type, b, rng);
    return out.parts;
  }

  // The wild sights are scenery with no rarity: in HD they get real materials and finer props, matte, with no glow
  // or shine they don't already have. Their HD-only randomness has its own seeded rng (never the model's)
  const add = adder(b);
  switch (npc.type as GeneratedNPCType) {
    case "kraken": {
      // HD: a wet mantle rising behind the eyes with barnacles, lidded eyes with slit pupils, a beak; every tentacle
      // one smooth limb with suckers along its underside, swaying as it does
      b.add("sphere", 0, -0.6, 0, 2.2, 1.6, 2.2, "#7e2a5a", { mat: "skin" });
      b.add("sphere", -0.45, 0.45, 0.85, 0.35, 0.35, 0.3, "#fde047", { glow: true });
      b.add("sphere", 0.45, 0.45, 0.85, 0.35, 0.35, 0.3, "#fde047", { glow: true });
      for (let i = 0; i < 6; i++) {
        const color = i % 2 ? "#9d3a6e" : "#7e2a5a";
        stackedArc(b, rng, (i / 6) * Math.PI * 2 + 0.3, 3.2, color, "skin", ([cx, cy, cz], s, t, ride, dir, len) => {
          arcBody(add, [cx, cy, cz], dir, len, s, color, "skin", ride);
          if (t > 0.6) return;
          // Two suckers on the segment's inner, lower side
          const [ix, iz] = [-cx, -cz];
          const l = Math.hypot(ix, iz) || 1;
          for (const k of [-1, 1]) {
            const [dx, dy, dz] = [(ix / l) * 0.32 - (iz / l) * 0.18 * k, -0.3, (iz / l) * 0.32 + (ix / l) * 0.18 * k];
            add("sphere", cx + dx * s, cy + dy * s - 0.065, cz + dz * s, 0.13, 0.13, 0.13, "#f5d0e6", hdo("skin", ride));
          }
        });
      }
      add("sphere", 0, -0.2, -0.5, 2.0, 2.2, 1.9, "#7e2a5a", hdo("skin", { rx: -0.55 }));
      const hr = mulberry32(5101);
      for (let i = 0; i < 4; i++) {
        const a = Math.PI * (0.15 + hr() * 0.7);
        add("sphere", Math.cos(a) * 0.95, 0.75 + hr() * 0.4, -0.35 - Math.sin(a) * 0.55, 0.16, 0.13, 0.16, "#d6d3d1", hdo("stone")); // barnacles
      }
      for (const sx of [-1, 1]) {
        along(add, "capsule", [sx * 0.66, 0.68, 0.84], [sx * 0.26, 0.7, 0.95], 0.13, 0.12, "#5e1f43", hdo("skin")); // heavy lid
        add("sphere", sx * 0.45, 0.5, 0.98, 0.13, 0.26, 0.13, "#1c1917", hdo("gem")); // slit pupil
      }
      add("sphere", 0, 0.0, 1.02, 0.22, 0.2, 0.26, "#1c1917", hdo("bone", { rx: 0.5 })); // beak
      break;
    }
    case "mermaid_rock": {
      // HD: weathered rocks with weed and shells, the mermaid's scaled tail ending in a fin, arms on the rock, a real
      // face, long red hair down her back; the pearl in an open clam
      b.add("sphere", 0, -0.6, 0, 2.6, 1.6, 2.0, "#6b7280", { mat: "hide", hdShape: "boulder" });
      b.add("sphere", 1.2, -0.5, 0.6, 1.2, 1.0, 1.0, "#4b5563", { mat: "hide", hdShape: "boulder" });
      b.add("cone", 0.2, 0.55, 0.3, 0.45, 0.9, 0.45, "#14b8a6", { rz: 1.1, hd: false });
      // HD: her tail curling from the waist down over the rock, narrowing to its fin
      const tailPts: V3[] = [
        [-0.24, 0.66, 0.22],
        [0.02, 0.62, 0.38],
        [0.32, 0.66, 0.44],
        [0.58, 0.76, 0.36]
      ];
      for (let k = 0; k < 3; k++) {
        // Each piece reaches into the next, so the tail reads as one
        const [p, q] = [tailPts[k], tailPts[k + 1]];
        const e = (i: number) => (q[i] - p[i]) * 0.25;
        along(add, "capsule", [p[0] - e(0), p[1] - e(1), p[2] - e(2)], [q[0] + e(0), q[1] + e(1), q[2] + e(2)], 0.38 - k * 0.08, 0.32 - k * 0.07, "#14b8a6", hdo("gem"));
      }
      b.add("cyl", -0.25, 0.55, 0.2, 0.32, 0.6, 0.28, "#f1c9a5", { mat: "skin", hdShape: "taper" });
      b.add("sphere", -0.25, 1.15, 0.2, 0.3, 0.3, 0.3, "#f1c9a5", { mat: "skin", hdShape: "egg" });
      b.add("sphere", -0.3, 1.2, 0.08, 0.38, 0.45, 0.3, "#dc2626", { mat: "cloth" });
      b.add("sphere", 0.7, 0.75, -0.4, 0.22, 0.22, 0.22, "#f0f9ff", { glow: true });
      // The tail's fin, fanned at its tip (the cone points down and out along +x)
      for (const k of [-1, 1]) along(add, "drop", [0.58, 0.78, 0.36], [0.86, 0.95 + k * 0.05, 0.36 + k * 0.24], 0.2, 0.05, "#0f766e", hdo("gem"));
      add("cyl", -0.18, 0.55, 0.2, 0.42, 0.1, 0.36, "#0f766e", hdo("gem")); // scales' band at the waist
      // Arms resting on the rock
      for (const sx of [-1, 1]) {
        along(add, "capsule", [-0.25 + sx * 0.17, 1.08, 0.2], [-0.25 + sx * 0.32, 0.72, 0.38], 0.09, 0.09, "#f1c9a5", hdo("skin"));
        add("egg", -0.25 + sx * 0.33, 0.62, 0.42, 0.1, 0.1, 0.13, "#f1c9a5", hdo("skin"));
      }
      const mf: Add = (shape, x, y0, z, w, h, d, color, o) => add(shape, x - 0.25, y0, z, w, h, d, color, o);
      faceAt(mf, { skin: "#f1c9a5", tunic: "#14b8a6", legs: "#14b8a6", boots: "#14b8a6", belt: "#14b8a6", eyes: "#0e7490" }, {}, 1.3, 0.2, 0.88);
      // Her hair, falling down her back in locks
      for (let i = 0; i < 5; i++) {
        const x = -0.25 + (i - 2) * 0.07;
        along(add, "capsule", [x, 1.33, 0.08], [x + (i - 2) * 0.03, 0.72 + (i % 2) * 0.08, -0.05], 0.1, 0.07, "#b91c1c", hdo("cloth"));
      }
      // The pearl in its open clam, shells and weed swaying at the waterline
      add("cyl", 0.7, 0.72, -0.4, 0.42, 0.05, 0.34, "#e7e5e4", hdo("bone"));
      along(add, "cyl", [0.7, 0.76, -0.55], [0.7, 1.0, -0.64], 0.42, 0.04, "#e7e5e4", hdo("bone"));
      const hr = mulberry32(5203);
      for (let i = 0; i < 6; i++) {
        const a = hr() * Math.PI * 2;
        const [x, z] = [Math.cos(a) * 1.25, Math.sin(a) * 0.95];
        along(add, "drop", [x, -0.05, z], [x + (hr() - 0.5) * 0.2, 0.35 + hr() * 0.3, z + (hr() - 0.5) * 0.2], 0.1, 0.05, "#3f6212", hdo("leaf", { idle: IDLE_KIND.sway }));
      }
      for (const [x, y, z] of [
        [0.35, 0.52, 0.85],
        [-0.9, 0.52, 0.6]
      ]) {
        add("cone", x, y, z, 0.16, 0.08, 0.16, "#fda4af", hdo("bone", { rx: 1.2 }));
      }
      break;
    }
    case "lighthouse": {
      // HD: a rocky footing, a door and windows up the painted tower, a gallery with its railing, the lantern room open
      // round the lamp between its glazing bars, two beams of light sweeping round, a ball on the cap
      b.add("sphere", 0, -0.3, 0, 2.6, 1.0, 2.6, "#6b7280", { mat: "hide", hdShape: "boulder" });
      for (let i = 0; i < 5; i++) {
        const r = 1.15 - i * 0.12;
        b.add("cyl", 0, 0.3 + i * 0.9, 0, r, 0.9, r, i % 2 ? "#dc2626" : "#f8fafc", { mat: "plain" });
      }
      b.add("cyl", 0, 4.8, 0, 0.9, 0.7, 0.9, "#1f2937", { hd: false });
      b.add("sphere", 0, 4.85, 0, 0.6, 0.6, 0.6, "#fde047", { glow: true });
      b.add("box", 0, 5.1, 0, 3.6, 0.14, 0.18, "#fef9c3", { glow: true, idle: IDLE_KIND.spin, hd: false, sync: 1 }); // sweeping light
      // HD: the lamp's two beams, spreading from it as they sweep round (riding the Normal light's turn)
      for (const k of [-1, 1]) along(add, "cone", [k * 2.7, 5.17, 0], [k * 0.2, 5.17, 0], 0.62, 0.62, "#fef9c3", hdo("plain", { glow: true, idle: IDLE_KIND.spin, sync: 1 }));
      // The lantern room open round the lamp: its roof and glazing bars
      add("cyl", 0, 5.42, 0, 0.92, 0.08, 0.92, "#1f2937", hdo("iron"));
      b.add("cone", 0, 5.5, 0, 1.1, 0.8, 1.1, "#dc2626", { mat: "dull" });
      add("box", 0, 0.3, 0.6, 0.36, 0.62, 0.12, "#3f2a1a", hdo("wood")); // door
      for (let i = 1; i < 5; i++) {
        const a = i * 1.9;
        const r = (1.15 - i * 0.12) / 2;
        add("box", Math.sin(a) * r, 0.55 + i * 0.9, Math.cos(a) * r, 0.16, 0.26, 0.1, "#1e293b", hdo("gem", { ry: a }));
      }
      add("cyl", 0, 4.76, 0, 1.35, 0.1, 1.35, "#374151", hdo("iron")); // gallery
      arc(add, [0, 5.12, 0], [1, 0, 0], [0, 0, 1], 0.64, 0, Math.PI * 2, 14, 0.035, "#1f2937", hdo("iron"));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        add("cyl", Math.cos(a) * 0.64, 4.86, Math.sin(a) * 0.64, 0.03, 0.26, 0.03, "#1f2937", hdo("iron"));
        add("cyl", Math.cos(a + 0.4) * 0.44, 4.86, Math.sin(a + 0.4) * 0.44, 0.035, 0.58, 0.035, "#1f2937", hdo("iron")); // glazing bars
      }
      add("sphere", 0, 6.25, 0, 0.16, 0.16, 0.16, "#1f2937", hdo("iron"));
      break;
    }
    case "fishing_village": {
      // HD: plank huts with corner battens, doors and thatch ridges; a pier with bollards and a rope; a rounded boat
      // with its gunwales and a thwart; nets drying on a rack, a fish crate and a barrel
      for (const [x, z, r] of [
        [-1.2, -0.8, 0.2],
        [0.8, -1.1, -0.15],
        [-0.2, 0.9, 0.4]
      ]) {
        const hut = b.child(x, z, r);
        hut.add("box", 0, 0, 0, 1.1, 0.8, 0.9, "#8b5a2b", { mat: "wood" });
        hut.add("prism", 0, 0.8, 0, 1.3, 0.6, 1.1, "#a16207", { mat: "fur" });
        const ha = adder(hut);
        battens(ha, 0, 0, 0, 1.1, 0.8, 0.9, "#5b3b22");
        ha("box", 0.15, 0, 0.47, 0.3, 0.56, 0.06, "#3f2a1a", hdo("wood"));
        ha("box", -0.3, 0.38, 0.47, 0.22, 0.2, 0.06, "#1c1917", hdo("wood"));
        along(ha, "capsule", [-0.68, 1.38, 0], [0.68, 1.38, 0], 0.1, 0.1, "#854d0e", hdo("fur"));
      }
      b.add("box", 1.9, 0.1, 1.0, 2.6, 0.12, 0.6, "#7c4a24", { mat: "wood" }); // pier
      for (const px of [1.0, 2.0, 3.0]) b.add("cyl", px, -0.4, 1.0, 0.12, 0.6, 0.12, "#5b3b22", { mat: "wood" });
      b.add("box", 3.4, -0.05, 1.8, 0.5, 0.3, 1.3, "#92400e", { hd: false }); // boat
      b.add("cyl", 3.4, 0.25, 1.8, 0.05, 1.2, 0.05, "#5b3b22", { mat: "wood" });
      b.add("box", 3.6, 0.6, 1.8, 0.04, 0.6, 0.6, "#f8fafc", { idle: IDLE_KIND.flutter, mat: "cloth" });
      smoke(b, -1.2, 1.6, -0.8, 0.9);
      for (const px of [1.0, 2.0, 3.0]) add("cyl", px, 0.17, 1.24, 0.1, 0.22, 0.1, "#5b3b22", hdo("wood")); // bollards
      along(add, "capsule", [1.0, 0.36, 1.24], [3.0, 0.36, 1.24], 0.03, 0.03, "#a8a29e", hdo("cloth"));
      add("pod", 3.4, -0.08, 1.8, 0.56, 0.32, 1.36, "#92400e", hdo("wood")); // hull
      for (const sx of [-1, 1]) along(add, "capsule", [3.4 + sx * 0.25, 0.22, 1.28], [3.4 + sx * 0.25, 0.22, 2.32], 0.05, 0.05, "#7c2d12", hdo("wood"));
      add("box", 3.4, 0.14, 1.55, 0.5, 0.05, 0.14, "#7c2d12", hdo("wood")); // thwart
      // A rack of nets drying
      for (const x of [-2.3, -1.3]) add("cyl", x, 0, 1.3, 0.07, 0.95, 0.07, "#5b3b22", hdo("wood"));
      along(add, "cyl", [-2.35, 0.92, 1.3], [-1.25, 0.92, 1.3], 0.05, 0.05, "#5b3b22", hdo("wood"));
      add("box", -1.8, 0.3, 1.3, 0.9, 0.6, 0.03, "#57534e", hdo("cloth", { idle: IDLE_KIND.flutter, sync: 2 }));
      for (let k = 0; k < 4; k++) add("sphere", -2.13 + k * 0.22, 0.84, 1.3, 0.07, 0.07, 0.07, "#d97706", hdo("wood", { idle: IDLE_KIND.flutter, sync: 2 })); // cork floats
      // The morning's catch in a crate, a barrel
      add("box", 1.1, 0.22, 0.75, 0.5, 0.2, 0.36, "#8b5a2b", hdo("wood"));
      for (let k = 0; k < 3; k++) add("pod", 1.0 + k * 0.1, 0.36, 0.75, 0.1, 0.08, 0.3, "#94a3b8", hdo("gel", { ry: (k - 1) * 0.3 }));
      add("cyl", 2.6, 0.22, 0.85, 0.34, 0.44, 0.34, "#7c4a24", hdo("wood"));
      for (const y of [0.3, 0.54]) add("cyl", 2.6, y, 0.85, 0.38, 0.04, 0.38, "#57534e", hdo("dull"));
      break;
    }
    case "treant": {
      // HD: furrowed bark, a face of knots (brow, nose, a hollow mouth) and a beard of moss, lumpy leaf crowns, roots
      // in bark, bracket fungus and moss on the roots
      b.alive();
      b.add("cyl", 0, 0, 0, 1.2, 3.2, 1.2, "#5b3b22", { mat: "wood" });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        b.add("cone", Math.cos(a) * 0.8, 0, Math.sin(a) * 0.8, 0.4, 0.9, 0.4, "#4a3322", { rx: Math.sin(a) * 0.6, rz: -Math.cos(a) * 0.6, mat: "wood" });
      }
      b.add("cyl", 0.8, 2.2, 0, 0.3, 1.6, 0.3, "#5b3b22", { rz: -0.9, mat: "wood" });
      b.add("cyl", -0.8, 2.3, 0, 0.3, 1.5, 0.3, "#5b3b22", { rz: 0.9, mat: "wood" });
      b.add("sphere", 0, 3.4, 0, 3.0, 2.2, 3.0, "#2f7d32", { idle: IDLE_KIND.sway, mat: "leaf", hdShape: "canopy" });
      b.add("sphere", 1.1, 3.0, 0.4, 1.6, 1.3, 1.6, "#3f9a3a", { idle: IDLE_KIND.sway, mat: "leaf", hdShape: "canopy" });
      b.add("sphere", -1.0, 3.2, -0.3, 1.5, 1.2, 1.5, "#3f9a3a", { idle: IDLE_KIND.sway, mat: "leaf", hdShape: "canopy" });
      b.add("sphere", -0.25, 1.9, 0.6, 0.18, 0.18, 0.1, "#fbbf24", { glow: true });
      b.add("sphere", 0.25, 1.9, 0.6, 0.18, 0.18, 0.1, "#fbbf24", { glow: true });
      // Bark ridges up the trunk, clear of its face
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + 0.35;
        if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.6) continue;
        along(add, "capsule", [Math.cos(a) * 0.58, 0.15, Math.sin(a) * 0.58], [Math.cos(a + 0.12) * 0.55, 3.0, Math.sin(a + 0.12) * 0.55], 0.13, 0.1, "#4a3322", hdo("wood"));
      }
      for (const sx of [-1, 1]) along(add, "capsule", [sx * 0.42, 2.16, 0.55], [sx * 0.08, 2.06, 0.64], 0.13, 0.1, "#4a3322", hdo("wood")); // brows
      add("egg", 0, 1.6, 0.6, 0.16, 0.26, 0.14, "#4a3322", hdo("wood", { rx: -0.2 })); // nose knot
      add("egg", 0, 1.22, 0.56, 0.42, 0.18, 0.12, "#1c1209", hdo("wood")); // hollow mouth
      const hr = mulberry32(5401);
      for (let i = 0; i < 9; i++) {
        const x = (i - 4) * 0.075;
        along(add, "capsule", [x, 1.2, 0.6], [x * 1.25, 0.55 + hr() * 0.4, 0.64 + hr() * 0.06], 0.07, 0.05, i % 2 ? "#4d7c0f" : "#3f6212", hdo("leaf"));
      }
      for (let i = 0; i < 4; i++) {
        const a = hr() * Math.PI * 2;
        add("cyl", Math.cos(a) * 0.62, 0.5 + hr() * 1.0, Math.sin(a) * 0.62, 0.26, 0.05, 0.26, "#d6b98c", hdo("wood"));
      }
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.3;
        add("egg", Math.cos(a) * 1.05, 0, Math.sin(a) * 1.05, 0.34, 0.14, 0.3, "#4d7c0f", hdo("leaf", { ry: a }));
      }
      break;
    }
    case "fairy_ring": {
      // HD: fleshy stems swelling at the foot, pale gills under each cap and white spots on the red ones, little caps
      // springing up between, a mossy ground
      const hr = mulberry32(5501);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const s = range(rng, 0.7, 1.2);
        const x = Math.cos(a) * 1.8;
        const z = Math.sin(a) * 1.8;
        b.add("cyl", x, 0, z, 0.18 * s, 0.45 * s, 0.18 * s, "#f5f5f4", { mat: "skin", hdShape: "taper" });
        const cap = i % 3 === 0 ? "#a855f7" : "#dc2626";
        b.add("sphere", x, 0.4 * s, z, 0.6 * s, 0.35 * s, 0.6 * s, cap, { mat: "skin" });
        add("cyl", x, 0.42 * s, z, 0.5 * s, 0.04 * s, 0.5 * s, "#fde7c8", hdo("skin"));
        for (let k = 0; k < 5; k++) {
          const ka = hr() * Math.PI * 2;
          const d = (0.06 + hr() * 0.16) * s;
          const y = 0.575 * s + 0.175 * s * Math.sqrt(Math.max(0, 1 - (d / (0.3 * s)) ** 2));
          const z0 = 0.07 * s;
          add("sphere", x + Math.cos(ka) * d, y - z0 / 2, z + Math.sin(ka) * d, z0, z0 * 0.6, z0, "#fafaf9", hdo("skin"));
        }
      }
      for (let i = 0; i < 6; i++) {
        b.add("octa", range(rng, -1, 1), range(rng, 0.6, 1.6), range(rng, -1, 1), 0.12, 0.16, 0.12, "#f0abfc", { glow: true, idle: IDLE_KIND.spin, pivot: [0, 0], phase: 0.01 + i });
      }
      b.add("cyl", 0, 0, 0, 2.8, 0.03, 2.8, "#3f9a5c", { hd: false });
      add("cyl", 0, 0, 0, 2.8, 0.06, 2.8, "#3f9a5c", hdo("leaf"));
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + 0.2;
        const d = 1.5 + hr() * 0.7;
        const s = 0.35 + hr() * 0.25;
        const [x, z] = [Math.cos(a) * d, Math.sin(a) * d];
        add("cyl", x, 0, z, 0.1 * s, 0.4 * s, 0.1 * s, "#f5f5f4", hdo("skin", { hdShape: "taper" }));
        add("sphere", x, 0.32 * s, z, 0.42 * s, 0.24 * s, 0.42 * s, i % 2 ? "#dc2626" : "#c084fc", hdo("skin"));
      }
      break;
    }
    case "hunter_lodge": {
      // HD: pale cut ends on the logs, a plank door and an antlered skull over it, a stone chimney, a stag with a real
      // head, branching antlers and four legs, the pelt hung over its rack's crossbar, a woodpile and a chopping block
      b.add("box", 0, 0, 0, 2.2, 1.2, 1.6, "#6b4423", { mat: "wood" });
      for (let i = 0; i < 4; i++) b.add("cyl", 0, 0.2 + i * 0.3 - 1.15, 0.82, 0.16, 2.3, 0.16, "#7c4a24", { rz: Math.PI / 2, mat: "wood" }); // log siding on the front wall
      b.add("prism", 0, 1.2, 0, 2.5, 0.9, 1.9, "#3f2a1a", { mat: "wood" });
      b.add("box", 0.8, 1.3, -0.3, 0.3, 0.9, 0.3, "#6b7280", { mat: "stone", hdShape: "block" });
      smoke(b, 0.8, 2.3, -0.3, 0.8);
      for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) add("cyl", sx * 1.17, 0.2 + i * 0.3 - 0.03, 0.82, 0.14, 0.06, 0.14, "#c69c6d", hdo("wood", { rz: Math.PI / 2 }));
      add("box", 0.45, 0, 0.92, 0.42, 0.85, 0.06, "#3f2a1a", hdo("wood"));
      add("sphere", 0.6, 0.42, 0.97, 0.05, 0.05, 0.05, "#57534e", hdo("dull"));
      skull(add, -0.35, 1.0, 0.98, 0.2, BONE, 0, hdo("bone"));
      for (const sx of [-1, 1]) {
        along(add, "horn", [-0.35 + sx * 0.06, 1.1, 1.0], [-0.35 + sx * 0.3, 1.32, 1.0], 0.04, 0.04, BONE, hdo("bone"));
        along(add, "cone", [-0.35 + sx * 0.2, 1.22, 1.0], [-0.35 + sx * 0.22, 1.38, 1.02], 0.025, 0.025, BONE, hdo("bone"));
      }
      // Deer
      const deer = b.child(-1.8, 1.2, 0.6).alive();
      deer.add("box", 0, 0.45, 0, 0.35, 0.35, 0.8, "#a0662d", { mat: "hide", hdShape: "pod" });
      deer.add("box", 0, 0, 0.3, 0.3, 0.45, 0.08, "#7c4a24", { hd: false });
      deer.add("box", 0, 0, -0.3, 0.3, 0.45, 0.08, "#7c4a24", { hd: false });
      deer.add("box", 0, 0.75, 0.45, 0.22, 0.35, 0.22, "#a0662d", { hd: false });
      deer.add("cyl", -0.12, 1.05, 0.45, 0.04, 0.4, 0.04, "#efe6cf", { rz: 0.4, hd: false });
      deer.add("cyl", 0.12, 1.05, 0.45, 0.04, 0.4, 0.04, "#efe6cf", { rz: -0.4, hd: false });
      const da = adder(deer);
      for (const sx of [-1, 1])
        for (const lz of [-0.3, 0.3]) {
          da("box", sx * 0.1, 0.02, lz, 0.08, 0.5, 0.08, "#7c4a24", hdo("hide", { hdShape: "limb" }));
          da("cyl", sx * 0.1, 0, lz + 0.01, 0.08, 0.05, 0.09, "#1c1917", hdo("bone"));
        }
      along(da, "taper", [0, 0.62, 0.3], [0, 0.98, 0.46], 0.17, 0.15, "#a0662d", hdo("hide"));
      da("snout", 0, 0.86, 0.6, 0.15, 0.15, 0.3, "#a0662d", hdo("hide", { rx: 0.35 }));
      da("egg", 0, 0.83, 0.75, 0.06, 0.05, 0.05, "#1c1917", hdo("leather"));
      for (const sx of [-1, 1]) {
        da("sphere", sx * 0.07, 0.96, 0.58, 0.04, 0.04, 0.04, "#1c1917", hdo("gem"));
        along(da, "egg", [sx * 0.06, 1.02, 0.5], [sx * 0.22, 1.08, 0.46], 0.07, 0.03, "#a0662d", hdo("hide"));
        // Antlers: a beam sweeping up and back, with tines
        const base: V3 = [sx * 0.05, 1.05, 0.52];
        const mid: V3 = [sx * 0.15, 1.2, 0.47];
        const top: V3 = [sx * 0.2, 1.34, 0.4];
        along(da, "cyl", base, mid, 0.03, 0.03, BONE, hdo("bone"));
        along(da, "cone", mid, top, 0.03, 0.03, BONE, hdo("bone"));
        along(da, "cone", mid, [sx * 0.15, 1.31, 0.55], 0.025, 0.025, BONE, hdo("bone"));
        along(da, "cone", [sx * 0.1, 1.12, 0.5], [sx * 0.09, 1.2, 0.58], 0.02, 0.02, BONE, hdo("bone"));
      }
      da("egg", 0, 0.62, -0.42, 0.1, 0.12, 0.06, "#f5f5f4", hdo("hide", { rx: -0.4 })); // tail
      da("egg", 0, 0.45, 0.05, 0.24, 0.08, 0.5, "#c4a27a", hdo("hide")); // pale belly
      // Drying rack
      b.add("box", 1.6, 0, 1.0, 0.08, 0.9, 0.08, "#5b3b22", { mat: "wood" });
      b.add("box", 2.2, 0, 1.0, 0.08, 0.9, 0.08, "#5b3b22", { mat: "wood" });
      b.add("box", 1.9, 0.6, 1.0, 0.5, 0.35, 0.04, "#c08457", { idle: IDLE_KIND.flutter, mat: "leather" });
      along(add, "cyl", [1.56, 0.94, 1.0], [2.24, 0.94, 1.0], 0.05, 0.05, "#5b3b22", hdo("wood"));
      // A woodpile against the wall and a chopping block with its axe
      for (const [y, z] of [
        [0.075, -0.6],
        [0.075, -0.45],
        [0.075, -0.3],
        [0.2, -0.525],
        [0.2, -0.375]
      ]) {
        add("cyl", -1.3, y - 0.3, z, 0.15, 0.6, 0.15, "#92400e", hdo("wood", { rx: Math.PI / 2 }));
      }
      add("cyl", 1.25, 0, -0.95, 0.38, 0.35, 0.38, "#a16207", hdo("wood", { hdShape: "trunk" }));
      add("cyl", 1.25, 0.34, -0.95, 0.3, 0.04, 0.3, "#d6b98c", hdo("wood"));
      along(add, "box", [1.2, 0.33, -0.95], [1.36, 0.4, -0.95], 0.04, 0.16, "#a8a29e", hdo("dull"));
      along(add, "cyl", [1.28, 0.36, -0.95], [1.62, 0.78, -0.95], 0.04, 0.04, "#78350f", hdo("wood"));
      break;
    }
    case "yeti_cave": {
      // HD: a drifted snowbank, a rock arch round the cave mouth hung with icicles, the yeti in shaggy fur with a blue
      // face (brow, eyes, nose and fangs), hands with claws and broad feet; rocks at the crystals' feet, an offering
      // of dried fish and gnawed bones
      b.add("sphere", 0, -0.8, -0.6, 4.2, 3.2, 3.4, "#e2e8f0", { mat: "hide" });
      b.add("box", 0, 0, 0.95, 1.2, 1.3, 0.3, "#0f172a", { mat: "stone" });
      arc(add, [0, 0, 1.05], [1, 0, 0], [0, 1, 0], [0.78, 1.42], 0, Math.PI, 7, 0.3, "#cbd5e1", hdo("stone"));
      const hr = mulberry32(5701);
      for (let i = 0; i < 7; i++) {
        const x = -0.55 + i * 0.18;
        const h = 0.18 + hr() * 0.28;
        const top = 1.4 * Math.sqrt(Math.max(0, 1 - (x / 0.78) ** 2)) - 0.05;
        add("cone", x, top - h, 1.12, 0.07, h, 0.07, "#bae6fd", hdo("gem", { rx: Math.PI }));
      }
      const yeti = b.child(1.4, 1.1, -0.5).alive();
      yeti.add("sphere", 0, 0, 0, 1.0, 1.3, 0.8, "#f8fafc", { mat: "fur" });
      yeti.add("sphere", 0, 1.2, 0, 0.6, 0.55, 0.55, "#f8fafc", { mat: "fur" });
      yeti.add("box", 0, 1.15, 0.26, 0.36, 0.26, 0.06, "#60a5fa", { hd: false });
      yeti.add("cyl", 0.55, 0.4, 0, 0.25, 0.8, 0.25, "#f8fafc", { rz: 0.5, mat: "fur", hdShape: "limb" });
      yeti.add("cyl", -0.55, 0.4, 0, 0.25, 0.8, 0.25, "#f8fafc", { rz: -0.5, mat: "fur", hdShape: "limb" });
      const ya = adder(yeti);
      ya("egg", 0, 0.55, 0.12, 0.56, 0.7, 0.36, "#e2e8f0", hdo("fur")); // pale chest
      ya("sphere", 0, 1.19, 0.12, 0.34 * 0.95, 0.34 * 0.95, 0.34 * 0.95, "#60a5fa", hdo("skin")); // face
      faceAt(ya, { skin: "#60a5fa", tunic: "#f8fafc", legs: "#f8fafc", boots: "#f8fafc", belt: "#f8fafc", eyes: "#1e3a8a", ears: false }, {}, 1.35, 0.12, 0.95);
      for (const sx of [-1, 1]) {
        ya("cone", sx * 0.05, 1.21, 0.26, 0.03, 0.06, 0.03, "#f8fafc", hdo("bone")); // fangs
        along(ya, "drop", [sx * 0.12, 1.55, 0.05], [sx * 0.3, 1.42, -0.05], 0.14, 0.1, "#f8fafc", hdo("fur")); // shaggy crown
        // Hands with three claws each, and broad feet
        ya("egg", sx * 0.74, 0.26, 0, 0.26, 0.26, 0.24, "#f8fafc", hdo("fur"));
        for (let k = -1; k <= 1; k++) along(ya, "cone", [sx * 0.76 + k * 0.06, 0.28, 0.08], [sx * 0.78 + k * 0.07, 0.17, 0.16], 0.04, 0.04, "#cbd5e1", hdo("bone"));
        ya("egg", sx * 0.24, -0.02, 0.18, 0.3, 0.16, 0.42, "#f8fafc", hdo("fur"));
      }
      for (const [x, z] of [
        [-1.6, 1.0],
        [-2.0, -0.2],
        [1.9, -1.0]
      ]) {
        b.add("octa", x, 0, z, 0.4, 0.9, 0.4, "#67e8f9", { glow: true });
        add("boulder", x, 0, z, 0.7, 0.28, 0.6, "#94a3b8", hdo("stone"));
        add("octa", x + 0.25, 0, z + 0.12, 0.16, 0.36, 0.16, "#67e8f9", hdo("gem", { rz: -0.4 }));
      }
      // Dried fish laid on a flat stone at the mouth, gnawed bones
      add("box", -0.75, 0, 1.5, 0.6, 0.12, 0.4, "#94a3b8", hdo("stone", { hdShape: "boulder" }));
      for (let k = 0; k < 2; k++) {
        add("pod", -0.85 + k * 0.22, 0.12, 1.5, 0.1, 0.07, 0.32, "#a8a29e", hdo("leather", { ry: 0.3 - k * 0.6 }));
        add("cone", -0.85 + k * 0.22 - 0.03 + k * 0.06, 0.13, 1.5 - 0.2 + k * 0.4, 0.1, 0.04, 0.08, "#78716c", hdo("leather"));
      }
      bone(add, [0.6, 0.05, 1.55], [1.05, 0.05, 1.3], 0.07, BONE, hdo("bone"));
      bone(add, [0.8, 0.05, 1.75], [1.2, 0.05, 1.8], 0.06, BONE, hdo("bone"));
      break;
    }
    case "dragon_nest": {
      // HD: boulders, eggs in scaled stone, the dragon's hide, a tapered neck, a snouted head, horns, eyes and wings
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        b.add("sphere", Math.cos(a) * 1.7, -0.1, Math.sin(a) * 1.7, 0.9, 0.6, 0.9, "#57534e", { mat: "stone", hdShape: "boulder" });
      }
      for (const [x, z, c] of [
        [-0.5, 0.6, "#f59e0b"],
        [0.4, 0.8, "#10b981"],
        [0.0, 1.2, "#ef4444"]
      ] as const) {
        b.add("sphere", x, 0, z, 0.4, 0.55, 0.4, c, { mat: "stone", hdShape: "egg" });
      }
      const dragon = b.child(0, -0.4, 0);
      dragon.add("sphere", 0, 0.6, 0, 1.4, 1.1, 2.0, "#b91c1c", { mat: "hide" });
      dragon.add("cyl", 0, 1.3, 0.9, 0.4, 1.2, 0.4, "#b91c1c", { rx: 0.6, mat: "hide", hdShape: "taper" });
      dragon.add("box", 0, 2.0, 1.45, 0.55, 0.45, 0.8, "#991b1b", { mat: "hide", hdShape: "snout" });
      dragon.add("cone", -0.18, 2.3, 1.2, 0.1, 0.4, 0.1, BONE, { rx: -0.5, mat: "bone", hdShape: "horn" });
      dragon.add("cone", 0.18, 2.3, 1.2, 0.1, 0.4, 0.1, BONE, { rx: -0.5, mat: "bone", hdShape: "horn" });
      dragon.add("box", -1.3, 1.3, 0, 2.0, 0.06, 1.2, "#7f1d1d", { rz: 0.45, idle: IDLE_KIND.flutter, mat: "leather" });
      dragon.add("box", 1.3, 1.3, 0, 2.0, 0.06, 1.2, "#7f1d1d", { rz: -0.45, idle: IDLE_KIND.flutter, mat: "leather" });
      dragon.add("cone", 0, 0.5, -1.5, 0.4, 1.6, 0.4, "#b91c1c", { rx: -1.4, mat: "hide" });
      dragon.add("sphere", 0, 1.95, 1.9, 0.25, 0.2, 0.25, "#f97316", { glow: true });
      smoke(dragon, 0, 2.2, 1.95, 0.6, "#57534e");
      const ra = adder(dragon);
      for (const sx of [-1, 1]) ra("sphere", sx * 0.2, 2.28, 1.6, 0.09, 0.07, 0.09, "#fbbf24", hdo("gem"));
      for (let k = 0; k < 4; k++) ra("cone", 0, 1.1 - k * 0.04, 0.3 - k * 0.38, 0.14, 0.24, 0.1, "#7f1d1d", hdo("bone")); // back scutes
      break;
    }
    case "sandworm": {
      // HD: one smooth hide body along each coil with a scute down its back, a throat of ringed segments, lips round the maw with a
      // second row of teeth inside it, a wet gullet
      for (let i = 0; i < 3; i++)
        stackedArc(b, rng, i * 0.25 - 0.25 + Math.PI, 2.6 + i * 1.6, "#c08457", "hide", ([cx, cy, cz], s, _t, ride, dir, len) => {
          arcBody(add, [cx, cy, cz], dir, len, s, "#c08457", "hide", ride);
          if (s > 0.4) add("sphere", cx, cy + s * 0.32, cz, s * 0.55, s * 0.32, s * 0.55, "#a0662d", hdo("hide", ride));
        });
      b.add("cyl", 0, 0, 0, 1.6, 2.6, 1.6, "#a16207", { hd: false });
      // HD: the throat in ringed segments, each bulging a little past the last
      for (let k = 0; k < 5; k++) add("sphere", 0, k * 0.5 - 0.3, 0, 1.68 - k * 0.03, 1.05, 1.68 - k * 0.03, k % 2 ? "#a16207" : "#9a5d09", hdo("hide"));
      b.add("cyl", 0, 2.6, 0, 1.9, 0.3, 1.9, "#7c2d12", { mat: "skin" });
      b.add("cyl", 0, 2.65, 0, 1.2, 0.3, 1.2, "#1c0a00", { mat: "gel" });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        b.add("cone", Math.cos(a) * 0.75, 2.6, Math.sin(a) * 0.75, 0.15, 0.45, 0.15, BONE, { rx: Math.sin(a) * 0.6, rz: -Math.cos(a) * 0.6, mat: "bone" });
      }
      b.add("sphere", 0, -0.3, 0, 3.4, 0.9, 3.4, "#ddb460", { mat: "hide" });
      smoke(b, 1.2, 0.3, 0.6, 1.1, "#d6b06a");
      arc(add, [0, 2.92, 0], [1, 0, 0], [0, 0, 1], 0.88, 0, Math.PI * 2, 14, 0.16, "#9a3412", hdo("skin"));
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + 0.3;
        along(add, "cone", [Math.cos(a) * 0.52, 2.86, Math.sin(a) * 0.52], [Math.cos(a) * 0.3, 3.12, Math.sin(a) * 0.3], 0.13, 0.13, BONE, hdo("bone"));
      }
      break;
    }
    case "pyramid": {
      // HD: the pyramid in stepped courses of dressed stone, a doorway on its face, sand drifted against it, glyphs
      // cut into the obelisk, fallen blocks
      b.add("pyramid", 0, -0.5, 0, 4.4, 3.6, 4.4, "#d6b06a", { hd: false });
      for (let i = 0; i < 7; i++) {
        const w = 4.4 * (1 - (i * 0.45 + 0.225) / 3.6);
        add("block", 0, -0.5 + i * 0.45, 0, w, 0.45, w, i % 2 ? "#d6b06a" : "#cfa862", hdo("stone"));
      }
      b.add("pyramid", 0, 2.65, 0, 0.6, 0.5, 0.6, "#fbbf24", { glow: true, idle: IDLE_KIND.spin });
      smoke(b, -1.4, 0.4, -1.2, 1.0, "#e7c98c");
      b.add("pyramid", 3.0, -0.3, 1.6, 1.8, 1.4, 1.8, "#c9a15a", { mat: "stone" });
      b.add("box", -2.6, 0, 1.6, 0.4, 2.6, 0.4, "#b8925a", { mat: "stone" });
      b.add("pyramid", -2.6, 2.6, 1.6, 0.4, 0.4, 0.4, "#fbbf24", { mat: "dull" });
      b.add("sphere", 1.5, -0.4, -2.0, 3.0, 1.0, 2.0, "#ddb460", { mat: "hide" });
      add("box", 0, 0, 1.8, 0.52, 0.42, 0.14, "#292524", hdo("stone")); // doorway
      add("box", 0, 0.42, 1.82, 0.74, 0.12, 0.2, "#b8925a", hdo("stone")); // lintel
      for (let k = 0; k < 5; k++) for (const sx of [-1, 1]) add("box", -2.6 + sx * 0.09, 0.35 + k * 0.42, 1.81, 0.1, 0.12, 0.1, "#8a6a3a", hdo("stone"));
      for (const [x, z, w] of [
        [-1.6, 1.4, 1.3],
        [1.7, -1.0, 1.5],
        [-1.2, -1.8, 1.2]
      ]) {
        add("sphere", x, -0.35, z, w, 0.7, w * 0.7, "#ddb460", hdo("hide"));
      }
      add("block", 2.0, 0, 1.9, 0.5, 0.4, 0.5, "#cfa862", hdo("stone", { ry: 0.5 }));
      add("block", -0.8, 0, 2.6, 0.45, 0.35, 0.55, "#cfa862", hdo("stone", { ry: -0.3, rz: 0.15 }));
      break;
    }
    case "caravan": {
      // HD: canvas tents on poles with guy ropes and dark doorways, a rug laid out; camels with padded feet, humps,
      // long necks, ears, eyes, drooping lips and tails, saddle bags and tassels; a battened crate, a hooped barrel,
      // stones and logs round the fire, clay jars
      b.add("pyramid", -1.2, 0, -0.6, 1.6, 1.3, 1.6, "#dc2626", { mat: "cloth" });
      b.add("pyramid", 0.8, 0, -1.2, 1.4, 1.1, 1.4, "#f8fafc", { mat: "cloth" });
      for (const [x, z, w, h] of [
        [-1.2, -0.6, 1.6, 1.3],
        [0.8, -1.2, 1.4, 1.1]
      ]) {
        add("cyl", x, h - 0.1, z, 0.05, 0.4, 0.05, "#5b3b22", hdo("wood"));
        // The doorway, laid on the tent's sloping front
        const slope = Math.atan(w / 2 / h);
        add("box", x, 0.3 - 0.275, z + (w / 2) * (1 - 0.3 / h) + 0.03, 0.38, 0.55, 0.04, "#292524", hdo("cloth", { rx: -slope }));
        for (const [sx, sz] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1]
        ]) {
          const c: V3 = [x + sx * w * 0.25, h * 0.5, z + sz * w * 0.25];
          const stake: V3 = [x + sx * (w * 0.5 + 0.35), 0, z + sz * (w * 0.5 + 0.35)];
          along(add, "cyl", c, stake, 0.015, 0.015, "#d6d3d1", hdo("cloth"));
          add("cone", stake[0], 0, stake[2], 0.05, 0.14, 0.05, "#5b3b22", hdo("wood"));
        }
      }
      add("box", -1.2, 0, 0.55, 0.9, 0.03, 0.6, "#9f1239", hdo("cloth"));
      for (const [x, z, r] of [
        [-0.6, 1.2, 0.3],
        [1.4, 0.8, -0.5]
      ]) {
        const camel = b.child(x, z, r).alive();
        camel.add("box", 0, 0.7, 0, 0.45, 0.45, 1.0, "#c9a15a", { mat: "fur", hdShape: "pod" });
        camel.add("sphere", 0, 1.0, 0.1, 0.4, 0.4, 0.4, "#b8925a", { mat: "fur", hdShape: "egg" });
        camel.add("cyl", 0, 1.1, 0.55, 0.16, 0.7, 0.16, "#c9a15a", { rx: 0.5, mat: "fur", hdShape: "taper" });
        camel.add("box", 0, 1.45, 0.78, 0.2, 0.2, 0.35, "#c9a15a", { mat: "fur", hdShape: "snout" });
        camel.add("box", 0, 0, 0.35, 0.4, 0.55, 0.08, "#a07a45", { hd: false });
        camel.add("box", 0, 0, -0.35, 0.4, 0.55, 0.08, "#a07a45", { hd: false });
        camel.add("box", 0, 0.92, -0.25, 0.5, 0.15, 0.3, "#7c3aed", { mat: "cloth" });
        const ca = adder(camel);
        for (const sx of [-1, 1]) {
          for (const lz of [-0.35, 0.35]) {
            ca("box", sx * 0.14, 0.04, lz, 0.1, 0.72, 0.1, "#a07a45", hdo("fur", { hdShape: "limb" }));
            ca("sphere", sx * 0.14, 0.33, lz + 0.01, 0.11, 0.1, 0.11, "#a07a45", hdo("fur")); // knobbly knee
            ca("egg", sx * 0.14, 0, lz + 0.03, 0.15, 0.06, 0.18, "#57534e", hdo("leather")); // padded foot
          }
          ca("egg", sx * 0.08, 1.6, 0.72, 0.04, 0.09, 0.05, "#a07a45", hdo("fur", { rz: sx * 0.4 })); // ear
          ca("sphere", sx * 0.09, 1.56, 0.82, 0.045, 0.045, 0.045, "#1c1917", hdo("gem"));
          along(ca, "capsule", [sx * 0.12, 1.59, 0.79], [sx * 0.04, 1.6, 0.86], 0.025, 0.02, "#a07a45", hdo("fur")); // heavy lid
          ca("egg", sx * 0.29, 0.62, -0.25, 0.12, 0.3, 0.26, "#78350f", hdo("leather")); // saddle bag
          for (const tz of [-0.36, -0.14]) ca("drop", sx * 0.25, 0.74, tz, 0.05, 0.12, 0.05, "#fbbf24", hdo("cloth", { rx: Math.PI }));
        }
        ca("egg", 0, 1.43, 0.95, 0.14, 0.07, 0.1, "#a07a45", hdo("fur")); // drooping lip
        tail(ca, [0, 0.95, -0.48], { len: 0.35, w0: 0.05, w1: 0.04, n: 2, pitch: 1.3, curl: -0.2, color: "#a07a45", tip: "#57534e" }, hdo("fur"));
      }
      b.add("box", 0.2, 0, 0, 0.5, 0.5, 0.5, "#8b5a2b", { mat: "wood" });
      b.add("cone", -0.2, 0, 0.5, 0.35, 0.4, 0.35, "#f97316", { glow: true }); // cooking fire
      smoke(b, -0.2, 0.45, 0.5, 0.7);
      b.add("cyl", 0.8, 0, 0.2, 0.4, 0.5, 0.4, "#7c4a24", { mat: "wood" });
      battens(add, 0.2, 0, 0, 0.5, 0.5, 0.5, "#5b3b22");
      for (const y of [0.08, 0.38]) add("cyl", 0.8, y, 0.2, 0.44, 0.04, 0.44, "#57534e", hdo("dull"));
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        add("boulder", -0.2 + Math.cos(a) * 0.3, 0, 0.5 + Math.sin(a) * 0.3, 0.14, 0.1, 0.12, "#78716c", hdo("stone"));
      }
      for (const a of [0.4, 2.2]) along(add, "cyl", [-0.2 - Math.cos(a) * 0.2, 0.05, 0.5 - Math.sin(a) * 0.2], [-0.2 + Math.cos(a) * 0.2, 0.05, 0.5 + Math.sin(a) * 0.2], 0.07, 0.07, "#3f2a1a", hdo("wood"));
      for (const [x, z] of [
        [0.55, 0.55],
        [0.7, 0.75]
      ]) {
        add("egg", x, 0, z, 0.22, 0.3, 0.22, "#b45309", hdo("stone"));
        add("cyl", x, 0.28, z, 0.1, 0.06, 0.1, "#b45309", hdo("stone"));
      }
      break;
    }
    case "goblin_camp": {
      // HD: hide huts on crossed poles with dark doorways, tusks of bone; stones and logs round the fire; the totem as
      // a pole of real skulls with a feathered crossbar; crude blades stuck in a stump, a loot sack spilling coin
      const huts: Array<[number, number]> = [
        [-1.4, -0.6],
        [1.3, -0.9],
        [0.1, 1.4]
      ];
      for (const [x, z] of huts) {
        b.add("cone", x, 0, z, 1.3, 1.5, 1.3, "#7c5a35", { mat: "hide" });
        b.add("cone", x + 0.3, 1.1, z, 0.08, 0.6, 0.08, BONE, { rz: -0.5, mat: "bone", hdShape: "horn" });
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2 + 0.5;
          along(add, "cyl", [x, 1.3, z], [x + Math.cos(a) * 0.18, 1.8, z + Math.sin(a) * 0.18], 0.05, 0.05, "#3f2a1a", hdo("wood"));
        }
        // The doorway faces the fire
        const a = Math.atan2(-z, -x);
        add("egg", x + Math.cos(a) * 0.42, 0, z + Math.sin(a) * 0.42, 0.34, 0.6, 0.3, "#1c1917", hdo("hide", { ry: Math.PI / 2 - a }));
      }
      b.add("cone", 0, 0, 0, 0.6, 0.9, 0.6, "#f97316", { glow: true });
      b.add("cone", 0, 0, 0, 0.3, 1.2, 0.3, "#fde047", { glow: true });
      smoke(b, 0, 1.3, 0, 1.0, "#57534e");
      for (let i = 0; i < 4; i++) b.add("box", 1.8, i * 0.5, 1.2, 0.5, 0.5, 0.5, i === 3 ? BONE : "#57534e", { hd: false });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        b.add("cone", Math.cos(a) * 2.6, 0, Math.sin(a) * 2.6, 0.2, 1.0, 0.2, "#3f2a1a", { rz: -Math.cos(a) * 0.4, rx: Math.sin(a) * 0.4, mat: "wood" });
      }
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        add("boulder", Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42, 0.2, 0.14, 0.17, "#57534e", hdo("stone"));
      }
      for (const a of [0.3, 1.9, 3.6]) along(add, "cyl", [-Math.cos(a) * 0.32, 0.06, -Math.sin(a) * 0.32], [Math.cos(a) * 0.32, 0.06, Math.sin(a) * 0.32], 0.09, 0.09, "#292524", hdo("wood"));
      add("cyl", 1.8, 0, 1.2, 0.14, 2.2, 0.14, "#3f2a1a", hdo("wood"));
      for (const y of [0.35, 0.9, 1.45]) skull(add, 1.8, y, 1.27, 0.4, BONE, 0, hdo("bone"));
      along(add, "cyl", [1.45, 1.95, 1.2], [2.15, 1.95, 1.2], 0.06, 0.06, "#3f2a1a", hdo("wood"));
      for (const sx of [-1, 1]) along(add, "drop", [1.8 + sx * 0.33, 1.94, 1.2], [1.8 + sx * 0.36, 1.66, 1.22], 0.08, 0.03, "#b91c1c", hdo("cloth"));
      add("cyl", -1.9, 0, 1.4, 0.4, 0.4, 0.4, "#5b3b22", hdo("wood", { hdShape: "trunk" }));
      along(add, "blade", [-1.95, 0.35, 1.4], [-2.0, 0.85, 1.38], 0.03, 0.1, "#78716c", hdo("dull"));
      along(add, "blade", [-1.82, 0.35, 1.45], [-1.7, 0.75, 1.55], 0.03, 0.09, "#78716c", hdo("dull"));
      add("egg", -0.6, 0, -2.0, 0.45, 0.5, 0.4, "#92400e", hdo("cloth"));
      coins(add, mulberry32(5901), -0.45, 0, -1.7, 0.3, 4, "#ca8a04", hdo("dull"));
      break;
    }
    case "beast_skeleton": {
      // HD: a spine of vertebrae with spurs, ribs curving up out of the sand, the colossus's skull with its sockets and
      // horns, scattered leg bones half-buried
      b.add("cyl", 0, 0.45 - 2.2, 0, 0.3, 4.4, 0.3, BONE, { rz: Math.PI / 2, hd: false }); // spine, level with the skull
      for (let i = 0; i < 11; i++) {
        const x = -2.1 + i * 0.42;
        add("cyl", x, 0.45 - 0.17, 0, 0.36, 0.34, 0.36, BONE, hdo("bone", { rz: Math.PI / 2 }));
        along(add, "cone", [x, 0.55, 0], [x - 0.08, 0.9, 0], 0.12, 0.08, BONE, hdo("bone"));
      }
      for (let i = 0; i < 5; i++) {
        const x = -1.6 + i * 0.8;
        const h = 2.4 - Math.abs(i - 2) * 0.35;
        b.add("cyl", x, 0, 0.75, 0.16, h, 0.16, BONE, { rx: -0.35, hd: false });
        b.add("cyl", x, 0, -0.75, 0.16, h, 0.16, BONE, { rx: 0.35, hd: false });
        for (const sz of [-1, 1]) {
          // A rib from the spine, arching out and up and curving in at its tip
          const p = (t: number): V3 => {
            const u = 1 - t;
            return [x, 0.45 * u * u + 2 * u * t * (h * 0.6) + t * t * h, sz * (0.15 * u * u + 2 * u * t * 1.5 + t * t * 0.35)];
          };
          // Segments overlap a little, so the rib reads as one curved bone
          for (let k = 0; k < 5; k++) along(add, "capsule", p(Math.max(0, k / 5 - 0.04)), p(Math.min(1, (k + 1) / 5 + 0.04)), 0.17 - k * 0.02, 0.12 - k * 0.012, BONE, hdo("bone"));
        }
      }
      b.add("sphere", 2.7, 0, 0, 1.2, 1.0, 1.0, BONE, { hd: false });
      b.add("box", 2.95, 0.35, 0.25, 0.2, 0.2, 0.15, "#1c1917", { hd: false });
      b.add("box", 2.95, 0.35, -0.25, 0.2, 0.2, 0.15, "#1c1917", { hd: false });
      skull(add, 2.75, 0.32, 0, 1.25, BONE, Math.PI / 2, hdo("bone"));
      b.add("cone", 2.6, 0.7, 0.45, 0.2, 1.0, 0.2, BONE, { rx: 0.6, rz: -0.3, mat: "bone" });
      b.add("cone", 2.6, 0.7, -0.45, 0.2, 1.0, 0.2, BONE, { rx: -0.6, rz: -0.3, mat: "bone" });
      smoke(b, 2.7, 0.9, 0, 0.7, "#cbd5e1");
      bone(add, [-2.4, 0.1, 1.6], [-0.9, 0.1, 2.1], 0.2, BONE, hdo("bone"));
      bone(add, [0.6, 0.1, -1.9], [1.9, 0.1, -1.4], 0.18, BONE, hdo("bone"));
      for (const [x, z, w] of [
        [-2.4, 1.6, 0.9],
        [1.9, -1.4, 0.8],
        [-2.6, -0.4, 1.0]
      ]) {
        add("sphere", x, -0.25, z, w, 0.5, w * 0.7, "#d6b06a", hdo("hide"));
      }
      break;
    }
    case "wizard_tower": {
      // HD: stone courses round the tower, a brim under the pointed slate roof, sills and arches over the lit windows,
      // a strapped door, ivy climbing one side, a brass telescope on the parapet
      b.add("cyl", 0, 0, 0, 1.5, 4.6, 1.5, "#6b6f86", { mat: "stone" });
      b.add("cyl", 0, 4.6, 0, 1.8, 0.25, 1.8, "#4b5563", { mat: "stone" });
      b.add("cone", 0.1, 4.85, 0, 2.0, 2.2, 2.0, "#1e40af", { rz: 0.12, mat: "stone" });
      b.add("box", 0.95, 0, 0.4, 1.1, 1.2, 1.1, "#6b6f86", { mat: "stone", hdShape: "block" });
      b.add("pyramid", 0.95, 1.2, 0.4, 1.3, 0.7, 1.3, "#1e40af", { mat: "stone" });
      for (const y of [1.6, 2.8, 3.8]) b.add("box", 0, y, 0.74, 0.25, 0.4, 0.06, "#fde68a", { glow: true });
      b.add("sphere", 0, 7.6, 0, 0.6, 0.6, 0.6, "#a5f3fc", { glow: true });
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        b.add("octa", Math.cos(a) * 1.6, 3.2 + i * 0.9, Math.sin(a) * 1.6, 0.26, 0.4, 0.26, "#a5f3fc", { glow: true, idle: IDLE_KIND.spin, pivot: [0, 0], phase: 0.01 });
      }
      for (const y of [0.9, 2.2, 3.4]) add("cyl", 0, y, 0, 1.6, 0.08, 1.6, "#565a70", hdo("stone"));
      add("cyl", 0.23, 4.84, 0, 2.15, 0.06, 2.15, "#1e3a8a", hdo("stone", { rz: 0.12 }));
      for (const y of [1.6, 2.8, 3.8]) {
        add("box", 0, y - 0.07, 0.8, 0.36, 0.06, 0.12, "#4b5563", hdo("stone"));
        arc(add, [0, y + 0.4, 0.8], [1, 0, 0], [0, 1, 0], 0.16, 0, Math.PI, 4, 0.05, "#4b5563", hdo("stone"));
      }
      add("box", -0.4, 0, 0.65, 0.42, 0.78, 0.08, "#3f2a1a", hdo("wood", { ry: -0.55 }));
      for (const y of [0.2, 0.55]) add("box", -0.42, y, 0.68, 0.44, 0.04, 0.1, "#292524", hdo("iron", { ry: -0.55 }));
      const hr = mulberry32(6101);
      for (let i = 0; i < 9; i++) {
        const a = Math.PI + 0.6 + (hr() - 0.5) * 0.7;
        const y = 0.2 + i * 0.45;
        add("egg", Math.cos(a) * 0.76, y, Math.sin(a) * 0.76, 0.32, 0.36, 0.14, i % 2 ? "#3f6212" : "#4d7c0f", hdo("leaf", { ry: -a + Math.PI / 2 }));
      }
      break;
    }
    case "tavern": {
      // HD: posts and braces timbering the plaster ground floor, a jettied upper floor with shuttered windows, mullions
      // over the lit windows, a strapped door, the sign hung from a bracket with a mug on it, hooped barrels,
      // a bench and a lantern by the door
      b.add("box", 0, 0, 0, 2.8, 1.3, 2.0, "#efe3c8", { mat: "stone" });
      b.add("box", 0, 1.3, 0, 3.0, 1.1, 2.2, "#8b5a2b", { mat: "wood" });
      b.add("prism", 0, 2.4, 0, 3.3, 1.1, 2.5, "#7f1d1d", { mat: "wood" });
      b.add("box", 1.0, 2.4, -0.5, 0.35, 1.2, 0.35, "#6b7280", { mat: "stone", hdShape: "block" });
      smoke(b, 1.0, 3.7, -0.5, 0.9);
      b.add("box", 0, 0, 1.0, 0.6, 0.85, 0.06, "#3b2a1a", { mat: "wood" });
      for (const x of [-0.9, 0.9]) b.add("box", x, 0.5, 1.0, 0.4, 0.4, 0.06, "#fde68a", { glow: true });
      b.add("cyl", 1.7, 0, 1.4, 0.06, 1.6, 0.06, "#3b2a1a", { mat: "wood" });
      b.add("box", 1.7, 1.2, 1.7, 0.06, 0.5, 0.6, "#fbbf24", { idle: IDLE_KIND.flutter, mat: "wood", sync: 1 });
      for (const x of [-1.5, -1.0]) b.add("cyl", x, 0, 1.5, 0.4, 0.55, 0.4, "#7c4a24", { mat: "wood" });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add("box", sx * 1.4, 0, sz * 1.0, 0.14, 1.3, 0.14, "#3b2a1a", hdo("wood"));
      for (const sx of [-1, 1]) add("box", sx * 0.5, 0, 1.0, 0.1, 1.2, 0.1, "#3b2a1a", hdo("wood"));
      add("box", 0, 1.18, 1.05, 2.9, 0.12, 0.1, "#3b2a1a", hdo("wood"));
      for (const x of [-0.9, 0.9]) {
        add("box", x, 0.68, 1.06, 0.42, 0.04, 0.04, "#3b2a1a", hdo("wood"));
        add("box", x, 0.5, 1.06, 0.04, 0.4, 0.04, "#3b2a1a", hdo("wood"));
        add("box", x, 0.44, 1.07, 0.48, 0.05, 0.1, "#3b2a1a", hdo("wood"));
        // Upstairs: a window with its shutters open
        add("box", x, 1.65, 1.13, 0.34, 0.4, 0.06, "#1e293b", hdo("gem"));
        for (const sx of [-1, 1]) add("box", x + sx * 0.27, 1.63, 1.15, 0.17, 0.44, 0.04, "#14532d", hdo("wood"));
      }
      for (const y of [0.15, 0.6]) add("box", 0, y, 1.05, 0.56, 0.05, 0.08, "#292524", hdo("iron"));
      add("cyl", 1.0, 3.6, -0.5, 0.45, 0.08, 0.45, "#4b5563", hdo("stone"));
      along(add, "capsule", [-1.62, 3.48, 0], [1.62, 3.48, 0], 0.12, 0.12, "#5f1515", hdo("wood"));
      add("cyl", 1.7, 1.6, 1.4, 0.06, 0.2, 0.06, "#3b2a1a", hdo("wood"));
      along(add, "cyl", [1.7, 1.74, 1.36], [1.7, 1.74, 2.04], 0.05, 0.05, "#3b2a1a", hdo("wood"));
      // A mug through the sign, read from both sides
      add("cyl", 1.7, 1.32, 1.7, 0.16, 0.22, 0.16, "#78350f", hdo("wood", { idle: IDLE_KIND.flutter, sync: 1 }));
      add("cyl", 1.7, 1.52, 1.7, 0.17, 0.05, 0.17, "#f5f5f4", hdo("cloth", { idle: IDLE_KIND.flutter, sync: 1 }));
      for (const x of [-1.5, -1.0]) {
        for (const y of [0.1, 0.42]) add("cyl", x, y, 1.5, 0.44, 0.04, 0.44, "#57534e", hdo("dull"));
        add("cyl", x, 0.55, 1.5, 0.32, 0.03, 0.32, "#c69c6d", hdo("wood"));
      }
      add("box", 0.75, 0.32, 1.45, 0.9, 0.06, 0.26, "#78350f", hdo("wood"));
      for (const sx of [-1, 1]) add("box", 0.75 + sx * 0.38, 0, 1.45, 0.06, 0.32, 0.22, "#78350f", hdo("wood"));
      add("box", -0.55, 0.92, 1.08, 0.04, 0.04, 0.16, "#292524", hdo("iron"));
      lanternFrame(add, -0.55, 0.62, 1.16, 0.12, 0.2, "#292524", { mat: "iron" });
      add("sphere", -0.55, 0.65, 1.16, 0.09, 0.12, 0.09, "#fbbf24", hdo("plain", { glow: true }));
      break;
    }
    case "portal": {
      // HD: dressed runestones with a lit rune on each face, a swirl in the void, a stepped stone dais, the floating
      // shards cut gems
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        b.add("box", Math.cos(a) * 1.7, 1.9 + Math.sin(a) * 1.7 - 0.25, 0, 0.55, 0.5, 0.6, "#312e81", { rz: a, mat: "stone", hdShape: "block" });
        // A rune: a stave with two strokes off it
        const [rx, ry] = [Math.cos(a) * 1.7, 1.9 + Math.sin(a) * 1.7];
        const k = i % 2 ? 1 : -1;
        along(add, "capsule", [rx, ry - 0.13, 0.33], [rx, ry + 0.13, 0.33], 0.045, 0.045, "#a78bfa", hdo("plain", { glow: true }));
        for (const dy of [0.02, 0.1]) along(add, "capsule", [rx, ry + dy - 0.06, 0.33], [rx + k * 0.1, ry + dy, 0.33], 0.04, 0.04, "#a78bfa", hdo("plain", { glow: true }));
      }
      b.add("cyl", 0, 1.86, 0, 3.0, 0.08, 3.0, "#a855f7", { rx: Math.PI / 2, glow: true });
      b.add("box", 0, 0, 0, 3.6, 0.25, 1.4, "#1e1b4b", { mat: "stone", hdShape: "block" });
      for (let i = 0; i < 4; i++) {
        b.add("octa", range(rng, -2.6, 2.6), range(rng, 1, 3.5), range(rng, -1.5, 1.5), 0.4, 0.5, 0.4, "#4c1d95", { idle: IDLE_KIND.spin, pivot: [0, 0], phase: 0.01 + i * 1.6, mat: "gem" });
      }
      add("block", 0, 0, 1.0, 2.8, 0.14, 0.6, "#1e1b4b", hdo("stone"));
      // A swirl in the void: broken rings of paler light turning inward, on both faces
      for (const z of [-0.09, 0.09])
        for (let k = 0; k < 4; k++) arc(add, [0, 1.9, z], [1, 0, 0], [0, 1, 0], 0.35 + k * 0.3, k * 1.7, k * 1.7 + Math.PI * 1.2, 6 + k * 2, 0.05, k % 2 ? "#d8b4fe" : "#7c3aed", hdo("plain", { glow: true }));
      for (const sx of [-1, 1]) add("block", sx * 2.1, 0, 0.3, 0.6, 0.35, 0.5, "#312e81", hdo("stone", { ry: sx * 0.4 }));
      break;
    }
  }

  return out.parts;
}


/** Ground radius of the JSX / rig-modelled NPCs (bosses, the Nethergarde Core, the bandit king and the horror) */
const JSX_FOOTPRINT: Record<string, number> = { ruins: 2.6, "ruins-ascended": 3.4, "bandit-kingpin": 2.4, "mythic-singularity": 2.8 };
const BOSS_FOOTPRINT = 3.0;

const footprintCache = new Map<string, number>();

/**
 * Radius (at scale 1) that a model covers on the ground, so its rarity ring can sit just
 * outside it instead of being hidden underneath. Clamped so sprawling models keep a sane ring.
 */
export function npcFootprint(type: string, realmStage?: number): number {
  const key = realmStage === undefined ? type : `${type}:${realmStage}`;
  const cached = footprintCache.get(key);
  if (cached !== undefined) return cached;
  let r: number;
  if (hasNPCModel(type)) {
    r = 0;
    // A buffer realm's settlement grows with its stage (epic without one)
    const realm = realmStage === undefined ? undefined : ({ stage: realmStage } as MapNPC["realm"]);
    for (const p of buildNPCModel({ id: "fp", type, x: 0, z: 0, realm } as MapNPC)) {
      if (p.y - p.h / 2 > 0.6) continue; // only what touches the ground
      r = Math.max(r, Math.hypot(p.x, p.z) + Math.max(p.w, p.d) / 2);
    }
  } else {
    r = type.startsWith("boss-") ? BOSS_FOOTPRINT : JSX_FOOTPRINT[type] ?? 2.0;
  }
  // Legendary landmarks are the grandest sites: they may spread wider
  // Legendary landmarks are the grandest sites, and a realm's walls spread wide as it grows: they may spread wider
  r = Math.min(LEGENDARY_LANDMARK_TYPES.has(type) ? 5 : REALM_MODEL_TYPES.has(type) ? 5.6 : 3.4, Math.max(1.6, r));
  footprintCache.set(key, r);
  return r;
}
