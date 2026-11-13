import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { CivilizationType, CodexEntry, DeveloperKingdom, MapNPC, NPCRarity, RealmCycle } from "./types.js";
import { config } from "./env.js";
import { HORROR_KIT, NPC_GATE_CIV, NPC_KINGDOM_KITS, REALM_CYCLE, REGION_SAFE_FOR, bossUnitFor, npcKingdomKitFor, npcKitFor, realmLevelOn } from "./warConfig.js";
import { ARTS, INSTINCTS, kitLines, type UnitRarity } from "./battleArts.js";
import {
  BUFFER_OFFSET,
  BUFFER_RADIUS,
  CENTRE_CLEAR,
  FJORD_WATER,
  FOOTPRINT,
  FOOTPRINT_MARGIN,
  type Footprint,
  GATE_OFFSET,
  LANDMARK_STRIP,
  PLAY_HALF,
  PROVINCE_OFFSET,
  PROVINCE_SIZE,
  RIM_AREAS,
  ROVING_STRIP,
  VOIDRIFT_BAND,
  VOIDRIFT_KEEP_OUT,
  VOIDRIFT_RIM,
  VOID_GATE,
  VOIDRIFT_SIZE,
  WORLD_SCALE,
  WORLD_SIZE,
  footprintOf,
  onLand,
  roomAt,
  ws
} from "./worldGeometry.js";

/** A free realm's garrison kit as it grows stage by stage, one Codex line per civilization that may hold it */
function realmKitLines(region: string): string[] {
  const named = (id: string) => `${(INSTINCTS[id] ?? ARTS[id])?.emblem ?? ""} ${(INSTINCTS[id] ?? ARTS[id])?.name ?? id}`.trim();
  const civs = (REGION_SAFE_FOR[region] ?? []).filter((c) => c !== "arcane");
  return (civs.length ? civs : ["human" as const]).map((civ) => {
    const k = NPC_KINGDOM_KITS[civ];
    const name = civ[0].toUpperCase() + civ.slice(1);
    return `Garrison (${name}) · ${named(k.instincts[0])} (common), + ${named(k.arts[0])} (uncommon), + ${named(k.instincts[1])} (rare), + ${named(k.arts[1])} (epic)`;
  });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "../data");
const MAP_FILE = path.join(DATA_DIR, "world_map.json");
const REROLL_FILE = path.join(DATA_DIR, "roving_reroll.json");
/** The last good save of the map, kept beside it: a damaged world_map.json is restored from it, never re-rolled */
const MAP_BACKUP_FILE = path.join(DATA_DIR, "world_map.bak.json");
/** The spawns rolled for today, the current wave and the current roving window (see `keptSpawns`) */
const SPAWN_ROLLS_FILE = path.join(DATA_DIR, "spawn_rolls.json");

/**
 * Writes a data file whole or not at all: to a temp file beside it, then renamed over it, so a crash or a kill mid-write
 * never leaves it half written
 */
function writeFileAtomic(file: string, text: string) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text, "utf-8");
  fs.renameSync(tmp, file);
}

/** Saves the persistent map: the previous good save becomes the backup first */
function writeMapFile(map: FlatWorldMapData) {
  if (fs.existsSync(MAP_FILE)) {
    try {
      JSON.parse(fs.readFileSync(MAP_FILE, "utf-8"));
      fs.copyFileSync(MAP_FILE, MAP_BACKUP_FILE);
    } catch {
      // The file on disk is not a good save: keep the backup we have
    }
  }
  writeFileAtomic(MAP_FILE, JSON.stringify(map, null, 2));
}

/** Reads a file, trying again a few times when the read itself fails (a file lock on Windows, say) */
function readWithRetry(file: string): string {
  for (let i = 0; ; i++) {
    try {
      return fs.readFileSync(file, "utf-8");
    } catch (err) {
      if (i >= 4) throw err;
      const until = Date.now() + 50 * (i + 1);
      while (Date.now() < until) {
        /* a short wait before the next try */
      }
    }
  }
}

/**
 * The saved map, or null when there is none yet. A save that can't be parsed is set aside (world_map.corrupt-<time>.json)
 * and the backup takes its place; with no good backup it throws: the realm's layout is never silently rolled again.
 */
function loadSavedMap(): FlatWorldMapData | null {
  if (!fs.existsSync(MAP_FILE)) return null;
  const content = readWithRetry(MAP_FILE);
  try {
    return JSON.parse(content) as FlatWorldMapData;
  } catch (err) {
    const aside = path.join(DATA_DIR, `world_map.corrupt-${Date.now()}.json`);
    fs.renameSync(MAP_FILE, aside);
    console.error(`❌ world_map.json could not be read (${(err as Error).message}); set aside as ${path.basename(aside)}`);
    if (fs.existsSync(MAP_BACKUP_FILE)) {
      try {
        const backup = JSON.parse(fs.readFileSync(MAP_BACKUP_FILE, "utf-8")) as FlatWorldMapData;
        writeFileAtomic(MAP_FILE, JSON.stringify(backup, null, 2));
        console.warn("🗺️ The world map was restored from its last good save (world_map.bak.json)");
        return backup;
      } catch {
        /* the backup is no good either */
      }
    }
    throw new Error(`world_map.json is damaged and there is no good backup: it was set aside as ${path.basename(aside)}. Restore it by hand, or delete it to roll a new realm.`, { cause: err });
  }
}

/**
 * Spawns are rolled once and kept: today's resource nodes, the current wave and the current roving window. They are
 * placed against the castles as they stand when first rolled, so a castle that moves later (a civilization swap, an
 * ascension, a new ruler) never moves them or turns them into something else under the same id. Only the current day
 * and windows are kept (scripts asking about other windows get them rolled fresh, and keep nothing).
 */
type SpawnRollKind = "daily" | "wave" | "roving";
let spawnRolls: Partial<Record<SpawnRollKind, { key: string; npcs: MapNPC[] }>> | null = null;

function loadSpawnRolls() {
  if (!spawnRolls) {
    try {
      spawnRolls = JSON.parse(fs.readFileSync(SPAWN_ROLLS_FILE, "utf-8"));
    } catch {
      spawnRolls = {};
    }
  }
  return spawnRolls!;
}

function keptSpawns(kind: SpawnRollKind, key: string, current: boolean, roll: () => MapNPC[]): MapNPC[] {
  const rolls = loadSpawnRolls();
  const kept = rolls[kind];
  if (kept && kept.key === key) return kept.npcs;
  const npcs = roll();
  if (current) {
    rolls[kind] = { key, npcs };
    try {
      writeFileAtomic(SPAWN_ROLLS_FILE, JSON.stringify(rolls));
    } catch (err) {
      console.error("❌ Failed saving spawn_rolls.json:", err);
    }
  }
  return npcs;
}

/** The kept spawns standing now (today's nodes, this wave, this window): a castle that moves in keeps clear of them */
function keptSpawnsNow(now = Date.now()): MapNPC[] {
  const rolls = loadSpawnRolls();
  const out: MapNPC[] = [];
  if (rolls.daily?.key === utcDayOf(now)) out.push(...rolls.daily.npcs);
  if (rolls.wave?.key === waveKeyOf(now)) out.push(...rolls.wave.npcs);
  if (rolls.roving?.key === currentRovingWindow(now).key) out.push(...rolls.roving.npcs);
  return out;
}

/** Admin reset world: a new realm rolls its spawns afresh */
function forgetSpawnRolls() {
  spawnRolls = {};
  try {
    if (fs.existsSync(SPAWN_ROLLS_FILE)) fs.unlinkSync(SPAWN_ROLLS_FILE);
  } catch {
    // ignore
  }
}

const utcDayOf = (t: number) => new Date(t).toISOString().slice(0, 10);
const waveKeyOf = (now: number) => {
  const w = currentWaveWindow(now);
  return `${w.epoch}-r${w.reroll}`;
};

/** Roving encounters respawn with every harvest: SYNC_INTERVAL_MINUTES (default every 15 min) */
export const rovingWindowMinutes = () => Math.max(1, config.syncIntervalMinutes);
const rovingWindowMs = () => rovingWindowMinutes() * 60 * 1000;
/** A wave of resource nodes lasts two harvests: SYNC_INTERVAL_MINUTES × 2 (default every 30 min) */
export const waveWindowMinutes = () => Math.max(1, config.syncIntervalMinutes * 2);
const waveWindowMs = () => waveWindowMinutes() * 60 * 1000;

/** Admin rerolls of the current roving window; a new window always starts from reroll 0 */
let rovingReroll: { epoch: number; count: number } | null = null;

function loadReroll(): { epoch: number; count: number } {
  if (!rovingReroll) {
    try {
      rovingReroll = JSON.parse(fs.readFileSync(REROLL_FILE, "utf-8"));
    } catch {
      rovingReroll = { epoch: 0, count: 0 };
    }
  }
  return rovingReroll!;
}

/** Current roving-spawn window (every SYNC_INTERVAL_MINUTES × 2, aligned to the clock): changes on each respawn and admin reroll */
export function currentRovingWindow(now = Date.now()) {
  const windowMs = rovingWindowMs();
  const epoch = Math.floor(now / windowMs);
  const r = loadReroll();
  const reroll = r.epoch === epoch ? r.count : 0;
  return { epoch, reroll, key: `${epoch}-${reroll}`, nextRespawnAt: (epoch + 1) * windowMs, windowMinutes: rovingWindowMinutes() };
}

/** Admin: roll a fresh set of roving encounters for the current window (the regular respawns continue) */
export function rerollRovingSpawns() {
  const { epoch, reroll } = currentRovingWindow();
  rovingReroll = { epoch, count: reroll + 1 };
  writeFileAtomic(REROLL_FILE, JSON.stringify(rovingReroll));
  return currentRovingWindow();
}

export interface MapProvince {
  civilization: CivilizationType;
  name: string;
  theme: string;
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
  color: string;
  groundColor: string;
  accentColor: string;
  shape: "valley" | "highland" | "archipelago" | "badlands" | "voidrift";
}

export interface MapBufferZone {
  id: string;
  type: "sea" | "desert" | "forest" | "mountains";
  name: string;
  x: number;
  z: number;
  radius: number;
  description: string;
}

export interface FlatWorldMapData {
  seed: number;
  width: number;
  depth: number;
  provinces: Record<CivilizationType, MapProvince>;
  kingdomPlacements: Record<string, { x: number; z: number }>;
  bufferZones: MapBufferZone[];
  npcs: MapNPC[];
  /** Layout version of the persistent NPCs; older saves are re-laid out on load */
  npcLayoutVersion?: number;
  /** Layout version of the castle plots; older saves lay every castle out afresh once */
  castleLayoutVersion?: number;
  /** The world scale the map's coordinates were laid out at (absent: before the realm grew, scale 1) */
  worldScale?: number;
  /**
   * Where the scenery sites stand (taverns, caravans, towers: one per `SCENERY_PER_RULERS` rulers). The server picks the
   * spots, so every spawn keeps clear of them; the client builds a site fitting its ground on each.
   */
  scenery?: MapPoint[];
  /** The epic landmarks' weekly rotation (absent on maps saved before it: they are upgraded in place on load) */
  landmarks?: LandmarkRotationState;
  /** Each buffer zone's realm cycle (absent on maps saved before it: the standing realms join the current cycle) */
  realms?: Record<string, RealmSlot>;
}

/** Bump whenever the castle plot rules change so every castle is laid out afresh once */
const CASTLE_LAYOUT_VERSION = 5;

/** Bump whenever persistent NPC placement or types change so saved maps get re-laid out */
const NPC_LAYOUT_VERSION = 7;

/**
 * Footprint sampling: tries `tries` candidates and returns the first that stays on the board, clear of the Core, on dry
 * land (unless `water`: a crew afloat) and clear of every footprint in `occupied` by both radii plus the margin. When
 * none fits it returns null: a spawn is skipped rather than stacked on another (a layer's count is a target).
 */
function pickSpacedPoint(
  occupied: Footprint[],
  candidate: () => { x: number; z: number },
  r: number,
  opts: { tries?: number; water?: boolean } = {}
): { x: number; z: number } | null {
  const tries = opts.tries ?? 60;
  for (let i = 0; i < tries; i++) {
    const c = candidate();
    if (Math.abs(c.x) > PLAY_HALF || Math.abs(c.z) > PLAY_HALF || Math.hypot(c.x, c.z) < CENTRE_CLEAR) continue;
    if (!opts.water && !onLand(c.x, c.z)) continue;
    if (roomAt(occupied, c.x, c.z, r) >= 0) return c;
  }
  return null;
}

/** Spawns skipped for want of room, per layer, in the last window built (`npm run check:map` and debug logs read it) */
export const skippedSpawns: Record<string, number> = {};
let skipLogKey = "";
function noteSkipped(layer: string, n: number, key: string) {
  skippedSpawns[layer] = n;
  if (n > 0 && process.env.NODE_ENV !== "production" && skipLogKey !== `${layer}:${key}`) {
    skipLogKey = `${layer}:${key}`;
    console.debug(`🗺️ ${n} ${layer} spawn${n === 1 ? "" : "s"} skipped for want of room (${key})`);
  }
}

/**
 * Things on the map other modules own (the Voidrift slots' void kingdoms, Xal'Vorath), as footprints at a moment:
 * registered by those modules so the generator never has to import them. `stable` sources are fixed for the day (the
 * daily nodes keep clear of them); the rest move (only the window's roving spawns keep clear of them, as they stood
 * when the window began).
 */
type OccupantSource = { stable: boolean; at: (now: number) => Footprint[] };
const occupantSources: OccupantSource[] = [];
export function registerMapOccupants(stable: boolean, at: (now: number) => Footprint[]) {
  occupantSources.push({ stable, at });
}
const registeredOccupants = (now: number, stable: boolean) => occupantSources.filter((s) => s.stable === stable).flatMap((s) => s.at(now));

// 5 Equal-area provinces with radically distinct terrain themes and shapes
export const PROVINCE_CONFIG: Record<CivilizationType, MapProvince> = {
  human: {
    civilization: "human",
    name: "Valorian Heartlands",
    theme: "Fertile river plains, stone roadways, and royal agricultural estates",
    centerX: -PROVINCE_OFFSET,
    centerZ: PROVINCE_OFFSET,
    width: PROVINCE_SIZE,
    depth: PROVINCE_SIZE,
    color: "#166534",
    groundColor: "#15803d",
    accentColor: "#2563eb",
    shape: "valley"
  },
  elf: {
    civilization: "elf",
    name: "Sylvandale Glades",
    theme: "Ancient silverwood canopies, emerald lagoons, and bioluminescent groves",
    centerX: -PROVINCE_OFFSET,
    centerZ: -PROVINCE_OFFSET,
    width: PROVINCE_SIZE,
    depth: PROVINCE_SIZE,
    color: "#065f46",
    groundColor: "#047857",
    accentColor: "#06b6d4",
    shape: "archipelago"
  },
  dwarf: {
    civilization: "dwarf",
    name: "Ironforge Highlands",
    theme: "Terraced basalt plateaus, snowy mountain fortresses, and smoking forge vents",
    centerX: PROVINCE_OFFSET,
    centerZ: -PROVINCE_OFFSET,
    width: PROVINCE_SIZE,
    depth: PROVINCE_SIZE,
    color: "#334155",
    groundColor: "#1e293b",
    accentColor: "#f97316",
    shape: "highland"
  },
  orc: {
    civilization: "orc",
    name: "Badlands of Drak'mar",
    theme: "Arid red-rock mesas, cracked clay canyons, and spiked war barricades",
    centerX: PROVINCE_OFFSET,
    centerZ: PROVINCE_OFFSET,
    width: PROVINCE_SIZE,
    depth: PROVINCE_SIZE,
    color: "#78350f",
    groundColor: "#92400e",
    accentColor: "#dc2626",
    shape: "badlands"
  },
  arcane: {
    civilization: "arcane",
    name: "Nethergarde Voidrift",
    theme: "Levitating obsidian monoliths hovering over a deep glowing crystalline rift",
    centerX: 0,
    centerZ: 0,
    width: VOIDRIFT_SIZE,
    depth: VOIDRIFT_SIZE,
    color: "#1e1b4b",
    groundColor: "#312e81",
    accentColor: "#c084fc",
    shape: "voidrift"
  }
};

