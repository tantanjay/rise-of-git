import { API_BASE } from "@/config";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Crown, Library, Play, Rows3, Search, Users } from "lucide-react";
import { SoonBadge } from "./SoonBadge";
import { VOID_GATE_TYPE } from "@/components/3d/world/VoidGate";
import { Brood, VG_WARDEN_TYPE, VOID_BROODS, VOID_WARDEN, packOf, vgType } from "@/components/3d/world/voidCreatures";
import { BUILT_BROODS, VOID_RIGS } from "@/components/3d/world/voidRigs";
import { BuildingType, CivilizationType, CodexEntry, MercRarity, NPCRarity, UpgradeDef } from "@/types";
import { BAND_BOSS_DAMAGE, BATTLE_PAY, HEAL_PRICE_SHARE, MERC_RULES, battlePayFor, costText, mercDurationText } from "@/utils/mercenaries";
import { ARMORY_RARITIES, ARMORY_RULES, ARMORY_TARGET_SHARE, armorySetFor, forgeCost, setText } from "@/utils/armory";
import type { AnimalKind } from "@/components/3d/city/parts";
import { Modal } from "./Modal";
import { Combobox } from "./Combobox";
import { CIV_META } from "./TopHUD";
import { CASTLE_STAGES, EMPYREAN_STAGE, RED_STAR_FROM, WONDER_STAGE, castleStage } from "@/utils/castle";
import { MERCENARY_BAND_SIZE, MERCENARY_POOLS, OATHBOUND } from "@/components/3d/world/mercenaryRigs";
import { championLibrary } from "@/components/3d/world/heroChampions";
import { CHAMPION_ART_SHARE, CHAMPION_MAX_LEVEL, CHAMPION_SLOTS, CHAMPION_STAT_PER_LEVEL, CHAMPION_TARGET_SHARE, KIT_UNLOCKS, LOOK_OPTIONS, championModelType, type ChampionLooks } from "@/utils/champion";
import { SCOUT_MOUNT } from "@/utils/war";
import { HOSTILE_NPC_TYPES, NPC_KINDS } from "@/components/3d/world/npcs";
import { HdSwitch, ModelViewer, Preview, RARITY_STYLE, hasHdVersion } from "./CodexPreview";
import { DEFEAT_MARKER_MS } from "@/utils/war";
import { graphics } from "@/utils/graphics";
import { GuideBook } from "./GuideBook";
import { ChroniclesBook } from "./ChroniclesBook";
import { SparringGrounds } from "./SparringGrounds";
import { UniqueTraitCard } from "./UniqueTraitCard";
import { playCue, SOUND_CUES, SoundCueId } from "@/utils/soundCues";
import { EPIC_LANDMARK_TYPES } from "@/components/3d/world/landmarks";
import { isBatchedHero } from "@/components/3d/world/heroes";
import { LANDMARK_STEPS } from "@/components/3d/world/landmarkStages";
import { REALM_CYCLE_DAYS, REALM_MODEL_TYPES, REALM_STAGES, REALM_STAGE_DAYS, REALM_STAGE_LEVELS } from "@/components/3d/world/realmTypes";
import { SoundtrackPlayer } from "./SoundtrackPlayer";
import { soundtrack } from "@/utils/soundtrackEngine";
import { SINGULARITY_ACTIONS, SingularityAction } from "@/components/3d/world/HighGraphicsSingularity";
import { heroActions, isBossHero, isMercHero } from "@/components/3d/world/heroBosses";
import { BossActionId } from "@/components/3d/world/heroRig";

interface CodexCatalog {
  rarityWeights: Record<NPCRarity, number>;
  entries: CodexEntry[];
  upgrades: UpgradeDef[];
  voidKingdoms: VoidKingdom[];
  /** Each civilization's mercenary of each rarity: its Battle Arts as lines */
  mercenaryKits?: Partial<Record<CivilizationType, Partial<Record<MercRarity, string[]>>>>;
}

/** The Warden holding a Voidrift slot while no developer does (server: `voidNpcFor`) */
interface VoidKingdom {
  slot: number;
  name: string;
  level: number;
  population: number;
  maxGarrison: number;
  wallTier: number;
  wallMaxHp: number;
  wallDefMult: number;
  loot: { gold: number; iron: number; stone: number; scarce?: Record<string, number> };
}

interface CodexModalProps {
  open: boolean;
  onClose: () => void;
  /** Opens on this top tab (e.g. "chronicles" from the weekly story's banner) */
  initialSection?: string;
  /** Opens the Guide Book on this chapter (guideContent.ts id), e.g. from a What's New notice */
  initialChapter?: string;
}

/* ------------------------------------------------------------------------- */
/* Entries shown in the list: map NPCs from the server, plus castles and     */
/* improvements composed on the client from the catalog                     */
/* ------------------------------------------------------------------------- */

interface Item {
  id: string;
  name: string;
  emblem: string;
  subtitle: string;
  description: string;
  rarity?: NPCRarity;
  /** Not in the game yet (a future event) */
  teaser?: boolean;
  facts: Array<[string, string]>;
  preview: Preview;
  /** Sounds tab: the cue its ▶ button plays */
  cue?: SoundCueId;
  /** Epic landmarks: its region's one standing on the map this week */
  standing?: boolean;
  /** Void Gate tab: a family of the climb, its sizes shown as cards under the line-up */
  brood?: Brood;
}

const TABS = [
  { id: "bosses", label: "Bosses", icon: "🐉" },
  { id: "monsters", label: "Monsters", icon: "🐺" },
  { id: "bandits", label: "Bandits", icon: "🗡️" },
  { id: "treasures", label: "Treasures", icon: "💰" },
  { id: "resources", label: "Resources", icon: "⛏️" },
  { id: "landmarks", label: "Landmarks", icon: "🗿" },
  { id: "gates", label: "Frontier Gates", icon: "🏯" },
  { id: "realms", label: "Free Realms", icon: "🚩" },
  { id: "wilds", label: "Wilds", icon: "🌲" },
  { id: "mercenaries", label: "Mercenaries", icon: "⚔️" },
  { id: "armory", label: "The Armory", icon: "🗡️" },
  { id: "champions", label: "Champions", icon: "🦸" },
  { id: "folk", label: "Folk & Beasts", icon: "🧑‍🌾" },
  { id: "legends", label: "Wandering Legends", icon: "🛒" },
  { id: "voidgate", label: "Void Gate", icon: "🌀" },
  { id: "castles", label: "Castles", icon: "🏰" },
  { id: "buildings", label: "Buildings", icon: "🏘️" },
  { id: "improvements", label: "Improvements", icon: "🧱" },
  { id: "soundtrack", label: "Soundtracks", icon: "🎼" },
  { id: "sounds", label: "Game sounds", icon: "🔊" }
] as const;
type TabId = (typeof TABS)[number]["id"];

/** The Codex's top tabs; each holds one or more of the tabs above (the Game Guide holds none) */
const SECTIONS: Array<{ id: string; label: string; icon: string; blurb: string; tabs: TabId[] }> = [
  { id: "guide", label: "Game Guide", icon: "📖", blurb: "How the realm works, chapter by chapter, and the legends behind each civilization", tabs: [] },
  { id: "creatures", label: "Creatures", icon: "🐺", blurb: "Every boss, monster, bandit, mercenary and champion, with where it roams and how rare it is, the townsfolk and animals that live in the realm, and the legends who wander its roads", tabs: ["bosses", "monsters", "bandits", "mercenaries", "armory", "champions", "folk", "legends", "voidgate"] },
  { id: "world", label: "World", icon: "🗺️", blurb: "The landmarks, frontier gates, free realms, wild sights, resource nodes and treasure caches of the world map", tabs: ["landmarks", "gates", "realms", "wilds", "resources", "treasures"] },
  { id: "structures", label: "Structures", icon: "🏰", blurb: "Every castle stage, every district's buildings tier by tier, and every improvement tier with its cost", tabs: ["castles", "buildings", "improvements"] },
  { id: "music", label: "Music & Sounds", icon: "🎵", blurb: "Each civilization's soundtracks, and every sound the game plays", tabs: ["soundtrack", "sounds"] },
  { id: "chronicles", label: "Chronicles", icon: "📜", blurb: "The realm's saga: every weekly story the Crown has published, newest first", tabs: [] },
  { id: "sparring", label: "Sparring Grounds", icon: "🤺", blurb: "Pick two units and watch their Battle Arts in a 6-round fight on the realm's own battle engine", tabs: [] }
];

