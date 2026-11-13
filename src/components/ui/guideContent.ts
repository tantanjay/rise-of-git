import { CivilizationType, NPCRarity, SCARCE_RESOURCES } from "@/types";
import type { Preview } from "./CodexPreview";
import { CASTLE_STAGES, EMPYREAN_STAGE, RED_STAR_FROM, WONDER_STAGE } from "@/utils/castle";
import { CHRONICLE } from "@/utils/chronicle";
import { FOOTPRINT, FOOTPRINT_MARGIN, RIM_AREAS, VOIDRIFT_SIZE, WILD_FRAME, WORLD_SCALE, WORLD_SIZE, ZONE_HALF } from "@/utils/worldGeometry";
import { HORROR, HORROR_GEM, HORROR_LEVELS } from "@/utils/horror";
import {
  BATTLE_ROUND_MS,
  CIV_DEMOGRAPHICS,
  CIV_LOAD_MULT,
  CIV_MARCH_MULT,
  CIV_SOLDIER_SHARE,
  BANDIT_STASH_BY_TIER,
  BOSS_BOUNTY,
  BOSS_HOARD,
  BOSS_HOARD_GEMS,
  NPC_KINGDOM_REFILL_SHARE,
  NPC_KINGDOM_TREASURY_PER_LEVEL,
  REALM_TREASURY_TIER_MULT,
  REALM_CONQUEST_HOARD,
  realmHoardText,
  DAILY_RESOURCE_NODE_COUNT,
  WAVE_RESOURCE_NODE_COUNT,
  GATHER_RATE_PER_SEC,
  LOAD_PER_SOLDIER,
  MOB_LOOT_BY_TIER,
  PACK_GEAR,
  PACK_GEAR_ORDER,
  PVE_LOAD_MULT,
  TREASURE_CONTENTS_BY_TIER,
  MARCH_CAPACITY_SHARE,
  MARCH_SLOT_LEVELS,
  MOBILIZATION_COST,
  PROTECTED_TREASURY_PER_LEVEL,
  SOLDIER_FOOD_UPKEEP,
  SUMMON_COST,
  SETTLERS,
  FESTIVAL,
  CALL_TO_ARMS_MS,
  festivalCostFor,
  WALL_BURN_THRESHOLD,
  WALL_BURN_REPAIR_HOURS,
  WALL_UNBURN_SHARE,
  WALL_DEF_MULT,
  WALL_DAMAGE_TAKEN_MULT
} from "@/utils/civDemographics";
import { EPIC_LANDMARK_POOLS } from "@/components/3d/world/landmarks";
import { DAY_PART_EFFECTS, GEM_TILT, HARVEST_SHARE_CAP, HARVEST_WEIGHT_SCALE, NIGHT_HARVEST_MULT, SEASONS, SEASON_MODS, SEASON_SUN, hhmm } from "@/utils/realmTime";
import { LANDMARK_STEPS } from "@/components/3d/world/landmarkStages";
import { DISASTERS, DISASTER_EFFECTS, DISASTER_KINDS, DISASTER_SCHEDULE } from "@/utils/disasters";
import { REALM_CYCLE_DAYS, REALM_STAGES, REALM_STAGE_DAYS, REALM_STAGE_LEVELS } from "@/components/3d/world/realmTypes";
import { DEED_RULES } from "@/utils/scriptoriumApi";
import { AFTERMATH_LOOKS } from "@/utils/spellFx";
import { BATTLE_ROUNDS, BOSS_FREEZE_CHILL, BOSS_KIT_SIZE, BOSS_PARALYZE_MULT, FINALE_LAST_STAND, KIT_SIZES, RALLY_BATTLE_ROUNDS, STATUS_MAX_SOURCES, STATUS_RULES, UnitRarity } from "@/utils/battleArts";
import { BAND_BOSS_DAMAGE, BATTLE_PAY, HEAL_PRICE_SHARE, MERC_RARITIES, MERC_RULES, bandCapForSlots, battlePayFor, costText, mercDurationText } from "@/utils/mercenaries";
import { ARMORY_RARITIES, ARMORY_RULES, ARMORY_SETS, ARMORY_TARGET_SHARE, EPIC_GEM, setText } from "@/utils/armory";
import { MUSTER_SPLITS } from "@/utils/muster";
import { CHAMPION_ART_SHARE, CHAMPION_MAX_GAIN, CHAMPION_MAX_LEVEL, CHAMPION_SLOTS, CHAMPION_STAT_PER_LEVEL, CHAMPION_TARGET_SHARE, DAILY_RENOWN, HASTEN_GEM_LEVEL, KIT_UNLOCKS, RENOWN, championModelType, healMsFor, xpForLevel as champXpFor, type ChampionLooks } from "@/utils/champion";

/** A champion's look for the chapter's models: every slot on option `v`, turned a little by its slot */
const champLooks = (v: number) => Object.fromEntries(CHAMPION_SLOTS.map((s, i) => [s, (v + i) % 4])) as ChampionLooks;
import { MOONWELL, hastenCostFor, BOSS_BATTLE_CAP, BOSS_WRATH, CIV_BOSS_DAMAGE, GATE_BASE_GARRISON, GATE_DUTY_TEXT, GATE_LEVEL, GATE_REINFORCE_CAP, GATE_SCOUT_CATCH, SCOUT_ODDS, GATE_WALL_HP, GATE_WALL_TIER, SCOUT_MAX_SOLDIERS, SCOUT_MOUNT } from "@/utils/war";

/* ------------------------------------------------------------------------- */
/* The Guide Book: the game's rules in short chapters, each with 3D models.   */
/* Numbers come from the client mirrors of the server's config wherever one  */
/* exists, so the text follows the code. Keep it in step with GAME_GUIDE.md. */
/* ------------------------------------------------------------------------- */

export interface GuideModel {
  label: string;
  preview: Preview;
  /** Not in the realm yet: locked on its button, the Coming soon ribbon over its preview */
  soon?: boolean;
}

export interface GuideSection {
  heading?: string;
  body?: string;
  /** Short label → value lines shown under the text */
  facts?: Array<[string, string]>;
}

export interface GuideChapter {
  id: string;
  group: "The Realm" | "Your City" | "Civilizations" | "War";
  title: string;
  emblem: string;
  summary: string;
  /** The models the preview can switch between (first is shown first) */
  models: GuideModel[];
  sections: GuideSection[];
  /** Civilization chapters show that civ's Unique Trait and its buffs and debuffs */
  civ?: CivilizationType;
}

export const GUIDE_GROUPS: GuideChapter["group"][] = ["The Realm", "Your City", "Civilizations", "War"];

/** XP needed for a building level (mirrors the level curve in server/src/kingdomUtils.ts) */
const xpForLevel = (n: number) => (n <= 1 ? 0 : Math.round(5 + 0.8 * (n - 1) ** 2));

const pct = (v: number) => `${Math.round(v * 100)}%`;
const x = (v: number) => `${v}×`;
const n = (v: number) => v.toLocaleString("en-US");
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

const castle = (civ: CivilizationType, stage: number): Preview => ({ kind: "castle", civ, stage });
const npc = (type: string, rarity: NPCRarity, boss = false, scaled = !boss): Preview => ({ kind: "npc", type, rarity, boss, scaled });
/** An epic landmark as it looks on its rotation day, halfway through */
const staged = (type: string, stage: "rising" | "crumbling"): Preview => ({ kind: "npc", type, rarity: "epic", boss: false, scaled: false, stage, step: Math.floor(LANDMARK_STEPS / 2) });
/** A buffer realm at a stage of its cycle (0 common … 3 epic), on its building day halfway through when `building` */
const realm = (type: string, stage: number, building = false): Preview => ({
  kind: "npc",
  type,
  rarity: REALM_STAGES[stage],
  boss: false,
  scaled: false,
  realmStage: stage,
  ...(building ? { stage: "rising" as const, step: Math.floor(LANDMARK_STEPS / 2) } : {})
});
const stageLevels = (i: number) => `City Hall ${REALM_STAGE_LEVELS[i][0]}–${REALM_STAGE_LEVELS[i][1]}`;

/** Epic landmarks standing in each buffer region at a time (mirrors EPICS_PER_REGION in server/src/worldMapGenerator.ts) */
const EPICS_PER_REGION = 1;
const POOL_SIZE = EPIC_LANDMARK_POOLS["buf-sea-fjord"].length;

const CIV_NAMES: Record<CivilizationType, string> = { human: "Human", elf: "Elf", dwarf: "Dwarf", orc: "Orc", arcane: "Nethergarde" };
const ORDER: CivilizationType[] = ["human", "orc", "dwarf", "elf", "arcane"];
const perCiv = (fn: (c: CivilizationType) => string) => ORDER.map((c) => `${CIV_NAMES[c]} ${fn(c)}`).join(" · ");
/** Bulk resources in a treasure chest of this tier */
const chestTotal = (tier: string) => {
  const t = TREASURE_CONTENTS_BY_TIER[tier];
  return t.gold + t.iron + t.stone + t.lumber + t.food;
};

function civChapter(civ: CivilizationType, emblem: string, models: GuideModel[], intro: string, extra: GuideSection[] = []): GuideChapter {
  const d = CIV_DEMOGRAPHICS[civ];
  const u = d.soldierUnit;
  return {
    id: `civ-${civ}`,
    group: "Civilizations",
    title: d.name,
    emblem,
    summary: intro,
    civ,
    models,
    sections: [
      {
        heading: "People",
        facts: [
          ["Population", `${x(d.popMultiplier)} capacity (City Hall × 100 × ${d.popMultiplier})`],
          ["Births", d.birthFactor > 0 ? `${pct(d.birthFactor)} of the people per harvest, less as the city fills` : "None: summoned by void ritual"],
          ["Lifespan", d.lifespanDescription],
          ["Workforce", d.civilianYieldDesc]
        ]
      },
      {
        heading: `Soldier: ${u.name}`,
        body: `${u.trait}: ${u.traitDesc}.`,
        facts: [
          ["HP · ATK · DEF", `${u.hp} · ${u.atk} · ${u.def}`],
          ["Soldier cap", `${pct(CIV_SOLDIER_SHARE[civ])} of the people`],
          ["March speed", d.marchSpeedDesc],
          ["March capacity", x(CIV_MARCH_MULT[civ])],
          ["Load per soldier", `${LOAD_PER_SOLDIER * CIV_LOAD_MULT[civ]}`]
        ]
      },
      ...extra
    ]
  };
}