// Rich buffer zones gating the civilizations
export const BUFFER_ZONES: MapBufferZone[] = [
  {
    id: "buf-sea-fjord",
    type: "sea",
    name: "The Sunken Fjord",
    x: 0,
    z: -BUFFER_OFFSET,
    radius: BUFFER_RADIUS,
    description: "Deep azure waterways with submerged coral reefs separating Sylvandale and Ironforge."
  },
  {
    id: "buf-scorch-desert",
    type: "desert",
    name: "The Scorchwind Expanse",
    x: 0,
    z: BUFFER_OFFSET,
    radius: BUFFER_RADIUS,
    description: "Shifting golden dunes, sandstone arches, and dry cracked canyons separating Valoria and Drak'mar."
  },
  {
    id: "buf-whisper-woods",
    type: "forest",
    name: "The Whispering Deepwood",
    x: -BUFFER_OFFSET,
    z: 0,
    radius: BUFFER_RADIUS,
    description: "Dense, mist-shrouded ancient redwood forest gating the human valleys from elven sanctuaries."
  },
  {
    id: "buf-dragon-peaks",
    type: "mountains",
    name: "The Dragonspine Peaks",
    x: BUFFER_OFFSET,
    z: 0,
    radius: BUFFER_RADIUS,
    description: "Colossal jagged snowy mountain ridge forming a natural barrier between dwarves and orcs."
  }
];

/* -------------------------------------------------------------------------- */
/* Deterministic pseudo-random number generator for seeded world elements     */
/* -------------------------------------------------------------------------- */
function createPrng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* -------------------------------------------------------------------------- */
/* BUFFER ZONE CANDIDATE POOLS (Bosses, Kingdoms, Terrain Landmarks)         */
/* -------------------------------------------------------------------------- */

interface BufferDefinition {
  bosses: Array<{ name: string; type: string; emblem: string; subtitle: string; description: string }>;
  kingdoms: Array<{ name: string; type: string; emblem: string; subtitle: string; description: string }>;
  terrains: Array<{ name: string; type: string; emblem: string; subtitle: string; description: string }>;
}

/**
 * One permanent legendary landmark at the heart of each mortal province, in its civilization's style, as the Nethergarde
 * Core is the heart of the Voidrift. `dx` / `dz` nudge it off the exact centre where the ground asks for it (Valoria's
 * river runs through its centre). Castles keep clear of its footprint (`FOOTPRINT.legendary`).
 */
const LEGENDARY_LANDMARKS: Partial<Record<CivilizationType, { name: string; type: string; emblem: string; subtitle: string; description: string; dx?: number; dz?: number }>> = {
  human: {
    name: "The Cathedral of the Dawn Banner",
    type: "lm-dawn-cathedral",
    emblem: "⛪",
    subtitle: "Where the First King Raised His Standard",
    description:
      "A white-stone cathedral under blue slate roofs on a green hill beside Valoria's river, its bell tower crowned by a turning golden sun. Before its doors the First King still raises the Dawn Banner, under which every village once marched as one, and every knight of Valoria is sworn in beneath it.",
    dx: ws(5)
  },
  elf: {
    name: "The Heart-Oak",
    type: "lm-heart-oak",
    emblem: "🌳",
    subtitle: "The First Tree of Sylvandale",
    description:
      "The oldest living thing in the realm: a vast oak whose roots hold up the forest floor and whose hollow heart glows with green fire. Wisps circle its crown, and the elves say every glade grew from one of its acorns."
  },
  dwarf: {
    name: "The Anvil of the Gods",
    type: "lm-anvil-of-gods",
    emblem: "⚒️",
    subtitle: "Where the World Was Forged",
    description:
      "A mountain plateau crowned by an anvil the size of a keep, with a god's hammer hovering above it and rivers of forge-fire running down the rock. Every dwarven clan swears its first blade was struck here."
  },
  orc: {
    name: "The Bloodfire Throne",
    type: "lm-bloodfire-throne",
    emblem: "💀",
    subtitle: "Seat of the First Warchief",
    description:
      "A colossal throne hewn from a titan's skull on a red mesa, where the bones of the first Warchief still sit with his war-axe raised. War drums ring it, totems burn on every side, and every warband of Drak'mar swears its oaths here before it marches."
  }
};


const BUFFER_POOLS: Record<string, BufferDefinition> = {
  "buf-sea-fjord": {
    bosses: [
      {
        name: "Leviathan Kraken Lord",
        type: "boss-kraken",
        emblem: "🐙",
        subtitle: "Abyssal Scourge of the Fjord",
        description: "Colossal multi-tentacled sea terror that drags war galleons into the abyss. Its thrashing stirs tidal whirlpools."
      },
      {
        name: "Dagon Tsunami Sovereign",
        type: "boss-leviathan",
        emblem: "🌊",
        subtitle: "Tide Monarch of the Deeps",
        description: "An ancient primordial sea serpent coiled beneath oceanic trenches, wielding torrential tidal storms."
      },
      {
        name: "Siren Broodmother",
        type: "boss-siren",
        emblem: "🧜‍♀️",
        subtitle: "Empress of the Drowned Chasm",
        description: "Winged siren queen whose ultrasonic screech shatters hull timbers, charms scout crews, and summons razor shoals."
      }
    ],
    kingdoms: [
      {
        name: "Corsair Sovereign Citadel",
        type: "bk-corsair-citadel",
        emblem: "🏴‍☠️",
        subtitle: "Pirate Lord High Stronghold",
        description: "A fortified naval citadel built atop volcanic sea pillars where the Freebooter Lords govern the trade channels."
      },
      {
        name: "Port Royale Freebooters",
        type: "bk-port-royale",
        emblem: "⚓",
        subtitle: "Autonomous Corsair Anchorage",
        description: "A sprawling floating haven of galleons, rope bridges, and privateer taverns trading salvaged treasures."
      },
      {
        name: "High-Tide Merfolk Enclave",
        type: "bk-merfolk-enclave",
        emblem: "🔱",
        subtitle: "Coral Sanctuary of the Depths",
        description: "A glowing undersea citadel carved into bioluminescent reefs, home to the elusive Tide-Callers."
      }
    ],
    terrains: [
      {
        name: "Wreck of the Kraken's Folly",
        type: "lm-shipwreck",
        emblem: "⛵",
        subtitle: "Sunken Corsair Galleon",
        description: "A corsair galleon holed on the reef and listing in the shallows, its sails in tatters, barnacles on its cannons and a lantern still lit in the stern. Casks drift round it, and sea-lanterns circle the wreck at night."
      },
      {
        name: "Luminescent Coral Trench",
        type: "lm-coral-trench",
        emblem: "🪸",
        subtitle: "Glowing Abyssal Fissure",
        description: "A deep nautical fissure pulsing with neon sea anemones and pearls of celestial tide magic."
      },
      {
        name: "Atlantis Sunken Spire",
        type: "lm-atlantis-spire",
        emblem: "🏺",
        subtitle: "Drowned Archaic Monolith",
        description: "A colossal basalt obelisk rising just below the surface, etched with forgotten oceanic runes."
      },
      {
        name: "Siren Pearl Lagoon",
        type: "lm-pearl-lagoon",
        emblem: "🪨",
        subtitle: "Singing Crystal Shoals",
        description: "Sun-drenched sea rocks adorned with rare giant oyster beds and singing sirens."
      },
      {
        name: "The Drowned Lighthouse of Saltmere",
        type: "lm-drowned-lighthouse",
        emblem: "🗼",
        subtitle: "A Lamp That Never Went Out",
        description: "A great red-and-white lighthouse that slid off its cliff in a storm and now leans out of the fjord on the reef. Its lamp still burns green and still turns, and fishermen swear it sweeps toward wherever the Kraken is rising."
      },
      {
        name: "The Leviathan's Jaw",
        type: "lm-leviathan-arch",
        emblem: "🐋",
        subtitle: "Whalebone Arch over the Tide",
        description: "The jawbones of a sea-titan rise out of the fjord in two white arches high enough for a galleon to sail through. Sailors hang charms from its crown for a safe return, and sea-lanterns drift between its teeth."
      }
    ]
  },

  "buf-scorch-desert": {
    bosses: [
      {
        name: "Great Sandworm Ouroboros",
        type: "boss-sandworm",
        emblem: "🪱",
        subtitle: "Dune World Devourer",
        description: "A gigantic armored colossus tunneling through golden dunes, devouring entire desert caravans in a single breach."
      },
      {
        name: "Anubis Sunken Sphinx",
        type: "boss-sphinx",
        emblem: "🏺",
        subtitle: "Cursed Pharaoh Guardian",
        description: "Enormous sandstone sphinx animated by ancient solar curses, firing incinerating solar beams from its emerald eyes."
      },
      {
        name: "Dune Colossus Behemoth",
        type: "boss-scorpion",
        emblem: "🦂",
        subtitle: "Scorpion Titan of the Wastes",
        description: "Obsidian-plated scorpion monstrosity with twin crushing claws and venomous stings that melt plate armor."
      }
    ],
    kingdoms: [
      {
        name: "Nomad Dune Confederacy",
        type: "bk-nomad-pavilions",
        emblem: "🏕️",
        subtitle: "Sovereign Desert Caravan Union",
        description: "A nomadic empire of silk pavilion cities that moves with the celestial constellations across the dunes."
      },
      {
        name: "Sultanate of the Brass Mirage",
        type: "bk-brass-sultanate",
        emblem: "🕌",
        subtitle: "Gilded Oasis Empire",
        description: "A gleaming oasis fortress city with brass domes, spice bazaars, and elite camel cavalry."
      },
      {
        name: "Sandstrider Republic",
        type: "bk-sandstrider",
        emblem: "🦅",
        subtitle: "Dune Ranger Federation",
        description: "Desert scavengers and skiff-riders guarding ancient subterranean waterways beneath the sand."
      }
    ],
    terrains: [
      {
        name: "Mirage Palm Oasis",
        type: "lm-palm-oasis",
        emblem: "🌴",
        subtitle: "Sacred Desert Springs",
        description: "Crystal clear desert spring surrounded by date palms, ancient stone obelisks, and traveler caravans."
      },
      {
        name: "Great Obsidian Pyramid",
        type: "lm-obsidian-pyramid",
        emblem: "🔺",
        subtitle: "Tomb of the Sun God",
        description: "A monolithic black glass pyramid reflecting blinding sunlight, humming with dormant planetary energy."
      },
      {
        name: "Titan Beast Skeleton",
        type: "lm-titan-skeleton",
        emblem: "🦴",
        subtitle: "Fossilized Leviathan Ribs",
        description: "Vast bleached ribcage of an ancient prehistoric beast protruding high above the shifting sands."
      },
      {
        name: "Sunken Sandstone Canyon",
        type: "lm-sandstone-canyon",
        emblem: "🏜️",
        subtitle: "Echoing Wind Gorge",
        description: "Dramatic windswept canyon carved by centuries of gale storms, exposing veins of quartz and gold."
      },
      {
        name: "Temple of the Burning Disc",
        type: "lm-sun-temple",
        emblem: "🛕",
        subtitle: "Colonnade of the Sun Priests",
        description: "A columned sandstone temple on a stepped platform, crowned by a golden sun disc that turns with the day. Braziers burn at its steps, obelisks flank it, and the priests' gong carries for miles across the dunes."
      },
      {
        name: "Valley of the Sleeping Kings",
        type: "lm-tomb-of-kings",
        emblem: "🗿",
        subtitle: "Colossi Carved in the Cliff",
        description: "Four seated stone kings carved into a red cliff guard a dark doorway under a band of golden glyphs. Torches burn in their laps, their painted eyes still watch the sand, and the bones of tomb robbers lie at their feet."
      }
    ]
  },

  "buf-whisper-woods": {
    bosses: [
      {
        name: "Elder Treant Heartwood",
        type: "boss-treant",
        emblem: "🌳",
        subtitle: "Wrath of the Deepwood",
        description: "A millennium-old sentient ironwood behemoth awakening roots to crush trespassers under colossal trunk blows."
      },
      {
        name: "Fenrir Shadow Wolf Packlord",
        type: "boss-wolf",
        emblem: "🐺",
        subtitle: "Eclipse Stalker of the Glades",
        description: "Colossal dire wolf that steps through misty shadows and commands phantom packs to encircle prey."
      },
      {
        name: "Queen of the Fae Court",
        type: "boss-fae",
        emblem: "🧚",
        subtitle: "Sylvan Thorn Sovereign",
        description: "Fickle arch-fae empress commanding bramble storms, illusions, and piercing thorn magic."
      }
    ],
    kingdoms: [
      {
        name: "Sylvan Ranger Barony",
        type: "bk-ranger-barony",
        emblem: "🏹",
        subtitle: "Canopy Archery Bastion",
        description: "A treetop kingdom of suspended ropebridges, watchtowers, and legendary longbow rangers."
      },
      {
        name: "Dryad Principality",
        type: "bk-dryad-court",
        emblem: "🍃",
        subtitle: "Living Wood Sanctuary",
        description: "A flourishing hollow of living elder trees intertwined into royal throne chambers and floral gardens."
      },
      {
        name: "Greenwood Hermit Bastion",
        type: "bk-greenwood-bastion",
        emblem: "🏰",
        subtitle: "Druidic Woodfort",
        description: "A mossy timber fortress sworn to protect the boundary between mortal kingdoms and primal nature."
      }
    ],
    terrains: [
      {
        name: "Stonehenge of the Leyline",
        type: "lm-stonehenge",
        emblem: "🌿",
        subtitle: "Ancient Druidic Megalith",
        description: "Colossal mossy standing stones channeling the harmonic energies of the ancient world tree."
      },
      {
        name: "World Tree Hollow",
        type: "lm-world-tree",
        emblem: "🪵",
        subtitle: "Great Hollow Heartwood",
        description: "The cavernous trunk of a fallen ancient titan tree, now a sheltered resting haven filled with glow-shrooms."
      },
      {
        name: "Fairy Mushroom Megalith",
        type: "lm-mushroom-megalith",
        emblem: "🍄",
        subtitle: "Enchanted Fae Ring",
        description: "A circular cluster of gargantuan luminescent mushroom caps that release starry pollen into the mist."
      },
      {
        name: "Blackwood Bandit Den",
        type: "lm-bandit-stockade",
        emblem: "🗡️",
        subtitle: "Rogue Forest Fort",
        description: "A fortified timber log stockade hidden deep in the misty pine hollows."
      },
      {
        name: "The Moonwell Shrine",
        type: "lm-moonwell",
        emblem: "⛲",
        subtitle: "Silver Pool of the Glade",
        description: "A round pool of silver water ringed by white arches, each hung with a moon-lantern. A stone stag stands over the water where the druids leave their offerings, and moonmoths circle it all night."
      },
      {
        name: "The Grove of Whispering Spirits",
        type: "lm-spirit-grove",
        emblem: "🎐",
        subtitle: "Lantern Shrine of the Old Gods",
        description: "Pale birches hung with paper lanterns ring a red-pillared shrine under a sweeping roof, with a red gate before it. Little glowing spirits drift between the trees, and travellers leave rice and coins at its offering stone."
      }
    ]
  },

  "buf-dragon-peaks": {
    bosses: [
      {
        name: "Ignis Molten Greatwyrm",
        type: "boss-dragon",
        emblem: "🐉",
        subtitle: "Apex Dragon of the Caldera",
        description: "Massive volcanic dragon roosting on Mount Ignis, breathing liquid magma, firestorms, and molten slag."
      },
      {
        name: "Frost Titan Yeti Chieftain",
        type: "boss-yeti",
        emblem: "❄️",
        subtitle: "Monarch of the Blizzard Peak",
        description: "Gigantic frost-furred brute wielding a glacier club that freezes the ground on impact."
      },
      {
        name: "Gorgon Stonecrusher",
        type: "boss-gorgon",
        emblem: "🗿",
        subtitle: "Chasm Basilisk Colossus",
        description: "Subterranean four-armed stone giant that crushes boulders into lethal shrapnel avalanches."
      }
    ],
    kingdoms: [
      {
        name: "Basalt Forgehold Keep",
        type: "bk-forgehold",
        emblem: "⚒️",
        subtitle: "High Mountain Bastion",
        description: "A sheer cliff fortress cut into volcanic basalt, home to master smiths and siege weapon engineers."
      },
      {
        name: "Thunderpeak Clan Bastion",
        type: "bk-thunderpeak",
        emblem: "⚡",
        subtitle: "Stormforged Peak Enclave",
        description: "High-altitude stone fortresses harnessing lightning rod towers to charge runic batteries."
      },
      {
        name: "Dragon-Rider Eyrie",
        type: "bk-rider-eyrie",
        emblem: "🪶",
        subtitle: "High Aerodrome Keep",
        description: "A precipitous mountain spire where tamers breed and train mountain drakes for aerial combat."
      }
    ],
    terrains: [
      {
        name: "Mount Ignis Caldera",
        type: "lm-ignis-caldera",
        emblem: "🌋",
        subtitle: "Raging Lava Cone & Dragon Roost",
        description: "Towering volcanic peak with bubbling molten lava channels, sulfur vents, and wyvern roosts."
      },
      {
        name: "The Deep Iron Delve",
        type: "lm-iron-delve",
        emblem: "⛏️",
        subtitle: "Subterranean Forge Mine",
        description: "Ancient minecart rails leading into cavernous basalt tunnels filled with raw veins of iron and mithril."
      },
      {
        name: "Glacial Wyrm Peak",
        type: "lm-glacial-peak",
        emblem: "🏔️",
        subtitle: "Perpetual Frost Glacier",
        description: "A sheer glacier peak capped with eternal permafrost and glowing blue ice caves."
      },
      {
        name: "Basalt Pillar Gorge",
        type: "lm-basalt-gorge",
        emblem: "🪨",
        subtitle: "Hexagonal Giant Causeway",
        description: "Spectacular hexagonal basalt stone pillars soaring hundreds of feet above a geothermal river."
      },
      {
        name: "The Giants' Forge",
        type: "lm-giants-forge",
        emblem: "🔥",
        subtitle: "Abandoned Titan Smithy",
        description: "A forge built for hands ten times a dwarf's: a hearth that still glows, bellows the size of a house, and a half-forged blade cooling on an anvil the giants never came back for. Its chimney smokes day and night, and rune pillars keep the fire fed."
      },
      {
        name: "The Old King's Skybridge",
        type: "lm-sky-bridge",
        emblem: "🌉",
        subtitle: "Carved Bridge Between the Peaks",
        description: "A carved stone bridge leaping between two snowy crags, lit by rune-lamps and guarded at either end by dwarf statues with their hammers raised. A waterfall pours out beneath it into the valley, and eagles wheel over the span."
      }
    ]
  }
};