const RARITY_ORDER: NPCRarity[] = ["common", "uncommon", "rare", "epic", "legendary", "mythical"];

const CATEGORY_TAB: Record<CodexEntry["category"], TabId> = {
  mob: "monsters",
  boss: "bosses",
  bandit: "bandits",
  treasure: "treasures",
  resource: "resources",
  kingdom: "realms",
  terrain: "landmarks"
};

const CATEGORY_LABEL: Record<CodexEntry["category"], string> = {
  mob: "Roving monster",
  boss: "World raid boss",
  bandit: "Bandit warband",
  treasure: "Treasure cache",
  resource: "Resource node",
  kingdom: "Free realm (buffer zone)",
  terrain: "Landmark"
};

const CIVS: CivilizationType[] = ["human", "elf", "dwarf", "orc", "arcane"];

const STAGE_BLURB = [
  "A humble stone keep with two front watchtowers.",
  "All four corner towers, a royal banner and chimneys.",
  "A central spire, bell tower, fire braziers and curtain ramparts.",
  "An upper palace hall, windmill, crystal obelisks and floating citadels.",
  "The civilization's wonder signature crowns the castle (in HD a grander castle of its own: Valoria's turning gilt crown and tall spires, Sylvandale's tree in bloom, Ironforge's forge stack and lava falls, Drak'mar's mammoth skull and bonfire, Nethergarde's monoliths and turning silver rings).",
  "A floating citadel over a broken rock base: crimson-gold spires and banners, a slow halo, three orbiting shards and a beam of light (in HD a cathedral city of towers and stained glass, held to its rock by gold chains, water pouring off its edge). It stands at the heart of the Voidrift, under the Eye."
];

/** Stages every civilization's castle goes through (the Empyrean is the Archon's alone) */
const MORTAL_STAGES = CASTLE_STAGES.slice(0, EMPYREAN_STAGE);

/** Frontier gates are kingdom NPCs on the map, but get a tab of their own */
const isGate = (e: CodexEntry) => e.category === "kingdom" && e.type.startsWith("gate-");
/** The Void Gate lives in its own tab (Creatures → Void Gate), not with the landmarks, until it stands on the map;
 * the wandering legends in theirs (Creatures → Wandering Legends) */
const isLegendEntry = (e: CodexEntry) => e.type.startsWith("legend-");
const tabOf = (e: CodexEntry): TabId => (e.type === VOID_GATE_TYPE ? "voidgate" : isGate(e) ? "gates" : isLegendEntry(e) ? "legends" : CATEGORY_TAB[e.category]);

function npcItem(e: CodexEntry): Item {
  const facts: Array<[string, string]> = [
    ["Type", isGate(e) ? "Frontier gate" : isLegendEntry(e) ? "Wandering legend" : CATEGORY_LABEL[e.category]],
    ["Found in", e.spawn]
  ];
  if (e.chance !== undefined) {
    const pct = `${(e.chance * 100).toFixed(e.chance < 0.01 ? 2 : 1)}%`;
    facts.push(e.category === "resource" ? ["Spawn chance", `${pct} per node`] : ["Spawn odds", `${pct} expected per 15-min window`]);
  }
  if (e.resourceYield) {
    facts.push(["Yield", Object.entries(e.resourceYield).map(([k, v]) => `+${v.toLocaleString()} ${k}`).join(" · ")]);
  }
  // World bosses, mobs and bandits: their Battle Arts, one fact per Instinct, Art and Finale
  for (const line of e.arts ?? []) {
    const [kind, text] = line.split(" · ");
    facts.push([kind, text ?? line]);
  }
  if (e.standing !== undefined) facts.push(["This week", e.standing ? "🏛️ Standing on the map now" : "Not standing (waits in the region's pool)"]);
  if (REALM_MODEL_TYPES.has(e.type)) {
    facts.push(
      ["Cycle", `${REALM_CYCLE_DAYS} days: ${REALM_STAGES.map((st, i) => `${st} Lv${REALM_STAGE_LEVELS[i][0]}–${REALM_STAGE_LEVELS[i][1]}`).join(" → ")}, a week each`],
      ["Building day", `The first day of every stage it is built up, shielded (no attacks or rallies), then it gains a level a day, refilled to full each time`],
      ["Moves", "After its epic week it leaves; another realm of the region rises somewhere else"]
    );
  }
  return {
    id: e.id,
    name: e.name,
    emblem: e.emblem,
    subtitle: e.subtitle,
    description: e.description,
    rarity: e.rarity,
    teaser: e.teaser,
    standing: e.standing,
    facts,
    preview: { kind: "npc", type: e.type, rarity: e.rarity, scaled: ["mob", "bandit", "treasure", "resource"].includes(e.category), boss: e.category === "boss" }
  };
}

/** Mortal castle stages on the rarity ladder: Keep, Castle, Citadel, Palace, Wonder */
const STAGE_RARITY: NPCRarity[] = ["common", "uncommon", "rare", "epic", "legendary"];

function castleItems(): Item[] {
  const empyrean = CASTLE_STAGES[EMPYREAN_STAGE];
  const archon: Item = {
    id: "castle-empyrean",
    name: "The Empyrean",
    emblem: "👑",
    subtitle: `Archon of the Realm · castle levels ${empyrean.from}–${empyrean.from + 4}`,
    description: STAGE_BLURB[EMPYREAN_STAGE],
    // Top of the rarity ladder: mythic-class, above the legendary Wonder
    rarity: "mythical",
    facts: [
      ["Held by", "The Archon of the Realm only"],
      ["Castle levels", `${empyrean.from}–${empyrean.from + 4}`],
      ["Seat", "The Voidrift's centre, under the Eye"]
    ],
    preview: { kind: "castle", civ: "arcane", stage: EMPYREAN_STAGE }
  };
  return [
    ...CIVS.flatMap((civ) =>
      MORTAL_STAGES.map((st, i) => ({
        id: `castle-${civ}-${i}`,
        name: `${CIV_META[civ].label} ${st.name}`,
        emblem: CIV_META[civ].icon,
        subtitle: `${CIV_META[civ].realm} · castle levels ${st.from}–${st.from + 4}`,
        description: STAGE_BLURB[i],
        // Each stage climbs the rarity ladder: Keep common … Palace epic, the Wonder (top mortal castle) legendary
        rarity: STAGE_RARITY[i],
        facts: [
          ["Civilization", `${CIV_META[civ].label} (${CIV_META[civ].realm})`],
          ["Castle levels", `${st.from}–${st.from + 4}`],
          ["Stage", `${i + 1} of ${MORTAL_STAGES.length}`]
        ] as Array<[string, string]>,
        preview: { kind: "castle", civ, stage: i } as Preview
      }))
    ),
    archon
  ];
}

/** The NPC void kingdoms on the Voidrift's open slots, drawn as the Nethergarde castle of their City Hall level */
function voidKingdomItems(list: VoidKingdom[]): Item[] {
  return list.map((v) => {
    const scarce = Object.entries(v.loot.scarce ?? {}).map(([k, n]) => `${n} ${k.replace(/_/g, " ")}`);
    return {
      id: `void-kingdom-${v.slot}`,
      name: v.name,
      emblem: "🌌",
      subtitle: `NPC void kingdom · Voidrift slot ${v.slot}`,
      description:
        "A Warden of the Void holding an open Voidrift slot. Break its garrison to claim the slot and ascend to Nethergarde. Losses stick between assaults, and only one ruler may claim it (no rallies).",
      rarity: "epic",
      facts: [
        ["Type", "Free realm (Voidrift)"],
        ["Found in", `Nethergarde Voidrift, slot ${v.slot} while no developer holds it`],
        ["City Hall", `Level ${v.level}`],
        ["Garrison", `${v.maxGarrison.toLocaleString()} of ${v.population.toLocaleString()} people`],
        ["Walls", `Tier ${v.wallTier} · ${v.wallMaxHp.toLocaleString()} HP · DEF ×${v.wallDefMult.toFixed(2)}`],
        ["Conquest loot", [`${v.loot.gold.toLocaleString()} gold`, `${v.loot.iron.toLocaleString()} iron`, `${v.loot.stone.toLocaleString()} stone`, ...scarce].join(" · ")]
      ] as Array<[string, string]>,
      preview: { kind: "castle", civ: "arcane", stage: castleStage(v.level).index } as Preview
    };
  });
}