export const GUIDE_CHAPTERS: GuideChapter[] = [
  /* --------------------------------- The Realm -------------------------------- */
  {
    id: "realm",
    group: "The Realm",
    title: "The Realm at a Glance",
    emblem: "🗺️",
    summary: "Every developer rules a kingdom; every repository they work on becomes a building. Nobody has to click anything: the realm grows from real Git work.",
    models: [
      { label: "A young keep", preview: castle("human", 0) },
      { label: "A grown citadel", preview: castle("dwarf", 2) },
      { label: "A wonder", preview: castle("elf", 4) }
    ],
    sections: [
      {
        body: "Your kingdom is your Git account. The repos you commit to stand in your city as buildings (owning one is not enough), and their levels add up to your castle. Every 15 minutes the realm shares out a harvest of resources, and you spend them on improvements and armies.",
        facts: [
          ["Kingdom", "A Git user"],
          ["Building", "A repo with at least one commit of yours"],
          ["Building level", "Contribution XP in that repo"],
          ["Castle level", "From the sum of all building levels"],
          ["Weeds & health", "Days since the repo's last commit"],
          ["Townsfolk", "Your commits this week"],
          ["Resources", "A fixed pool every 15 min, shared by past-week XP"],
          ["🟢 Online now", "A white curtain of light round the castle and a green dot by the ruler's name on the map"]
        ]
      },
      {
        heading: "Five civilizations",
        body: "Rulers are spread over four mortal civilizations (Humans, Elves, Dwarves, Orcs), each in its own province. The fifth, Nethergarde, rules the Voidrift at the centre of the map and is entered only by conquest."
      },
      {
        heading: "🌾 The map and its Wild Rim",
        body: `Every province, buffer zone and strip of the frontier has ${Math.round((WORLD_SCALE ** 2 - 1) * 100)}% more ground than the first map, and round all of them runs the Wild Rim, ${WILD_FRAME} units deep on every side and round the corners: each stretch the region beside it gone wild, sparser and rockier, before the coast. Resource nodes and roving packs spread out there when the zones fill up; castles, free realms, bosses and landmarks never stand on it. Nothing on the map stands on anything else: every kind of thing has its own patch of ground, and a spawn with no room is skipped, never piled on another.`,
        facts: [
          ["Board", `${WORLD_SIZE} units across; the zones end ${ZONE_HALF} out`],
          ["Wild Rim", `${RIM_AREAS.length} stretches (4 sides, 4 corners), ${WILD_FRAME} units deep: nodes and packs, no one's safe territory`],
          ["Spacing", `Two things stand at least their footprints + ${FOOTPRINT_MARGIN} apart: castle ${FOOTPRINT.castle}, boss ${FOOTPRINT.boss}, landmark ${FOOTPRINT.landmark}, node ${FOOTPRINT.resource}, common pack ${FOOTPRINT.encounter.common}`],
          ["Marches", `Armies move ${WORLD_SCALE.toFixed(3)}× faster to match, so every road takes as long as it did`],
          ["Voidrift", `${VOIDRIFT_SIZE} units across: its castles on a tight ring round the Core, its open outer band for packs, nodes and the titan`],
          ["🌀 Void Gate", "Stands south of the Core, its climb coming soon: click it on the map"]
        ]
      }
    ]
  },
  {
    id: "rarity",
    group: "The Realm",
    title: "Rarity & the Living World",
    emblem: "✨",
    summary: "Everything in the realm is styled on one rarity ladder, so you can tell at a glance how special it is. And nothing stands still.",
    models: [
      { label: "Common wolf pack", preview: npc("mob-wolf", "common") },
      { label: "Rare troll vanguard", preview: npc("mob-troll", "rare") },
      { label: "Epic warlord's horde", preview: npc("bandit-warlord", "epic") },
      { label: "Rare strongbox", preview: npc("treasure-strongbox", "rare") },
      { label: "Epic hoard", preview: npc("treasure-dragonhoard", "epic") },
      { label: "Legendary Heart-Oak", preview: npc("lm-heart-oak", "legendary", false, false) },
      { label: "Moonwood Arch (gate)", preview: npc("gate-elf", "rare", false, false) },
      { label: "Legendary Wonder", preview: castle("human", WONDER_STAGE) },
      { label: "Mythical Empyrean", preview: castle("arcane", EMPYREAN_STAGE) }
    ],
    sections: [
      {
        body: "Common things are plain, uncommon ones get an accent and a prop, rare ones glint, epic ones get a faint curtain of light round them and orbiting motes. Legendary is two steps above epic: a tall curtain of rising light round it, a beam of light, rising embers and orbiting motes. Mythical goes further still, in crimson with a prismatic shimmer. The light always stands round the structure, never as a disc on the ground; creatures get only the sparkles (and the beam at legendary).",
        facts: [
          ["Rare", "A few twinkling glints"],
          ["Epic", "Low curtain of light, orbiting motes"],
          ["Legendary", "Tall golden curtain, beam, embers, motes"],
          ["Mythical", "Crimson prismatic curtain, crimson beam, shards"]
        ]
      },
      {
        heading: "Buildings & castles",
        body: "A building's structures climb the ladder with its level, in each civilization's own style: tier 0 is plain and matte, tier 1 adds the civilization's accent and a small prop, tier 2 metal or glowing trim, lit windows and one looping effect (smoke, a turning vane or crystal, a streaming banner), tier 3 a bigger, glowing structure with something circling it (doves, wisps, embers, crows, shards). Improvements climb by tier the same way, tier 5 legendary. The castle does the same by stage: Keep common, Castle uncommon, Citadel rare (glints), Palace epic (a low curtain of light), Wonder legendary. The Royal Codex's Buildings tab shows every step."
      },
      {
        heading: "Monsters & bandits",
        body: "Every roving band has a bigger leader in the middle and wears its tier. Common bands are plain and matte, nothing glowing. Uncommon bands share one accent colour and carry a small prop, a banner or a lantern. Rare bands get metal or glowing trim and one looping effect, like a cook-fire's smoke or a pulsing moon. Epic bands are bigger and armoured, with glowing details and embers, motes or crows orbiting them. Crews afloat, the river pirates' raft and the corsairs' skiff, rove only on the Sunken Fjord's open water; a land band, resource node or treasure that lands on water gets an islet to stand on, wide enough for gatherers to work on it. Armies marching through water wade, waist-deep at most, a ring of foam round each figure."
      },
      {
        heading: "Top class",
        body: `Your own progress climbs the same ladder: a Wonder castle (Lv21–25) and a building with ${RED_STAR_FROM} or more prestige stars (the red ★) are legendary-class. Only the Archon's Empyrean and Celestial plots are mythical. Improvements that stand as one structure (the city gate, the fountain, the dragon, the spire) are rare at tier 3, epic at tier 4 and legendary at tier 5.`
      },
      {
        heading: "Landmarks",
        body: `At the heart of each mortal province stands its legendary landmark, as the Nethergarde Core is the heart of the Voidrift: the Cathedral of the Dawn Banner (Valoria), the Heart-Oak (Sylvandale), the Anvil of the Gods (Ironforge) and the Bloodfire Throne (Drak'mar). Out in each buffer zone stands an epic landmark, ${EPICS_PER_REGION} of the region's ${POOL_SIZE} at a time, changing every week (see Landmarks & Their Rotation). On the road into each mortal province stands a frontier gate in its civilization's style, its border wall curving away both ways round the province (the Imperial High Gate, the Tusked War Pass, the Moonwood Arch, the Anvilhold Deepgate): each is an NPC kingdom that the other civilizations can attack (never its own), and while it stands no other civilization can attack a city in its province.`
      },
      {
        heading: "A living world",
        body: "Monsters walk, scurry, hop and slither about their lair with weight (heads steady, tails trailing, a pause now and then to glance round, sniff or shake), flyers beat their wings and wheel overhead, spirits hover, bandits pace their camp, treasure bobs. Chimneys smoke, flags flutter, trees and wheat sway, runes orbit and crystals pulse. Foam rolls onto the shores, Valoria's river flows under its stone bridges, forge vents smoke and lava pulses in Drak'mar's fissures. Each copy moves on its own rhythm, so no two wolves or mills ever move in step."
      }
    ]
  },
  {
    id: "landmarks",
    group: "The Realm",
    title: "Landmarks & Their Rotation",
    emblem: "🗿",
    summary: `Each buffer region keeps a pool of ${POOL_SIZE} epic landmarks in its own style. ${EPICS_PER_REGION} stands at a time, and every Sunday the old one falls to ruin while a new one rises.`,
    models: [
      { label: "Valley of the Sleeping Kings", preview: npc("lm-tomb-of-kings", "epic", false, false) },
      { label: "…rising on its day", preview: staged("lm-tomb-of-kings", "rising") },
      { label: "…crumbling on its day", preview: staged("lm-tomb-of-kings", "crumbling") },
      { label: "The Moonwell, being shaped", preview: staged("lm-moonwell", "rising") },
      { label: "The Leviathan's Jaw", preview: npc("lm-leviathan-arch", "epic", false, false) },
      { label: "The Old King's Skybridge", preview: npc("lm-sky-bridge", "epic", false, false) }
    ],
    sections: [
      {
        heading: "Four regions, four styles",
        facts: [
          ["🌊 Sunken Fjord", "Sea ruins and wrecks: the Kraken's Folly, Coral Trench, Atlantis Spire, Pearl Lagoon, Drowned Lighthouse, Leviathan's Jaw"],
          ["🏜️ Scorchwind", "Desert temples: Palm Oasis, Obsidian Pyramid, Titan Skeleton, Sandstone Canyon, Temple of the Burning Disc, Valley of the Sleeping Kings"],
          ["🌲 Deepwood", "Forest shrines: Stonehenge, World Tree Hollow, Mushroom Megalith, Bandit Den, Moonwell Shrine, Grove of Whispering Spirits"],
          ["🏔️ Dragonspine", "Mountain forges: Ignis Caldera, Iron Delve, Glacial Peak, Basalt Gorge, the Giants' Forge, the Old King's Skybridge"]
        ]
      },
      {
        heading: "Rotation day",
        body: `Every Sunday (00:00 UTC) each region shows two landmarks for a day. The leaving one crumbles where it stands: stones tilt and fall into rubble, lights go out, dust rises. The arriving one rises at a new spot under scaffolding and a crane, masons hammering, course by course; magical sites are shaped instead, their stones floating round them. Both move on in ${LANDMARK_STEPS} steps through the day, and on Monday only the new one stands. Scouting one on its day tells you how long it has left.`,
        facts: [
          ["Standing", `${EPICS_PER_REGION} of ${POOL_SIZE} per region`],
          ["Changes", "Every Sunday, 00:00 UTC"],
          ["Rotation day", "24 h: the old one 🏚️ crumbles, the new one 🏗️ rises"],
          ["Spacing", `Clear of every landmark, castle, boss, realm and the day's nodes by both footprints + ${FOOTPRINT_MARGIN} (a landmark covers ${FOOTPRINT.landmark})`],
          ["Royal Codex", "Shows all six of each region, the standing one marked"]
        ]
      },
      {
        heading: "The legendary ones never move",
        body: "Each province's legendary landmark stands at its heart for good; only the epic landmarks of the buffer regions rotate."
      }
    ]
  },
  {
    id: "xp",
    group: "The Realm",
    title: "Contribution XP",
    emblem: "✨",
    summary: "XP rewards meaningful work, not raw commit count. One ordinary commit is about 1 XP.",
    models: [
      { label: "Lv1 hut", preview: { kind: "building", district: "residential_commercial", level: 1 } },
      { label: "Lv10 houses", preview: { kind: "building", district: "residential_commercial", level: 10 } }
    ],
    sections: [
      {
        body: "Only meaningful lines count: blank lines, comments, lockfiles, build output and pure reformats are ignored. A one-line fix is worth about 0.6 XP, 100+ changed lines a full 1 XP.",
        facts: [
          ["Commit", "0.5 – 1.0 XP by size"],
          ["Big commit (500+ lines)", "+0.5 / +1.0 / +1.5 bonus"],
          ["Merged pull request", "+3 XP"],
          ["Open pull request", "+0.5 XP"],
          ["Review on someone's PR", "+1.5 XP (once per PR)"],
          ["🪶 Sealed deed report", `${DEED_RULES.choices.join(" / ")} XP, at most ${DEED_RULES.dailyCap} a day`],
          ["Merge commit, empty commit", "0 XP"]
        ]
      },
      {
        heading: "Diminishing returns",
        body: "Across all your repos, your first 5 commits of the day count in full, the 6th–10th at half and every one after that at a fifth. Spreading spam over repos doesn't help."
      }
    ]
  },

  {
    id: "scriptorium",
    group: "The Realm",
    title: "The Scriptorium",
    emblem: "🪶",
    summary: "Where the realm's scribes write down what was done: the tree of what the company builds, and deed reports for work that isn't a commit.",
    models: [
      { label: "The scribes' folk", preview: { kind: "folk", civ: "human" } },
      { label: "A repo's hall", preview: { kind: "building", district: "residential_commercial", level: 12 } }
    ],
    sections: [
      {
        heading: "The tree",
        body: "Division → Client → Project → repos. Administrators set the Divisions; Admins, Special Overseers and the Archon add the Clients (a client, tenant or app). Any developer creates a project and puts their own repos in it (owned or committed to). A repo sits in one project at most; repos in none wait in the Unsorted bucket.",
        facts: [
          ["Divisions", "Admins"],
          ["Clients", "Admins, Special Overseers, the Archon"],
          ["Projects", "Anyone (edit your own)"],
          ["Moving a repo out of someone else's project", "A manager"]
        ]
      },
      {
        heading: "Deed reports",
        body: `A meeting, research, support duty, a deployment, a review outside Git: log it on one of your repos with a title, a short report and an XP claim. The first ${DEED_RULES.autoSeal} XP of a day seal at once and raise the building; past that an Admin, Special Overseer or the Archon seals or rejects it, and you hear it from the herald. Nobody seals their own.`,
        facts: [
          ["XP per deed", DEED_RULES.choices.map((c) => c.toFixed(1)).join(" · ")],
          ["Daily cap", `${DEED_RULES.dailyCap} XP a day (pending and revoked count, rejected frees it)`],
          ["Sealed at once", `The first ${DEED_RULES.autoSeal} XP of the day (a revoked deed's place isn't sealed at once again)`],
          ["Days", "Today or yesterday"],
          ["Pays", "Building and castle levels, and the harvest, like commit XP"]
        ]
      }
    ]
  },

  {
    id: "omens",
    group: "The Realm",
    title: "Omens",
    emblem: "🌠",
    summary: "You are the gods of this realm: your commits raise its cities. A god doesn't pray, it sends omens down to the stewards.",
    models: [{ label: "A moon-wisp's glow", preview: { kind: "folk", civ: "elf" } }],
    sections: [
      {
        body: "☰ menu → Send an Omen: tell the realm's admins about a bug, an idea, the balance, or just give praise. Only admins read them. When one of them reads yours, the herald brings you word: “Your omen was heeded”.",
        facts: [
          ["Kinds", "🐞 Bug · 💡 Idea · ⚖️ Balance · 🙌 Praise · 🌠 Other"],
          ["Per day", "5 omens"],
          ["Read by", "Admins only"]
        ]
      }
    ]
  },

  {
    id: "chronicle",
    group: "The Realm",
    title: "The Weekly Chronicle",
    emblem: "📖",
    summary: "Every week the realm's bards tell the story of the week before: its sieges, its kills, its finds and its fallen, as legend, never as numbers of work.",
    models: [
      { label: "The great hall where it is told", preview: castle("human", WONDER_STAGE) },
      { label: "The Voidrift's halls", preview: castle("arcane", WONDER_STAGE) }
    ],
    sections: [
      {
        body: `Early each week the Crown publishes the story of last week (Sunday to Sunday). It reaches every ruler as a herald notice, a 📖 banner shows its title for ${CHRONICLE.BANNER_DAYS} days, and it is kept in the Royal Codex under 📜 Chronicles, chapter after chapter, so the saga goes on.`,
        facts: [
          ["Told", "Voidrift slots taken and thrones lost, the ruler who kept attacking until the rift gave way, legendary finds, boss kills, Xal'Vorath driven back, slain or left to burn a city, the greatest siege, the longest defence, castles burned, comebacks, titles, civilization swaps, deeds sealed, disasters weathered"],
          ["Solo kill", `you dealt ${pct(CHRONICLE.SOLO_KILL_SHARE)} or more of a boss's wounds and struck the last blow`],
          ["Stolen kill", "someone else struck the last blow on a boss you wounded most"],
          ["Persistence", `${CHRONICLE.PERSISTENCE_MIN_ATTEMPTS}+ assaults on the Voidrift before one won through`],
          ["Your work", "told as the forges, bells, looms, drums and runes of your civilization, never counted"],
          ["Its look", "a crest of the week's greatest deed beside the opening, icons the bard chose, your name with your people's crest"],
          ["A quiet week", "no great deeds; the realm rests and its heroes sharpen their blades"]
        ]
      },
      {
        heading: "Who writes it",
        body: `Admins, Special Overseers and the Archon publish it from 👑 Royal Decrees → Weekly Chronicle: the week's happenings, a ready prompt for any bard (an LLM) with the last ${CHRONICLE.PROMPT_PAST} chapters, then the story pasted back, edited and published. One story per week.`
      }
    ]
  },

  /* --------------------------------- Your City -------------------------------- */
  {
    id: "buildings",
    group: "Your City",
    title: "Buildings & Districts",
    emblem: "🏠",
    summary: `Each repo is a building whose level comes from its XP, up to Lv25. The plot grows from huts to great halls.`,
    models: [
      { label: "Lv3 huts", preview: { kind: "building", district: "residential_commercial", level: 3 } },
      { label: "Lv12 manor", preview: { kind: "building", district: "residential_commercial", level: 12 } },
      { label: "Lv20 farm", preview: { kind: "building", district: "food_field", level: 20 } },
      { label: "Lv25 keep ★★★★", preview: { kind: "building", district: "soldier_building", level: 25, prestige: 4 } },
      { label: `Lv25 keep, red ★${RED_STAR_FROM}`, preview: { kind: "building", district: "soldier_building", level: 25, prestige: RED_STAR_FROM } }
    ],
    sections: [
      {
        heading: "Level from XP",
        body: `XP needed for level n = 5 + 0.8 × (n − 1)². Lv25 is the grand structure. Past it every 200 XP adds a ★ prestige star: banners, a gold border, sparkles, then a low curtain of light round the plot (epic). From the ${RED_STAR_FROM}th star the row turns into one red ★ and the plot becomes top class: a tall golden curtain of light round the whole plot, rising embers and orbiting motes (with HD graphics its banners also become gilt standards, its border a gilt kerb set with gems, and pennants fly from its towers). No plot gets a pillar of light; only the castle keeps its beam.`,
        facts: [5, 10, 15, 20, 25].map((lv) => [`Lv${lv}`, `${xpForLevel(lv)} XP`] as [string, string])
      },
      {
        heading: "Four districts",
        body: "Houses (35%), animal fields (25%), food fields (25%) and soldier buildings (15%) each take a quadrant of the city. Each has four structure tiers: huts → houses (Lv4) → the first manor (Lv12) → a great hall (Lv20). Fences, paths, lamps, statues and towers are added along the way."
      },
      {
        heading: "Health",
        body: "Health is 100 minus the days since the repo's last commit (never below 40). Flowers bloom on healthy plots and weeds grow on neglected ones. After 90 days without a commit the plot goes dormant and loses its banner and lanterns; one new commit raises them again."
      }
    ]
  },
  {
    id: "castle",
    group: "Your City",
    title: "The Castle",
    emblem: "🏰",
    summary: "Castle level = 1 + √(sum of all building levels), up to Lv25. The square root rewards a well-rounded city, and a repo past Lv25 keeps counting its extra XP, so a few deep repos are not held back.",
    models: CASTLE_STAGES.slice(0, EMPYREAN_STAGE).map((st, i) => ({ label: `${st.name} (Lv${st.from}+)`, preview: castle("human", i) })),
    sections: [
      {
        body: "The castle is rebuilt bigger every 5 levels. Its level is also your City Hall level: it sets your population, march slots, wall HP and protected vault.",
        facts: [
          ...CASTLE_STAGES.slice(0, EMPYREAN_STAGE).map((st) => [st.name, `Lv${st.from}–${st.from + 4}`] as [string, string]),
          ["Past Lv25", "A starred repo counts 25 × its XP ÷ 466 (18★ ≈ 207)"],
          ["Examples", "1 hut → Lv2 · ten Lv5 buildings → Lv8 · twenty Lv20 → Lv21 · three 18★ repos → Lv25"]
        ]
      },
      {
        heading: "Castle prestige",
        body: "A Wonder (Lv21–25) is top class, as grand as a legendary landmark: a tall golden curtain of light round it, a beam of light, rising embers and orbiting motes, in the city and on the world map. Past a raw level of 25, every 3 extra levels add a prestige tier (up to ★★★★): a gold aura ring, a light beacon, a golden halo, then orbiting sparkles. With HD graphics the Wonder is grander in its model too (taller towers and spires, its civilization's signature rebuilt, parts that turn and glow), and its prestige becomes a ring of gilt light-standards, a beam bright down its middle, a gilt halo with rays and sparkles rising round it."
      }
    ]
  },
  {
    id: "harvest",
    group: "Your City",
    title: "Resources & the Harvest",
    emblem: "🌾",
    summary: "Every 15 minutes a fixed pool of resources is shared across all kingdoms, weighted by each ruler's past-week XP.",
    models: [
      { label: "Grain field", preview: npc("res-grain", "common") },
      { label: "Gold mine", preview: npc("res-gold", "rare") },
      { label: "Dragonstone core", preview: npc("res-dragonstone", "legendary") }
    ],
    sections: [
      {
        body: `Everyone gets a small guaranteed minimum; the rest is shared by weight = ${HARVEST_WEIGHT_SCALE} × √activity score + 1, so 4× the work earns 2× the share and quiet kingdoms still get a little. No kingdom takes more than ${pct(HARVEST_SHARE_CAP)} of a pool. Each harvest also drops one random scarce gem, shared the same way.`,
        facts: [
          ["Pool per harvest", "1,000 gold · 25k iron · 50k stone · 100k lumber · 250k food"],
          ["Activity score", "2 × past-week XP, raised by your play streak"],
          ["Pool weight", `${HARVEST_WEIGHT_SCALE} × √activity score + 1`],
          ["Share cap", `${pct(HARVEST_SHARE_CAP)} of each pool; the excess goes to the others`],
          ["Building harvest", "Per building level: 0.2 gold · 2 iron · 4 stone · 4 lumber · 10 food"],
          ["🔥 Active Surge", "A repo with a commit or merged PR in 48 h harvests double"],
          ["Workforce", "Every 100 civilians add their civ's yield"],
          ["🌗 Night & season", `Night ×${NIGHT_HARVEST_MULT}; the season ±${pct(SEASON_MODS.harvest)} (Day, Night & Seasons)`]
        ]
      },
      {
        heading: "🔥 Play streak",
        body: "A play day is a day with at least 5 game actions (marches, scouts, improvements…). Each day in a row adds +2% to your activity score, up to +20%."
      }
    ]
  },
  {
    id: "seasons",
    group: "The Realm",
    title: "Day, Night & Seasons",
    emblem: "🌗",
    summary: "Day and night take turns with the harvest: one harvest is day, the next is night. Night pays less but drops more gems, and every week a new season favours one civilization and burdens another.",
    models: [
      { label: "Moonwell Shrine", preview: npc("lm-moonwell", "epic", false, false) },
      { label: "Grain field", preview: npc("res-grain", "common") },
      { label: "Farmland", preview: { kind: "building", district: "food_field", level: 12 } }
    ],
    sections: [
      {
        heading: "One harvest day, one harvest night",
        body: "Every harvest window (15 minutes) is either day or night, in turn, so a realm day is two harvests. The harvest that ends a window pays it as day or night. The sky runs through dawn, early morning, day, late afternoon and dusk, then nightfall, deep night and the small hours; windows, lamps and lanterns light up after dusk. Sunrise and sunset move with the season while the harvests stay put: summer light lingers into the night harvest, winter dark reaches into the day harvest. The day & season button in the top bar is the harvest timer: it shows which one is running and counts down to the next harvest.",
        facts: (["day", "night"] as const).map((k) => {
          const e = DAY_PART_EFFECTS[k];
          return [`${e.emblem} ${e.name} harvest`, k === "night" ? `harvest ×${e.harvest}, gem pool ×${e.scarcePool}, moon gems ×${GEM_TILT}` : `full harvest, sun gems ×${GEM_TILT}`] as [string, string];
        }).concat(SEASONS.map((s) => [`${s.emblem} ${s.name} sun`, `${hhmm(SEASON_SUN[s.key].rise)} → ${hhmm(SEASON_SUN[s.key].set)}`] as [string, string]))
      },
      {
        heading: "Life after dark",
        body: "At night the children are asleep and most townsfolk stay indoors: only about one in five is still about, and the night watch walks the main roads and the plaza. Everyone out after dark carries a light in their civilization's style, and so does every army and gathering party on the world map. The frontier gates glow with their braziers, torches and lanterns, and the Voidrift's orbiting shards smoulder violet.",
        facts: [
          ["👑 Humans", "Brass hand lantern"],
          ["🏹 Elves", "Floating moon-wisp"],
          ["⚒️ Dwarves", "Miner's lamp and iron lantern"],
          ["🛡️ Orcs", "Pitch torch"],
          ["🔮 Nethergarde", "Hovering void orb"]
        ]
      },
      {
        heading: "Sun and moon gems",
        body: "Each harvest drops one scarce gem. By day the sun's gems are more likely, by night the moon's, and a night drop is bigger.",
        facts: [
          ["☀️ Sun gems", "🔴 Blood Ruby · 🌌 Volcanic Obsidian · 🐉 Molten Dragon Scale"],
          ["🌙 Moon gems", "🔮 Arcane Mana · ⚡ Aether Shard · 🔷 Tide Sapphire"]
        ]
      },
      {
        heading: "Seasons",
        body: `One season a week, turning on Sunday 00:00 UTC. The buffed civilization gets +${pct(SEASON_MODS.harvest)} harvest, +${pct(SEASON_MODS.births)} births and +${pct(SEASON_MODS.march)} march speed; the debuffed one the same in reverse. Seasons never change combat. Nethergarde stands outside them. The day & season button in the top bar is framed in the season's colour; tap it for who flourishes and who struggles.`,
        facts: SEASONS.map((s) => [`${s.emblem} ${s.name} (${s.title})`, `▲ ${CIV_NAMES[s.buffed]} · ▼ ${CIV_NAMES[s.debuffed]} — ${s.story}`])
      },
      {
        heading: "Weather",
        body: "Grass and leaves take the season's colours, and the weather follows it.",
        facts: SEASONS.map((s) => [`${s.emblem} ${s.name}`, s.weather])
      }
    ]
  },
  {
    id: "disasters",
    group: "The Realm",
    title: "World Disasters",
    emblem: "⛈️",
    summary: `${DISASTER_SCHEDULE.MAX_PER_WEEK > 1 ? `1–${DISASTER_SCHEDULE.MAX_PER_WEEK}` : "One"} disasters strike the realm each week, ${DISASTER_SCHEDULE.DURATION_H} hours each. Every civilization copes with one of them and suffers from another; the herald warns an hour before.`,
    models: [
      ...DISASTER_KINDS.map((k) => ({ label: `${DISASTERS[k].emblem} ${DISASTERS[k].name}`, preview: { kind: "disaster", disaster: k } as Preview })),
      { label: "👑 Blackfang's Raid", soon: true, preview: { kind: "raid" } as Preview }
    ],
    sections: [
      {
        heading: "When they strike",
        body: `Each realm day rolls for one: ${pct(DISASTER_SCHEDULE.BASE_CHANCE)} at first, +${pct(DISASTER_SCHEDULE.MISS_STEP)} for every day without one, half the base chance the day after one. None by Saturday makes Saturday's certain; after ${DISASTER_SCHEDULE.MAX_PER_WEEK} in a week none comes until the week turns (Sunday 00:00 UTC). Never two in a day. All ${DISASTER_KINDS.length} kinds strike once, in a random order, before any strikes again; an unfinished round carries over to the next week, and the same kind never comes twice in a row. They start between ${String(DISASTER_SCHEDULE.START_FROM).padStart(2, "0")}:00 and ${DISASTER_SCHEDULE.START_TO}:00 realm time, mostly in the morning. An hour before, the herald warns the realm and a countdown chip appears in the top bar: dashed while the disaster is coming, solid while it lasts, ▲ or ▼ when your civilization copes or suffers. Tap it for the details.`,
        facts: [
          ["Length", `${DISASTER_SCHEDULE.DURATION_H} hours`],
          ["Warning", `${DISASTER_SCHEDULE.WARNING_H} hour before`],
          ["Copes", `half the effect, unless noted`],
          ["Suffers", `double the effect, unless noted`]
        ]
      },
      ...DISASTER_KINDS.map((k) => {
        const d = DISASTERS[k];
        return {
          heading: `${d.emblem} ${d.name}`,
          body: `${d.effect} ${d.look}`,
          facts: [
            [`▲ ${CIV_NAMES[d.copes]}`, d.copeText],
            [`▼ ${CIV_NAMES[d.suffers]}`, d.sufferText]
          ] as Array<[string, string]>
        };
      }),
      {
        heading: "👑 Blackfang's Raid",
        body: "Vargo Blackfang, the Bandit King, is gathering every bandit warband for one great raid. His hooded looters will run through the realm with sacks on their backs, and no kingdom's harvest will be safe. What comes after the raid, nobody has lived to say.",
        facts: [["Status", "Coming soon: not in the realm yet"]]
      },
      {
        heading: "Under the Blood Moon",
        body: `Only battle rounds fought inside its ${DISASTER_SCHEDULE.DURATION_H} hours are changed: a battle already under way feels it from its first round inside the window, and stops feeling it when the window ends. Mobs, bandits and bosses get +${pct(DISASTER_EFFECTS.BLOOD_MOON_NPC)} HP, ATK and DEF; NPC realms and rulers' castles fight as ever. A rally that can kill a boss today can still kill it under the red moon, in a few more tries.`
      }
    ]
  },
  {
    id: "improvements",
    group: "Your City",
    title: "City Improvements",
    emblem: "🧱",
    summary: "Ten improvements, five tiers each. Every tier shows in the city and adds a permanent bonus. Tiers 1–2 are cheap; from tier 3 each costs 4–5× the one before.",
    models: [
      { label: "Walls I", preview: { kind: "improvement", upgradeId: "walls", tier: 1 } },
      { label: "Walls V", preview: { kind: "improvement", upgradeId: "walls", tier: 5 } },
      { label: "Dragon Statue V", preview: { kind: "improvement", upgradeId: "dragon_statue", tier: 5 } },
      { label: "Mana Spire V", preview: { kind: "improvement", upgradeId: "mana_spire", tier: 5 } },
      { label: "Spymaster's Tower V", preview: { kind: "improvement", upgradeId: "spymaster", tier: 5 } }
    ],
    sections: [
      {
        body: "For a median developer tier 1 takes a couple of hours to save for, tier 2 under a day, tier 3 about a day and a half, tier 4 a week and tier 5 a month. Gems climb the rarity ladder: tier 3 asks a rare gem, tier 4 an epic one, tier 5 a legendary one (dragon scale, titan tablet or phoenix feather). The Royal Codex lists every tier's exact cost. With HD graphics tier 5 is grander in its model too: gilt fittings, banners that stream, things that turn and pulse (the citadel's runes, the highway's triumphal arches with turning suns, a crowned dragon on its hoard, the Night Court's watching eye).",
        facts: [
          ["🧱 City Walls", `DEF ${x(WALL_DEF_MULT[1])} → ${x(WALL_DEF_MULT[5])}, damage taken −10% per tier`],
          ["🛣️ Roads", "+2% march speed per tier"],
          ["🏮 Lantern Streets", "−2% rations, +3% scout speed per tier"],
          ["🌷 Royal Gardens", "+2% births, −4% famine desertion per tier"],
          ["🛒 Market Square", "+2% gathering speed and haul per tier"],
          ["🚩 Kingdom Banners", "+2% march capacity, +1% rally ATK per tier"],
          ["⛲ Plaza Fountain", "+1% army DEF per tier"],
          ["🐉 Dragon Statue", "+1% army ATK per tier"],
          ["🔮 Mana Spire", "+1% army HP per tier"],
          ["🦉 Spymaster's Tower", `+${pct(SCOUT_ODDS.spyCatchPerTier)} catch and +${pct(SCOUT_ODDS.spyDeceivePerTier)} false intel against scouts sent to you, +${pct(SCOUT_ODDS.spySuccessPerTier)} success for your own scouts, per tier`]
        ]
      }
    ]
  },
  {
    id: "proclamations",
    group: "Your City",
    title: "Royal Proclamations",
    emblem: "📜",
    summary: "One-off royal orders with a cooldown, paid mostly in food: call settlers after a war, or hold a Festival. Improvements → 📜 Royal Proclamations. Mortal kingdoms only.",
    models: [
      { label: "Festival", preview: { kind: "festival" } },
      { label: "Festival (HD)", preview: { kind: "festival", hd: true } }
    ],
    sections: [
      {
        heading: "🏘️ Paid Settlers",
        body: `Newcomers refill a kingdom gutted by war: only while it is below ${pct(SETTLERS.MAX_FILL)} of its capacity, and never past that line. One call brings as many as the room and your treasury allow.`,
        facts: [
          ["Cost", `${SETTLERS.COST.food} food + ${SETTLERS.COST.gold} gold per settler`],
          ["Cooldown", `${Math.round(SETTLERS.COOLDOWN_MS / 3_600_000)} h`]
        ]
      },
      {
        heading: "🎉 Festival",
        body: `Bunting and lanterns over the plaza, dancing round the fountain and fireworks over the castle, in the city and on the world map. An attack on the city doesn't end it.`,
        facts: [
          ["Effect", `births ×${FESTIVAL.BIRTH_MULT}, workforce +${pct(FESTIVAL.YIELD_MULT - 1)} for ${Math.round(FESTIVAL.DURATION_MS / 3_600_000)} h`],
          ["Cost", `${n(FESTIVAL.FOOD_PER_LEVEL)} food + ${n(FESTIVAL.GOLD_PER_LEVEL)} gold per City Hall level (${n(festivalCostFor(10).food)} food at Lv10)`],
          ["Cooldown", `once every ${Math.round(FESTIVAL.COOLDOWN_MS / 86_400_000)} days, never while Called to Arms`],
          ["By royal decree", "Admins, Special Overseers and the Archon can give one for free, apart from your own weekly Festival"]
        ]
      },
      {
        heading: "⚔️ Call to Arms",
        body: `Attacking another ruler's city or a frontier gate (a march, or leading or joining a rally) keeps you at war for ${Math.round(CALL_TO_ARMS_MS / 60_000)} minutes, shown by the red ⚔️ pill in the top bar. Only the attacker is called; the defender never is. No Festival can be declared meanwhile.`
      }
    ]
  },

  /* ------------------------------- Civilizations ------------------------------ */
  civChapter(
    "human",
    "👑",
    [
      { label: "Royal Footmen", preview: { kind: "soldiers", civs: ["human"] } },
      { label: "Human Wonder", preview: castle("human", 4) },
      { label: "vs Orcs", preview: { kind: "soldiers", civs: ["human", "orc"] } }
    ],
    "The Swarm: huge numbers, cheap manpower and colossal civilian output, but fragile soldiers and a big food bill."
  ),
  civChapter(
    "orc",
    "🛡️",
    [
      { label: "Blood Berserkers", preview: { kind: "soldiers", civs: ["orc"] } },
      { label: "Orc Wonder", preview: castle("orc", 4) },
      { label: "vs Dwarves", preview: { kind: "soldiers", civs: ["orc", "dwarf"] } }
    ],
    "The Horde: the highest mortal soldier cap and the fastest to rebuild after a lost war, with thin armour."
  ),
  civChapter(
    "dwarf",
    "⚒️",
    [
      { label: "Ironbreaker Sentinels", preview: { kind: "soldiers", civs: ["dwarf"] } },
      { label: "Dwarf Wonder", preview: castle("dwarf", 4) },
      { label: "vs Elves", preview: { kind: "soldiers", civs: ["dwarf", "elf"] } }
    ],
    "The Mountain Clan: the toughest soldiers and heaviest looters, with a stone and iron economy; slow to march and to rebuild."
  ),
  civChapter(
    "elf",
    "🏹",
    [
      { label: "Sylvan Rangers", preview: { kind: "soldiers", civs: ["elf"] } },
      { label: "Elf Wonder", preview: castle("elf", 4) },
      { label: "vs Nethergarde", preview: { kind: "soldiers", civs: ["elf", "arcane"] } }
    ],
    "The Ancients: few but deadly, cheap surgical strikes and near-immortal; every loss takes days to replace, so the Moonwell sends half the fallen home wounded.",
    [
      {
        heading: "🌙 Moonwell Healers",
        body: "No elf is left on a battlefield. Healers carry the fallen home to the Moonwell, and a few of them walk back into the garrison at every harvest. Kingdom → Population & Army shows the wounded, when the next come back and the Hasten button.",
        facts: [
          ["Wounded", `${pct(MOONWELL.WOUNDED_SHARE)} of an elf army's battle losses, attacking, defending or reinforcing`],
          ["Still deaths", "Marchers lost on the road (Tempest Roads), caught scouts and gatherers"],
          ["While healing", "They keep their place in the population: they don't work, eat or fight, and no recruit can take it"],
          ["Back", `A few at every harvest, the longest-wounded first: ${pct(MOONWELL.HEAL_SHARE_PER_HARVEST)} of your soldier cap at full population (at least ${MOONWELL.HEAL_MIN_PER_HARVEST}; City Hall 3: 1, City Hall 10: 3, City Hall 20: 6). A march wiped out is back in about 3–5 h`],
          ["Hasten", `${MOONWELL.HASTEN_PER_SOLDIER.food} food + ${MOONWELL.HASTEN_PER_SOLDIER.gold} gold per soldier and 1 Sylvan Emerald per ${MOONWELL.HASTEN_SOLDIERS_PER_EMERALD} (e.g. 70 wounded: ${n(hastenCostFor(70).food)} food, ${n(hastenCostFor(70).gold)} gold, ${hastenCostFor(70).gems.emerald} emeralds)`]
        ]
      }
    ]
  ),
  civChapter(
    "arcane",
    "🔮",
    [
      { label: "Void Weavers", preview: { kind: "soldiers", civs: ["arcane"] } },
      { label: "Nethergarde Wonder", preview: castle("arcane", 4) },
      { label: "The Empyrean", preview: castle("arcane", EMPYREAN_STAGE) }
    ],
    `The Timeless Ascendants: they never die of age, grow by void ritual (${SUMMON_COST.food} food + ${SUMMON_COST.iron} iron + ${SUMMON_COST.stone} stone each) and their fallen return through the Void Well. Nethergarde is entered only by conquering a Voidrift slot.`
  ),

  /* ------------------------------------ War ----------------------------------- */
  {
    id: "armies",
    group: "War",
    title: "Armies & Marches",
    emblem: "⚔️",
    summary: "Only part of your people can bear arms. Soldiers march out in a limited number of slots, and every march pays its rations up front.",
    models: [
      { label: "All five armies", preview: { kind: "soldiers", civs: ["human", "orc", "dwarf", "elf", "arcane"] } },
      { label: "A clash", preview: { kind: "soldiers", civs: ["human", "elf"] } }
    ],
    sections: [
      {
        body: `Arm civilians in Kingdom → Population & Army (${MOBILIZATION_COST.iron} iron + ${MOBILIZATION_COST.food} food each). The home garrison eats ${SOLDIER_FOOD_UPKEEP} food per soldier per harvest; an empty granary makes 10% desert. You can never attack your own civilization.`,
        facts: [
          ["Soldier cap", perCiv((c) => pct(CIV_SOLDIER_SHARE[c]))],
          ["March slots", `⌈City Hall ÷ 5⌉: ${MARCH_SLOT_LEVELS.map((lv, i) => `${i + 1} from Lv${lv}`).join(", ")}`],
          ["March capacity", `max population × ${pct(MARCH_CAPACITY_SHARE)} × civ (${perCiv((c) => x(CIV_MARCH_MULT[c]))})`],
          ["Rations", "Paid for the round trip when you set off; elves pay 25%; never refunded"],
          ["Kinds", "⚔️ attack · 🚩 rally · 👁️ scout · ⛏️ gather · 🛡️ reinforce"]
        ]
      },
      {
        heading: "⚔️ The Muster",
        body: "Every attack, and every rally you lead, is launched from the Muster: one screen to send your mercenary bands and boxes of soldiers on one target at once. One Launch sends them all (or none, and it lists every reason), they arrive in the same moment, and every one of them fights from round 1.",
        facts: [
          ["Split chips", `Each soldier box carries ${MUSTER_SPLITS.map((s) => pct(s)).join(" / ")} of a full march (your march capacity); as many boxes as your free slots and soldiers at home allow, plus one smaller box for any soldiers left over while a slot is free`],
          ["Each box", "Its own Armory loadout and, for one box at a time, your champion at its head"],
          ["Ticks", "Never more than your free march slots"],
          ["On the map", "Marches that leave together walk side by side as one host under one label, so a bigger attack looks bigger"],
          ["Power", `Soldiers × set (standard ×1, ${ARMORY_RARITIES.map((r) => `${r} ${x(ARMORY_RULES[r].power)}`).join(", ")}) × champion (up to +${pct(CHAMPION_MAX_GAIN)}); a band: the march it was hired for × rarity × strength`],
          ["Order of battle", "Automatic, strongest first: the defenders strike your strongest stack first (your soldiers still before any band)"],
          ["Arrival", "All set off together at the slowest one's pace and reach the target in the same moment"],
          ["Forge in place", "A box short of sets (none forged, too few, or rusted) shows the shortfall and a Forge button: the Armory's own forge, with the quantity, cost and what you can afford"],
          ["Rallies", "Lead one with several armies (each its own lobby march); bands don't rally, and joining someone's rally is still one army"]
        ]
      }
    ]
  },
  {
    id: "battles",
    group: "War",
    title: "Battles, Walls & Plunder",
    emblem: "🔥",
    summary: `Battles are fought live in ${BATTLE_ROUND_MS / 1000}-second rounds (up to ${BATTLE_ROUNDS}, ${RALLY_BATTLE_ROUNDS} for a rally). Armies that arrive later join on the next round; a Muster's marches arrive together and all fight from round 1. On the map each army walks round to its own place in a ring about the target, and a boss or pack faces the army it is striking, turning to the next when that one falls.`,
    models: [
      { label: "Palisade", preview: { kind: "improvement", upgradeId: "walls", tier: 1 } },
      { label: "Citadel Ramparts", preview: { kind: "improvement", upgradeId: "walls", tier: 5 } },
      { label: "Orcs vs Humans", preview: { kind: "soldiers", civs: ["orc", "human"] } }
    ],
    sections: [
      {
        body: "Damage = soldiers × ATK × (1 − armour) with a ±15% roll, where armour = DEF ÷ (DEF + 20). The defender strikes back at the earliest-arrived army first.",
        facts: [
          ["Walls", `DEF ${x(WALL_DEF_MULT[0])} (fence) … ${x(WALL_DEF_MULT[5])}; damage taken ${pct(WALL_DAMAGE_TAKEN_MULT[0])} … ${pct(WALL_DAMAGE_TAKEN_MULT[5])}`],
          ["Burning", `At ≤ ${pct(WALL_BURN_THRESHOLD)} wall HP the city catches fire: it can't be attacked or attack until its walls repair to ${pct(WALL_UNBURN_SHARE)}: up to ${WALL_BURN_REPAIR_HOURS} h from 0%, less the higher they stood. Its castle burns on the map, and inside the walls, houses and town hall are alight`],
          ["Protected vault", `${n(PROTECTED_TREASURY_PER_LEVEL)} × City Hall of each resource can't be stolen`],
          ["Plunder", `Survivors carry ${LOAD_PER_SOLDIER} × civ load each (${perCiv((c) => `${LOAD_PER_SOLDIER * CIV_LOAD_MULT[c]}`)}), gold first`]
        ]
      },
      {
        heading: "🩸 Battle numbers",
        body: `After every ${BATTLE_ROUND_MS / 1000}-second round its numbers rise over both sides of the battle on the map, at near and mid zoom.`,
        facts: [
          ["Red −320", "Soldiers that side lost this round"],
          ["Gold ⚔️ 1,240", "Damage that side dealt this round"],
          ["🔥 −40 · ❄️ Frost Lance", "Battle Arts: a status ticking on a side, a unit's cast rising over it"],
          ["Battle report", "Round by round: each side's losses and damage, then who still stands"],
          ["March Queue", "Your fighting army's row shows the last round's losses, yours and the foe's"]
        ]
      },
      {
        heading: "🌙 Wounded elves",
        body: `Elves' trait, Moonwell Healers: of the soldiers an elf army loses in a battle, ${pct(MOONWELL.WOUNDED_SHARE)} come home wounded and the rest die. A report shows both (−70, 🌙 35 wounded), and the wounded rejoin the garrison a few at every harvest.`,
        facts: [
          ["Wounded", `${pct(MOONWELL.WOUNDED_SHARE)} of an elf army's battle losses, attacking, defending or reinforcing`],
          ["Still deaths", "Marchers lost on the road (Tempest Roads), caught scouts and gatherers"],
          ["While healing", "They keep their place in the population: they don't work, eat or fight, and no recruit can take it"],
          ["Back", `A few at every harvest, the longest-wounded first: ${pct(MOONWELL.HEAL_SHARE_PER_HARVEST)} of your soldier cap at full population (at least ${MOONWELL.HEAL_MIN_PER_HARVEST}; City Hall 3: 1, City Hall 10: 3, City Hall 20: 6). A march wiped out is back in about 3–5 h`],
          ["Hasten", `${MOONWELL.HASTEN_PER_SOLDIER.food} food + ${MOONWELL.HASTEN_PER_SOLDIER.gold} gold per soldier and 1 Sylvan Emerald per ${MOONWELL.HASTEN_SOLDIERS_PER_EMERALD} (e.g. 70 wounded: ${n(hastenCostFor(70).food)} food, ${n(hastenCostFor(70).gold)} gold, ${hastenCostFor(70).gems.emerald} emeralds)`]
        ]
      },
      {
        heading: "⚔️ War Frenzy",
        body: "Once two civilizations fight this week (from a battle's first round), no one may swap or re-align between them until Sunday 00:00 UTC, and no castle may change civilization while a battle goes on at its walls. Click a kingdom of the other civilization and its panel shows a red ⚔️ War Frenzy badge with the time left."
      }
    ]
  },
  {
    id: "scouting",
    group: "War",
    title: "Scouting & Fog of War",
    emblem: "👁️",
    summary: "Other civilizations hide their garrison, people and treasury. Send scouts to see them.",
    models: [
      { label: "Stonehenge (landmark lore)", preview: npc("lm-stonehenge", "epic", false, false) },
      { label: "A wolf pack", preview: npc("mob-wolf", "common") },
      { label: "Spymaster's Tower V", preview: { kind: "improvement", upgradeId: "spymaster", tier: 5 } },
      { label: `Scouts on a ${SCOUT_MOUNT.human.name}`, preview: { kind: "folk", mount: "human" } },
      { label: `Scouts on a ${SCOUT_MOUNT.orc.name}`, preview: { kind: "folk", mount: "orc" } }
    ],
    sections: [
      {
        body: `A scout march is 1–${SCOUT_MAX_SOLDIERS} civilians, not soldiers: your garrison stays home, and while they're away they don't work. They ride 3× faster and never fight. The report arrives when they get home and is kept for 7 days. Its numbers show as a range (~scouted–estimate) that widens as time passes.`,
        facts: [
          ["Always visible", "City Hall level, wall tier, intact / damaged / burning"],
          ["Hidden until scouted", "Garrison, population, treasury, gems, wall HP"],
          ["Never hidden", "Your own civilization and the Special Overseers"],
          ["Landmarks", "Scouting them reveals their lore"]
        ]
      },
      {
        heading: "🐎 Riders in disguise",
        body: "Scouts ride their own civilization's mount. Heading for a kingdom (a ruler's city, an NPC kingdom or frontier gate, a Voidrift citadel) they dress as its people to blend in on its roads; for anything else they wear their own clothes. Only scouts ride: every other march goes on foot.",
        facts: (["human", "elf", "dwarf", "orc", "arcane"] as CivilizationType[]).map((civ) => [civ === "arcane" ? "Nethergarde" : `${civ[0].toUpperCase()}${civ.slice(1)}s`, `${SCOUT_MOUNT[civ].name}: ${SCOUT_MOUNT[civ].blurb}`] as [string, string])
      },
      {
        heading: "🕵️ Spies & Counterspies",
        body: `Scouting a ruler's city or an NPC kingdom (Voidrift citadel, buffer realm, frontier gate) can go wrong. Caught scouts die (your people, not your garrison) and bring nothing back; deceived ones bring home a false report, its garrison, people and treasury off by ${pct(SCOUT_ODDS.lieMin)}–${pct(SCOUT_ODDS.lieMax)} either way, that looks like any other. Mobs, nodes, treasure, bosses and landmarks never go wrong. The march form shows the odds for the party you pick.`,
        facts: [
          ["Base odds", `${pct(SCOUT_ODDS.caughtBase)} caught · ${pct(SCOUT_ODDS.deceivedBase)} deceived · the rest a true report`],
          ["Their Spymaster's Tower", `+${pct(SCOUT_ODDS.spyCatchPerTier)} caught and +${pct(SCOUT_ODDS.spyDeceivePerTier)} deceived per tier`],
          ["Your side", `+${pct(SCOUT_ODDS.perExtraScout)} success per scout beyond the first, +${pct(SCOUT_ODDS.perLanternTier)} per Lantern Streets tier, +${pct(SCOUT_ODDS.spySuccessPerTier)} per Spymaster's Tower tier, elves +${pct(SCOUT_ODDS.elfBonus)}`],
          ["Watched Borders", `A city behind a standing frontier gate adds ${pct(GATE_SCOUT_CATCH.base)}–${pct(GATE_SCOUT_CATCH.max)} to the catch chance (more as the gate fills up). While the gate burns, the border is unwatched.`],
          ["Limits", `Success stays between ${pct(SCOUT_ODDS.minSuccess)} and ${pct(SCOUT_ODDS.maxSuccess)}`],
          ["⚠️ Doubtful", "With a Spymaster's Tower at least as high as the target's, a false report feels doubtful half the time (amber border): scout again"],
          ["💀 Caught", "A red row in the War Room's scout reports; your last true report stays. A ruler you scouted hears of it"]
        ]
      }
    ]
  },
  {
    id: "gathering",
    group: "War",
    title: "Gathering, Treasure & Spoils",
    emblem: "⛏️",
    summary: `${DAILY_RESOURCE_NODE_COUNT} resource nodes appear every day, and a fresh wave of ${WAVE_RESOURCE_NODE_COUNT} every two harvests. The first march to arrive works a node alone; treasure goes whole to whoever claims it. Mobs and bandits pay spoils too: the grind for young kingdoms.`,
    models: [
      { label: "Timber camp", preview: npc("res-timber", "common") },
      { label: "Mana geode", preview: npc("res-mana", "epic") },
      { label: "Relic Hoard", preview: npc("treasure-relic", "legendary") }
    ],
    sections: [
      {
        body: "In your own province and the two buffer zones bordering it, civilians do the gathering and can never be attacked; while away they don't work. Anywhere else soldiers go, and other civilizations can attack them. The Wild Rim round the map is no one's territory: gatherers there are always exposed.",
        facts: [
          ["Load", `${LOAD_PER_SOLDIER} × civ load × ${PVE_LOAD_MULT} per worker (${perCiv((c) => `${LOAD_PER_SOLDIER * CIV_LOAD_MULT[c] * PVE_LOAD_MULT}`)})`],
          ["Speed", `${GATHER_RATE_PER_SEC} units/s × civ bonus (elves ×2 lumber, dwarves ×1.5 stone/iron/gold, humans ×1.5 food, orcs ×1.25 all)`],
          ["Nodes", `${DAILY_RESOURCE_NODE_COUNT} a day + a wave of ${WAVE_RESOURCE_NODE_COUNT} every two harvests (30 min by default), the first 8 of the day one to each province and buffer zone, the rest where there is the most free ground (the Wild Rim and the Voidrift's outer band are no one's safe territory)`],
          ["Wave nodes", "Gone when their window ends, unless workers are on the way or already there: then it stays on the map until the match is over"],
          ["They stay put", "The day's nodes, each wave and each window's mobs and bandits are rolled once and kept: a castle moving in later never moves one or turns it into something else"],
          ["Gems", "Ride along without weight; whoever empties the node takes the rest"],
          ["Treasure", `30 s to claim; common ${n(chestTotal("common"))} … legendary ${n(chestTotal("legendary"))} + ${TREASURE_CONTENTS_BY_TIER.legendary.gems} gems`]
        ]
      },
      {
        heading: "🐺 Mobs & bandits",
        body: "New packs roam out with every harvest (15 min): each frontier zone always gets a common, often a second and sometimes a third (often uncommon), and its own chance at a rare (50%) and an epic (25%). Packs pay fixed spoils by tier, carried home by your survivors. A common win is worth several harvests to a young kingdom; high kingdoms earn far more just from the harvest. Common packs are small, so most City Hall 1 armies can win (elves, with so few soldiers, from about City Hall 3). Every pack also rolls its gear when it spawns, hidden until you scout it: armed and war-geared packs hit harder and carry more.",
        facts: [
          ...PACK_GEAR_ORDER.map((g) => [`${PACK_GEAR[g].emblem} ${PACK_GEAR[g].name}`, `${Math.round(PACK_GEAR[g].chance * 100)}% of packs${g === "ragged" ? ": as their stats read" : `: ${PACK_GEAR[g].description}`}`] as [string, string]),
          ["Mob spoils", `common ${n(MOB_LOOT_BY_TIER.common.food)} food · ${n(MOB_LOOT_BY_TIER.common.lumber)} lumber · ${n(MOB_LOOT_BY_TIER.common.iron)} iron · ${n(MOB_LOOT_BY_TIER.common.gold)} gold … epic ${n(MOB_LOOT_BY_TIER.epic.food)} · ${n(MOB_LOOT_BY_TIER.epic.lumber)} · ${n(MOB_LOOT_BY_TIER.epic.iron)} · ${n(MOB_LOOT_BY_TIER.epic.gold)}, split by survivors`],
          ["Bandit stash", `common ${n(BANDIT_STASH_BY_TIER.common.gold)} gold · ${n(BANDIT_STASH_BY_TIER.common.iron)} iron · ${n(BANDIT_STASH_BY_TIER.common.stone)} stone · ${n(BANDIT_STASH_BY_TIER.common.food)} food … epic ${n(BANDIT_STASH_BY_TIER.epic.gold)} gold, taken by load (×${PVE_LOAD_MULT}, as when gathering)`]
        ]
      }
    ]
  },
  {
    id: "rallies",
    group: "War",
    title: "Rallies, Bosses & Overseers",
    emblem: "🚩",
    summary: "Join forces: a rally marches together and every army hits harder. World bosses are raid content for the strongest kingdoms.",
    models: [
      { label: "Greatwyrm", preview: npc("boss-dragon", "legendary", true) },
      { label: "Kraken", preview: npc("boss-kraken", "legendary", true) },
      { label: "Overseer's spire", preview: castle("arcane", 4) }
    ],
    sections: [
      {
        heading: "🚩 Rallies",
        body: "Raise one from any target you could attack, wait 2, 5 or 10 minutes, and rulers of your civilization join. Every army gets +5% ATK per joiner (up to +25%) plus +1% per tier of the leader's Kingdom Banners.",
        facts: [
          ["Joiners", "3 (leader City Hall 1–15) · 4 (16–24) · 5 (25)"],
          ["Rounds", `A rally's armies fight ${RALLY_BATTLE_ROUNDS} rounds before falling back (any other battle ${BATTLE_ROUNDS})`]
        ]
      },
      {
        heading: "🔥 World bosses",
        body: `One giant unit per buffer zone with shared HP that never heals. Colossus Hide: an army lands (City Hall ÷ 25)² of its blows; orcs land ${pct(CIV_BOSS_DAMAGE.orc?.mult ?? 1)} of that (the war-drums can't drown a colossus's roar), elves ${pct(CIV_BOSS_DAMAGE.elf?.mult ?? 1)} (Heartseeker Volleys) and dwarves ${pct(CIV_BOSS_DAMAGE.dwarf?.mult ?? 1)} (Giant-Felling Runes), so their small armies keep pace, and a mercenary band ${pct(BAND_BOSS_DAMAGE)} (the Sellsword's Oath). Killers carry the hoard home; everyone who wounded it shares the bounty by damage. A felled boss returns 10% stronger each time that week.`,
        facts: [
          ["HP · ATK", "105k–135k · 750–1,000"],
          [`${BOSS_BATTLE_CAP.emblem} ${BOSS_BATTLE_CAP.name}`, `No battle takes more than ${pct(BOSS_BATTLE_CAP.share)} of its max HP, whoever fights it: a boss at full HP never falls in one battle`],
          [`${BOSS_WRATH.emblem} ${BOSS_WRATH.name}`, `When one ruler's armies (bands included) take ${pct(BOSS_WRATH.trigger)} of its HP in one battle, it rages: ATK ×${BOSS_WRATH.atkMult} for the rest of that battle, on top of its Enrage. Rallies never wake it`],
          ["Battle Arts", "A colossus's kit each: 3 Instincts (🪓 Cleave on every boss: 3% of every army each round, on top of its blow), 2 Arts and an ult (Finale) of its own. See the Battle Arts chapter, and each boss in the Codex"],
          ["Hoard", `${n(BOSS_HOARD.gold)} gold · ${n(BOSS_HOARD.iron)} iron / stone / lumber · ${n(BOSS_HOARD.food)} food by load, + ${BOSS_HOARD_GEMS} gems split by survivors`],
          ["Bounty", `${n(BOSS_BOUNTY.gold)} gold · ${n(BOSS_BOUNTY.iron)} iron / stone / lumber · ${n(BOSS_BOUNTY.food)} food, shared by damage`],
          ["Rotation", "Every Sunday 00:00 UTC and after every kill (24 h rest)"]
        ]
      },
      {
        heading: "👑 Overseers & the Archon",
        body: "Special Overseers never march but can be attacked and plundered; each defeat this week makes their garrison 20% stronger. The Archon of the Realm is untouchable."
      }
    ]
  },
  {
    id: "battle-arts",
    group: "War",
    title: "Battle Arts",
    emblem: "✨",
    summary: "Named units fight with more than their stats: Instincts always on, Arts they cast, and a Finale once a battle. Today the world bosses carry full kits, so an army with no Arts of its own fights them at a disadvantage, and every mob and bandit pack carries a kit of its rarity.",
    models: [
      { label: "Siren (Siren's Requiem)", preview: npc("boss-siren", "legendary", true) },
      { label: "Werewolves (Rending Blow)", preview: npc("mob-werewolf", "rare") },
      { label: "Saboteurs (Blackpowder Keg)", preview: npc("bandit-saboteur", "epic") },
      { label: "Scorpion (Stinger Storm)", preview: npc("boss-scorpion", "legendary", true) },
      { label: "Treant (Grasping Roots)", preview: npc("boss-treant", "legendary", true) }
    ],
    sections: [
      {
        heading: "Instincts, Arts and the Finale",
        body: "An Instinct is always on (stat shares add up, then multiply on top like titles). An Art is cast: at most one a round per unit. Arts have no rarity, each is worth the same over a battle; a rarer unit is stronger because it carries more. Ordinary soldiers carry none.",
        facts: (Object.keys(KIT_SIZES) as UnitRarity[]).map((r) => {
          const k = KIT_SIZES[r];
          return [r[0].toUpperCase() + r.slice(1), `${k.instincts} Instinct${k.instincts > 1 ? "s" : ""}${k.arts ? ` · ${k.arts} Art${k.arts > 1 ? "s" : ""}` : ""}${k.finale ? " · a Finale" : ""}`] as [string, string];
        }).concat([["World boss", `${BOSS_KIT_SIZE.instincts} Instincts (🪓 Cleave on each) · ${BOSS_KIT_SIZE.arts} Arts · a Finale`]])
      },
      {
        heading: "What is cast each round",
        body: "Before the blows, every unit picks from the Arts that are past their first round, off cooldown and whose condition holds (a failed condition skips it without a cooldown). An Art reaching its first round wins; otherwise the one waiting longest; a tie is settled by the battle's own roll, so the report and a replay always agree.",
        facts: [
          ["Cooldown", "Cast in round r → ready again in round r + cooldown + 1"],
          ["Late arrivals", "Count rounds from their own arrival"],
          ["Wiped out", "Casts nothing more; its Burns and Poisons still tick out"]
        ]
      },
      {
        heading: "Statuses",
        body: `The same status from the same caster refreshes; from different casters it stacks up to ${STATUS_MAX_SOURCES} times. On a boss, Paralyze lands at ${pct(BOSS_PARALYZE_MULT)} strength and never two rounds in a row, and Freeze only Chills it (−${pct(BOSS_FREEZE_CHILL)} ATK for ${STATUS_RULES.chill.rounds} rounds).`,
        facts: (Object.keys(STATUS_RULES) as Array<keyof typeof STATUS_RULES>)
          .filter((k) => k !== "freeze")
          .map((k) => {
            const r = STATUS_RULES[k];
            const extra = k === "chill" ? ` · ${STATUS_RULES.freeze.emblem} Freeze: ${STATUS_RULES.freeze.text}` : "";
            return [`${r.emblem} ${r.name}`, `${r.text}${extra}`] as [string, string];
          })
      },
      {
        heading: "🎺 The Finale",
        body: `Once per battle, in its own slot beside the round's Art: on its round, or earlier as a last stand when its unit drops under ${pct(FINALE_LAST_STAND)}, never both. A Finale that breaks the last of an army gets its own line in the report. Rallies fight ${RALLY_BATTLE_ROUNDS} rounds (others ${BATTLE_ROUNDS}), room for a Finale to land. A boss casting its Finale breaks off the fight to rear up in a battle cry, and so does a boss whose Enrage wakes.`
      },
      {
        heading: "✨ How a cast looks",
        body: "Every Art, Finale and Instinct that shows has its own look, played over the battle on the world map (and in the Sparring Grounds) as its name rises: six stages, each picked from one shared set, so Fireball and Cataclysm share their flames but not their shape. A whoosh sounds as it is cast and a boom as it lands, for battles near the camera. A Finale is bigger and louder, with a war horn; a boss's breathes embers and sparks, never a pillar of light.",
        facts: [
          ["Charge", "its colour is pulled into the caster's hand, spirals round it or rises off the ground"],
          ["Core", "a hot ball, a spike of ice, a glowing edge or a flare swells"],
          ["Trail", "flames, frost, venom or a streak of light follow the bolt (an Art on its own side lands at once)"],
          ["Burst", "a flash, shards, a splash, lightning, a dome of shields, a ring of light, a sunrise, falling stones, a whirlpool, a wall of sand, spectral wolves or a cone of fire"],
          ["Reaction", "the enemy flashes white and flinches or is jolted; the caster's side glows, lifted"],
          ["Aftermath", "the status it leaves plays on its army while it holds (below)"]
        ]
      },
      {
        heading: "Statuses you can see",
        body: "While a status holds on an army, its look plays over it until the next round shows whether it still does.",
        facts: (Object.keys(AFTERMATH_LOOKS) as Array<keyof typeof AFTERMATH_LOOKS>).map((k) => [`${STATUS_RULES[k].emblem} ${AFTERMATH_LOOKS[k].name}`, AFTERMATH_LOOKS[k].text] as [string, string])
      },
      {
        heading: "World bosses",
        body: "Each boss carries a colossus's kit, one Instinct more than a legendary unit: 3 Instincts (🪓 Cleave on every boss, so its blows reach every army, not only the front) and 2 Arts from these and the shared ones above, and an ult (Finale) of its own, no two alike (round 5, or round 1 as a last stand under 25% HP). Its heals bring back only HP lost in that battle.",
        facts: [
          ["🪓 Cleave", "Instinct: every round it kills 3% of each attacking army on top of its blow"],
          ["💢 Enrage", "Instinct: +50% ATK below 50% HP"],
          ["🛡️ Ward", "Art: cast in the first round of each battle, −80% damage taken that round"],
          ["Fjord ults", "🐙 Kraken: Abyssal Grasp (Frozen) · 🌊 Leviathan: Maelstrom (Chill) · 🎵 Siren: Siren's Requiem (Paralyzed)"],
          ["Scorchwind ults", "🪱 Sandworm: Devouring Maw (the front army only, 200%) · 🌪️ Sphinx: Sandstorm (Sunder) · 🦂 Scorpion: Stinger Storm (Poisoned)"],
          ["Deepwood ults", "🌳 Treant: Grasping Roots (Bleeding) · 🐺 Wolf: Wild Hunt (Bleeding) · 🧚 Fae: Glamour of the Court (Chill)"],
          ["Peaks ults", "🐉 Dragon: Dragonfire (Burning) · 🏔️ Yeti: Avalanche (Chill) · 👁️ Gorgon: Petrifying Gaze (Frozen)"]
        ]
      },
      {
        heading: "🐺 Mobs & bandits",
        body: "Every roving pack carries a kit of its rarity, themed to the creature: a common pack 1 Instinct, an uncommon one an Art too, up to an epic pack's 2 Instincts and 2 Arts. A kit reshapes a pack, it never makes it harder to beat: what the kit is worth comes off the pack's own HP and ATK, and the balance check fights every pack with and without its kit. Scout reports and each entry in the Codex list its kit. While a pack fights on the map, its creatures strike at the armies every round (a coil, a lunge, a follow-through), and when it casts they rear back first, then hurl themselves forward as the spell flies; no two strike alike.",
        facts: [
          ["Instincts", "🐺 Pack Hunter, 🗡️ Cutthroat, 🎯 Keen Eye +15% ATK · 🦇 Swarm, 💀 Undying +30% HP · 🪶 Light-Footed +40% DEF, beside the shared ones"],
          ["🗡️ Ambush", "Art: round 1, once: one hard blow on the enemy front before the fight is joined (goblins, sand raiders, river pirates, saboteurs)"],
          ["🦂 Venom Sting · ☠️ Poisoned Blade", "Art: a strike that Poisons the enemy front (scorpions, basilisks · smugglers, syndicate blades)"],
          ["💚 Regenerate · 💀 Raise the Dead", "Art: once the pack has lost 10% (15%), some of its fallen stand again (trolls · liches)"],
          ["👻 Dread Wail · 👁️ Stone Gaze", "Art: Paralyze every army (wraiths) · Freeze the enemy front, turned to stone (basilisks)"],
          ["🐉 Fire Breath · 🌀 Void Lash · 💣 Blackpowder Keg", "Art: fire over every army (drakes) · Sunder the front (aberrations) · a blast over every army (saboteurs)"]
        ]
      },
      {
        heading: "🤺 Sparring Grounds",
        body: "Royal Codex → Sparring Grounds: pick two units (a drill band of each rarity, any world boss, or any mob or bandit pack at its full size) and watch a 6-round fight on the same engine as every battle, casts and ticks rising over them and every cast and status played on its look. Its spell gallery casts any one Art, Finale, Instinct or status on its own and lights each stage as it plays. Mercenary bands carry Battle Arts of their rarity too (see the Mercenaries chapter); so do champions, at a hero's share (see the Champions chapter); the mythical horror will, but it is not in the game yet."
      }
    ]
  },
  {
    id: "mercenaries",
    group: "War",
    title: "Mercenaries",
    emblem: "🪙",
    summary: "Hire a band of sellswords at your civilization's legendary landmark. A band is a whole march: one slot, none of your soldiers, your full march × its power, with Battle Arts of its rarity. It attacks and defends your walls, costs a price, upkeep and battle pay each fight, counts its losses as strength, heals for resources and time, and dies at 0%.",
    models: [
      { label: "Ser Aldric, legendary (Valoria)", preview: { kind: "mercenary", type: "merc-human-champion", rarity: "legendary" } },
      { label: "Eclipse Reaver, epic (Nethergarde)", preview: { kind: "mercenary", type: "merc-void-reaver", rarity: "epic" } },
      { label: "Runesmith, rare (Ironforge)", preview: { kind: "mercenary", type: "merc-dwarf-runesmith", rarity: "rare" } },
      { label: "Leafward Warden, uncommon (Sylvandale)", preview: { kind: "mercenary", type: "merc-elf-warden", rarity: "uncommon" } },
      { label: "Grunt Raider, common (Drak'mar)", preview: { kind: "mercenary", type: "merc-orc-raider", rarity: "common" } }
    ],
    sections: [
      {
        heading: "⛺ The camps",
        body: "Your own civilization's legendary landmark is your Mercenary Camp (Valoria's Cathedral of the Dawn Banner, Sylvandale's Heart-Oak, Ironforge's Anvil of the Gods, Drak'mar's Bloodfire Throne, Nethergarde's Core): click it to hire. Another civilization's landmark is only scouted, as before: you hire from your own people. Each camp keeps its own stock, shared by every ruler of its civilization and first come first served; a new recruit of each rarity arrives on a clock, up to a few waiting. A rarity you can't hire shows greyed out with the reason. Your bands, their strength and their heal and dismiss buttons are in the camp and in your kingdom window's Mercenaries tab.",
        facts: MERC_RARITIES.map((r) => [cap(r), `one new every ${mercDurationText(MERC_RULES[r].restockMs)}, up to ${MERC_RULES[r].maxStock} waiting`] as [string, string])
      },
      {
        heading: "A band is one march",
        body: "Bands take the march slots your soldiers can't fill: at full population no civilization's soldier cap fills every slot, so a band adds its power on top of your army. It takes one march slot on its own: none of your soldiers march with it, it eats no rations and it costs no population. Its power is your full march (your soldier cap shared over your march slots, never more than your march capacity) at the moment you hire it, × its rarity's power, so it grows with your kingdom and never outclasses it. It fights as your civilization's soldiers with its own Battle Arts, never your titles or landmarks, and the defenders strike your own soldiers before it.",
        facts: MERC_RARITIES.map((r) => {
          const x = MERC_RULES[r];
          const k = KIT_SIZES[r];
          return [
            cap(r),
            `${x.models > 1 ? `${x.models} models` : "walks alone"} · ${x.power}× · ${k.instincts} Instinct${k.instincts > 1 ? "s" : ""}${k.arts ? ` · ${k.arts} Art${k.arts > 1 ? "s" : ""}` : ""}${k.finale ? " · a Finale" : ""} · ${x.minSlots > 1 ? `needs ${x.minSlots} march slots` : "any slots"}`
          ] as [string, string];
        })
      },
      {
        heading: "Holding bands",
        body: `You hold at most ${bandCapForSlots(3)} band with 1–3 march slots and ${bandCapForSlots(4)} with 4–5, whether at home, marching, wounded or healing. One that dies, deserts or is dismissed frees its place. If your slots drop (or you change civilization) you keep the bands you have; a civilization change carries each over as your new civilization's mercenary of the same rarity, wounds and all. Bands attack and defend your castle (below); they don't scout, gather, rally or reinforce anyone else, and on a world boss they keep the Sellsword's Oath (below).`
      },
      {
        heading: "🛡️ On your walls",
        body: `When your castle is attacked, every band at home (whole or wounded, not healing or away) takes the walls beside your garrison, if your treasury pays its battle pay right then. It defends as its own group behind your walls, with its Battle Arts but never your titles, landmarks or Armory sets, and its losses are strength. One you can't pay stays inside, and the battle log says so. While it holds the walls it can't march, heal or be dismissed; when the battle ends it is back inside. On the walls a band is worth its power in soldiers, just as in the field.`,
        facts: [
          ["Who takes the walls", "Every band at home, oldest first, whose battle pay is paid"],
          ["Unpaid", "Stays inside for that battle"],
          ["Fights with", "Its soldier-equivalents, Walls DEF and its own Battle Arts"]
        ]
      },
      {
        heading: "🪙 The Sellsword's Oath",
        body: `Every free company swears the same oath when it signs on at its camp: our steel is for hire, our graves are not. Before a colossus a band fights from the flanks — hamstringing, harrying, keeping a road home open — so it lands only ${pct(BAND_BOSS_DAMAGE)} of its blows on a world boss. Its Arts still weaken the beast, so bands help your soldiers there, but one ruler with bands never kills a boss alone.`,
        facts: [
          ["On a world boss", `${pct(BAND_BOSS_DAMAGE)} of its blows land, after Colossus Hide`],
          ["Everywhere else", "Its full power"]
        ]
      },
      {
        heading: "🪙 Price and upkeep",
        body: `A band costs its price once and its upkeep every harvest, home or away, whole or wounded. Every fight also costs its ${BATTLE_PAY.name.toLowerCase()}, ${BATTLE_PAY.harvests === 1 ? "one harvest's" : `${BATTLE_PAY.harvests} harvests'`} upkeep paid on the spot: when it marches out to attack and when it takes your walls. A treasury that can't pay keeps it out of that fight. Upkeep your treasury can't pay brings one warning; unpaid again at the next harvest, the band deserts (from the field, if it is marching). Dismiss a band at your camp to send it away: no refund.`,
        facts: MERC_RARITIES.map((r) => [cap(r), `${costText(MERC_RULES[r].price, false)} · upkeep ${costText(MERC_RULES[r].upkeep, false)} · ${BATTLE_PAY.name.toLowerCase()} ${costText(battlePayFor(r), false)} a fight`] as [string, string])
      },
      {
        heading: "🩹 Strength, wounds and healing",
        body: `A band of one can't lose "−320 soldiers": what it loses is strength, shown as −18% over the battle, in the report and in the March Queue. It fights at the strength it has; at 0% it is dead and gone. Healing always costs: the share lost × ${pct(HEAL_PRICE_SHARE)} of its price, and the share lost × its full-heal time. A healing band is home and can't march (stopping the heal keeps what it healed, refunds nothing); a wounded band may march at its current strength, and the march form warns you. A Tempest Roads takes the same share of a band's strength on the road as it takes of an army.`,
        facts: MERC_RARITIES.map((r) => [cap(r), `whole from 0% in ${mercDurationText(MERC_RULES[r].healFullMs)}`] as [string, string])
      }
    ]
  },
  {
    id: "armory",
    group: "War",
    title: "The Armory",
    emblem: "🗡️",
    summary: "Forge your civilization's own war gear in three sets (uncommon, rare, epic) and send an attack or a rally out in one: every soldier wears a set. The sets at home dress your garrison. Each set costs what its power would cost in extra soldiers, and its upkeep every harvest; unpaid, the sets rust back to the stock pile.",
    models: [
      { label: `${ARMORY_SETS.human.epic.name}, epic (Valoria)`, preview: { kind: "folk", civ: "human", arms: 3 } },
      { label: `${ARMORY_SETS.orc.rare.name}, rare (Drak'mar)`, preview: { kind: "folk", civ: "orc", arms: 2 } },
      { label: `${ARMORY_SETS.elf.uncommon.name}, uncommon (Sylvandale)`, preview: { kind: "folk", civ: "elf", arms: 1 } },
      { label: `${ARMORY_SETS.dwarf.epic.name}, epic (Ironforge)`, preview: { kind: "folk", civ: "dwarf", arms: 3 } },
      { label: `${ARMORY_SETS.arcane.epic.name}, epic (Nethergarde)`, preview: { kind: "folk", civ: "arcane", arms: 3 } }
    ],
    sections: [
      {
        heading: "Forging",
        body: `Open 👥 Kingdom → Armory and forge sets, one per soldier you mean to arm. Each civilization forges its own three sets; your smiths need a bigger City Hall for the better ones. The epic set also takes a scarce gem of your civilization (${perCiv((c) => SCARCE_RESOURCES.find((g) => g.key === EPIC_GEM[c].key)?.name ?? EPIC_GEM[c].key)}). A set is worth what its power would cost in extra soldiers (a Paid Settler armed): quality instead of quantity, never free power. It lets your army hit harder than its numbers once your march slots are full.`,
        facts: ARMORY_RARITIES.map((r) => [cap(r), `from City Hall ${ARMORY_RULES[r].minLevel} · 100 sets: ${costText(ARMORY_RULES[r].forge, false)}${r === "epic" ? " + a gem" : ""} · ${x(ARMORY_RULES[r].power)} a march`] as [string, string])
      },
      {
        heading: "Every civilization's sets",
        body: "Each set adds to its soldiers' HP, ATK or DEF (on top of the civilization's buffs and your titles), and the rare and epic ones sharpen the civilization's own edge: elves pierce more armour, dwarves take less damage, orcs hit harder in round 1, humans swarm harder, Nethergarde's wards blunt the first blows.",
        facts: ORDER.flatMap((c) => ARMORY_RARITIES.map((r) => [`${CIV_NAMES[c]} ${r}`, `${ARMORY_SETS[c][r].emblem} ${ARMORY_SETS[c][r].name}: ${setText(ARMORY_SETS[c][r])}`] as [string, string]))
      },
      {
        heading: "Loadout",
        body: "When you send an attack, or lead or join a rally, pick its Loadout: Standard gear (the stock pile every soldier is armed from) or one of your sets. Every soldier of the march wears one, so you need as many sets at home as soldiers you send (the form offers to forge the rest). Soldiers who fall on the field lose theirs; the survivors bring theirs home. Mercenary bands, scouts, gatherers and reinforcements march in their own gear.",
        facts: [
          ["Your garrison", "Defends in the sets still at home, the best first: as many soldiers as there are sets, the rest in standard gear. Its fallen are carried home, sets and all"],
          ["The battle log", "Names the set each army marches in, and how many of the garrison wear one"]
        ]
      },
      {
        heading: "Where steel counts less",
        body: "Forged sets are made for wars between kingdoms. Against the realm's raid content a set counts only part of its gains, so one ruler can never kill a world boss alone or break a full frontier gate that holds against their army in standard gear.",
        facts: Object.values(ARMORY_TARGET_SHARE).map((t) => [`${t.emblem} ${t.name}`, cap(t.description)] as [string, string])
      },
      {
        heading: "Upkeep and rust",
        body: "Every set you hold, at home or on a march, costs its upkeep every harvest, the epic ones first. What your treasury can't pay rusts back to the stock pile at once: the sets at home first, then a marching army's (it fights on in standard gear from its next round). A herald notice tells you. Sets you no longer want can be scrapped at home (Scrap… on the set's card): nothing comes back, and they cost no more upkeep. A civilization change keeps your sets: they become your new civilization's sets of the same rarity.",
        facts: ARMORY_RARITIES.map((r) => [cap(r), `${costText(ARMORY_RULES[r].upkeep, false)} per 100 sets a harvest`] as [string, string])
      },
      {
        heading: "On the map",
        body: "Soldiers wear their set: uncommon its accent colour on a tabard or sash and a small prop (a pennant, a plume, a charm), rare metal pauldrons and a crest, epic a cape and glowing details on the weapon and the chest. The same in the Normal and HD graphics, and an armed march costs the map no more to draw. Each set is in the Royal Codex, under Creatures → The Armory."
      }
    ]
  },
  {
    id: "champions",
    group: "War",
    title: "Champions",
    emblem: "🦸",
    summary: `Every kingdom has one champion: a legendary hero rolled once, by name, look and Battle Arts. It leads one attack or rally march of soldiers at a time, and your garrison while it is home; it rises to level ${CHAMPION_MAX_LEVEL} (never above your City Hall) on the Renown of the battles it leads. It falls, but never dies.`,
    models: [
      { label: "A Valoria champion", preview: { kind: "boss_hd", type: championModelType("human", champLooks(0)), action: "idle" } },
      { label: "A Sylvandale champion", preview: { kind: "boss_hd", type: championModelType("elf", champLooks(1)), action: "idle" } },
      { label: "An Ironforge champion", preview: { kind: "boss_hd", type: championModelType("dwarf", champLooks(2)), action: "idle" } },
      { label: "A Drak'mar champion", preview: { kind: "boss_hd", type: championModelType("orc", champLooks(3)), action: "idle" } },
      { label: "A Nethergarde champion", preview: { kind: "boss_hd", type: championModelType("arcane", champLooks(1)), action: "idle" } }
    ],
    sections: [
      {
        heading: "🦸 Lead with your champion",
        body: `When you send an attack, or lead or join a rally, turn on Lead with your champion. It leads one march at a time (the switch is greyed out while it is away) and only soldiers: never a mercenary band, scouts, gatherers or reinforcements. The army it leads fights with its Battle Arts and +${Math.round(CHAMPION_STAT_PER_LEVEL * 1000) / 10}% HP, ATK and DEF a level (+${pct(CHAMPION_STAT_PER_LEVEL * CHAMPION_MAX_LEVEL)} at level ${CHAMPION_MAX_LEVEL}), on top of your civilization, titles, the rally bonus and an Armory set. A champion is one hero, not a band: its Arts strike with ${pct(CHAMPION_ART_SHARE)} of its army's blow. At home it leads the garrison's defence by itself; if it rides out mid-siege it leaves the walls, and doesn't fall with the garrison it left.`,
        facts: [
          ["Its kit", `2 Instincts, 2 Arts and a Finale (legendary)`],
          ["Unlocks", `level ${KIT_UNLOCKS.instinct1} an Instinct · ${KIT_UNLOCKS.art1} an Art · ${KIT_UNLOCKS.art2} a second Art · ${KIT_UNLOCKS.instinct2} a second Instinct · ${KIT_UNLOCKS.finale} its Finale`],
          ["The most it adds", `a max-level champion lifts its march at most +${pct(CHAMPION_MAX_GAIN)}, kit included`]
        ]
      },
      {
        heading: "📈 Renown and levels",
        body: `It levels only on the battles it leads (and the defences of your castle). Renown thins through a realm day: the first ${DAILY_RENOWN.full} count whole, up to ${DAILY_RENOWN.half} half, past that a quarter. It is never above your City Hall: what it earns at the cap is banked and counts once the City Hall rises. Its tab (👥 Kingdom → Champion, with its portrait) keeps the Renown ledger, battle by battle.`,
        facts: [
          ["A round fought", `${RENOWN.perRound}`],
          ["Enemies slain", `${RENOWN.perSqrtKill} × √kills, at most ${RENOWN.killsCap}`],
          ["A victory", `${RENOWN.win}`],
          ["A world boss felled", `${RENOWN.bossFelled}`],
          ["A realm felled", `${RENOWN.realmFelled} (an NPC kingdom, a Voidrift garrison, a ruler's castle set burning)`],
          ["An army its Finale broke", `${RENOWN.finaleKill}`],
          ["Level 10 / 20 / 30", `${champXpFor(10).toLocaleString()} / ${champXpFor(20).toLocaleString()} / ${champXpFor(30).toLocaleString()} Renown in all`]
        ]
      },
      {
        heading: "🩹 Falls, never dies",
        body: `When the army it leads is wiped out, your champion falls, wounded, and is carried home. It heals by itself in 2 h + 10 min a level (${Math.round(healMsFor(20) / 60_000 / 6) / 10} h at level 20); Hasten on its card heals it at once for gold and food by the hours left (and a gem of your civilization from level ${HASTEN_GEM_LEVEL}). A wounded champion can't lead.`
      },
      {
        heading: "Where a hero counts less",
        body: "Against the realm's hardest walls and beasts a champion counts only part of its worth (its bonus and its Arts alike).",
        facts: Object.values(CHAMPION_TARGET_SHARE).map((t) => [`${t.emblem} ${t.name}`, cap(t.description)] as [string, string])
      },
      {
        heading: "🎲 Its look, its Arts",
        body: "Its look is rolled like a collectible: head, face, body, armour, cloak, weapon, aura and mark, four options each in your civilization's part library. Re-roll it for a gem of your civilization (its name, level and Arts stay); Retraining swaps one Art for another for gold and iron. A civilization change keeps the same hero: its Arts and level stay, and it is re-dressed in the new civilization's parts. With HD graphics it walks at the head of the march it leads; every civilization's champions are in the Royal Codex, under Creatures → Champions."
      }
    ]
  },
  {
    id: "free-realms",
    group: "War",
    title: "Free Realms",
    emblem: "🚩",
    summary: `Each buffer region holds an NPC kingdom that grows from common to epic over ${REALM_CYCLE_DAYS} days, then moves on. Anyone may attack it, except on the day it is built up.`,
    models: [
      { label: "Brass Sultanate — common", preview: realm("bk-brass-sultanate", 0) },
      { label: "…uncommon", preview: realm("bk-brass-sultanate", 1) },
      { label: "…rare", preview: realm("bk-brass-sultanate", 2) },
      { label: "…epic", preview: realm("bk-brass-sultanate", 3) },
      { label: "…being built up to epic", preview: realm("bk-brass-sultanate", 3, true) },
      { label: "Corsair Citadel (sea) — epic", preview: realm("bk-corsair-citadel", 3) }
    ],
    sections: [
      {
        heading: "A realm grows",
        body: `Each region has a pool of 3 realms; one stands at a time. It climbs one stage a week, and the regions are a week apart, so every week the map shows one realm of each stage. It grows bigger as it climbs: houses and a banner, then walls and towers, then a great tower and the epic aura. Its soldiers, of the civilization whose people it borrows, patrol round it, more at each stage.`,
        facts: REALM_STAGES.map((st, i) => [`Week ${i + 1}: ${st}`, stageLevels(i)] as [string, string])
      },
      {
        heading: "🏗️ Building day",
        body: `The first of its ${REALM_STAGE_DAYS} days at a stage it is built up under scaffolding, and shielded: no attacks or rallies, and armies arriving turn back (scouts may still look). Then it gains a City Hall level every day at 00:00 UTC, and each new level rebuilds it good as new: full people, garrison and treasury, walls mended. On the last day it holds the stage's top level.`,
        facts: [
          ["Shielded", "Day 1 of each stage"],
          ["Level-up", "Days 2–6, one a day, refilled to full"],
          ["Moves on", `After its epic week (${REALM_CYCLE_DAYS} days): it crumbles away and another of the pool rises somewhere else in the region`]
        ]
      },
      {
        heading: "⚔️ Taking it on",
        body: "Attack or rally on it like any castle: walls by level, burning protection, plunder by load from its treasury. Break its garrison and you also win its conquest hoard, once a day: paid straight into your treasuries, split by the damage each ruler dealt, and far bigger at the higher tiers. It is always fogged; scout it for its garrison and treasury. It takes real losses until its next level-up, and is never destroyed. The Royal Codex (World → Free Realms) shows every realm at each stage.",
        facts: [
          ["Treasury per City Hall", `${n(NPC_KINGDOM_TREASURY_PER_LEVEL.gold)} gold · ${n(NPC_KINGDOM_TREASURY_PER_LEVEL.iron)} iron / stone · ${n(NPC_KINGDOM_TREASURY_PER_LEVEL.lumber)} lumber · ${n(NPC_KINGDOM_TREASURY_PER_LEVEL.food)} food, × its tier (${(Object.keys(REALM_TREASURY_TIER_MULT) as Array<keyof typeof REALM_TREASURY_TIER_MULT>).map((t) => `${t} ×${REALM_TREASURY_TIER_MULT[t]}`).join(", ")}); refills ${pct(NPC_KINGDOM_REFILL_SHARE)} a harvest`],
          ...(Object.keys(REALM_CONQUEST_HOARD) as Array<keyof typeof REALM_CONQUEST_HOARD>).map((t) => [`👑 Hoard · ${t}`, realmHoardText(t)] as [string, string]),
          ["Protected vault", `${n(PROTECTED_TREASURY_PER_LEVEL)} × City Hall of each resource can't be stolen`]
        ]
      },
      {
        heading: "✨ Its garrison's Battle Arts",
        body: "The garrison fights with its civilization's Battle Arts, more of them as the realm grows: an Instinct while common, an Art from uncommon, a second Instinct from rare and a second Art when epic (a frontier gate fights with the rare kit). The kit is paid for out of the soldiers' own strength, so it changes how the realm fights, never how hard it is to take. Scouts and the Codex list it.",
        facts: [
          ["👑 Human", "Stoneskin → Shield Wall → Bloodlust → War Cry"],
          ["🛡️ Orc", "Bloodlust → War Cry → Enrage → Armor Break"],
          ["🏹 Elf", "Keen Eye → Frost Lance → Light-Footed → Second Wind"],
          ["⚒️ Dwarf", "Stoneskin → Armor Break → Thick Hide → Shield Wall"]
        ]
      }
    ]
  },
  {
    id: "gates",
    group: "War",
    title: "Frontier Gates",
    emblem: "🚧",
    summary: "Each mortal province is sealed by its frontier gate: burn the gate before you can attack the cities behind it.",
    models: [
      { label: "The Imperial High Gate (human)", preview: npc("gate-human", "rare", false, false) },
      { label: "The Tusked War Pass (orc)", preview: npc("gate-orc", "rare", false, false) },
      { label: "The Moonwood Arch (elf)", preview: npc("gate-elf", "rare", false, false) },
      { label: "The Anvilhold Deepgate (dwarf)", preview: npc("gate-dwarf", "rare", false, false) },
      { label: "A fallen gate, burning", preview: { kind: "npc", type: "gate-orc", rarity: "rare", boss: false, scaled: false, burning: true } }
    ],
    sections: [
      {
        heading: "🚧 The seal",
        body: `While a province's gate stands, no other civilization can attack or rally on a city in that province. Set the gate burning (walls below ${pct(WALL_BURN_THRESHOLD)}) and the province is open for the burn, until its walls repair to ${pct(WALL_UNBURN_SHARE)}: up to ${WALL_BURN_REPAIR_HOURS} hours if they fell to nothing, less the higher they stood. A fallen gate is plain to see on the map: broken open, its wall knocked down either side, on fire, and its guards gone. Resource nodes, treasure, mobs and bosses are never sealed. Nethergarde has no gate.`,
        facts: [
          ["Gate", `City Hall ${GATE_LEVEL} · walls tier ${GATE_WALL_TIER}, ${n(GATE_WALL_HP)} HP`],
          ["Base garrison", `Human ${n(GATE_BASE_GARRISON.human)} · Orc ${n(GATE_BASE_GARRISON.orc)} · Dwarf ${n(GATE_BASE_GARRISON.dwarf)} · Elf ${n(GATE_BASE_GARRISON.elf)} (regrows 50% per harvest)`],
          ["Bare gate", "A lone City Hall 15 ruler with 3 marches beats its garrison; a few more waves set it burning"],
          ["Treasury", `${n(NPC_KINGDOM_TREASURY_PER_LEVEL.gold * GATE_LEVEL)} gold · ${n(NPC_KINGDOM_TREASURY_PER_LEVEL.iron * GATE_LEVEL)} iron / stone · ${n(NPC_KINGDOM_TREASURY_PER_LEVEL.lumber * GATE_LEVEL)} lumber · ${n(NPC_KINGDOM_TREASURY_PER_LEVEL.food * GATE_LEVEL)} food, plundered by load`]
        ]
      },
      {
        heading: "🛡️ Gate duty",
        body: `A civilization never attacks its own gate, but its rulers can reinforce it. Troops on gate duty fight beside the garrison in every attack, with their own stats and buffs; the garrison itself fights with its civilization's rare Battle Arts kit (see Free Realms). A full gate usually takes a rally to break. Each soldier on duty costs ${GATE_DUTY_TEXT} per harvest, on top of normal upkeep, to keep the gate and its wall in shape. If you can't pay, your newest troops there walk home. Click your gate to see how many troops are on duty, yours and your allies'; other civilizations never see that count.`,
        facts: [
          ["Reinforce cap", `Human ${n(GATE_REINFORCE_CAP.human)} · Orc ${n(GATE_REINFORCE_CAP.orc)} · Dwarf ${n(GATE_REINFORCE_CAP.dwarf)} · Elf ${n(GATE_REINFORCE_CAP.elf)} (garrison + troops on duty)`],
          ["Watched Borders", `+${pct(GATE_SCOUT_CATCH.base)} catch chance for scouts heading into the province, up to +${pct(GATE_SCOUT_CATCH.max)} at a full gate; nothing while it burns`]
        ]
      }
    ]
  },
  {
    id: "wrath",
    group: "War",
    title: "The Overseers' Wrath",
    emblem: "🌑",
    summary: `Xal'Vorath, the realm's one mythical horror, is sent by royal decree. It crawls to a kingdom's gates for ${HORROR.APPROACH_DAYS} days, and only a kingdom that keeps working can drive it back.`,
    models: [{ label: "Xal'Vorath", preview: npc("mythic-singularity", "mythical", true) }],
    sections: [
      {
        heading: "It is sent, never met by chance",
        body: `An admin, a Special Overseer or the Archon may send it once a week, at up to ${HORROR.MAX_TARGETS} kingdoms, at a Level from ${HORROR.MIN_LEVEL} to ${HORROR.MAX_LEVEL}. Each kingdom gets its own horror, at the Level's stats divided by the number of kingdoms. The whole realm hears who it turns toward, watches it crawl across the map, and sees a banner at the top left of the screen for as long as it is out: click it for what you can do.`,
        facts: Object.entries(HORROR_LEVELS).map(([lvl, u]): [string, string] => [`Level ${lvl}`, `${n(u.hp)} HP · ${n(u.atk)} ATK · ${u.def} DEF`])
      },
      {
        heading: "Drive it back with work",
        body: `Earn at least ${HORROR.XP_PER_DAY} XP on each of its ${HORROR.DAYS} days and it comes apart when it reaches your gates. Commits, pull requests, reviews and sealed deeds all count, once the realm has read them from Git (a deed on the realm day you wrote it), so don't leave it to the last minute. After the realm has been asleep, it waits at your gates until the realm has read Git again. Sent before ${HORROR.LATE_SEND_HOUR}:00 realm time, the first day is that day; from then on it is the next day, so no day is cut short. Your top bar counts the days.`,
        facts: [
          ["The road", `${HORROR.APPROACH_DAYS} days`],
          ["To drive it back", `${HORROR.XP_PER_DAY} XP on each of ${HORROR.DAYS} days`]
        ]
      },
      {
        heading: "One hour at the gates",
        body: `If any day falls short it stands at your gates for ${HORROR.SIEGE_HOURS} hour. You and the rulers of your civilization can attack it or raise a rally; nobody else can. It keeps its wounds from one battle to the next, and every ruler's damage counts toward the bounty until it falls. If the realm was asleep when the hour ran out, the time left is given back. It fights like a world boss (Colossus Hide, Titan's Endurance and Colossus's Wrath) with the only mythic kit in the realm.`,
        facts: [
          ["Its kit", "3 Instincts, 3 Arts and The Devouring"],
          ["If it still stands", `walls to 0 and the city burns; ${pct(HORROR.TREASURY_DEVOURED)} of the treasury above the vault is devoured`]
        ]
      },
      {
        heading: "The prize",
        body: `Slain, it leaves a hoard and a bounty worth a world boss's times its Level, the bounty shared by damage dealt, and one ${SCARCE_RESOURCES.find((r) => r.key === HORROR_GEM)?.name}: the rarest trophy in the realm, for the ruler who wounded it most, whole even if the Wrath was split. It counts toward World Boss Kills.`
      }
    ]
  },
  {
    id: "titles",
    group: "War",
    title: "Milestone Titles",
    emblem: "🎖️",
    summary: "Titles come from your Git history and your war record. Each category gives its highest tier; buffs from different categories add up.",
    models: [
      { label: "Wonder ★★★★", preview: castle("orc", 4) },
      { label: "Prestige keep", preview: { kind: "building", district: "soldier_building", level: 25, prestige: 4 } }
    ],
    sections: [
      {
        body: "Title buffs multiply your soldiers' HP, ATK and DEF wherever they fight, on top of civilization buffs and the Dragon Statue, Mana Spire and Plaza Fountain.",
        facts: [
          ["Lines of Code", "5M / 15M / 25M → HP +2/5/10%"],
          ["Commits", "500 / 2,000 / 3,500 → ATK +2/5/10%"],
          ["Active Days", "200 / 600 / 1,200 → DEF +2/5/10%"],
          ["Repo Holdings (Lv3+)", "5 / 10 / 20 → all +1/2/3%"],
          ["Legendary Buildings (Lv25)", "1 / 2 / 3 → all +2/4/6%"],
          ["Game Activity", "30 / 90 / 180 play days → harvest +10/20/30%"],
          ["World Boss Kills", "10 / 50 / 100 → all +1/2/3%"],
          ["Kingdom Kills", "1k / 10k / 100k → ATK +2/5/10%"],
          ["Resources Gathered", "10k / 100k / 1M → HP +2/5/10%"],
          ["Mob & Bandit Kills", "1k / 10k / 100k → DEF +2/5/10%"]
        ]
      }
    ]
  }
];