/**
 * Builds the persistent trinity (Boss + Kingdom + Terrain) for each buffer zone,
 * along with the central Nethergarde Core and boundary gates.
 */
function generatePersistentBufferNPCs(seed: number): MapNPC[] {
  const prng = createPrng(seed);
  const npcs: MapNPC[] = [];

  for (const bz of BUFFER_ZONES) {
    const pool = BUFFER_POOLS[bz.id];
    if (!pool) continue;

    // 1. Boss Monster (1 selected of 3 candidates)
    const bossIdx = Math.floor(prng() * pool.bosses.length);
    const activeBoss = pool.bosses[bossIdx];

    // 2. Kingdom-like NPC
    const kIdx = Math.floor(prng() * pool.kingdoms.length);
    const kDef = pool.kingdoms[kIdx];

    // 3. Terrain Landmark
    const tIdx = Math.floor(prng() * pool.terrains.length);
    const tDef = pool.terrains[tIdx];

    // Organic small jitter [-1.5, 1.5]
    const jx = () => (prng() * 3 - 1.5) * WORLD_SCALE;
    const jz = () => (prng() * 3 - 1.5) * WORLD_SCALE;

    // Triangle layout: boss in the buffer centre, kingdom and landmark toward the outer sea edge,
    // splayed sideways. Keeps ≥14 units between the three and clear of the province kingdom rings.
    const r1 = (v: number) => Math.round(v * 10) / 10;
    const horizontal = Math.abs(bz.x) < 5; // Fjord / Scorchwind run along X; Deepwood / Dragonspine along Z
    const outX = horizontal ? 0 : Math.sign(bz.x) * ws(12);
    const outZ = horizontal ? Math.sign(bz.z) * ws(12) : 0;
    const sideX = horizontal ? ws(8) : 0;
    const sideZ = horizontal ? 0 : ws(8);

    const bossX = r1(bz.x + jx());
    const bossZ = r1(bz.z + jz());
    const kX = r1(bz.x + outX - sideX + jx());
    const kZ = r1(bz.z + outZ - sideZ + jz());
    const tX = r1(bz.x + outX + sideX + jx());
    const tZ = r1(bz.z + outZ + sideZ + jz());

    npcs.push({
      id: `boss-${bz.id}`,
      name: activeBoss.name,
      type: activeBoss.type,
      category: "boss",
      rarity: "legendary",
      emblem: activeBoss.emblem,
      subtitle: activeBoss.subtitle,
      description: activeBoss.description,
      x: bossX,
      z: bossZ,
      region: bz.name,
      bossIndex: bossIdx,
      bossRotationPool: pool.bosses
    });

    npcs.push({
      id: `kingdom-${bz.id}`,
      name: kDef.name,
      type: kDef.type,
      category: "kingdom",
      rarity: "epic",
      emblem: kDef.emblem,
      subtitle: kDef.subtitle,
      description: kDef.description,
      x: kX,
      z: kZ,
      region: bz.name
    });

    npcs.push({
      id: epicIdOf(bz.id, tDef.type),
      name: tDef.name,
      type: tDef.type,
      category: "terrain",
      rarity: "epic",
      emblem: tDef.emblem,
      subtitle: tDef.subtitle,
      description: tDef.description,
      x: tX,
      z: tZ,
      region: bz.name
    });

  }

  // The legendary landmark at the heart of each mortal province (fixed: no draw, no jitter, so it never moves)
  for (const [civ, def] of Object.entries(LEGENDARY_LANDMARKS) as Array<[CivilizationType, NonNullable<(typeof LEGENDARY_LANDMARKS)[CivilizationType]>]>) {
    const p = PROVINCE_CONFIG[civ];
    const { dx = 0, dz = 0, ...legend } = def;
    npcs.push({ id: `legend-${civ}`, ...legend, category: "terrain", rarity: "legendary", x: p.centerX + dx, z: p.centerZ + dz, region: p.name });
  }

  // Central Core & Landmark Gates
  npcs.push(
    {
      id: "npc-void-monolith",
      name: "The Nethergarde Core",
      type: "ruins",
      category: "terrain",
      rarity: "legendary",
      emblem: "🔮",
      subtitle: "Floating Arcane Monolith",
      description: "A giant octagonal dark-matter runestone levitating above an infinite crystalline abyss.",
      x: 0,
      z: 0,
      region: "Nethergarde Voidrift"
    },
    {
      id: "npc-gate-valoria",
      name: "The Imperial High Gate",
      type: "gate-human",
      category: "kingdom",
      rarity: "rare",
      emblem: "🏰",
      subtitle: "Fortified Border Bastion",
      description: "A massive twin-towered dressed-stone fortress arch controlling the mountain road into Valoria.",
      x: -GATE_OFFSET,
      z: GATE_OFFSET,
      region: "Valoria Frontier"
    },
    {
      id: "npc-gate-drakmar",
      name: "The Tusked War Pass",
      type: "gate-orc",
      category: "kingdom",
      rarity: "rare",
      emblem: "⚔️",
      subtitle: "Orcish Palisade Gate",
      description: "Towering mammoth tusks and sharpened logs guarding the canyon entrance to the Orc Badlands.",
      x: GATE_OFFSET,
      z: GATE_OFFSET,
      region: "Drak'mar Frontier"
    },
    {
      id: "npc-gate-sylvandale",
      name: "The Moonwood Arch",
      type: "gate-elf",
      category: "kingdom",
      rarity: "rare",
      emblem: "🌿",
      subtitle: "Living Elven Gate",
      description: "Two ancient trees grown into one arch over the road into Sylvandale, hung with moonstone lanterns and watched by rangers in the boughs.",
      x: -GATE_OFFSET,
      z: -GATE_OFFSET,
      region: "Sylvandale Frontier"
    },
    {
      id: "npc-gate-ironforge",
      name: "The Anvilhold Deepgate",
      type: "gate-dwarf",
      category: "kingdom",
      rarity: "rare",
      emblem: "⚒️",
      subtitle: "Rune-Carved Mountain Gate",
      description: "A great iron door cut into a rune-carved cliff on the road into Ironforge, guarded by two stone dwarves with their hammers raised.",
      x: GATE_OFFSET,
      z: -GATE_OFFSET,
      region: "Ironforge Frontier"
    }
  );

  return npcs;
}

/* -------------------------------------------------------------------------- */
/* DAILY RESOURCE SPAWNS (iron delve, quarry, herd, crops, rare gold mine...) */
/* -------------------------------------------------------------------------- */

interface ResourceTemplate {
  name: string;
  type: string;
  emblem: string;
  subtitle: string;
  description: string;
  rarity: NPCRarity;
  yield: Record<string, number>;
}

/** Spawn weight per rarity tier: a common race/resource is 25× likelier than a legendary one */
export const RARITY_WEIGHT: Record<NPCRarity, number> = {
  common: 50,
  uncommon: 28,
  rare: 14,
  epic: 6,
  legendary: 2,
  // Never rolled: only the overseers' horror is mythical
  mythical: 0
};

/** Picks a template with probability proportional to its rarity weight */
function pickWeighted<T extends { rarity: NPCRarity }>(prng: () => number, pool: T[]): T {
  const total = pool.reduce((s, t) => s + RARITY_WEIGHT[t.rarity], 0);
  let roll = prng() * total;
  for (const t of pool) {
    roll -= RARITY_WEIGHT[t.rarity];
    if (roll < 0) return t;
  }
  return pool[pool.length - 1];
}

/** Chance (0–1) that one pick from `pool` lands on `t` */
function pickChance<T extends { rarity: NPCRarity }>(pool: T[], t: T): number {
  const total = pool.reduce((s, p) => s + RARITY_WEIGHT[p.rarity], 0);
  return RARITY_WEIGHT[t.rarity] / total;
}

// One template per resource type; the rarity belongs to the resource itself
/** Resource nodes spawned each day: two in each of the 8 mortal provinces and buffer zones */
export const DAILY_RESOURCE_NODE_COUNT = 16;

const DAILY_RESOURCE_TEMPLATES: ResourceTemplate[] = [
  // Common
  {
    name: "Highland Pine Timber Camp",
    type: "res-timber",
    emblem: "🌲",
    subtitle: "Active Timber Mill",
    description: "Felled cedar and pine trunks processed by waterwheel saws for building scaffolding.",
    rarity: "common",
    yield: { lumber: 9000 }
  },
  {
    name: "Lush Grain Field",
    type: "res-grain",
    emblem: "🌾",
    subtitle: "Bountiful Golden Wheatfield",
    description: "Vast swaying fields of mature wheat and barley providing nourishment for the province armies.",
    rarity: "common",
    yield: { food: 10000 }
  },
  {
    name: "Highland Stone Quarry",
    type: "res-quarry",
    emblem: "🪨",
    subtitle: "Granite Excavation Site",
    description: "Freshly cut ashlar stone blocks ready for castle masonry and bastion fortifications.",
    rarity: "common",
    yield: { stone: 7000 }
  },

  // Uncommon
  {
    name: "Rich Iron Vein Mine",
    type: "res-iron",
    emblem: "⛏️",
    subtitle: "Subterranean Ore Gallery",
    description: "Lantern-lit mine shafts exposing dense seams of magnetic black iron, hauled out by ore cart.",
    rarity: "uncommon",
    yield: { iron: 10000 }
  },
  {
    name: "Highland Cattle Herd",
    type: "res-cattle",
    emblem: "🐄",
    subtitle: "Grazing Livestock Pasture",
    description: "Thriving herds of prized highland bulls and dairy cattle grazing upon lush clover valleys.",
    rarity: "uncommon",
    yield: { food: 15000 }
  },

  // Rare
  {
    name: "Gilded Vein Gold Mine",
    type: "res-gold",
    emblem: "🪙",
    subtitle: "High-Purity Aurum Cavern",
    description: "A rare glittering subterranean seam of natural gold nuggets and sparkling quartz.",
    rarity: "rare",
    yield: { gold: 300, iron: 5000 }
  },
  {
    name: "Royal Vineyard & Orchard",
    type: "res-vineyard",
    emblem: "🍇",
    subtitle: "Terraced Sunken Vineyard",
    description: "Prized vintages of royal nectar and sweet sun-ripened orchard fruits delivering feast bounties.",
    rarity: "rare",
    yield: { food: 20000, gold: 100 }
  },

  // Epic
  {
    name: "Starfall Mithril Chasm",
    type: "res-mithril",
    emblem: "💎",
    subtitle: "Meteorite Mithril Impact",
    description: "A deep impact crater where celestial mithril fused with bedrock, producing lightweight indestructible ore.",
    rarity: "epic",
    yield: { iron: 16000, stone: 16000, mithril: 2 }
  },
  {
    name: "Celestial Mana Crystal Geode",
    type: "res-mana",
    emblem: "🔮",
    subtitle: "Resonant Crystal Hollow",
    description: "Cavernous purple geodes humming with pure crystallized arcane mana and void luminescence.",
    rarity: "epic",
    yield: { stone: 14000, mana: 60 }
  },
  {
    name: "Golden Fleece Sheepfold",
    type: "res-fleece",
    emblem: "🐑",
    subtitle: "Mythical Golden Pasture",
    description: "Shimmering golden-fleeced sheep producing exquisite wool and sovereign bounties.",
    rarity: "epic",
    yield: { food: 24000, gold: 500 }
  },

  // Legendary
  {
    name: "Volcanic Dragonstone Core",
    type: "res-dragonstone",
    emblem: "🌋",
    subtitle: "Geothermal Obsidian Vent",
    description: "Extremely rare dragonstone crystals cooled from the deepest mantle of Mount Ignis.",
    rarity: "legendary",
    yield: { stone: 40000, gold: 900, ruby: 3 }
  },
  {
    name: "King's Motherlode Treasury Mine",
    type: "res-motherlode",
    emblem: "👑",
    subtitle: "Sovereign Gold Motherlode",
    description: "The fabled heart of the mountains: boundless solid gold veins and diamond geodes beyond measure.",
    rarity: "legendary",
    yield: { gold: 1200, iron: 20000, stone: 20000, diamond: 2 }
  }
];

export function generateDailyResourceSpawns(dateString?: string, occupied: Footprint[] = []): MapNPC[] {
  const d = dateString || new Date().toISOString().split("T")[0];
  let seed = 0;
  for (let i = 0; i < d.length; i++) seed = (seed * 31 + d.charCodeAt(i)) >>> 0;
  return placeResourceNodes(createPrng(seed), DAILY_RESOURCE_NODE_COUNT, [...occupied], (i) => `res-daily-${d}-${i}`, {}, `daily nodes ${d}`, HOME_REGIONS);
}