/**
 * Every civilization's mercenary pool, common → legendary, slot for slot alike across the five: hired at the Mercenary
 * Camps (each region's legendary landmark), with their power, Battle Arts, price and upkeep
 */
function mercenaryItems(kits: CodexCatalog["mercenaryKits"]): Item[] {
  return [...poolItems(kits), oathboundItem()];
}

/** The Void Gate's legendary mercenary: its model is built, the gate is coming soon (no numbers promised yet) */
function oathboundItem(): Item {
  return {
    id: OATHBOUND.type,
    name: OATHBOUND.name,
    emblem: OATHBOUND.emblem,
    subtitle: `${OATHBOUND.title} · every civilization`,
    description: OATHBOUND.description,
    rarity: OATHBOUND.rarity,
    teaser: true,
    facts: [
      ["Type", "Legendary mercenary (a familiar), never sold at a camp"],
      ["Won by", "Beating the Void Gate's last level, its Warden (the gate is not in the realm yet)"],
      ["Band", "One pair, a whole march on its own"],
      ["Civilization", "The same pair for every civilization"],
      ["Rules", "Not settled yet: coming with the Void Gate"]
    ],
    preview: { kind: "mercenary", type: OATHBOUND.type, rarity: OATHBOUND.rarity } as Preview
  };
}

function poolItems(kits: CodexCatalog["mercenaryKits"]): Item[] {
  return CIVS.flatMap((civ) =>
    (MERCENARY_POOLS[civ] ?? []).map((m) => {
      const r = m.rarity as MercRarity;
      const rule = MERC_RULES[r];
      const facts: Array<[string, string]> = [
        ["Civilization", `${CIV_META[civ].label} (${CIV_META[civ].realm}): a ruler of another civilization hiring this rarity gets their own counterpart`],
        ["Role", m.role],
        ["Band", MERCENARY_BAND_SIZE[m.rarity] > 1 ? `${MERCENARY_BAND_SIZE[m.rarity]} walk in one band (a whole march)` : "Walks alone (a whole march)"],
        ["Power", `${rule.power}× its hirer's full march`],
        ["Hired with", rule.minSlots > 1 ? `${rule.minSlots}+ march slots (City Hall ${rule.minSlots * 5 - 4}+)` : "Any march slots"],
        ["Hire price", costText(rule.price, false)],
        ["Upkeep", `${costText(rule.upkeep, false)} every harvest`],
        [BATTLE_PAY.name, `${costText(battlePayFor(r), false)} each fight (marching out, or defending its hirer's walls); unpaid, it stays out of that fight`],
        ["Defends", "Its hirer's castle when it is attacked and the band is at home, beside the garrison"],
        ["Healing", `Share lost × ${HEAL_PRICE_SHARE * 100}% of the price; ${mercDurationText(rule.healFullMs)} from 0% to whole`],
        ["Camp stock", `One new every ${mercDurationText(rule.restockMs)}, up to ${rule.maxStock} waiting`],
        [
          "The Sellsword's Oath",
          `"Our steel is for hire, our graves are not." Before a colossus a free company fights from the flanks, hamstringing and harrying with a road home kept open: on a world boss it lands ${Math.round(BAND_BOSS_DAMAGE * 100)}% of its blows (its Arts still weaken the beast)`
        ]
      ];
      // Its Battle Arts, one fact per Instinct, Art and Finale
      for (const line of kits?.[civ]?.[r] ?? []) {
        const [kind, text] = line.split(" · ");
        facts.push([kind, text ?? line]);
      }
      return {
        id: m.type,
        name: m.name,
        emblem: m.emblem,
        subtitle: `${m.title} · ${CIV_META[civ].realm}`,
        description: m.description,
        rarity: m.rarity,
        facts,
        preview: { kind: "mercenary", type: m.type, rarity: m.rarity } as Preview
      };
    })
  );
}

/**
 * The Void Gate tab (coming soon): the gate itself, then its 30-level climb, one family of creatures per stage, each
 * shown as its sizes side by side (common → legendary), then the Gate Warden with the koi that become the Oathbound.
 * No numbers are promised: the climb's rules aren't settled yet
 */
function voidGateItems(entries: CodexEntry[]): Item[] {
  const gate = entries.find((e) => e.type === VOID_GATE_TYPE);
  const broods: Item[] = VOID_BROODS.filter((b) => BUILT_BROODS.has(b.id)).map((b) => {
    const first = b.sizes[0].level;
    const last = b.sizes[b.sizes.length - 1].level;
    const facts: Array<[string, string]> = [
      ["Stage", `${b.stage} of the climb · levels ${first}–${last}`],
      ["Normal levels", b.boss ? `Levels ${first}–${last - 1}: a pack of the brood, one size bigger each level` : `Levels ${first}–${last}: a pack of Sentinels, stronger each level`],
      ["Models", "Each size a rigged creature, as the mercenaries are: pick a level to see it alone, its pack, and in HD its walk and strike"],
      ...(b.boss ? ([["Boss", `Level ${last}: ${b.sizes[4].name}, the brood grown up, alone`]] as Array<[string, string]>) : []),
      ["Found in", "Beyond the Void Gate (not in the realm yet)"]
    ];
    return {
      id: `vg-${b.id}`,
      name: b.title,
      emblem: b.emblem,
      subtitle: `Stage ${b.stage} · levels ${first}–${last}`,
      description: b.description,
      rarity: b.sizes[b.sizes.length - 1].rarity,
      teaser: true,
      facts,
      preview: { kind: "void_brood", brood: b.id } as Preview,
      brood: b
    };
  });
  const warden: Item = {
    id: "vg-warden",
    name: VOID_WARDEN.name,
    emblem: VOID_WARDEN.emblem,
    subtitle: `Level ${VOID_WARDEN.level} · the climb's last`,
    description: VOID_WARDEN.description,
    rarity: VOID_WARDEN.rarity,
    teaser: true,
    facts: [
      ["Level", `${VOID_WARDEN.level}: the Warden alone, with its guard`],
      ["Its guard", "The two void koi swimming a wide ring above its head, casting for its side; they never strike"],
      ["When it falls", `The koi swear themselves to the ruler who beat it and become ${OATHBOUND.name}, a legendary mercenary (Creatures → Mercenaries)`],
      ["Found in", "Beyond the Void Gate (not in the realm yet)"]
    ],
    preview: { kind: "void_brood", brood: "warden" } as Preview
  };
  return [...(gate ? [npcItem(gate)] : []), ...broods, ...(VOID_RIGS[VG_WARDEN_TYPE] ? [warden] : [])];
}

/** The wild sights scattered over the map by the client (lodges, lighthouses, sea monsters…): scenery, no rarity */
function wildsItems(): Item[] {
  return NPC_KINDS.filter((k) => k.habitat).map((k) => {
    const hostile = HOSTILE_NPC_TYPES.has(k.type);
    return {
      id: `wild-${k.type}`,
      name: k.names[0],
      emblem: k.emblem,
      subtitle: k.subtitle,
      description: k.descriptions.join(" "),
      facts: [
        ["Type", hostile ? "Wild creature (scenery)" : "Wild sight (scenery)"],
        ["Found in", k.habitat!],
        ["Also called", k.names.slice(1).join(" · ")],
        ["On the map", "One wild sight per four kingdoms, spread over the kinds the land suits; no reward and nothing to fight"]
      ] as Array<[string, string]>,
      preview: { kind: "npc", type: k.type, rarity: "common", scaled: false, boss: false } as Preview
    };
  });
}

/** The animals of the cities' pens, yards and skies, and where else they turn up */
const ANIMAL_ENTRIES: Array<{ kind: AnimalKind; name: string; emblem: string; where: string; description?: string }> = [
  { kind: "sheep", name: "Sheep", emblem: "🐑", where: "Valoria and Nethergarde pens (violet fleeces in Nethergarde); flocks at fleece nodes on the map" },
  { kind: "cow", name: "Cow", emblem: "🐄", where: "Valoria pens; herds at cattle nodes on the map" },
  { kind: "pig", name: "Pig", emblem: "🐖", where: "Valoria pens" },
  { kind: "chicken", name: "Chicken", emblem: "🐔", where: "Valoria yards" },
  { kind: "deer", name: "Deer", emblem: "🦌", where: "Sylvandale pens" },
  { kind: "horse", name: "Horse", emblem: "🐎", where: "Sylvandale pens" },
  { kind: "rabbit", name: "Rabbit", emblem: "🐇", where: "Sylvandale pens" },
  { kind: "swan", name: "Swan", emblem: "🦢", where: "Sylvandale yards" },
  { kind: "goat", name: "Goat", emblem: "🐐", where: "Ironforge pens" },
  { kind: "boar", name: "Boar", emblem: "🐗", where: "Ironforge and Drak'mar pens" },
  { kind: "pony", name: "Pony", emblem: "🐴", where: "Ironforge pens" },
  { kind: "goose", name: "Goose", emblem: "🪿", where: "Ironforge yards" },
  { kind: "wolf", name: "Wolf", emblem: "🐺", where: "Drak'mar pens; wolf packs prowling round their lairs on the map" },
  { kind: "lizard", name: "Lizard", emblem: "🦎", where: "Drak'mar pens" },
  { kind: "crow", name: "Crow", emblem: "🐦‍⬛", where: "Drak'mar yards; crows, bats, harpies and vultures wheeling over lairs and bones on the map; the owls of the Nethergarde towers" },
  { kind: "griffin", name: "Griffin", emblem: "🦅", where: "The Archon's Griffin Roosts (Celestial pastures): two rest on the perches, three circle the crag. Normal draws them as gilded birds, HD as griffins: an eagle's head, wings and talons on a lion's body and tufted tail, with a gilt beak, collar and primaries", description: "Griffins rest on the Archon's carved perches and wheel over the crag; they live nowhere else in the realm." },
  { kind: "stag", name: "Spirit stag", emblem: "🦌", where: "Nethergarde pens: antlers lit with the void" },
  { kind: "cat", name: "Cat", emblem: "🐈‍⬛", where: "Nethergarde pens" },
  { kind: "owl", name: "Owl", emblem: "🦉", where: "Nethergarde yards" }
];

/**
 * The townsfolk of each civilization (villagers, farmers, soldiers and the light they carry after dark), the mount its
 * scouts ride, and every animal: they walk the cities' streets and pens, patrol and work round the map's camps and
 * nodes, and march (or ride) to war
 */
function folkItems(): Item[] {
  const folk: Item[] = CIVS.map((civ) => ({
    id: `folk-${civ}`,
    name: `${CIV_META[civ].label} folk`,
    emblem: CIV_META[civ].icon,
    subtitle: `Townsfolk · ${CIV_META[civ].realm}`,
    description: `The people of ${CIV_META[civ].realm}: villagers going about the streets, farmers at work, soldiers on patrol, and the light they carry after dark.`,
    facts: [
      ["Civilization", `${CIV_META[civ].label} (${CIV_META[civ].realm})`],
      ["In the city", "Walking the streets, working the fields and workshops, guarding the walls, playing in the squares"],
      ["On the map", "Villagers, pilgrims and gate guards round its NPCs, and its soldiers marching to war"]
    ] as Array<[string, string]>,
    preview: { kind: "folk", civ } as Preview
  }));
  const animals: Item[] = ANIMAL_ENTRIES.map((a) => ({
    id: `folk-${a.kind}`,
    name: a.name,
    emblem: a.emblem,
    subtitle: "Animal",
    description: a.description ?? `${a.name}s graze, peck and roam in the cities and round the map.`,
    facts: [["Found in", a.where]] as Array<[string, string]>,
    preview: { kind: "folk", animal: a.kind } as Preview
  }));
  const remains: Item = {
    id: "folk-remains",
    name: "Battlefield remains",
    emblem: "💀",
    subtitle: "What a routed army leaves behind",
    description: `Where an army is repelled or driven off, its remains lie on the battlefield for ${Math.round(DEFEAT_MARKER_MS / 1000)} seconds, in its civilization's colours: the standard snapped but its banner still hanging, a second banner trampled into the mud, shields, helmets, skulls and the army's own broken weapons, with a fire of broken shafts that burns down to a last wisp of smoke.`,
    facts: [
      ["On the map", "At the battlefield of every lost battle, over a boss, a rival's walls, a camp or a node"],
      ["Weapons", "Valoria's swords and kite shields, Sylvandale's bows and leaf shields, Ironforge's axes, Drak'mar's cleavers and horned helms, Nethergarde's crystal staves"],
      ["Burning down", "Flames and bright embers, then red embers and grey smoke, then cold with a last wisp"],
      ["More losses", "The more soldiers fell, the more lies strewn round the standard"]
    ],
    preview: { kind: "remains" }
  };
  const mounts: Item[] = CIVS.map((civ) => ({
    id: `folk-mount-${civ}`,
    name: SCOUT_MOUNT[civ].name,
    emblem: CIV_META[civ].icon,
    subtitle: `Scout mount · ${CIV_META[civ].label}`,
    description: `${CIV_META[civ].label} scouts ride the ${SCOUT_MOUNT[civ].name}, ${SCOUT_MOUNT[civ].blurb}. Its rider is a civilian, dressed as the people of the kingdom they are scouting; the saddle cloth keeps their own colours.`,
    facts: [
      ["Ridden by", `${CIV_META[civ].label} scouting parties (only scouts ride: armies, gatherers and reinforcements march on foot)`],
      ["On the map", "Under every scout on the road to its target and home again"],
      ["Rider", "A civilian in the target kingdom's clothes (an NPC kingdom's civilization, the Voidrift's for Nethergarde); their own clothes for any other target"]
    ] as Array<[string, string]>,
    preview: { kind: "folk", mount: civ } as Preview
  }));
  return [...folk, ...mounts, remains, ...animals];
}

/** 🗡️ Every civilization's three Armory sets, each on its soldiers (standard gear beside them for comparison) */
function armoryItems(): Item[] {
  const shares = Object.values(ARMORY_TARGET_SHARE).map((t) => `${t.emblem} ${t.name}: ${t.description}`);
  return CIVS.flatMap((civ) =>
    ARMORY_RARITIES.map((rarity, i) => {
      const set = armorySetFor(civ, rarity);
      const rule = ARMORY_RULES[rarity];
      const per100 = forgeCost(civ, rarity, 100);
      const look =
        rarity === "uncommon"
          ? "Its accent colour on a tabard or sash, and a small prop (a pennant, plume or charm)"
          : rarity === "rare"
            ? "The uncommon accent, with metal pauldrons and a crest on the helm"
            : "Rare's metal trim, a cape behind the back and glowing details (the weapon's head, a gem on the chest)";
      return {
        id: `armory-${civ}-${rarity}`,
        name: set.name,
        emblem: set.emblem,
        subtitle: `${rarity[0].toUpperCase()}${rarity.slice(1)} set · ${CIV_META[civ].label}`,
        description: `${set.story} Forged in the Armory and worn by a whole attack or rally march, one set per soldier; the sets left at home dress the home garrison.`,
        rarity: rarity as NPCRarity,
        facts: [
          ["Adds", setText(set)],
          ["Power", `A march in it fights like ${rule.power}× the same march in standard gear`],
          ["Forging 100 sets", costText({ ...per100.cost }) + (Object.keys(per100.gems).length ? ` + ${Object.entries(per100.gems).map(([k, v]) => `${v} ${k}`).join(", ")}` : "")],
          ["Upkeep, every harvest", `${costText({ ...rule.upkeep })} per 100 sets held (at home or on a march); what the treasury can't pay rusts back to the stock pile`],
          ["Forged from", `City Hall ${rule.minLevel} (${i + 2} march slots)`],
          ["Looks", look],
          ["Against", shares.join(" · ")]
        ] as Array<[string, string]>,
        preview: { kind: "folk", civ, arms: (i + 1) as 1 | 2 | 3 } as Preview
      };
    })
  );
}

/**
 * 🦸 Every civilization's champions: one rolled legendary hero per kingdom, its look drawn slot by slot from its
 * civilization's part library (four looks of each civilization shown, every slot's options listed)
 */