/** An area spawns may land in: a disc (a province or buffer zone's heart) or a rectangle (a stretch of the wild rim) */
interface SpawnArea {
  name: string;
  /** Square units of ground it covers */
  area: number;
  sample: (prng: () => number) => { x: number; z: number };
  contains: (x: number, z: number) => boolean;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** A ring round (cx, cz) from `inner` out to `inner + r` */
function discArea(name: string, cx: number, cz: number, r: number, inner = 5): SpawnArea {
  return {
    name,
    area: Math.PI * ((inner + r) ** 2 - inner ** 2),
    sample: (prng) => {
      const angle = prng() * Math.PI * 2;
      const dist = inner + prng() * r;
      return { x: r1(cx + Math.cos(angle) * dist), z: r1(cz + Math.sin(angle) * dist) };
    },
    contains: (x, z) => Math.hypot(x - cx, z - cz) <= inner + r
  };
}

/** A band round the Core from `rIn` to `rOut`, between angles a0 and a1 (radians, from +x toward +z) */
function ringArea(name: string, rIn: number, rOut: number, a0 = 0, a1 = Math.PI * 2): SpawnArea {
  const inArc = (a: number) => {
    const t = (((a - a0) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return t <= a1 - a0;
  };
  return {
    name,
    area: ((a1 - a0) / 2) * (rOut ** 2 - rIn ** 2),
    sample: (prng) => {
      const a = a0 + prng() * (a1 - a0);
      const r = Math.sqrt(rIn ** 2 + prng() * (rOut ** 2 - rIn ** 2));
      return { x: r1(Math.cos(a) * r), z: r1(Math.sin(a) * r) };
    },
    contains: (x, z) => {
      const r = Math.hypot(x, z);
      return r >= rIn && r <= rOut && inArc(Math.atan2(z, x));
    }
  };
}

function rectArea(name: string, x0: number, x1: number, z0: number, z1: number): SpawnArea {
  return {
    name,
    area: (x1 - x0) * (z1 - z0),
    sample: (prng) => ({ x: r1(x0 + prng() * (x1 - x0)), z: r1(z0 + prng() * (z1 - z0)) }),
    contains: (x, z) => x >= x0 && x <= x1 && z >= z0 && z <= z1
  };
}

/**
 * Where resource nodes grow: the 4 mortal provinces, the 4 buffer zones (none in the Voidrift, so Nethergarde never
 * gathers safely) and the 8 stretches of the wild rim (open frontier: no one's safe territory)
 */
const RESOURCE_REGIONS: SpawnArea[] = [
  ...(["human", "elf", "dwarf", "orc"] as CivilizationType[]).map((c) => discArea(PROVINCE_CONFIG[c].name, PROVINCE_CONFIG[c].centerX, PROVINCE_CONFIG[c].centerZ, ws(20))),
  ...BUFFER_ZONES.map((z) => discArea(z.name, z.x, z.z, ws(14))),
  ...RIM_AREAS.map((a) => rectArea(a.name, a.x0, a.x1, a.z0, a.z1)),
  // The Voidrift's open outer band, beyond its castles: no one's safe territory, so Nethergarde never gathers safely
  ringArea(PROVINCE_CONFIG.arcane.name, VOIDRIFT_RIM.inner, VOIDRIFT_RIM.outer)
];

/** The 4 mortal provinces and the 4 buffer zones: the first of the day's nodes go one to each (safe territory for someone) */
const HOME_REGIONS = RESOURCE_REGIONS.slice(0, 8);
/** Of a wave's nodes, this many go one each to home regions drawn at random; the rest go by free ground */
const WAVE_HOME_SHARE = 4;

/** Ground an area has left: its size less the footprints already standing in it */
function freeArea(a: SpawnArea, occupied: Footprint[]): number {
  let used = 0;
  for (const o of occupied) if (a.contains(o.x, o.z)) used += Math.PI * (o.r + 1) ** 2;
  return Math.max(0, a.area - used);
}

/**
 * A spot for one spawn among `areas`: an area drawn by how much free ground it has left (a filling region passes its
 * spawn to a roomier one, and the rim soaks up the overflow), then a clear spot in it. Null when none has room.
 */
function pickInAreas(prng: () => number, areas: SpawnArea[], occupied: Footprint[], r: number): { spot: { x: number; z: number }; area: SpawnArea } | null {
  const left = areas.map((a) => ({ a, w: freeArea(a, occupied) }));
  while (left.length) {
    const total = left.reduce((s, l) => s + l.w, 0);
    let roll = prng() * total;
    let i = 0;
    while (i < left.length - 1 && roll >= left[i].w) roll -= left[i++].w;
    const { a } = left[i];
    const spot = pickSpacedPoint(occupied, () => a.sample(prng), r, { tries: 40 });
    if (spot) return { spot, area: a };
    left.splice(i, 1);
  }
  return null;
}

/**
 * `count` resource nodes: a weighted template each, at a clear spot in a region drawn by its free ground, against
 * `occupied` (which gains every node placed)
 */
function placeResourceNodes(
  prng: () => number,
  count: number,
  occupied: Footprint[],
  idOf: (i: number) => string,
  extra: Partial<MapNPC> = {},
  layer = "resource nodes",
  home: SpawnArea[] = []
): MapNPC[] {
  const spawns: MapNPC[] = [];
  let skipped = 0;
  for (let i = 0; i < count; i++) {
    const tmpl = pickWeighted(prng, DAILY_RESOURCE_TEMPLATES);
    // The first nodes are each a home region's own (a clear spot inside it when there is one); the rest go by free ground
    const own = i < home.length ? pickInAreas(prng, [home[i]], occupied, FOOTPRINT.resource) : null;
    const pick = own ?? pickInAreas(prng, RESOURCE_REGIONS, occupied, FOOTPRINT.resource);
    if (!pick) {
      skipped++;
      continue;
    }
    const { spot, area } = pick;
    occupied.push({ ...spot, r: FOOTPRINT.resource });

    spawns.push({
      id: idOf(i),
      name: tmpl.name,
      type: tmpl.type,
      category: "resource",
      rarity: tmpl.rarity,
      emblem: tmpl.emblem,
      subtitle: tmpl.subtitle,
      description: tmpl.description,
      x: spot.x,
      z: spot.z,
      region: area.name,
      resourceYield: tmpl.yield,
      ...extra
    });
  }
  noteSkipped(layer.replace(/ \S+$/, ""), skipped, layer);
  return spawns;
}

/** Fresh resource nodes with every wave window (two harvests), anywhere there is room, gone when the window ends */
export const WAVE_RESOURCE_NODE_COUNT = 8;
/** Ids of a roving window's wave nodes (found among the roving spawns, not on the map) */
export const WAVE_NODE_PREFIX = "res-wave-";

/** The wave window `now` falls in (two harvests), with the admin reroll that applies to it */
export function currentWaveWindow(now = Date.now()) {
  const windowMs = waveWindowMs();
  const epoch = Math.floor(now / windowMs);
  const r = loadReroll();
  const reroll = Math.floor((r.epoch * rovingWindowMs()) / windowMs) === epoch ? r.count : 0;
  return { epoch, reroll, startsAt: epoch * windowMs, endsAt: (epoch + 1) * windowMs };
}

/**
 * A wave of resource nodes, seeded by its window (an admin reroll draws a fresh wave too) and spaced against
 * `occupied` (castles, landmarks, today's nodes, what moves as it stood when the wave began). The wave is placed
 * before the roving encounters, so it keeps its spots for both harvests; gatherers at work when it expires finish and
 * carry their whole load home.
 */
export function generateWaveResourceSpawns(occupied: Footprint[] = [], now = Date.now()): MapNPC[] {
  const { epoch, reroll, endsAt } = currentWaveWindow(now);
  const expiresAt = new Date(endsAt).toISOString();
  const prng = prngFor(`wave:${epoch}:${reroll}`);
  // Half the home regions get one of the wave's nodes each (a different half every wave), the rest go by free ground
  const home = [...HOME_REGIONS];
  for (let i = home.length - 1; i > 0; i--) {
    const j = Math.floor(prng() * (i + 1));
    [home[i], home[j]] = [home[j], home[i]];
  }
  return placeResourceNodes(prng, WAVE_RESOURCE_NODE_COUNT, [...occupied], (i) => `${WAVE_NODE_PREFIX}${epoch}-r${reroll}-${i}`, { expiresAt }, `wave nodes ${epoch}-r${reroll}`, home.slice(0, WAVE_HOME_SHARE));
}

/* -------------------------------------------------------------------------- */
/* 15-MINUTE DYNAMIC SPAWNS (Minor Monster Mobs, Bandits, Rare Treasure)     */
/* -------------------------------------------------------------------------- */

export interface DynamicSpawnTemplate {
  name: string;
  category: "mob" | "bandit" | "treasure";
  type: string;
  emblem: string;
  subtitle: string;
  description: string;
  rarity: NPCRarity;
  /** A crew afloat (a boat or raft): it roves only on the Sunken Fjord's open water, never on land */
  water?: true;
}

export const DYNAMIC_15M_TEMPLATES: DynamicSpawnTemplate[] = [
  // Mobs
  {
    name: "Green Slime Swarm",
    category: "mob",
    type: "mob-slime",
    emblem: "🟢",
    subtitle: "Acrid Jelly Outbreak",
    description: "Quivering acidic slimes melting discarded pickaxes and threatening trade roads.",
    rarity: "common"
  },
  {
    name: "Forest Dire Wolf Pack",
    category: "mob",
    type: "mob-wolf",
    emblem: "🐺",
    subtitle: "Hungry Prowlers",
    description: "Fierce grey wolves stalking along the forest verge searching for easy prey.",
    rarity: "common"
  },
  {
    name: "Cave Bat Cloud",
    category: "mob",
    type: "mob-bat",
    emblem: "🦇",
    subtitle: "Nocturnal Swarm",
    description: "Screeching cavern bats emerging from fissure crevices at twilight.",
    rarity: "common"
  },
  {
    name: "Goblin Scouting Party",
    category: "mob",
    type: "mob-goblin",
    emblem: "👺",
    subtitle: "Sneaky Scavengers",
    description: "Shifty green-skinned raiders armed with barbed knives and stolen lanterns.",
    rarity: "uncommon"
  },
  {
    name: "Skeleton Skirmishers",
    category: "mob",
    type: "mob-skeleton",
    emblem: "💀",
    subtitle: "Restless Barrow Bones",
    description: "Ancient soldiers reanimated by stray leyline surges, patrolling forgotten graves.",
    rarity: "uncommon"
  },
  {
    name: "Dune Scorpion Brood",
    category: "mob",
    type: "mob-scorpion",
    emblem: "🦂",
    subtitle: "Chittering Strikers",
    description: "Sand-burrowing scorpions with venom dripping from curved amber stingers.",
    rarity: "uncommon"
  },
  {
    name: "Mountain Troll Vanguard",
    category: "mob",
    type: "mob-troll",
    emblem: "🧌",
    subtitle: "Boulder Crusher",
    description: "A thick-hided stone troll armed with a splintered spruce log, hurling jagged rocks.",
    rarity: "rare"
  },
  {
    name: "Shadow Chimera",
    category: "mob",
    type: "mob-chimera",
    emblem: "🦅",
    subtitle: "Feral Aerial Terror",
    description: "A mutated beast bearing lion jaws, bat wings, and a venomous tail.",
    rarity: "rare"
  },
  {
    name: "Moonfang Werewolf Den",
    category: "mob",
    type: "mob-werewolf",
    emblem: "🐺",
    subtitle: "Cursed Moonlit Lair",
    description: "A ring of claw-scored standing stones where cursed hunters shed their skins under the full moon.",
    rarity: "rare"
  },
  {
    name: "Emberwing Drake",
    category: "mob",
    type: "mob-drake",
    emblem: "🐲",
    subtitle: "Young Fire Wyrm",
    description: "A scaled fire drake roosting on a scorched crag, guarding a clutch of smouldering eggs.",
    rarity: "epic"
  },
  {
    name: "Void Rift Aberration",
    category: "mob",
    type: "mob-aberration",
    emblem: "🌌",
    subtitle: "Interdimensional Intruder",
    description: "A writhing shadowy entity that slipped past Nethergarde's perimeter wards.",
    rarity: "epic"
  },
  {
    name: "Molten Magma Elemental",
    category: "mob",
    type: "mob-magma",
    emblem: "🔥",
    subtitle: "Living Slag Golem",
    description: "A roaring entity of pure liquid rock born from Mount Ignis's sulfur vents.",
    rarity: "epic"
  },

  {
    name: "Giant Sewer Rat Pack",
    category: "mob",
    type: "mob-rat",
    emblem: "🐀",
    subtitle: "Plague-Ridden Scurriers",
    description: "Dog-sized rats with gnawed tails, swarming out of collapsed drainage tunnels after grain wagons.",
    rarity: "common"
  },
  {
    name: "Venomweb Spider Nest",
    category: "mob",
    type: "mob-spider",
    emblem: "🕷️",
    subtitle: "Silk-Shrouded Ambushers",
    description: "Bloated green-backed spiders spinning sticky webs between dead trees to snare passing travellers.",
    rarity: "common"
  },
  {
    name: "Stormcrag Harpy Flock",
    category: "mob",
    type: "mob-harpy",
    emblem: "🦅",
    subtitle: "Shrieking Cliff Raiders",
    description: "Feathered hags swooping from the crags to snatch livestock and shiny trinkets.",
    rarity: "uncommon"
  },
  {
    name: "Bogmire Lizardfolk Band",
    category: "mob",
    type: "mob-lizardfolk",
    emblem: "🦎",
    subtitle: "Swamp Spear-Hunters",
    description: "Scaled marsh warriors with bone-tipped spears and woven reed shields, guarding their egg mounds.",
    rarity: "uncommon"
  },
  {
    name: "Ogre Brute Camp",
    category: "mob",
    type: "mob-ogre",
    emblem: "👹",
    subtitle: "Cauldron-Stirring Bullies",
    description: "A pair of hulking ogres roasting a whole ox over a fire pit, swinging tree-trunk clubs at anyone nearby.",
    rarity: "rare"
  },
  {
    name: "Wailing Wraith Coven",
    category: "mob",
    type: "mob-wraith",
    emblem: "👻",
    subtitle: "Restless Spectral Choir",
    description: "Hooded spectres drifting above a ruined shrine, their wails freezing the blood of anyone who listens.",
    rarity: "rare"
  },
  {
    name: "Stone-Gaze Basilisk",
    category: "mob",
    type: "mob-basilisk",
    emblem: "🐍",
    subtitle: "Petrifying Serpent King",
    description: "An eight-legged crested serpent surrounded by the statues of adventurers who met its glare.",
    rarity: "epic"
  },
  {
    name: "Ancient Lich Circle",
    category: "mob",
    type: "mob-lich",
    emblem: "☠️",
    subtitle: "Necromantic Ritual Site",
    description: "A crowned lich floating over a glowing ritual circle, raising skeletal servants from the frontier dust.",
    rarity: "epic"
  },

  // Bandits
  {
    name: "Highwayman Outlaws",
    category: "bandit",
    type: "bandit-highwayman",
    emblem: "🗡️",
    subtitle: "Masked Roadside Robbers",
    description: "Desperate brigands demanding tolls from traveling merchants and builders.",
    rarity: "common"
  },
  {
    name: "Rogue Pickpockets",
    category: "bandit",
    type: "bandit-pickpocket",
    emblem: "🦹",
    subtitle: "Alleyway Cutpurses",
    description: "Nimble thieves hunting gold purses and shiny crystal trinkets near city borders.",
    rarity: "common"
  },
  {
    name: "Blackwood Smugglers",
    category: "bandit",
    type: "bandit-smuggler",
    emblem: "🏹",
    subtitle: "Contraband Runners",
    description: "Stealthy archers moving untaxed ore and illicit elixirs through forest bogs.",
    rarity: "uncommon"
  },
  {
    name: "Desert Sand Raiders",
    category: "bandit",
    type: "bandit-raider",
    emblem: "🐪",
    subtitle: "Marauder Warband",
    description: "Mounted desert scavengers pillaging unguarded water barrels and pack mules.",
    rarity: "uncommon"
  },
  {
    name: "Corsair Plunderer Skiff",
    category: "bandit",
    type: "bandit-corsair",
    emblem: "🏴‍☠️",
    subtitle: "Coastal Raiders",
    description: "A longboat crew prowling the fjord with stolen lumber crates and iron ingots in the hold.",
    rarity: "rare",
    water: true
  },
  {
    name: "Shadow Syndicate Cadre",
    category: "bandit",
    type: "bandit-syndicate",
    emblem: "🥷",
    subtitle: "Elite Guild Infiltrators",
    description: "Professional mercenaries armed with poisoned throwing stars and smoke bombs.",
    rarity: "rare"
  },
  {
    name: "Dread Mercenary Legion",
    category: "bandit",
    type: "bandit-mercenary",
    emblem: "⚔️",
    subtitle: "Renegade Ironclad Troops",
    description: "Deserted palace guards operating as a heavily armed extortion gang.",
    rarity: "epic"
  },

  {
    name: "Poacher Gang",
    category: "bandit",
    type: "bandit-poacher",
    emblem: "🪤",
    subtitle: "Illegal Game Trappers",
    description: "Rough hunters setting snares and cages for the royal deer, selling pelts on the black market.",
    rarity: "common"
  },
  {
    name: "River Pirate Raft",
    category: "bandit",
    type: "bandit-riverpirate",
    emblem: "🛶",
    subtitle: "Ferry-Robbing Rafters",
    description: "A ramshackle raft crew that chains off the fjord's channels and demands silver from every barge.",
    rarity: "uncommon",
    water: true
  },
  {
    name: "Ashen Cultist Raiders",
    category: "bandit",
    type: "bandit-cultist",
    emblem: "🕯️",
    subtitle: "Doom-Chanting Zealots",
    description: "Red-robed fanatics raiding shrines for relics to feed their burning effigy.",
    rarity: "rare"
  },
  {
    name: "Warlord's Iron Horde",
    category: "bandit",
    type: "bandit-warlord",
    emblem: "🪓",
    subtitle: "Conquering Marauder Host",
    description: "A war-painted warlord on a towering war-beast leading spiked raiders toward unguarded villages.",
    rarity: "epic"
  },
  {
    name: "Blackpowder Saboteurs",
    category: "bandit",
    type: "bandit-saboteur",
    emblem: "💣",
    subtitle: "Gunpowder Demolition Crew",
    description: "Soot-faced engineers stacking powder kegs beneath bridges and mine entrances for a ransom.",
    rarity: "epic"
  },

  // Treasures
  {
    name: "Weathered Wanderer Stash",
    category: "treasure",
    type: "treasure-stash",
    emblem: "🧰",
    subtitle: "Hidden Traveler Cache",
    description: "A weathered pine lockbox containing copper coins, iron nails, and trail rations.",
    rarity: "common"
  },
  {
    name: "Smuggler's Iron Lockbox",
    category: "treasure",
    type: "treasure-lockbox",
    emblem: "📦",
    subtitle: "Buried Contraband Box",
    description: "An iron-banded chest hidden in the underbrush, packed with silver coins and fine tools.",
    rarity: "uncommon"
  },
  {
    name: "Gilded Royal Strongbox",
    category: "treasure",
    type: "treasure-strongbox",
    emblem: "🪙",
    subtitle: "Lost Sovereign Vault",
    description: "A heavy royal chest stamped with the crown insignia, brimming with minted gold.",
    rarity: "rare"
  },
  {
    name: "Sunken Corsair Treasure Chest",
    category: "treasure",
    type: "treasure-seachest",
    emblem: "💎",
    subtitle: "Barnacled Sea Jewels",
    description: "A jewel-encrusted sea trunk salvaged from a reef wreck, glistening with sapphires and pearls.",
    rarity: "epic"
  },
  {
    name: "Abandoned Supply Cart",
    category: "treasure",
    type: "treasure-cart",
    emblem: "🛒",
    subtitle: "Broken-Wheel Wagon",
    description: "A merchant wagon with a snapped axle, its crates of grain, rope and tools left by the roadside.",
    rarity: "common"
  },
  {
    name: "Dwarven Ore Cache",
    category: "treasure",
    type: "treasure-orecache",
    emblem: "⛏️",
    subtitle: "Rune-Sealed Stockpile",
    description: "Iron-bound ore crates stacked behind a rune-carved stone door, forgotten by a long-gone mining clan.",
    rarity: "uncommon"
  },
  {
    name: "Moonsilver Elven Reliquary",
    category: "treasure",
    type: "treasure-reliquary",
    emblem: "🌙",
    subtitle: "Silvered Shrine Coffer",
    description: "A delicate moonsilver casket on a vine-wrapped pedestal, humming with soft starlight.",
    rarity: "rare"
  },
  {
    name: "Dragon's Gold Hoard",
    category: "treasure",
    type: "treasure-dragonhoard",
    emblem: "🐉",
    subtitle: "Abandoned Wyrm Treasure",
    description: "A mountain of gold coins and goblets around a shed dragon skull, left behind when its keeper flew off.",
    rarity: "epic"
  },
  {
    name: "Ancient Nethergarde Relic Hoard",
    category: "treasure",
    type: "treasure-relic",
    emblem: "👑",
    subtitle: "Levitating Celestial Relic",
    description: "A glowing celestial chest pulsing with raw dark-matter diamonds, void rings, and gold bullion.",
    rarity: "legendary"
  }
];

/**
 * Roving spawn slots per buffer zone per roving window (also used for the Codex odds):
 * - the 1st is always there, a common;
 * - the 2nd comes often (SECOND_CHANCE), and is uncommon half the time;
 * - the 3rd comes now and then (THIRD_CHANCE): uncommon if the 2nd wasn't (THIRD_UNCOMMON_IF_SECOND_COMMON), rarely if it was;
 * - a rare and an epic each roll on their own.
 */
export const ROVING_SLOTS = {
  secondChance: 0.8,
  secondUncommon: 0.5,
  thirdChance: 0.5,
  /** The 3rd slot's chance to be uncommon when the 2nd was uncommon, and when it wasn't (or never came) */
  thirdUncommonIfSecondUncommon: 0.1,
  thirdUncommonIfSecondCommon: 1,
  rare: 0.5,
  epic: 0.25
};
type RovingTier = "common" | "uncommon" | "rare" | "epic";

/** Expected spawns of each tier per buffer zone per window (the Codex's odds) */
export function rovingTierExpectation(): Record<RovingTier, number> {
  const S = ROVING_SLOTS;
  const secondUnc = S.secondChance * S.secondUncommon;
  const thirdUnc = S.thirdChance * (secondUnc * S.thirdUncommonIfSecondUncommon + (1 - secondUnc) * S.thirdUncommonIfSecondCommon);
  return {
    common: 1 + S.secondChance - secondUnc + S.thirdChance - thirdUnc,
    uncommon: secondUnc + thirdUnc,
    rare: S.rare,
    epic: S.epic
  };
}

/** Tier of each roving spawn in this window (ROVING_SLOTS) */
function rollRovingTiers(prng: () => number): RovingTier[] {
  const S = ROVING_SLOTS;
  const tiers: RovingTier[] = ["common"];
  const second = prng() < S.secondChance;
  const secondUncommon = second && prng() < S.secondUncommon;
  if (second) tiers.push(secondUncommon ? "uncommon" : "common");
  if (prng() < S.thirdChance) tiers.push(prng() < (secondUncommon ? S.thirdUncommonIfSecondUncommon : S.thirdUncommonIfSecondCommon) ? "uncommon" : "common");
  if (prng() < S.rare) tiers.push("rare");
  if (prng() < S.epic) tiers.push("epic");
  return tiers;
}

/**
 * Templates a roving slot can pick: the epic slot also holds the legendary relic hoard (weighted 6:2). Crews afloat
 * (`water`) rove only in the sea buffer zone, so a boat never sits on dry land.
 */
function rovingPool(category: "mob" | "bandit" | "treasure", tier: "common" | "uncommon" | "rare" | "epic", zoneType: MapBufferZone["type"]) {
  return DYNAMIC_15M_TEMPLATES.filter(
    (t) => t.category === category && (t.rarity === tier || (tier === "epic" && t.rarity === "legendary")) && (!t.water || zoneType === "sea")
  );
}

/** A buffer zone's roving strip as a spawn area: between its two provinces, from the Nethergarde rim out to the zones' edge */
function stripArea(bz: MapBufferZone): SpawnArea {
  const horizontal = Math.abs(bz.x) < 5;
  const sign = horizontal ? Math.sign(bz.z) : Math.sign(bz.x);
  const { across, from, to } = ROVING_STRIP;
  const a0 = sign > 0 ? from : -to;
  const a1 = sign > 0 ? to : -from;
  return horizontal ? rectArea(bz.name, -across, across, a0, a1) : rectArea(bz.name, a0, a1, -across, across);
}

/**
 * The window's roving spawns may land in their zone's strip, out on the stretches of the wild rim beside it, or in the
 * quarter of the Voidrift's open outer band that faces their zone
 */
const rovingAreas = (bz: MapBufferZone): SpawnArea[] => {
  const toward = Math.atan2(bz.z, bz.x);
  return [
    stripArea(bz),
    ...RIM_AREAS.filter((a) => a.zones.includes(bz.id)).map((a) => rectArea(a.name, a.x0, a.x1, a.z0, a.z1)),
    ringArea(PROVINCE_CONFIG.arcane.name, VOIDRIFT_RIM.inner, VOIDRIFT_RIM.outer, toward - Math.PI / 4, toward + Math.PI / 4)
  ];
};

/** A zone's first encounters each window (the always-there common and the often-there second) stay in its own strip */
const ROVING_OWN_STRIP_SLOTS = 2;

export function generate15MinDynamicSpawns(occupied: Footprint[] = [], now = Date.now()): MapNPC[] {
  const { epoch: epoch15, reroll, nextRespawnAt } = currentRovingWindow(now);
  // Admin rerolls shift the seed so the window gets a fresh, still deterministic, set of encounters
  const prng = createPrng(epoch15 + reroll * 104729);
  const expiresAt = new Date(nextRespawnAt).toISOString();

  const spawns: MapNPC[] = [];
  const taken = [...occupied];
  let skipped = 0;

  for (const bz of BUFFER_ZONES) {
    const sign = Math.abs(bz.x) < 5 ? Math.sign(bz.z) : Math.sign(bz.x);
    const areas = rovingAreas(bz);

    for (const [slot, tier] of rollRovingTiers(prng).entries()) {
      // Category first (50% mob, 35% bandit, 15% treasure), then a template of the rolled tier
      const catRoll = prng();
      const category = catRoll < 0.5 ? "mob" : catRoll < 0.85 ? "bandit" : "treasure";
      const tmpl = pickWeighted(prng, rovingPool(category, tier, bz.type));
      const r = footprintOf({ id: "", category: tmpl.category, rarity: tmpl.rarity });
      let spot: { x: number; z: number } | null;
      let region = bz.name;
      if (tmpl.water) {
        // A crew afloat keeps to the fjord's open water
        const afloat = () => ({
          x: r1((prng() * 2 - 1) * FJORD_WATER.across),
          z: r1(sign * (FJORD_WATER.from + prng() * (FJORD_WATER.to - FJORD_WATER.from)))
        });
        spot = pickSpacedPoint(taken, afloat, r, { tries: 80, water: true });
      } else {
        // The zone's first two encounters keep to its own strip while it has room; the rest roam by free ground
        const pick = (slot < ROVING_OWN_STRIP_SLOTS ? pickInAreas(prng, [areas[0]], taken, r) : null) ?? pickInAreas(prng, areas, taken, r);
        spot = pick?.spot ?? null;
        if (pick) region = pick.area.name;
      }
      if (!spot) {
        skipped++;
        continue;
      }
      taken.push({ ...spot, r });

      spawns.push({
        id: `dyn-15m-${epoch15}-r${reroll}-${spawns.length}`,
        name: tmpl.name,
        type: tmpl.type,
        category: tmpl.category,
        rarity: tmpl.rarity,
        emblem: tmpl.emblem,
        subtitle: tmpl.subtitle,
        description: tmpl.description,
        x: spot.x,
        z: spot.z,
        region,
        expiresAt
      });
    }
  }

  noteSkipped("roving encounters", skipped, `window ${epoch15}-r${reroll}`);
  return spawns;
}

type MapPoint = { x: number; z: number };

/** Castles stand at least this far apart: a Wonder is ~5 units across, plus room for its name badge */
export const CASTLE_MIN_GAP = 8;
/** Other castles keep this far from the Archon's seat: the Empyrean and the Eye above it would hide anything closer */
export const ARCHON_SEAT_CLEARANCE = 14;
/** The camera looks north (−z): a castle straight behind the Archon's citadel would sit under the Eye's column */
const behindSeat = (dx: number, dz: number) => dz < 0 && Math.abs(dx) < 10;
/** Plots keep this far inside the province edge */
const PROVINCE_EDGE_MARGIN = 3;
/**
 * Nethergarde castles and the Voidrift's NPC kingdoms stand in a band round the rift's heart: no nearer than this to
 * the Nethergarde Core (or `ARCHON_SEAT_CLEARANCE` from the Archon's seat, whichever is more)…
 */
export const VOIDRIFT_INNER_RADIUS = VOIDRIFT_BAND.inner;
/** …and no farther than this, so none drifts off into the province's corners */
export const VOIDRIFT_OUTER_RADIUS = VOIDRIFT_BAND.outer;
/** Inside the Voidrift's band (a castle's distance from the rift's heart) */
const inVoidBand = (d: number, reserveSeat: boolean) =>
  d >= Math.max(VOIDRIFT_INNER_RADIUS, reserveSeat ? ARCHON_SEAT_CLEARANCE : 0) && d <= VOIDRIFT_OUTER_RADIUS;


/**
 * Candidate castle plots of a province, nearest the centre first: rings 8 units apart, each with as many slots as
 * fit `CASTLE_MIN_GAP` apart round it (so any two candidates are at least that far apart), clipped to the province.
 * With the Archon seated, the Voidrift's rings start outside `ARCHON_SEAT_CLEARANCE` (and skip the strip straight behind the
 * citadel, as seen from the map camera). The centre itself comes last.
 */
/**
 * Castle plots of a province, best first: a jittered scatter over the whole province (seeded by the province, so it
 * never changes between loads), not rings, so castles stand about like towns rather than in circles. Every province
 * ranks its plots with organic noise: mortal provinces fill loosely from the centre outward (distance plus noise); the
 * Voidrift, home to only a handful of castles, takes its plots in random order so they scatter round the rift, inside its
 * band (`VOIDRIFT_INNER_RADIUS`–`VOIDRIFT_OUTER_RADIUS` from the heart).
 */
function castlePlotCandidates(p: MapProvince, reserveSeat: boolean): Array<[number, number]> {
  const halfW = p.width / 2 - PROVINCE_EDGE_MARGIN;
  const halfD = p.depth / 2 - PROVINCE_EDGE_MARGIN;
  let seed = 17;
  for (const ch of p.civilization) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = createPrng(seed);
  const voidrift = p.civilization === "arcane";
  // The Voidrift's band is narrow: a finer scatter lets more castles fit round it
  const step = CASTLE_MIN_GAP * (voidrift ? 0.4 : 0.7);
  const plots: Array<{ x: number; z: number; rank: number }> = [];
  for (let gx = -halfW; gx <= halfW; gx += step) {
    for (let gz = -halfD; gz <= halfD; gz += step) {
      const dx = Math.max(-halfW, Math.min(halfW, gx + (rnd() - 0.5) * step * 0.9));
      const dz = Math.max(-halfD, Math.min(halfD, gz + (rnd() - 0.5) * step * 0.9));
      const d = Math.hypot(dx, dz);
      if (reserveSeat && d < ARCHON_SEAT_CLEARANCE) continue;
      if (voidrift && !inVoidBand(d, reserveSeat)) continue;
      if (!voidrift && Math.hypot(p.centerX + dx, p.centerZ + dz) < VOIDRIFT_KEEP_OUT) continue;
      const noise = rnd() * 14;
      plots.push({ x: r1(p.centerX + dx), z: r1(p.centerZ + dz), rank: voidrift ? noise : d + noise });
    }
  }
  plots.sort((a, b) => a.rank - b.rank);
  return plots.map((q) => [q.x, q.z] as [number, number]);
}

/** A frontier gate's border wall curves this far (radians) either side of it round its province's heart (client: gates.ts) */
const GATE_WALL_SPAN = 0.42;
/** Castles keep this far from any point of a border wall (a castle's footprint and a wall point's, touching) */
const WALL_CASTLE_GAP = FOOTPRINT.castle + FOOTPRINT.wall;

/**
 * Points along the border walls of the frontier gates (`npc-gate-*`), 2 units apart: castles, resource nodes and roving
 * spawns keep off them. Mirrors `gateWallPoints` in src/components/3d/world/gates.ts.
 */
export function gateWallPoints(npcs: MapNPC[]): MapPoint[] {
  const out: MapPoint[] = [];
  for (const n of npcs) {
    const civ = NPC_GATE_CIV[n.id];
    if (!civ) continue;
    const p = PROVINCE_CONFIG[civ];
    const r = Math.hypot(n.x - p.centerX, n.z - p.centerZ);
    const a0 = Math.atan2(n.z - p.centerZ, n.x - p.centerX);
    const steps = Math.ceil((r * GATE_WALL_SPAN) / 2);
    for (let i = -steps; i <= steps; i++) {
      const a = a0 + (i / steps) * GATE_WALL_SPAN;
      if (Math.abs((a - a0) * r) < 3.4) continue;
      out.push({ x: p.centerX + Math.cos(a) * r, z: p.centerZ + Math.sin(a) * r });
    }
  }
  return out;
}

/** A fixed thing castles must keep clear of, and how far (default: a castle's footprint, a landmark's and the margin) */
type Keepout = MapPoint & { gap?: number };
const CASTLE_NPC_GAP = FOOTPRINT.castle + FOOTPRINT.landmark + FOOTPRINT_MARGIN;
/** How far a castle keeps from a map NPC: both footprints and the margin */
export const castleKeepout = (n: MapNPC): Keepout => ({ x: n.x, z: n.z, gap: FOOTPRINT.castle + footprintOf(n) + FOOTPRINT_MARGIN });
const keepoutOf = castleKeepout;
/** Castles and the Voidrift slots keep clear of the Void Gate as of any fixed landmark */
export const VOID_GATE_KEEPOUT: Keepout = { ...VOID_GATE, gap: FOOTPRINT.castle + FOOTPRINT.voidGate + FOOTPRINT_MARGIN };

/** Rules a castle spot must keep inside one province */
function plotRules(p: MapProvince, reserveSeat: boolean, npcs: Keepout[]) {
  const inside = (x: number, z: number) => Math.abs(x - p.centerX) <= p.width / 2 + 6 && Math.abs(z - p.centerZ) <= p.depth / 2 + 6;
  const voidrift = p.civilization === "arcane";
  return (x: number, z: number, placed: MapPoint[]) =>
    inside(x, z) &&
    (!voidrift || inVoidBand(Math.hypot(x - p.centerX, z - p.centerZ), reserveSeat)) &&
    (voidrift || Math.hypot(x, z) >= VOIDRIFT_KEEP_OUT) &&
    (!reserveSeat || (Math.hypot(x - p.centerX, z - p.centerZ) >= ARCHON_SEAT_CLEARANCE && !behindSeat(x - p.centerX, z - p.centerZ))) &&
    placed.every((q) => Math.hypot(q.x - x, q.z - z) >= CASTLE_MIN_GAP) &&
    npcs.every((n) => Math.hypot(n.x - x, n.z - z) >= (n.gap ?? CASTLE_NPC_GAP));
}

/** The first `count` free plots of a province, keeping the castle spacing rules against `taken` (also used for the Voidrift's NPC kingdoms) */
export function freeCastlePlots(p: MapProvince, taken: MapPoint[], count: number, reserveSeat: boolean, npcs: Keepout[] = []): Array<[number, number]> {
  const ok = plotRules(p, reserveSeat, npcs);
  const placed = [...taken];
  const out: Array<[number, number]> = [];
  for (const [x, z] of castlePlotCandidates(p, reserveSeat)) {
    if (out.length >= count) break;
    if (!ok(x, z, placed)) continue;
    out.push([x, z]);
    placed.push({ x, z });
  }
  return out;
}

/**
 * Every castle's spot on the map. The Archon sits on the Voidrift's centre; everyone else keeps their previous spot
 * while it still follows the rules (inside their province, `CASTLE_MIN_GAP` from the castles kept before them in id
 * order, clear of the landmarks and of the Archon's seat), otherwise takes the first free candidate plot (or, with
 * none left, the candidate farthest from its neighbours). Pass no `prev` to lay every castle out afresh.
 */
function placeKingdoms(
  provinces: Record<CivilizationType, MapProvince>,
  kingdoms: DeveloperKingdom[],
  npcs: MapNPC[],
  prev: Record<string, MapPoint> = {},
  /** Spawns standing now (today's nodes, this window's): a castle placed afresh keeps clear of them while it can */
  avoid: MapNPC[] = []
): Record<string, MapPoint> {
  // Rulers not in the realm right now keep their entry (they get it back if it's still free when they return)
  const current = new Set(kingdoms.map((k) => k.id));
  const placements: Record<string, MapPoint> = Object.fromEntries(Object.entries(prev).filter(([id]) => !current.has(id)));
  const archon = kingdoms.find((k) => k.isArchon);
  if (archon) placements[archon.id] = archonSeat(provinces);
  const landmarks = [...npcs.map(keepoutOf), VOID_GATE_KEEPOUT, ...gateWallPoints(npcs).map((p) => ({ ...p, gap: WALL_CASTLE_GAP }))];

  for (const civ of ["human", "elf", "dwarf", "orc", "arcane"] as CivilizationType[]) {
    const p = provinces[civ];
    const reserveSeat = civ === "arcane" && Boolean(archon);
    // The Archon's seat is cleared by its own rule, so the Core under it isn't a landmark to dodge there
    const fixedThings = reserveSeat ? landmarks.filter((n) => Math.hypot(n.x - p.centerX, n.z - p.centerZ) > 1) : landmarks;
    const ok = plotRules(p, reserveSeat, fixedThings);
    const okClearOfSpawns = avoid.length ? plotRules(p, reserveSeat, [...fixedThings, ...avoid.map(keepoutOf)]) : ok;
    const members = kingdoms.filter((k) => k.civilization === civ && !k.isArchon).sort((a, b) => a.id.localeCompare(b.id));
    const placed: MapPoint[] = [];
    const waiting: DeveloperKingdom[] = [];
    for (const k of members) {
      const q = prev[k.id];
      if (q && ok(q.x, q.z, placed)) {
        placements[k.id] = q;
        placed.push(q);
      } else waiting.push(k);
    }
    const candidates = castlePlotCandidates(p, reserveSeat);
    for (const k of waiting) {
      let spot = candidates.find(([x, z]) => okClearOfSpawns(x, z, placed)) ?? candidates.find(([x, z]) => ok(x, z, placed));
      if (!spot) {
        // Province full: the candidate farthest from every castle already there, among those still clear of the fixed
        // things (landmarks, gates and their walls, the Void Gate); only the castle gap gives way
        const gap = ([x, z]: [number, number]) => Math.min(Infinity, ...placed.map((q) => Math.hypot(q.x - x, q.z - z)));
        const clear = candidates.filter(([x, z]) => ok(x, z, []));
        const pool = clear.length ? clear : candidates;
        spot = pool.reduce((best, c) => (gap(c) > gap(best) ? c : best), pool[0]);
      }
      placements[k.id] = { x: spot[0], z: spot[1] };
      placed.push(placements[k.id]);
    }
  }
  return placements;
}

const samePlacements = (a: Record<string, MapPoint>, b: Record<string, MapPoint>) => {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((id) => b[id] && b[id].x === a[id].x && b[id].z === a[id].z);
};

/**
 * Admin: lay every castle out afresh by the spacing rules (Refresh Kingdom Positions). Only positions change:
 * civilizations, buildings, bosses, landmarks and Voidrift slots stay as they are.
 */
export function relayoutKingdomPlacements(kingdoms: DeveloperKingdom[]): { moved: number; total: number } {
  const map = getOrGenerateFlatWorldMap(kingdoms);
  const saved = loadSavedMap()!;
  const before = map.kingdomPlacements;
  saved.kingdomPlacements = placeKingdoms(saved.provinces, kingdoms, saved.npcs || [], {}, keptSpawnsNow());
  writeMapFile(saved);
  const moved = kingdoms.filter((k) => {
    const a = before[k.id];
    const b = saved.kingdomPlacements[k.id];
    return !a || !b || a.x !== b.x || a.z !== b.z;
  }).length;
  return { moved, total: kingdoms.length };
}

/**
 * Grows a map saved at another world scale to `WORLD_SCALE`, in place: castles, landmarks, realms and everything still
 * crumbling spread out from the centre by the ratio; the fixed NPCs (bosses, gates, the Core, the legendary landmarks)
 * take a fresh map's spots; provinces and buffer zones take today's geometry. Returns true when it changed the map.
 */
function rescaleSavedMap(map: FlatWorldMapData): boolean {
  const from = map.worldScale ?? 1;
  if (Math.abs(from - WORLD_SCALE) < 1e-9) return false;
  const k = WORLD_SCALE / from;
  const grow = <T extends { x: number; z: number }>(p: T): T => ({ ...p, x: r1(p.x * k), z: r1(p.z * k) });
  const fixed = new Map(generatePersistentBufferNPCs(map.seed || 12345).map((n) => [n.id, n]));
  const place = (n: MapNPC): MapNPC => {
    const f = fixed.get(n.id);
    return f && (n.category === "boss" || n.id.startsWith("npc-") || n.id.startsWith("legend-")) ? { ...n, x: f.x, z: f.z } : grow(n);
  };
  map.npcs = (map.npcs ?? []).map(place);
  map.kingdomPlacements = Object.fromEntries(Object.entries(map.kingdomPlacements ?? {}).map(([id, p]) => [id, grow(p)]));
  for (const r of Object.values(map.landmarks?.rotations ?? {})) r.leaving = r.leaving.map(grow);
  for (const slot of Object.values(map.realms ?? {})) if (slot.leaving) slot.leaving.npc = grow(slot.leaving.npc);
  if (map.scenery) map.scenery = map.scenery.map(grow);
  map.provinces = PROVINCE_CONFIG;
  map.bufferZones = BUFFER_ZONES;
  map.width = WORLD_SIZE;
  map.depth = WORLD_SIZE;
  map.worldScale = WORLD_SCALE;
  console.log(`🗺️ The realm grew: world map rescaled ×${k.toFixed(3)} (castles keep their neighbours)`);
  return true;
}

/**
 * Loads existing flat world map from disk, or generates and saves a fresh persistent one.
 * Always merges in current daily resource spawns and current 15-minute dynamic spawns.
 */
export function getOrGenerateFlatWorldMap(kingdoms: DeveloperKingdom[]): FlatWorldMapData {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  let baseMap: FlatWorldMapData | null = null;

  // 1. Load the persistent map from disk (a damaged save is restored from its backup or stops here: never re-rolled)
  const savedMap = loadSavedMap();
  if (savedMap) {
    {
      let changed = false;

      // A map laid out at another world scale grows to this one in place: every spot spreads out from the centre, so
      // neighbours stay neighbours, and the fixed NPCs land exactly where a fresh map would put them
      if (rescaleSavedMap(savedMap)) changed = true;

      // Saves from older layouts (clumped buffer trinities, pre-boss types) are re-laid out
      if (savedMap.npcLayoutVersion !== NPC_LAYOUT_VERSION) {
        savedMap.npcs = generatePersistentBufferNPCs(savedMap.seed || 12345);
        savedMap.npcLayoutVersion = NPC_LAYOUT_VERSION;
        delete savedMap.landmarks;
        delete savedMap.realms;
        changed = true;
      }

      // Every castle keeps its spot while it follows the spacing rules; new, moved or crowded ones get a free plot.
      // New plot rules lay every castle out afresh, once.
      const fresh = savedMap.castleLayoutVersion !== CASTLE_LAYOUT_VERSION;
      const placements = placeKingdoms(savedMap.provinces, kingdoms, savedMap.npcs || [], fresh ? {} : savedMap.kingdomPlacements, keptSpawnsNow());
      if (fresh) {
        savedMap.castleLayoutVersion = CASTLE_LAYOUT_VERSION;
        changed = true;
      }
      if (!samePlacements(placements, savedMap.kingdomPlacements)) {
        savedMap.kingdomPlacements = placements;
        changed = true;
      }

      // Epic landmarks (after the castles, which they keep clear of): a map saved before the rotation is upgraded in
      // place, finished and with nothing else moving; then the regions rotate every Sunday 00:00 UTC
      if (settleEpicLandmarks(savedMap, Date.now())) changed = true;
      if (rotateWeekly(savedMap, Date.now())) changed = true;
      // Buffer realms: each zone's realm moves on when its 28-day cycle ends
      if (cycleRealms(savedMap, Date.now())) changed = true;
      // Scenery sites last: they go round the castles, landmarks and realms
      if (settleScenery(savedMap, kingdoms.length, Date.now())) changed = true;

      if (changed) writeMapFile(savedMap);

      baseMap = savedMap;
    }
  }

  // 2. Generate brand new persistent map if none exists
  if (!baseMap) {
    const seed = Math.floor(Math.random() * 1000000);
    // Generate persistent buffer zone trinity (boss + kingdom + terrain), then the castles clear of it
    const persistentNPCs = generatePersistentBufferNPCs(seed);
    const placements = placeKingdoms(PROVINCE_CONFIG, kingdoms, persistentNPCs);

    baseMap = {
      seed,
      width: WORLD_SIZE,
      depth: WORLD_SIZE,
      provinces: PROVINCE_CONFIG,
      kingdomPlacements: placements,
      bufferZones: BUFFER_ZONES,
      npcs: persistentNPCs,
      npcLayoutVersion: NPC_LAYOUT_VERSION,
      castleLayoutVersion: CASTLE_LAYOUT_VERSION,
      worldScale: WORLD_SCALE
    };
    // Each region's second epic landmark, clear of the castles; a new world starts with them finished
    settleEpicLandmarks(baseMap, Date.now());
    cycleRealms(baseMap, Date.now());
    settleScenery(baseMap, kingdoms.length, Date.now());

    // Save to disk permanently
    try {
      writeMapFile(baseMap);
      console.log(`🗺️ Saved persistent flat world map to ${MAP_FILE}`);
    } catch (err) {
      console.error("❌ Failed writing world_map.json:", err);
    }
  }

  // 3. Compose live world map with the landmarks as they stand today (rising / crumbling on a rotation day), daily
  // resource spawns and 15-minute dynamic roving spawns
  const now = Date.now();
  const { landmarks: _rotation, realms: _realms, ...shown } = baseMap;
  const dailyResources = dailyNodesOf(baseMap, utcDay(now), now);

  // Roving encounters are served separately (getRovingSpawns) so they can change without rebuilding the map
  const ascended = kingdoms.some((k) => k.isArchon);
  return {
    ...shown,
    npcs: [...realmsAt(baseMap, landmarksAt(baseMap, now), now).map((n) => (ascended ? ascendCore(n) : n)), ...dailyResources]
  };
}

/* -------------------------------------------------------------------------- */
/* EPIC LANDMARK ROTATION                                                      */
/* -------------------------------------------------------------------------- */

/** Epic landmarks standing in each buffer region at a time, out of its pool of 6 */
export const EPICS_PER_REGION = 1;
const DAY_MS = 86_400_000;
export interface LandmarkRotation {
  /** The rotation day: the arriving landmarks rise and the leaving ones crumble from → until (epoch ms; equal = skipped) */
  from: number;
  until: number;
  /** Ids of the epics that arrived (they are in the map's npcs) */
  arriving: string[];
  /** The epics that left, crumbling where they stood until `until` */
  leaving: MapNPC[];
}

export interface LandmarkRotationState {
  /** Start (YYYY-MM-DD, a Sunday) of the week of the last weekly rotation */
  week: string;
  /** Each region's latest rotation (the weekly one or an admin reset) */
  rotations: Record<string, LandmarkRotation>;
}

const utcDay = (t: number) => new Date(t).toISOString().slice(0, 10);
/** Sunday 00:00 UTC of the week `t` falls in (the realm's weekly resets) */
const weekStart = (t: number) => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - d.getUTCDay());
};
const weekOf = (t: number) => utcDay(weekStart(t));

/** Id of a region's epic landmark: one per design, so a landmark keeps its id for as long as it stands */
function epicIdOf(zoneId: string, type: string) {
  return `terrain-${zoneId}-${type.replace(/^lm-/, "")}`;
}
const isEpicOf = (zoneId: string) => (n: MapNPC) => n.category === "terrain" && n.id.startsWith(`terrain-${zoneId}`);

function prngFor(key: string) {
  let seed = 0;
  for (let i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) >>> 0;
  return createPrng(seed);
}

type LandmarkDef = BufferDefinition["terrains"][number];

/** `count` designs of the region's pool drawn at random from those not in `exclude` */
function drawEpics(pool: LandmarkDef[], exclude: Set<string>, count: number, prng: () => number): LandmarkDef[] {
  const free = pool.filter((t) => !exclude.has(t.type));
  for (let i = free.length - 1; i > 0; i--) {
    const j = Math.floor(prng() * (i + 1));
    [free[i], free[j]] = [free[j], free[i]];
  }
  return free.slice(0, count);
}

/** The fixed things on the map as footprints: castles, every map NPC (plus `extra`), the border walls, the Voidrift slots */
function fixedFootprints(map: FlatWorldMapData, npcs: MapNPC[], now: number): Footprint[] {
  return [
    ...Object.values(map.kingdomPlacements).map((p) => ({ x: p.x, z: p.z, r: FOOTPRINT.castle })),
    ...npcs.map((n) => ({ x: n.x, z: n.z, r: footprintOf(n) })),
    ...gateWallPoints(map.npcs).map((p) => ({ ...p, r: FOOTPRINT.wall })),
    ...(map.scenery ?? []).map((p) => ({ x: p.x, z: p.z, r: FOOTPRINT.scenery })),
    { ...VOID_GATE, r: FOOTPRINT.voidGate },
    ...registeredOccupants(now, true)
  ];
}

/** One scenery site per this many rulers (the client draws as many) */
export const SCENERY_PER_RULERS = 4;

/**
 * Brings the map's scenery spots up to one per `SCENERY_PER_RULERS` rulers, in place: a spot keeps its place while it
 * stays clear of the castles, map NPCs, walls and Voidrift slots; a crowded one, or a missing one, gets a fresh clear
 * spot on dry land anywhere on the board (the Wild Rim included), seeded by the map and its index. Returns true when the
 * map changed.
 */
function settleScenery(map: FlatWorldMapData, rulers: number, now: number): boolean {
  // Never fewer than it has: a caller that passes part of the realm must not drop spots the client draws on
  const want = Math.max(map.scenery?.length ?? 0, Math.ceil(rulers / SCENERY_PER_RULERS));
  const before = JSON.stringify(map.scenery ?? []);
  const occupied = fixedFootprints({ ...map, scenery: [] }, map.npcs, now);
  const kept: MapPoint[] = [];
  for (const p of map.scenery ?? []) {
    if (roomAt(occupied, p.x, p.z, FOOTPRINT.scenery) < 0) continue;
    kept.push(p);
    occupied.push({ ...p, r: FOOTPRINT.scenery });
  }
  for (let i = 0; kept.length < want && i < want * 4; i++) {
    const prng = prngFor(`${map.seed}:scenery:${kept.length}:${i}`);
    const spot = pickSpacedPoint(occupied, () => ({ x: r1((prng() * 2 - 1) * PLAY_HALF), z: r1((prng() * 2 - 1) * PLAY_HALF) }), FOOTPRINT.scenery, { tries: 120 });
    if (!spot) continue;
    kept.push(spot);
    occupied.push({ ...spot, r: FOOTPRINT.scenery });
  }
  map.scenery = kept;
  return JSON.stringify(kept) !== before;
}

/** What an arriving landmark or free realm keeps clear of: castles, every map NPC (plus `extra`), the day's nodes, the border walls */
function landmarkBlockers(map: FlatWorldMapData, extra: MapNPC[], nodes: MapNPC[], now = Date.now()): Footprint[] {
  return [...fixedFootprints(map, [...map.npcs, ...extra], now), ...nodes.map((n) => ({ x: n.x, z: n.z, r: FOOTPRINT.resource }))];
}

/**
 * A random spot anywhere in the region (between its two provinces, from outside the Voidrift out to the zones' edge)
 * where a footprint of `r` fits; with none free, the spot with the most room (a landmark or realm must stand somewhere).
 * A land landmark on open water gets an islet (the terrain raises a pad under it).
 */
function placeEpic(zone: MapBufferZone, blockers: Footprint[], prng: () => number, r: number = FOOTPRINT.landmark): MapPoint {
  const horizontal = Math.abs(zone.x) < 5;
  const sign = horizontal ? Math.sign(zone.z) : Math.sign(zone.x);
  let best: MapPoint = { x: zone.x, z: zone.z };
  let bestScore = -Infinity;
  for (let i = 0; i < 200; i++) {
    const across = r1((prng() * 2 - 1) * LANDMARK_STRIP.across);
    const along = r1(sign * (LANDMARK_STRIP.from + prng() * (LANDMARK_STRIP.to - LANDMARK_STRIP.from)));
    const c = horizontal ? { x: across, z: along } : { x: along, z: across };
    const score = roomAt(blockers, c.x, c.z, r);
    if (score >= 0) return c;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

const epicNpc = (zone: MapBufferZone, def: LandmarkDef, at: MapPoint): MapNPC => ({
  id: epicIdOf(zone.id, def.type),
  ...def,
  category: "terrain",
  rarity: "epic",
  x: at.x,
  z: at.z,
  region: zone.name
});

/**
 * What the day's resource nodes keep clear of: castles, the border walls and the landmarks as they stood when the UTC
 * day began (plus any still crumbling), so an admin reset in the middle of the day never moves a node out from under
 * its gatherers. The weekly rotation happens at 00:00, so Sunday's nodes already keep clear of the new landmarks.
 */
function nodeBlockers(map: FlatWorldMapData, now: number): Footprint[] {
  const d = new Date(now);
  const dayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const rotations = Object.values(map.landmarks?.rotations ?? {});
  const laterToday = rotations.filter((r) => r.from > dayStart && r.from <= now);
  const arrivedLater = new Set(laterToday.flatMap((r) => r.arriving));
  const gone = [...laterToday, ...rotations.filter((r) => now >= r.from && now < r.until)].flatMap((r) => r.leaving);
  const npcs = [...map.npcs.filter((n) => !arrivedLater.has(n.id)), ...gone.filter((n, i) => gone.findIndex((m) => m.id === n.id) === i)];
  return fixedFootprints(map, npcs, dayStart);
}

/** The day's resource nodes: rolled once against `nodeBlockers` (castles as they stood then) and kept all day */
function dailyNodesOf(map: FlatWorldMapData, day: string, at: number): MapNPC[] {
  return keptSpawns("daily", day, day === utcDayOf(Date.now()), () => generateDailyResourceSpawns(day, nodeBlockers(map, at)));
}

/**
 * Brings the saved map's epic landmarks up to the rules, in place: each region shows `EPICS_PER_REGION` designs of its
 * pool (texts refreshed, the old wreck renamed to its part-list model, one id per design); missing ones are drawn and
 * placed, finished. Nothing else on the map moves. Returns true when the map changed.
 */
function settleEpicLandmarks(map: FlatWorldMapData, now: number): boolean {
  let changed = false;
  for (const zone of BUFFER_ZONES) {
    const pool = BUFFER_POOLS[zone.id]?.terrains ?? [];
    const mine = isEpicOf(zone.id);
    const kept: MapNPC[] = [];
    for (const n of map.npcs.filter(mine)) {
      const type = n.type === "shipwreck" ? "lm-shipwreck" : n.type;
      const def = pool.find((t) => t.type === type);
      if (!def || kept.some((k) => k.type === type) || kept.length >= EPICS_PER_REGION) {
        changed = true; // a design no longer in the pool is dropped
        continue;
      }
      const next: MapNPC = { ...n, ...def, id: epicIdOf(zone.id, type), rarity: "epic", region: zone.name };
      if (JSON.stringify(next) !== JSON.stringify(n)) changed = true;
      kept.push(next);
    }
    map.npcs = [...map.npcs.filter((n) => !mine(n)), ...kept];
    if (kept.length >= EPICS_PER_REGION) continue;
    const prng = prngFor(`${map.seed}:${zone.id}:settle`);
    const nodes = dailyNodesOf(map, utcDay(now), now);
    for (const def of drawEpics(pool, new Set(kept.map((k) => k.type)), EPICS_PER_REGION - kept.length, prng)) {
      map.npcs.push(epicNpc(zone, def, placeEpic(zone, landmarkBlockers(map, [], nodes), prng)));
    }
    changed = true;
  }
  // Maps saved while the rotation was monthly carry no week: they start this week's cycle as they stand
  if (!map.landmarks?.week) {
    map.landmarks = { week: weekOf(now), rotations: map.landmarks?.rotations ?? {} };
    changed = true;
  }
  return changed;
}

/**
 * A rotation in the given regions: the epic standing leaves (crumbling where it stood until `until`) and another
 * of the pool arrive (rising) at fresh spots, seeded by `key` so the map is the same for everyone. `until` = `from`
 * skips straight to finished.
 */
function rotateEpicLandmarks(map: FlatWorldMapData, zoneIds: string[], from: number, until: number, key: string) {
  map.landmarks ??= { week: weekOf(from), rotations: {} };
  for (const zone of BUFFER_ZONES.filter((z) => zoneIds.includes(z.id))) {
    const pool = BUFFER_POOLS[zone.id]?.terrains ?? [];
    const mine = isEpicOf(zone.id);
    const leaving = map.npcs.filter(mine);
    const prng = prngFor(`${map.seed}:${zone.id}:${key}`);
    // The leaving pair is still in map.npcs while the new ones are placed, so they keep clear of where it crumbles
    const nodes = dailyNodesOf(map, utcDay(from), from);
    const arriving: MapNPC[] = [];
    for (const def of drawEpics(pool, new Set(leaving.map((n) => n.type)), EPICS_PER_REGION, prng)) {
      arriving.push(epicNpc(zone, def, placeEpic(zone, landmarkBlockers(map, arriving, nodes), prng)));
    }
    map.npcs = [...map.npcs.filter((n) => !mine(n)), ...arriving];
    map.landmarks.rotations[zone.id] = { from, until, arriving: arriving.map((n) => n.id), leaving };
  }
}

/** On the first load in a new week every region rotates; its rotation day runs from Sunday 00:00 UTC for 24 h */
function rotateWeekly(map: FlatWorldMapData, now: number): boolean {
  const week = weekOf(now);
  if (!map.landmarks || map.landmarks.week === week) return false;
  const from = weekStart(now);
  rotateEpicLandmarks(map, BUFFER_ZONES.map((z) => z.id), from, from + DAY_MS, week);
  map.landmarks.week = week;
  return true;
}

/** The map's persistent NPCs at `now`: on a rotation day the arriving epics are rising and the leaving ones crumbling */
function landmarksAt(map: FlatWorldMapData, now: number): MapNPC[] {
  const live = Object.values(map.landmarks?.rotations ?? {}).filter((r) => now >= r.from && now < r.until);
  if (live.length === 0) return map.npcs;
  const rising = new Map(live.flatMap((r) => r.arriving.map((id) => [id, r] as const)));
  const out = map.npcs.map((n) => {
    const r = rising.get(n.id);
    return r ? { ...n, landmarkState: { phase: "rising" as const, from: r.from, until: r.until } } : n;
  });
  for (const r of live) for (const n of r.leaving) out.push({ ...n, landmarkState: { phase: "crumbling", from: r.from, until: r.until } });
  return out;
}

/** Changes whenever the landmarks on the map change (a rotation, its day ending, a reset): clients refetch the map */
export function landmarkKey(kingdoms: DeveloperKingdom[]): string {
  return getOrGenerateFlatWorldMap(kingdoms)
    .npcs.filter((n) => n.category === "terrain" || n.realm)
    // A realm's stage, building day and level change its model and card: clients refetch on each
    .map((n) => `${n.id}:${n.landmarkState?.phase ?? ""}${n.realm ? `:${n.realm.stage}:${n.realm.level}` : ""}`)
    .join("|");
}

/* -------------------------------------------------------------------------- */
/* BUFFER REALM CYCLE                                                          */
/* -------------------------------------------------------------------------- */

/** A buffer zone's realm: the cycle it belongs to, and the one that left at its start (crumbling for its first day) */
export interface RealmSlot {
  cycle: number;
  leaving?: { npc: MapNPC; from: number; until: number };
}

const WEEK_MS = 7 * DAY_MS;
/** Sunday 4 Jan 1970 00:00 UTC: weeks of the realm cycle count from here */
const FIRST_SUNDAY = Date.UTC(1970, 0, 4);
const CYCLE_WEEKS = REALM_CYCLE.STAGES.length;

/**
 * Where zone `zoneIndex` stands at `t`. The zones are a week apart (zone i is i weeks into its cycle), so every week
 * shows one realm of each stage.
 */
function realmClock(zoneIndex: number, t: number): { cycle: number; stage: number; day: number; cycleStart: number; stageEndsAt: number } {
  const start = weekStart(t);
  const slot = Math.round((start - FIRST_SUNDAY) / WEEK_MS) + zoneIndex;
  const stage = ((slot % CYCLE_WEEKS) + CYCLE_WEEKS) % CYCLE_WEEKS;
  return {
    cycle: Math.floor(slot / CYCLE_WEEKS),
    stage,
    day: Math.min(REALM_CYCLE.STAGE_DAYS - 1, Math.floor((t - start) / DAY_MS)),
    cycleStart: start - stage * WEEK_MS,
    stageEndsAt: start + WEEK_MS
  };
}

/** A buffer realm's place in its cycle at `t` (its rarity is the stage's) */
export function realmCycleAt(zoneIndex: number, t: number): RealmCycle {
  const c = realmClock(zoneIndex, t);
  return { stage: c.stage, day: c.day, level: realmLevelOn(c.stage, c.day), building: c.day === 0, stageEndsAt: c.stageEndsAt };
}

const realmIdOf = (zoneId: string, cycle: number) => `kingdom-${zoneId}-${cycle}`;
/** The zone's realm on the map (frontier gates are `npc-gate-*`, never matched) */
const isRealmOf = (zoneId: string) => (n: MapNPC) => n.category === "kingdom" && n.id.startsWith(`kingdom-${zoneId}`);

type RealmDef = BufferDefinition["kingdoms"][number];

const realmNpc = (zone: MapBufferZone, cycle: number, def: RealmDef, at: MapPoint): MapNPC => ({
  id: realmIdOf(zone.id, cycle),
  ...def,
  category: "kingdom",
  rarity: "common",
  x: at.x,
  z: at.z,
  region: zone.name
});

/**
 * Brings every zone's realm to the current cycle, in place. A map saved before the cycle keeps its realms where they
 * stand (a design no longer in the pool is swapped for one that is) and they join the cycle at today's stage. When a
 * zone's cycle has rolled over, its realm leaves (crumbling for the new cycle's first day) and another design of the
 * pool, never the same one twice running, is built at a fresh spot. `force` moves those zones' realms now (admin): the
 * old realm is gone at once, with no crumbling day. Returns true when the map changed.
 */
function cycleRealms(map: FlatWorldMapData, now: number, opts: { force?: string[] } = {}): boolean {
  let changed = false;
  BUFFER_ZONES.forEach((zone, i) => {
    const pool = BUFFER_POOLS[zone.id]?.kingdoms ?? [];
    if (!pool.length) return;
    const clock = realmClock(i, now);
    const slot = map.realms?.[zone.id];
    const current = map.npcs.find(isRealmOf(zone.id));
    const forced = Boolean(opts.force?.includes(zone.id));
    if (slot && current && slot.cycle === clock.cycle && !forced) {
      // A realm standing too close to something (laid out under older spacing rules) moves to a clear spot, as it is
      const others = landmarkBlockers({ ...map, npcs: map.npcs.filter((n) => n.id !== current.id) }, [], [], now);
      if (roomAt(others, current.x, current.z, FOOTPRINT.realm) >= 0) return;
      const at = placeEpic(zone, others, prngFor(`${map.seed}:${zone.id}:realm:${clock.cycle}:respace`), FOOTPRINT.realm);
      map.npcs = map.npcs.map((n) => (n.id === current.id ? { ...n, x: at.x, z: at.z } : n));
      changed = true;
      return;
    }
    const prng = prngFor(`${map.seed}:${zone.id}:realm:${clock.cycle}${forced ? `:${now}` : ""}`);
    let next: MapNPC;
    let leaving: RealmSlot["leaving"];
    if (!slot && current && !forced) {
      // Joins the cycle where it stands
      const def = pool.find((d) => d.type === current.type) ?? pool[Math.floor(prng() * pool.length)];
      next = realmNpc(zone, clock.cycle, def, current);
    } else {
      const free = pool.filter((d) => d.type !== current?.type);
      const def = free[Math.floor(prng() * free.length)] ?? pool[0];
      // The leaving realm is still in map.npcs while the new one is placed, so it keeps clear of where it crumbles
      const nodes = dailyNodesOf(map, utcDay(now), now);
      next = realmNpc(zone, clock.cycle, def, placeEpic(zone, landmarkBlockers(map, [], nodes), prng, FOOTPRINT.realm));
      if (forced) next.id = `${next.id}-${now.toString(36)}`;
      // It falls on the first day of the new cycle; an admin move takes it (and any realm still crumbling) off at once
      if (current && !forced) leaving = { npc: current, from: clock.cycleStart, until: clock.cycleStart + DAY_MS };
    }
    map.npcs = [...map.npcs.filter((n) => !isRealmOf(zone.id)(n)), next];
    map.realms = { ...(map.realms ?? {}), [zone.id]: { cycle: clock.cycle, ...(leaving ? { leaving } : {}) } };
    changed = true;
  });
  return changed;
}

/** The map's NPCs with each realm's stage, level and building day applied, plus any realm still crumbling away */
function realmsAt(map: FlatWorldMapData, npcs: MapNPC[], now: number): MapNPC[] {
  const out = npcs.map((n) => {
    const zi = BUFFER_ZONES.findIndex((z) => isRealmOf(z.id)(n));
    if (zi < 0) return n;
    const realm = realmCycleAt(zi, now);
    const from = weekStart(now);
    return {
      ...n,
      rarity: REALM_CYCLE.STAGES[realm.stage],
      realm,
      ...(realm.building ? { landmarkState: { phase: "rising" as const, from, until: from + DAY_MS } } : {})
    };
  });
  for (const [zoneId, slot] of Object.entries(map.realms ?? {})) {
    const l = slot.leaving;
    const zi = BUFFER_ZONES.findIndex((z) => z.id === zoneId);
    if (!l || zi < 0 || now < l.from || now >= l.until) continue;
    // It crumbles at the stage it had when it left: epic at the end of its cycle, any stage when an admin moved it
    const realm = { ...realmCycleAt(zi, l.from - 1), building: false };
    out.push({ ...l.npc, rarity: REALM_CYCLE.STAGES[realm.stage], realm, landmarkState: { phase: "crumbling", from: l.from, until: l.until } });
  }
  return out;
}

/**
 * Admin: the realms of every zone (or one) move now: each is taken off the map at once (no crumbling day, so a zone never
 * shows two realms) and another of its pool stands at a fresh spot at the stage the cycle is on. Fresh ids, so the new
 * realms start full.
 */
export function moveRealms(kingdoms: DeveloperKingdom[], zoneId?: string) {
  if (zoneId && !BUFFER_ZONES.some((z) => z.id === zoneId)) throw new Error("Unknown region");
  getOrGenerateFlatWorldMap(kingdoms);
  const saved = loadSavedMap()!;
  const zones = zoneId ? [zoneId] : BUFFER_ZONES.map((z) => z.id);
  cycleRealms(saved, Date.now(), { force: zones });
  writeMapFile(saved);
  return BUFFER_ZONES.filter((z) => zones.includes(z.id)).map((z) => ({
    region: z.name,
    arriving: saved.npcs.find(isRealmOf(z.id))?.name ?? "",
    leaving: saved.realms?.[z.id]?.leaving?.npc.name ?? ""
  }));
}

/**
 * Admin 🗿 Reset Landmarks: every region (or one) rotates now, with the usual rotation day (crumbling + rising for
 * 24 h) or straight to finished. Kingdoms, bosses and castle positions stay; the next weekly rotation still comes on
 * Sunday.
 */
export function resetLandmarks(kingdoms: DeveloperKingdom[], opts: { zoneId?: string; finished?: boolean } = {}) {
  if (opts.zoneId && !BUFFER_ZONES.some((z) => z.id === opts.zoneId)) throw new Error("Unknown region");
  getOrGenerateFlatWorldMap(kingdoms); // the saved map is current (upgraded, this week's rotation done)
  const saved = loadSavedMap()!;
  const now = Date.now();
  const zones = opts.zoneId ? [opts.zoneId] : BUFFER_ZONES.map((z) => z.id);
  rotateEpicLandmarks(saved, zones, now, opts.finished ? now : now + DAY_MS, `reset-${now}`);
  writeMapFile(saved);
  return BUFFER_ZONES.filter((z) => zones.includes(z.id)).map((z) => ({
    region: z.name,
    arriving: saved.npcs.filter(isEpicOf(z.id)).map((n) => n.name),
    leaving: saved.landmarks!.rotations[z.id].leaving.map((n) => n.name)
  }));
}

/** Where the Archon's citadel stands: the heart of the Voidrift, under the Eye (the Nethergarde Core) */
function archonSeat(provinces: Record<CivilizationType, MapProvince>): { x: number; z: number } {
  return { x: provinces.arcane.centerX, z: provinces.arcane.centerZ };
}

/** With an Archon seated, the Nethergarde Core rises off the ground and floats above the citadel */
function ascendCore(n: MapNPC): MapNPC {
  if (n.id !== "npc-void-monolith") return n;
  return {
    ...n,
    type: "ruins-ascended",
    subtitle: "The Eye of the Voidrift · floating over the Archon's citadel",
    description: `${n.description} Since the Archon of the Realm took the seat beneath it, the Eye floats over the Empyrean citadel like a lodestone, its monoliths and shards wheeling round both and a beam of light running down into the citadel's crown.`
  };
}

/**
 * Everything already on the map at `now`, as one footprint list in placement order: castles and free realms, the fixed
 * NPCs, gates and walls, bosses and landmarks, today's resource nodes (all on the map), then the Voidrift slots and what
 * moves (Xal'Vorath, as it stood at `movingAt`). Each later layer places its spawns against it and adds itself.
 */
export function mapOccupancy(kingdoms: DeveloperKingdom[], now = Date.now(), movingAt = now, map = getOrGenerateFlatWorldMap(kingdoms)): Footprint[] {
  return [...fixedFootprints(map, map.npcs, now), ...registeredOccupants(movingAt, false)];
}

/**
 * The current window's wave of resource nodes and roving encounters, placed on the single occupancy list: the wave
 * first (against what stood when its two-harvest window began, so it never moves under its gatherers), then the
 * encounters (against that and the wave, what moves as it stood when their window began).
 */
export function getRovingSpawns(kingdoms: DeveloperKingdom[], now = Date.now()) {
  const win = currentRovingWindow(now);
  const map = getOrGenerateFlatWorldMap(kingdoms);
  // Each is rolled once, against the map as it stood then, and kept for its window (`keptSpawns`)
  const realNow = Date.now();
  const waveKey = waveKeyOf(now);
  const wave = keptSpawns("wave", waveKey, waveKey === waveKeyOf(realNow), () =>
    generateWaveResourceSpawns(mapOccupancy(kingdoms, now, currentWaveWindow(now).startsAt, map), now)
  );
  const encounters = keptSpawns("roving", win.key, win.key === currentRovingWindow(realNow).key, () =>
    generate15MinDynamicSpawns([...mapOccupancy(kingdoms, now, win.epoch * rovingWindowMs(), map), ...wave.map((n) => ({ x: n.x, z: n.z, r: FOOTPRINT.resource }))], now)
  );
  return { key: win.key, nextRespawnAt: win.nextRespawnAt, serverNow: Date.now(), npcs: [...encounters, ...wave] };
}

/**
 * Regenerates flat world map completely from scratch, wiping MAP_FILE and recalculating all placements,
 * re-randomizing bosses, kingdoms, and terrain landmarks.
 */
export function regenerateFlatWorldMap(kingdoms: DeveloperKingdom[]): FlatWorldMapData {
  forgetSpawnRolls();
  for (const file of [MAP_FILE, MAP_BACKUP_FILE]) {
    if (!fs.existsSync(file)) continue;
    try {
      fs.unlinkSync(file);
    } catch {
      // ignore
    }
  }
  return getOrGenerateFlatWorldMap(kingdoms);
}

/* -------------------------------------------------------------------------- */
/* CODEX CATALOG (everything that can appear on the world map)                */
/* -------------------------------------------------------------------------- */

/** Share of roving spawns per category (matches generate15MinDynamicSpawns) */
const ROVING_CATEGORY_SHARE = { mob: 0.5, bandit: 0.35, treasure: 0.15 } as const;

/** `standing`: types of the epic landmarks standing on the map right now (marked in the Codex) */
export function getCodexCatalog(standing: Set<string> = new Set()): { rarityWeights: Record<NPCRarity, number>; entries: CodexEntry[] } {
  const entries: CodexEntry[] = [];

  for (const t of DAILY_RESOURCE_TEMPLATES) {
    entries.push({
      id: `codex-${t.type}`,
      type: t.type,
      name: t.name,
      emblem: t.emblem,
      subtitle: t.subtitle,
      description: t.description,
      category: "resource",
      rarity: t.rarity,
      spawn: `Resource node: ${DAILY_RESOURCE_NODE_COUNT} each day, plus a fresh wave of ${WAVE_RESOURCE_NODE_COUNT} every ${waveWindowMinutes()} min`,
      chance: pickChance(DAILY_RESOURCE_TEMPLATES, t),
      resourceYield: t.yield
    });
  }

  // Expected appearances per roving window: slots of that tier × category share × pick within the pool
  // (rolled once per buffer zone)
  const zones = BUFFER_ZONES.length;
  const per = rovingTierExpectation();
  const slots = { common: zones * per.common, uncommon: zones * per.uncommon, rare: zones * per.rare, epic: zones * per.epic };
  for (const cat of ["mob", "bandit", "treasure"] as const) {
    for (const t of DYNAMIC_15M_TEMPLATES.filter((x) => x.category === cat)) {
      const tier = t.rarity === "legendary" ? "epic" : (t.rarity as keyof typeof slots);
      // Each zone rolls its own slots from its own pool (crews afloat only in the sea zone)
      const zoneChance = BUFFER_ZONES.reduce((sum, bz) => {
        const pool = rovingPool(cat, tier, bz.type);
        return sum + (pool.includes(t) ? pickChance(pool, t) / zones : 0);
      }, 0);
      entries.push({
        id: `codex-${t.type}`,
        type: t.type,
        name: t.name,
        emblem: t.emblem,
        subtitle: t.subtitle,
        description: t.description,
        category: cat,
        rarity: t.rarity,
        spawn: t.water ? `Roving spawn (every ${rovingWindowMinutes()} min), afloat on the Sunken Fjord only` : `Roving spawn (every ${rovingWindowMinutes()} min)`,
        chance: slots[tier] * ROVING_CATEGORY_SHARE[cat] * zoneChance,
        // Mobs and bandits fight with a Battle Arts kit sized by their rarity
        ...(cat === "treasure" ? {} : { arts: kitLines(npcKitFor(t.type, t.rarity as UnitRarity) ?? { instincts: [], arts: [] }) })
      });
    }
  }

  for (const bz of BUFFER_ZONES) {
    const pool = BUFFER_POOLS[bz.id];
    if (!pool) continue;
    pool.bosses.forEach((b, i) =>
      entries.push({ id: `codex-boss-${bz.id}-${i}`, ...b, category: "boss", rarity: "legendary", spawn: bz.name, arts: kitLines(bossUnitFor(b.type).kit) })
    );
    // One of the zone's realms stands at a time, growing common → epic over its 28-day cycle (the Codex steps through it)
    pool.kingdoms.forEach((k, i) =>
      entries.push({
        id: `codex-kingdom-${bz.id}-${i}`,
        ...k,
        category: "kingdom",
        rarity: "epic",
        spawn: `${bz.name} · 1 of its ${pool.kingdoms.length} realms stands at a time; it grows for 28 days, then moves on`,
        // Its garrison's Battle Arts grow with its stage (one of the bordering civilizations holds it)
        arts: realmKitLines(bz.name)
      })
    );
    pool.terrains.forEach((t, i) =>
      entries.push({
        id: `codex-terrain-${bz.id}-${i}`,
        ...t,
        category: "terrain",
        rarity: "epic",
        spawn: `${bz.name} · ${EPICS_PER_REGION} of its ${pool.terrains.length} stand at a time, changing every Sunday`,
        standing: standing.has(t.type)
      })
    );

  }

  for (const [civ, def] of Object.entries(LEGENDARY_LANDMARKS) as Array<[CivilizationType, NonNullable<(typeof LEGENDARY_LANDMARKS)[CivilizationType]>]>) {
    const { dx: _dx, dz: _dz, ...legend } = def;
    entries.push({ id: `codex-legend-${civ}`, ...legend, category: "terrain", rarity: "legendary", spawn: `${PROVINCE_CONFIG[civ].name}, at its heart (always standing)` });
  }

  // Fixed landmarks (Nethergarde Core, province gates)
  for (const raw of generatePersistentBufferNPCs(1).filter((n) => n.id.startsWith("npc-"))) {
    const n = config.archonUsers.length > 0 ? ascendCore(raw) : raw;
    entries.push({
      id: `codex-${n.id}`,
      type: n.type,
      name: n.name,
      emblem: n.emblem,
      subtitle: n.subtitle,
      description: n.description,
      category: n.category ?? "terrain",
      rarity: n.rarity ?? "rare",
      // A frontier gate seals its province's cities while it stands
      spawn: n.id.startsWith("npc-gate-") ? `${n.region} · seals its province while it stands (burn it to open the province's cities)` : n.region,
      // A gate's garrison fights with its civilization's rare kit
      ...(NPC_GATE_CIV[n.id] ? { arts: kitLines(npcKingdomKitFor(NPC_GATE_CIV[n.id], "rare", n.name)) } : {})
    });
  }

  // Teasers: in the Codex only, they never spawn (future events); Xal'Vorath is sent by decree, so it never spawns either
  entries.push({
    id: "codex-bandit-kingpin",
    type: "bandit-kingpin",
    name: "Vargo Blackfang, the Bandit King",
    emblem: "👑",
    subtitle: "Lord of the Thousand Thieves",
    description:
      "A bone-masked warlord in a blood-red cloak who wears the crowns he has stolen. He stands on a mountain of plunder under his war banner, crows circling overhead, and cuts down whole caravans with twin crimson sabers. Rumour says he is gathering every bandit warband for one great raid.",
    category: "bandit",
    rarity: "legendary",
    spawn: "Not in the game yet: a future event",
    teaser: true
  });
  entries.push({
    id: "codex-mythic-singularity",
    type: "mythic-singularity",
    name: "Xal'Vorath, the Devouring Singularity",
    emblem: "🌑",
    subtitle: "The Overseers' Wrath",
    description:
      "A void titan of broken rock held together by its own gravity, around a black core in a blazing ring of light. Shattered land and ruined temples circle it, and the ground beneath it churns into a well of dust. The Overseers send it against a kingdom: it crawls toward the gates for three days, and only a kingdom that works every day can drive it back. If it arrives, the kingdom and its civilization have one hour to bring it down before it burns the city.",
    category: "boss",
    rarity: "mythical",
    spawn: "Sent by an admin, a Special Overseer or the Archon (the Wrath decree, once a week each), Level 1–5. Slain: a hoard and bounty by its Level, and one Heart of the Void to the ruler who wounded it most",
    arts: kitLines(HORROR_KIT)
  });
  entries.push({
    id: "codex-void-gate",
    type: "void-gate",
    name: "The Void Gate",
    emblem: "🌀",
    subtitle: "The Rift That Does Not Close",
    description:
      "A tall arch of obsidian that no mason built, its stones hanging apart in the air and its crown broken open, round a vortex that sinks into the dark on both faces. Void shards circle it, arcs crackle across the break and embers rise off the stone. It is coming to the Nethergarde Voidrift, where it will stand for good: what waits on the far side, and what it asks of those who march in, is not yet known.",
    category: "terrain",
    rarity: "mythical",
    spawn: "Not in the realm yet: coming soon to the Nethergarde Voidrift",
    teaser: true
  });
  // The wandering legends: two travellers who will visit each ruler on their own (the Codex's Wandering Legends tab)
  entries.push({
    id: "codex-wanderer-merchant",
    type: "legend-merchant",
    name: "Alistair, the Wandering Merchant",
    emblem: "🪙",
    subtitle: "Master of the Long Road",
    description:
      "A merchant prince of no kingdom, who travels the frontier roads with a wagon under a crimson-and-gold awning, pulled by a horned ox in a dyed wool blanket. Brass-bound chests, amphorae of oil and wine, grain sacks and bundles of rare timber ride under its brass lantern, and before it he lays out his rug, his swaying brass scales and his table of coin. He buys gold and rare gems for bulk supplies, and no two visits bring the same stock.",
    category: "terrain",
    rarity: "legendary",
    spawn: "Not in the realm yet: coming soon to the frontier roads",
    teaser: true
  });
  entries.push({
    id: "codex-wanderer-blacksmith",
    type: "legend-blacksmith",
    name: "Grimur, the Master Blacksmith",
    emblem: "🔨",
    subtitle: "The Forge That Walks",
    description:
      "A towering, soot-dark armourer who hauls his forge from realm to realm on a cart with massive iron-tyred wheels: a hearth of glowing coals under a smoking chimney, a bellows that never rests, a quench barrel that steams and a rack of half-quenched blades. Beside it stands his runic anvil, throwing blue sparks with every blow of his great hammer. He forges masterwork war gear finer than any city smith can make, if a ruler can pay his price and wait on his fire.",
    category: "terrain",
    rarity: "legendary",
    spawn: "Not in the realm yet: coming soon to the frontier roads",
    teaser: true
  });

  return { rarityWeights: RARITY_WEIGHT, entries };
}