function championItems(): Item[] {
  const shares = Object.values(CHAMPION_TARGET_SHARE).map((t) => `${t.emblem} ${t.name}: ${t.description}`);
  return CIVS.flatMap((civ) =>
    [0, 1, 2, 3].map((v) => {
      const looks = Object.fromEntries(CHAMPION_SLOTS.map((s, i) => [s, (v + i * (v % 2 ? 1 : 3)) % LOOK_OPTIONS])) as ChampionLooks;
      const lib = championLibrary(civ);
      return {
        id: `champion-${civ}-${v}`,
        name: `${CIV_META[civ].realm} champion · look ${String.fromCharCode(65 + v)}`,
        emblem: "🦸",
        subtitle: `Legendary hero · ${CIV_META[civ].label}`,
        description:
          "Every kingdom has one champion: a legendary hero rolled for it once, by name, look and Battle Arts. It leads one attack or rally march of soldiers at a time, by its ruler's choice, and the home garrison's defence while it is home; it rises in level on the Renown of the battles it leads. A civilization change re-dresses the same champion in the new civilization's parts.",
        rarity: "legendary" as NPCRarity,
        facts: [
          ["Leads", "One attack or rally march of soldiers at a time (never a mercenary band, scouts, gatherers or reinforcements), and the home garrison while it is home"],
          ["Bonus", `+${Math.round(CHAMPION_STAT_PER_LEVEL * 1000) / 10}% HP, ATK and DEF a level for the army it leads (+${Math.round(CHAMPION_STAT_PER_LEVEL * CHAMPION_MAX_LEVEL * 100)}% at level ${CHAMPION_MAX_LEVEL})`],
          ["Battle Arts", `2 Instincts, 2 Arts and a Finale (legendary), unlocked at levels ${KIT_UNLOCKS.instinct1} / ${KIT_UNLOCKS.art1} / ${KIT_UNLOCKS.art2} / ${KIT_UNLOCKS.instinct2} / ${KIT_UNLOCKS.finale}; a hero's arm strikes with ${Math.round(CHAMPION_ART_SHARE * 100)}% of its army's blow`],
          ["Levels", `1–${CHAMPION_MAX_LEVEL}, never above its City Hall; Renown past the cap is banked`],
          ["Wounds", "Falls, never dies: wiped out, it is carried home wounded and heals in 2 h + 10 min a level (hastened with gold and food)"],
          ...CHAMPION_SLOTS.map((s): [string, string] => [`Look · ${s}`, lib[s].map((o, i) => `${String.fromCharCode(65 + i)} ${o}`).join(" · ")]),
          ["Against", shares.join(" · ")]
        ] as Array<[string, string]>,
        preview: { kind: "champion", type: championModelType(civ, looks), rarity: "legendary" } as Preview
      };
    })
  );
}

/** Civilizations whose mercenary pool isn't designed yet */
const CIVS_WITHOUT_MERCENARIES = CIVS.filter((c) => !MERCENARY_POOLS[c]?.length);

/** Every sound cue in the game, each on a little stage of its own */
function soundItems(): Item[] {
  return SOUND_CUES.map((c) => ({
    id: `sound-${c.id}`,
    name: c.name,
    emblem: c.emblem,
    subtitle: c.heard ? "Sound cue" : "Sound library · not played in the game yet",
    description: c.description,
    facts: [
      ["Heard when", c.heard ?? "Not played anywhere in the game yet"],
      ["Voice", c.voice]
    ] as Array<[string, string]>,
    preview: { kind: "sound", cue: c.id } as Preview,
    cue: c.id
  }));
}

const DISTRICTS: Array<{ type: BuildingType; name: string; emblem: string; tiers: string }> = [
  { type: "residential_commercial", name: "Homes & Shops", emblem: "🏠", tiers: "cottage → house → manor → great hall" },
  { type: "food_field", name: "Farms", emblem: "🌾", tiers: "crop patch → field → granary → windmill" },
  { type: "animal_field", name: "Pastures", emblem: "🐄", tiers: "pen → stable → barn → ranch" },
  { type: "soldier_building", name: "Barracks", emblem: "🛡️", tiers: "tent → barracks → watchtower → keep" }
];

/** The steps a building climbs on the rarity ladder: its structure tiers, the grand Lv25, prestige and the Celestial top */
const BUILDING_STEPS: Array<{ key: string; label: string; level: number; prestige?: number; rarity: NPCRarity; blurb: string }> = [
  { key: "t0", label: "Lv1 · tier 0", level: 1, rarity: "common", blurb: "Its first structure: plain and matte, shutters closed, nothing glowing." },
  { key: "t1", label: "Lv4 · tier 1", level: 4, rarity: "uncommon", blurb: "A tier-1 structure: one accent colour and a small prop (a hanging sign, a lantern, a weapon rack)." },
  { key: "t2", label: "Lv12 · tier 2", level: 12, rarity: "rare", blurb: "A tier-2 structure: slate, iron or copper trim, lit windows and one looping effect (chimney smoke, a turning vane, a streaming banner)." },
  { key: "t3", label: "Lv20 · tier 3", level: 20, rarity: "epic", blurb: "A tier-3 structure: a bigger silhouette, lit and gilded details, and birds circling it." },
  { key: "lv25", label: "Lv25 · grand", level: 25, rarity: "epic", blurb: "The grand structure: the full plot, walled, with corner towers, a statue and lamps." },
  { key: "p4", label: "Lv25 ★★★★", level: 25, prestige: 4, rarity: "epic", blurb: "Four prestige stars: banners, a gold border, sparkles and the epic aura, a low curtain of light round the plot. No pillar of light." },
  { key: "red", label: `Lv25 red ★${RED_STAR_FROM}`, level: 25, prestige: RED_STAR_FROM, rarity: "legendary", blurb: "The top class for a repo: the legendary kit round the plot, a tall curtain of rising light, embers and motes. In HD its banners are gilt standards, its border a gilt kerb set with gems, and pennants fly from its towers." },
  { key: "celestial", label: "Lv26 · Celestial", level: 26, rarity: "mythical", blurb: "The Archon of the Realm's buildings only: a Celestial structure and the mythic kit." }
];

function buildingItems(): Item[] {
  return DISTRICTS.flatMap((dist) =>
    BUILDING_STEPS.map((st) => ({
      id: `building-${dist.type}-${st.key}`,
      name: `${dist.name} · ${st.label}`,
      emblem: dist.emblem,
      subtitle: dist.tiers,
      description: st.blurb,
      rarity: st.rarity,
      facts: [
        ["District", dist.name],
        ["Level", st.prestige ? `${st.level}, ${st.prestige} prestige stars` : `${st.level}`],
        ["Tiers", dist.tiers]
      ] as Array<[string, string]>,
      preview: { kind: "building", district: dist.type, level: st.level, prestige: st.prestige ?? 0 } as Preview
    }))
  );
}

/** Improvement tiers 1–5 on the rarity ladder */
const TIER_RARITY: NPCRarity[] = ["common", "uncommon", "rare", "epic", "legendary"];

function improvementItems(upgrades: UpgradeDef[]): Item[] {
  return upgrades.flatMap((u) =>
    u.tiers.map((t, i) => {
      const cost = Object.entries(t.cost).map(([k, v]) => `${(v as number).toLocaleString()} ${k}`);
      const gems = Object.entries(t.gems ?? {}).map(([k, v]) => `${v} ${k.replace(/_/g, " ")}`);
      return {
        id: `upgrade-${u.id}-${i + 1}`,
        name: t.name,
        emblem: u.emblem,
        subtitle: u.tiers.length > 1 ? `${u.name} · tier ${i + 1} of ${u.tiers.length}` : u.name,
        description: t.description,
        // Improvement tiers climb the rarity ladder: tier 1 common … tier 5 legendary
        rarity: TIER_RARITY[i],
        facts: [
          ["Improvement", u.name],
          ["Tier", `${i + 1} of ${u.tiers.length}`],
          ["Cost", [...cost, ...gems].join(" · ")]
        ] as Array<[string, string]>,
        preview: { kind: "improvement", upgradeId: u.id, tier: i + 1 } as Preview
      };
    })
  );
}


/* ------------------------------------------------------------------------- */
/* Modal                                                                     */
/* ------------------------------------------------------------------------- */

/**
 * The Royal Codex: the Game Guide (rules and lore), every monster, boss, bandit, treasure, resource node, landmark,
 * mercenary, castle stage and improvement in a 3D preview, the civilizations' soundtracks and game sounds, and the
 * weekly stories (Chronicles)
 */
export function CodexModal({ open, onClose, initialSection, initialChapter }: CodexModalProps) {
  const [sectionId, setSectionId] = useState(() => SECTIONS.find((s) => s.id === initialSection)?.id ?? SECTIONS[0].id);
  const [catalog, setCatalog] = useState<CodexCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("bosses");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [civ, setCiv] = useState<CivilizationType>("human");
  const [castleView, setCastleView] = useState<"world" | "city">("world");
  const [prestige, setPrestige] = useState(0);
  /** Epic landmarks: shown finished, or as they look on a rotation day (rising / crumbling, at a step of the day) */
  const [landmarkStage, setLandmarkStage] = useState<"built" | "rising" | "crumbling">("built");
  const [landmarkStep, setLandmarkStep] = useState(4);
  /** Buffer realms: the stage of the cycle shown (0 common … 3 epic), and whether on its building day */
  const [realmStage, setRealmStage] = useState(0);
  const [realmBuilding, setRealmBuilding] = useState(false);
  /** Entries with an HD version show it (Normal / ✨ HD switch), opening on the player's Graphics setting: Builder models
   * world-map castles and improvements through the HD model kit, Xal'Vorath and the Empyrean as their hand-built
   * showcases (Xal'Vorath with its actions) */
  const [hdView, setHdView] = useState(() => graphics.get().quality === "hd");
  const [singularityAction, setSingularityAction] = useState<SingularityAction>("idle");
  const [bossAction, setBossAction] = useState<BossActionId>("idle");
  /** A mercenary's whole band in high graphics (every copy in the same draws) */
  const [bandView, setBandView] = useState(false);
  /** Void Gate tab: one level's pack shown in place of its family's line-up (by the entry it belongs to) */
  const [broodPick, setBroodPick] = useState<{ id: string; size: number } | null>(null);

  const section = SECTIONS.find((s) => s.id === sectionId) ?? SECTIONS[0];
  /** The 3D catalog: every tab but the guide and the soundtrack radio */
  const browsing = section.tabs.length > 0 && tab !== "soundtrack";
  const music = useSyncExternalStore(soundtrack.subscribe, soundtrack.getState);

  useEffect(() => {
    if (!open || catalog || !browsing) return;
    fetch(`${API_BASE}/codex`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((c: CodexCatalog) => setCatalog(c))
      .catch((e: Error) => setError(e.message));
  }, [open, catalog, browsing]);

  // The music keeps playing on any tab while the Codex is open, and stops when it closes
  useEffect(() => () => soundtrack.stop(), []);

  const openSection = (id: string) => {
    const next = SECTIONS.find((s) => s.id === id) ?? SECTIONS[0];
    setSectionId(next.id);
    if (next.tabs.length) setTab(next.tabs[0]);
    setSelectedId(null);
  };

  const items = useMemo(() => {
    if (!catalog) return [] as Item[];
    let list: Item[];
    if (tab === "castles") list = castleItems();
    else if (tab === "buildings") list = buildingItems();
    else if (tab === "improvements") list = improvementItems(catalog.upgrades);
    else if (tab === "mercenaries") list = mercenaryItems(catalog.mercenaryKits);
    else if (tab === "folk") list = folkItems();
    else if (tab === "armory") list = armoryItems();
    else if (tab === "champions") list = championItems();
    else if (tab === "wilds") list = wildsItems();
    else if (tab === "sounds") list = soundItems();
    else if (tab === "voidgate") list = voidGateItems(catalog.entries);
    else {
      list = catalog.entries
        .filter((e) => tabOf(e) === tab)
        // By rarity (common → legendary)
        .sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity))
        .map(npcItem);
      if (tab === "realms") list = [...list, ...voidKingdomItems(catalog.voidKingdoms ?? [])];
    }
    const q = query.trim().toLowerCase();
    return q ? list.filter((i) => `${i.name} ${i.subtitle} ${i.description}`.toLowerCase().includes(q)) : list;
  }, [catalog, tab, query]);

  const selected = items.find((i) => i.id === selectedId) ?? items[0] ?? null;
  const isEpic = selected?.preview.kind === "npc" && EPIC_LANDMARK_TYPES.has(selected.preview.type);
  const isRealm = selected?.preview.kind === "npc" && REALM_MODEL_TYPES.has(selected.preview.type);
  const isSingularity = selected?.preview.kind === "npc" && selected.preview.type === "mythic-singularity";
  const isEmpyrean = selected?.preview.kind === "castle" && selected.preview.stage === EMPYREAN_STAGE;
  /** The Void Gate (coming soon): one hand-built model, its HD version the same design with more detail */
  const isVoidGate = selected?.preview.kind === "npc" && selected.preview.type === VOID_GATE_TYPE;
  /** A one-of-a-kind sight with a hand-built HD hero (the legendary landmarks, the Nethergarde Core) */
  const isHero = selected?.preview.kind === "npc" && isBatchedHero(selected.preview.type);
  /** A world boss or legendary creature (the Bandit King, the Archmage) with a rigged HD hero, playing its actions */
  // 🦸 A champion is drawn in high graphics only (its rig is built from the part library)
  const isChampion = selected?.preview.kind === "champion";
  const isBoss = (selected?.preview.kind === "npc" && isBossHero(selected.preview.type)) || (selected?.preview.kind === "mercenary" && isMercHero(selected.preview.type)) || isChampion;
  const broodSize = selected && broodPick?.id === selected.id ? broodPick.size : undefined;
  /** A Void Gate creature shown alone (a level picked, or the Warden): a rigged hero, its actions in HD */
  const voidHero = selected?.preview.kind === "void_brood" ? (selected.preview.brood === "warden" ? VG_WARDEN_TYPE : broodSize !== undefined ? vgType(selected.preview.brood, broodSize) : undefined) : undefined;
  // How many walk in its pack (1 for the bosses and the Warden)
  const packSize = voidHero && selected?.preview.kind === "void_brood" && selected.preview.brood !== "warden" && broodSize !== undefined ? packOf(selected.preview.brood, broodSize) : 1;
  const bossActions = isBoss && selected ? heroActions((selected.preview as { type: string }).type) : voidHero ? heroActions(voidHero) : [];
  // A creature that never slumbers has no Slumbering button: fall back to its idle
  const shownBossAction = bossActions.some((a) => a.id === bossAction) ? bossAction : "idle";
  // How many walk in a mercenary's band (1 for anything else)
  const bandSize = selected?.preview.kind === "mercenary" ? MERCENARY_BAND_SIZE[selected.preview.rarity] : 1;
  // A castle's HD version: its world-map model and the city's town hall, both through the model kit
  const isCastleKit = selected?.preview.kind === "castle" && !isEmpyrean;
  const hasHd =
    isSingularity || isEmpyrean || isVoidGate || isHero || isBoss || isCastleKit || selected?.preview.kind === "folk" || selected?.preview.kind === "remains" || selected?.preview.kind === "improvement" || selected?.preview.kind === "building" || selected?.preview.kind === "void_brood" || (selected?.preview.kind === "npc" && hasHdVersion(selected.preview.type));
  const showHd = hasHd && (hdView || isChampion);
  const singularityHd = isSingularity && showHd;
  const empyreanHd = isEmpyrean && showHd;
  // A buffer realm is shown at the chosen stage of its cycle: its rarity and the levels it climbs follow the stage
  const shown: Item | null =
    selected && isRealm
      ? {
        ...selected,
        rarity: REALM_STAGES[realmStage],
        facts: [...selected.facts, ["Shown", `${REALM_STAGES[realmStage]} stage · City Hall ${REALM_STAGE_LEVELS[realmStage][0]}–${REALM_STAGE_LEVELS[realmStage][1]}${realmBuilding ? " · building day (shielded)" : ""}`]]
      }
      : selected;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      accentBorder="border-amber-600/60"
      headerClassName="bg-gradient-to-r from-amber-950 via-slate-950 to-slate-950"
      // The soundtrack list scrolls on its own; the radio above it stays put
      bodyClassName={section.tabs.length > 0 && tab === "soundtrack" ? "flex flex-col overflow-y-auto" : "overflow-y-auto"}
      header={
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-10 h-10 rounded-xl bg-amber-900/60 border border-amber-500/50 flex items-center justify-center">
            <Library className="w-5 h-5 text-amber-300" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-medieval text-lg font-bold text-amber-200 leading-tight">Royal Codex</h2>
            <p className="text-[11px] text-slate-400">{section.blurb}</p>
          </div>
        </div>
      }
      subHeader={
        // Top tabs: pinned above the scrolling body
        <div className="flex gap-1 overflow-x-auto overflow-y-hidden scrollbar-slim border-b border-slate-800 bg-slate-900">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => openSection(s.id)}
              className={`shrink-0 flex items-center gap-1.5 px-3 sm:px-4 h-9 text-sm font-medieval font-bold border-b-2 -mb-px transition ${section.id === s.id ? "border-amber-400 text-amber-200" : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
            >
              <span>{s.icon}</span>
              {s.label}
              {s.id === "music" && music.playing && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" title="Music playing" />}
            </button>
          ))}
        </div>
      }
    >
      <div className="h-3 shrink-0" />
      {section.id === "guide" && <GuideBook initialChapter={initialChapter} />}
      {section.id === "chronicles" && <ChroniclesBook />}
      {section.id === "sparring" && <SparringGrounds />}

      {section.tabs.length > 0 && (
        <>
          {/* Tabs of this section */}
          <div className="shrink-0 flex gap-1 overflow-x-auto pb-2">
            {/* In the section's own order: its first tab is the one it opens on */}
            {section.tabs.map((id) => TABS.find((t) => t.id === id)!).map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setTab(t.id);
                  setSelectedId(null);
                }}
                className={`shrink-0 flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-semibold border transition ${tab === t.id ? "bg-amber-900/60 border-amber-500/60 text-amber-200" : "bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200"
                  }`}
              >
                <span>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>

          {tab === "soundtrack" && <SoundtrackPlayer />}

          {browsing && error && <div className="p-4 text-sm text-red-300">Could not load the codex: {error}</div>}
          {browsing && !catalog && !error && <div className="p-8 text-center text-sm text-slate-400">Unrolling the codex…</div>}

          {browsing && catalog && (
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] gap-3">
              {/* List */}
              <div className="flex flex-col min-h-0">
                <label className="flex items-center gap-2 h-8 px-2 mb-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-400">
                  <Search className="w-3.5 h-3.5 shrink-0" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search…"
                    className="w-full bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-500"
                  />
                </label>
                <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-y-auto md:max-h-[28rem] pr-1">
                  {items.map((i) => (
                    <button
                      key={i.id}
                      onClick={() => {
                        setSelectedId(i.id);
                        if (i.cue) playCue(i.cue);
                      }}
                      title={i.cue ? "Select and play" : undefined}
                      className={`shrink-0 md:shrink text-left flex items-center gap-2 px-2 py-1.5 rounded-lg border transition ${selected?.id === i.id ? "bg-slate-800 border-amber-500/50" : "bg-slate-900/60 border-transparent hover:bg-slate-800/70"
                        }`}
                    >
                      <span className="text-lg leading-none">{i.emblem}</span>
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-slate-200 truncate">{i.name}</span>
                        {i.teaser ? (
                          <SoonBadge variant="line" />
                        ) : i.rarity ? (
                          <span className={`block text-[10px] uppercase tracking-wider font-bold ${RARITY_STYLE[i.rarity].text}`}>
                            {i.rarity}
                            {i.standing && <span className="text-emerald-300 normal-case tracking-normal"> · 🏛️ standing now</span>}
                          </span>
                        ) : (
                          <span className="block text-[10px] text-slate-500 truncate">{i.subtitle}</span>
                        )}
                      </span>
                      {i.cue && <Play className="w-3.5 h-3.5 ml-auto shrink-0 text-amber-300/80" />}
                    </button>
                  ))}
                  {items.length === 0 && <div className="text-xs text-slate-500 p-2">Nothing matches.</div>}
                  {tab === "mercenaries" && CIVS_WITHOUT_MERCENARIES.length > 0 && (
                    <div className="shrink-0 md:shrink text-[10px] text-slate-500 p-2 leading-snug">
                      🔒 {CIVS_WITHOUT_MERCENARIES.map((c) => CIV_META[c].label).join(", ")} mercenaries: coming soon
                    </div>
                  )}
                </div>
              </div>

              {/* Detail */}
              {selected && (
                <div className="flex flex-col gap-3 min-w-0">
                  <div className="relative h-72 sm:h-80 rounded-xl overflow-hidden border border-slate-700 bg-slate-950">
                    <ModelViewer
                      preview={
                        isSingularity && singularityHd
                          ? { kind: "singularity_hd", action: singularityAction }
                          : isEmpyrean && empyreanHd
                            ? { kind: "empyrean_hd", city: castleView === "city" }
                            : isHero && showHd
                              ? { kind: "hero_hd", type: (selected.preview as { type: string }).type }
                            : isBoss && showHd
                              ? { kind: "boss_hd", type: (selected.preview as { type: string }).type, action: shownBossAction, band: bandSize > 1 && bandView ? bandSize : undefined }
                            : selected.preview.kind === "npc" && isRealm
                              ? { ...selected.preview, hd: showHd, rarity: REALM_STAGES[realmStage], realmStage, ...(realmBuilding ? { stage: "rising" as const, step: landmarkStep } : {}) }
                              : selected.preview.kind === "npc" && isEpic && landmarkStage !== "built"
                                ? { ...selected.preview, hd: showHd, stage: landmarkStage, step: landmarkStep }
                                : selected.preview.kind === "void_brood"
                                  ? { ...selected.preview, hd: showHd, size: broodSize, action: shownBossAction, pack: packSize > 1 && bandView }
                                : (selected.preview.kind === "npc" || selected.preview.kind === "folk" || selected.preview.kind === "remains" || selected.preview.kind === "castle" || selected.preview.kind === "improvement" || selected.preview.kind === "building") && showHd
                                  ? { ...selected.preview, hd: true }
                                  : selected.preview
                      }
                      civ={civ}
                      view={castleView}
                      prestige={prestige}
                    />
                    {isSingularity && singularityHd && (
                      <div className="absolute right-2 top-2 flex flex-wrap justify-end gap-1 max-w-[70%]">
                        {SINGULARITY_ACTIONS.map((act) => (
                          <button
                            key={act.id}
                            onClick={() => setSingularityAction(act.id)}
                            className={`px-2 h-7 rounded-md text-[11px] font-semibold border transition ${singularityAction === act.id
                              ? "bg-amber-900/80 border-amber-500/60 text-amber-200"
                              : "bg-slate-900/80 border-slate-700 text-slate-300 hover:text-slate-100"
                              }`}
                          >
                            {act.label}
                          </button>
                        ))}
                      </div>
                    )}
                    {(isBoss || voidHero) && showHd && (
                      <div className="absolute right-2 top-2 flex flex-wrap justify-end gap-1 max-w-[70%]">
                        {bossActions.map((act) => (
                          <button
                            key={act.id}
                            onClick={() => setBossAction(act.id)}
                            className={`px-2 h-7 rounded-md text-[11px] font-semibold border transition ${shownBossAction === act.id
                              ? "bg-amber-900/80 border-amber-500/60 text-amber-200"
                              : "bg-slate-900/80 border-slate-700 text-slate-300 hover:text-slate-100"
                              }`}
                          >
                            {act.label}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="absolute left-2 top-2 flex flex-wrap gap-1">
                      {hasHd && !isChampion && <HdSwitch hd={showHd} onChange={setHdView} title={isSingularity || isBoss ? "High graphics, with its actions" : "High graphics"} />}
                      {isBoss && showHd && bandSize > 1 && (
                        <button
                          onClick={() => setBandView((v) => !v)}
                          title="The whole band, as it marches"
                          className={`px-2 h-7 rounded-md text-[11px] font-semibold border inline-flex items-center gap-1 ${bandView ? "bg-amber-900/80 border-amber-500/60 text-amber-200" : "bg-slate-900/80 border-slate-700 text-slate-300"}`}
                        >
                          <Users className="w-3.5 h-3.5" />
                          Band ×{bandSize}
                        </button>
                      )}
                      {packSize > 1 && (
                        <button
                          onClick={() => setBandView((v) => !v)}
                          title="The whole pack, as it walks at this level"
                          className={`px-2 h-7 rounded-md text-[11px] font-semibold border inline-flex items-center gap-1 ${bandView ? "bg-amber-900/80 border-amber-500/60 text-amber-200" : "bg-slate-900/80 border-slate-700 text-slate-300"}`}
                        >
                          <Users className="w-3.5 h-3.5" />
                          Pack ×{packSize}
                        </button>
                      )}
                      {selected.preview.kind === "castle" && (
                        <>
                          {(["world", "city"] as const).map((v) => (
                            <button
                              key={v}
                              onClick={() => setCastleView(v)}
                              className={`px-2 h-7 rounded-md text-[11px] font-semibold border ${castleView === v ? "bg-amber-900/80 border-amber-500/60 text-amber-200" : "bg-slate-900/80 border-slate-700 text-slate-300"
                                }`}
                            >
                              {v === "world" ? "World map" : "City town hall"}
                            </button>
                          ))}
                          {castleView === "city" && selected.preview.stage === 4 && (
                            <div className="w-32">
                              <Combobox
                                size="sm"
                                options={[0, 1, 2, 3, 4].map((p) => ({ value: String(p), label: p === 0 ? "No prestige" : `Prestige ★${p}` }))}
                                value={String(prestige)}
                                onChange={(v) => setPrestige(Number(v))}
                                title="Prestige effects at max level"
                                ariaLabel="Prestige"
                              />
                            </div>
                          )}
                        </>
                      )}
                      {isEpic && (
                        <>
                          {(["built", "rising", "crumbling"] as const).map((st) => (
                            <button
                              key={st}
                              onClick={() => setLandmarkStage(st)}
                              title={st === "built" ? "As it stands all week" : st === "rising" ? "Being built on its rotation day" : "Falling to ruin on its rotation day"}
                              className={`px-2 h-7 rounded-md text-[11px] font-semibold border ${landmarkStage === st ? "bg-amber-900/80 border-amber-500/60 text-amber-200" : "bg-slate-900/80 border-slate-700 text-slate-300"
                                }`}
                            >
                              {st === "built" ? "🏛️ Built" : st === "rising" ? "🏗️ Rising" : "🏚️ Crumbling"}
                            </button>
                          ))}
                          {landmarkStage !== "built" && (
                            <label className="flex items-center gap-1 h-7 px-2 rounded-md text-[11px] bg-slate-900/80 border border-slate-700 text-slate-300" title="How far through its rotation day">
                              <input type="range" min={0} max={LANDMARK_STEPS - 1} value={landmarkStep} onChange={(e) => setLandmarkStep(Number(e.target.value))} className="w-20 accent-amber-500" />
                              {Math.round(((landmarkStep + 1) / LANDMARK_STEPS) * 24)} h
                            </label>
                          )}
                        </>
                      )}
                      {isRealm && (
                        <>
                          {REALM_STAGES.map((st, i) => (
                            <button
                              key={st}
                              onClick={() => setRealmStage(i)}
                              title={`Week ${i + 1} of its cycle: City Hall ${REALM_STAGE_LEVELS[i][0]}–${REALM_STAGE_LEVELS[i][1]}`}
                              className={`px-2 h-7 rounded-md text-[11px] font-semibold border capitalize ${realmStage === i ? RARITY_STYLE[st].chip : "bg-slate-900/80 border-slate-700 text-slate-300"}`}
                            >
                              {st}
                            </button>
                          ))}
                          <button
                            onClick={() => setRealmBuilding((b) => !b)}
                            title={`The first of its ${REALM_STAGE_DAYS} days at a stage: built up, shielded`}
                            className={`px-2 h-7 rounded-md text-[11px] font-semibold border ${realmBuilding ? "bg-amber-900/80 border-amber-500/60 text-amber-200" : "bg-slate-900/80 border-slate-700 text-slate-300"
                              }`}
                          >
                            🏗️ Building day
                          </button>
                          {realmBuilding && (
                            <label className="flex items-center gap-1 h-7 px-2 rounded-md text-[11px] bg-slate-900/80 border border-slate-700 text-slate-300" title="How far through its building day">
                              <input type="range" min={0} max={LANDMARK_STEPS - 1} value={landmarkStep} onChange={(e) => setLandmarkStep(Number(e.target.value))} className="w-20 accent-amber-500" />
                              {Math.round(((landmarkStep + 1) / LANDMARK_STEPS) * 24)} h
                            </label>
                          )}
                        </>
                      )}
                      {(selected.preview.kind === "improvement" || selected.preview.kind === "building") && (
                        <div className="w-32">
                          <Combobox size="sm" options={CIVS.map((c) => ({ value: c, label: `${CIV_META[c].icon} ${CIV_META[c].label}` }))} value={civ} onChange={(v) => setCiv(v as CivilizationType)} title="Civilization style" ariaLabel="Civilization style" />
                        </div>
                      )}
                    </div>
                    {selected.teaser && <SoonBadge variant="ribbon" />}
                    <div className="absolute right-2 bottom-2 text-[10px] text-slate-500">Drag to rotate · scroll to zoom</div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-start gap-2 flex-wrap">
                      <span className="text-2xl leading-none">{selected.emblem}</span>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-medieval text-base font-bold text-amber-200 leading-tight">{selected.name}</h3>
                        <p className="text-xs text-slate-400">{selected.subtitle}</p>
                      </div>
                      {selected.cue && (
                        <button
                          onClick={() => playCue(selected.cue!)}
                          className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-bold border bg-amber-900/60 border-amber-500/60 text-amber-200 hover:bg-amber-800/70 active:scale-95 transition"
                        >
                          <Play className="w-3.5 h-3.5" /> Play
                        </button>
                      )}
                      <div className="flex flex-col items-end gap-1">
                        {shown?.rarity && (
                          <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider ${RARITY_STYLE[shown.rarity].chip}`}>
                            {shown.rarity}
                          </span>
                        )}
                        {selected.teaser && <SoonBadge />}
                      </div>
                    </div>
                    {selected.description && <p className="text-sm text-slate-300 leading-relaxed">{selected.description}</p>}
                    {(shown ?? selected).facts.length > 0 && (
                      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                        {(shown ?? selected).facts.map(([k, v], i) => (
                          <div key={`${i}:${k}`} className="contents">
                            <dt className="text-slate-500">{k}</dt>
                            <dd className="text-slate-200 break-words">{v}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    {selected.preview.kind === "castle" && selected.preview.stage !== EMPYREAN_STAGE && !selected.id.startsWith("void-kingdom-") && <UniqueTraitCard civ={selected.preview.civ} />}
                    {selected.brood && (
                      <BroodCards brood={selected.brood} picked={broodSize} onPick={(size) => setBroodPick(size === undefined ? null : { id: selected.id, size })} />
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

/** A family's sizes in climbing order, each a card (name, level, rarity, blurb): picking one shows its level's pack */
function BroodCards({ brood, picked, onPick }: { brood: Brood; picked?: number; onPick: (size?: number) => void }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <h4 className="text-[11px] uppercase tracking-wider font-bold text-slate-400">Its levels</h4>
        <button
          onClick={() => onPick(undefined)}
          className={`inline-flex items-center gap-1 px-2 h-6 rounded-md text-[10px] font-semibold border ${picked === undefined ? "bg-amber-900/70 border-amber-500/60 text-amber-200" : "bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200"}`}
          title="Every size side by side"
        >
          <Rows3 className="w-3 h-3" /> All sizes
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {brood.sizes.map((s, i) => {
          const boss = brood.boss && i === 4;
          return (
            <button
              key={i}
              onClick={() => onPick(picked === i ? undefined : i)}
              title={boss ? "Show the boss" : "Show this level's creature"}
              className={`text-left p-2 rounded-lg border transition ${picked === i ? "bg-slate-800 border-amber-500/50" : "bg-slate-900/60 border-slate-800 hover:bg-slate-800/70"} ${boss ? "sm:col-span-2" : ""}`}
            >
              <div className="flex items-center gap-1.5 flex-wrap">
                {boss ? <Crown className="w-3.5 h-3.5 text-amber-300" /> : <Users className="w-3.5 h-3.5 text-slate-400" />}
                <span className="text-xs font-semibold text-slate-200">{s.name}</span>
                <span className="text-[10px] text-slate-500">
                  Level {s.level}
                  {boss ? " · boss" : ""}
                </span>
                <span className={`ml-auto px-1.5 py-px rounded border text-[9px] font-bold uppercase tracking-wider ${RARITY_STYLE[s.rarity].chip}`}>{s.rarity}</span>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-slate-400">{s.blurb}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
