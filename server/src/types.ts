export type CivilizationType = 'human' | 'elf' | 'dwarf' | 'orc' | 'arcane';

export type ResourceType = 'gold' | 'iron' | 'stone' | 'lumber' | 'food';

export type BuildingType =
  | 'residential_commercial' // Houses for people (residential and commercial) — 35%
  | 'animal_field'           // Animal field — 25%
  | 'food_field'             // Food field — 25%
  | 'soldier_building';      // Soldier buildings — 15%

export type BuildingCondition = 'active' | 'idle';

export interface Commit {
  hash: string;
  message: string;
  author: string;
  lines: string;
  time: string;
}

export interface PullRequest {
  id: number;
  number: string;
  title: string;
  author: string;
  status: 'open' | 'merged' | 'closed';
  time: string;
}

export interface RepoBuilding {
  id: string;
  name: string;
  branch: string;
  buildingType: BuildingType;
  level: number;
  health: number;
  slot: number;               // Persistent plot index inside its district (kept until the kingdom is rebuilt)
  prestige: number;           // 0–4 effect tier for commits beyond the Lv25 cap
  /** Prestige stars, uncapped: one per 200 XP beyond the Lv25 cap (prestige is this, capped at 4) */
  stars?: number;
  totalCommits: number;
  xp: number;                 // Contribution XP (commits w/ diminishing returns + merged PRs + reviews)
  levelXp: number;            // XP needed for the current level
  nextLevelXp: number | null;
  condition: BuildingCondition; // 'idle' = no commits for 90+ days (dormant: no active banner)
  totalLines: number;
  totalFiles?: number;
  commitsPastWeek: number;
  prsPastWeek: number;
  linesAddedPastWeek: number;
  linesDeletedPastWeek: number;
  lastCommit: string;
  lastCommitDate: string;
  recentCommits: Commit[];
  recentPRs: PullRequest[];
  /** Active Surge: commit or merged PR in the last 48 h — double harvest, flame aura (GAME_GUIDE §7) */
  surging?: boolean;
}

export interface KingdomResources {
  gold: number;
  iron: number;
  stone: number;
  lumber: number;
  food: number;
  scarce?: Record<string, number>;
}

export interface LedgerEntry {
  id: number;
  userId: string;
  userName?: string;
  timestamp: string;
  type: string;
  goldDelta: number;
  ironDelta: number;
  stoneDelta: number;
  lumberDelta: number;
  foodDelta: number;
  goldBalance: number;
  ironBalance: number;
  stoneBalance: number;
  lumberBalance: number;
  foodBalance: number;
  scarceKey?: string | null;
  scarceDelta?: number;
  scarceBalance?: number;
  reason: string;
}

export interface ScarceResourceDef {
  key: string;
  name: string;
  emblem: string;
  pool: number;
  description: string;
  rarity: 'rare' | 'epic' | 'legendary';
}

export interface ActivitySummary {
  pastWeekCommits: number;
  pastWeekPRs: number;
  pastWeekReviews: number;
  weekXp: number;
  weightedScore: number;
  /** Activity score before the play streak bonus */
  baseScore?: number;
  /** Consecutive days with at least PLAY_DAY_MIN_ACTIONS game actions (today counts once reached) */
  playStreakDays?: number;
  /** Activity score bonus from the play streak (0.1 = +10%) */
  playStreakBonus?: number;
  growthMultiplier: number;
  dailyCommits?: Record<string, number>;
  /** Past-week XP from sealed deed reports (part of weekXp) */
  weekDeedXp?: number;
}

export type TitleCategory = 'loc' | 'commits' | 'active_days' | 'repo_holdings' | 'legendary_buildings' | 'play_days' | 'boss_kills' | 'pvp_kills' | 'gathering' | 'mob_kills';
/** `harvest` titles give bonus resources every harvest instead of a combat stat */
export type TitleBuffType = 'hp' | 'atk' | 'def' | 'all' | 'harvest';

/** A milestone title a ruler holds (cached in `user_earned_titles`) */
export interface EarnedTitle {
  category: TitleCategory;
  /** 1–3; a higher tier replaces the lower one in the same category */
  tier: number;
  name: string;
  emblem: string;
  buffType: TitleBuffType;
  /** e.g. 0.05 = +5% */
  buffPct: number;
  unlockedAt: string;
}

export interface TitleBuffs {
  hpBonus: number;
  atkBonus: number;
  defBonus: number;
  /** Extra share of every harvest's base resources (0.2 = +20%), capped per harvest */
  harvestBonus?: number;
}

export interface DeveloperKingdom {
  id: string;
  name: string;
  username: string;
  kingdomTitle: string;
  civilization: CivilizationType;
  mapCoordinates: [number, number];
  cityHallLevel: number;
  cityHallPrestige?: number; // 0–4 effect tiers past castle Lv25
  resources: KingdomResources;
  activity: ActivitySummary;
  streakDays: number;
  buildings: RepoBuilding[];
  upgrades?: Record<string, number>; // city improvement id → tier owned
  vacantPlots?: Array<{ buildingType: BuildingType; slot: number }>; // Plots kept for removed repos until a new repo takes them
  unbuiltRepos?: UnbuiltRepo[];
  population?: number;
  /** Home garrison (excludes soldiers away on a march) */
  soldiers?: number;
  /** Soldiers away on a march: still part of `population`, but they neither work nor can be re-mobilized */
  deployedSoldiers?: number;
  /** Civilians away gathering in safe territory (not soldiers; they don't work until home) */
  civiliansAway?: number;
  /** 🌙 Elf soldiers healing at the Moonwell (GAME_GUIDE §13): still part of `population`; `perHarvest` of them rejoin the garrison at each harvest */
  wounded?: { count: number; perHarvest: number };
  /** Nethergarde soldiers fallen in battle, returning from the Void Well over the next harvests */
  voidWell?: number;
  maxPopulation?: number;
  /** Max soldiers that can be mobilized at current population: floor(population * CIV_SOLDIER_SHARE[civ]) */
  maxSoldiers?: number;
  /** Max simultaneous marches: ceil(cityHallLevel / 5) */
  marchSlots?: number;
  /** Max soldiers per single march: floor(maxPopulation * MARCH_CAPACITY_SHARE * CIV_MARCH_MULT[civ]) */
  marchCapacity?: number;
  /** City walls tier (0-5) */
  wallTier?: number;
  /** Defender DEF multiplier from city walls (1.25 to 2.00) */
  wallDefMult?: number;
  /** Current wall structural HP */
  wallHp?: number;
  /** Maximum wall structural HP */
  wallMaxHp?: number;
  /** True when wallHp <= 25% of wallMaxHp (protected & unable to march aggressively until repaired past 25%) */
  burning?: boolean;
  /** Epoch ms when burning ends (when wall repairs back above 25%), if burning */
  burningEndsAt?: number | null;
  /** Special Overseer: Overseer's Resolve stacks this week */
  grudgeStacks?: number;
  /** True for Special Overseers (and the Archon, who has everything an overseer has) */
  isSpecial?: boolean;
  /** True for the Archon of the Realm: untouchable, Empyrean castle Lv30, 50 Celestial buildings */
  isArchon?: boolean;
  /** Milestone titles earned (one per category, highest tier only) — GAME_GUIDE §13 */
  earnedTitles?: EarnedTitle[];
  /** Summed title buffs as fractions (0.07 = +7%); `all` titles are already folded into hp/atk/def */
  titleBuffs?: TitleBuffs;
  /** Children playing on the city plaza in groups of 4: 1 + ⌈last harvest's births / 5⌉, at least 2; none under a Low birth rate punishment; Special Overseers 12 (3 groups, one per game) */
  childrenAtPlay?: number;
  /** 🛡️ Royal Shield, while one is up (public) */
  shield?: RoyalShield | null;
  /** ⛈️ Royal Punishment, while one lasts (public) */
  punishment?: RoyalPunishment | null;
  /** 📜 Royal Proclamations: Paid Settlers and Festival cooldowns, the Festival while it lasts, ⚔️ Call to Arms (public) */
  proclamations?: ProclamationState;
  /** Total XP by where it came from (the profile's XP breakdown); deeds are sealed deed reports */
  xpBySource?: { commits: number; prs: number; reviews: number; deeds: number };
  /**
   * Fog of war: set when the viewer is of another civilization (or not signed in). Population,
   * soldiers, treasury and wall HP are then hidden: unknown without a scout report, a projected range with one.
   */
  fog?: KingdomFog;
}

export interface KingdomFog {
  /** Seen from outside the walls */
  wall: 'intact' | 'damaged' | 'burning';
  /** The viewer's latest scout report (with its `estimate`); without one population, soldiers and treasury are unknown */
  report?: ScoutReport | null;
}

/** A fogged number: from what the scouts saw to what it has likely become since (lo ≤ hi; equal = still exact) */
export interface FogRange {
  lo: number;
  hi: number;
}

/**
 * A scout report projected to now, from the report alone and public rules (never the live numbers):
 * population grows by its civilization's births and deaths per harvest, soldiers away may have come home,
 * the treasury gains the income per harvest the scouts saw, walls repair at their known rate.
 */
export interface ScoutEstimate {
  /** Harvests since the scouts looked */
  harvests: number;
  garrison?: FogRange;
  population?: FogRange;
  wallHp?: FogRange;
  treasury?: Partial<Record<'gold' | 'iron' | 'stone' | 'lumber' | 'food', FogRange>>;
  scarce?: Record<string, FogRange>;
}

export interface UnbuiltRepo {
  id: string;
  name: string;
  reason: 'no_commits' | 'over_cap';
}

export interface ActivityEvent {
  id: number;
  text: string;
  time: string;
  type: 'system' | 'sync' | 'harvest' | 'level' | 'war' | 'notice';
}

export interface RealmStatus {
  status: string;
  realmName: string;
  totalKingdoms: number;
  lastSyncTime: string;
  nextSyncSeconds: number;
  syncIntervalMinutes: number;
  recentEvents: ActivityEvent[];
  source?: 'git' | 'demo';
  syncing?: boolean;
  lastGitSync?: string | null;
  lastError?: string | null;
  /** Changes whenever the roving encounters change (new roving window or admin respawn) */
  rovingKey?: string;
  /** Epoch ms of the next regular roving respawn */
  nextRespawnAt?: number;
  /** Minutes between regular roving respawns (SYNC_INTERVAL_MINUTES × 2) */
  rovingWindowMinutes?: number;
  /** Server clock (epoch ms) when the status was produced, to correct client clock skew */
  serverNow?: number;
}

/** Hall of Renown tabs (GAME_GUIDE §16) */
export type LeaderboardPeriod = 'week' | 'month' | 'year' | 'all';

/** One fairness axis of a ranked developer: the raw value, its 0–100 percentile and its rank on that axis */
export interface LeaderboardAxis {
  value: number;
  pct: number;
  rank: number;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  username: string;
  civilization: CivilizationType;
  castleLevel: number;
  /** Fairness score 0–100: Activeness 40% · Repo activeness 30% · Quality 30% (percentiles) */
  score: number;
  activeness: LeaderboardAxis;
  repoActivity: LeaderboardAxis;
  quality: LeaderboardAxis;
  activeDays: number;
  /** Working days (Mon–Fri) the activeness is measured over (All time: the developer's own tenure) */
  workdays: number;
  /** Repos with XP in the period / of them at Lv3+ */
  repos: number;
  qualityRepos: number;
  /** Places moved since the previous period (+ = up); null = not ranked then */
  change: number | null;
}

export interface Leaderboard {
  period: LeaderboardPeriod;
  label: string;
  from: string;
  to: string;
  /** Mon–Fri in the window (All time: 0, each developer has their own) */
  workdays: number;
  /** What ▲▼ compares against, e.g. "the week before" */
  changeSince: string;
  entries: LeaderboardEntry[];
  computedAt: string;
  /** Epoch ms when this ranking is next recomputed */
  nextRefreshAt: number;
}

/** Hall of Renown top 3 per tab (user ids, #1 first): marks in the kingdom picker, crowned civ frames for All time */
export interface RenownPodium {
  week: string[];
  month: string[];
  year: string[];
  all: string[];
}

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  isAdmin?: boolean;
}

export type NPCCategory = 'boss' | 'kingdom' | 'terrain' | 'resource' | 'mob' | 'bandit' | 'treasure';
/** `mythical` sits above legendary: reserved for the overseers' horror (Codex teaser for now) */
export type NPCRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythical';

/** One entry in the in-game Codex (GET /api/codex) */
export interface CodexEntry {
  id: string;
  type: string;
  name: string;
  emblem: string;
  subtitle: string;
  description: string;
  category: NPCCategory;
  rarity: NPCRarity;
  /** Where / how it appears, e.g. "The Sunken Fjord" or "Roving spawn (every 30 min)" */
  spawn: string;
  /** Chance (0–1) per daily node or per roving spawn; absent for persistent entries */
  chance?: number;
  /** A teaser: shown in the Codex but not in the game yet (a future event) */
  teaser?: boolean;
  resourceYield?: Record<string, number>;
  /** Epic landmarks: one of the two of its region's pool standing on the map this month */
  standing?: boolean;
  /** World bosses, mobs and bandits: their Battle Arts kit as lines ("Instinct · Cleave: …") */
  arts?: string[];
}

/** An epic landmark on a rotation day: rising (being built) or crumbling (falling to ruin), from → until (epoch ms) */
/**
 * A buffer realm (the NPC kingdom of a buffer zone) in its 28-day cycle: four 7-day stages (common, uncommon, rare,
 * epic). Day 0 of each stage it is built up (shielded: no attacks or rallies), days 1–5 it gains a level a day, day 6
 * it holds the stage's top level. After the epic week it leaves and another rises somewhere else in its region.
 */
export interface RealmCycle {
  /** 0 common · 1 uncommon · 2 rare · 3 epic */
  stage: number;
  /** Day of the stage week, 0–6 (0 = building) */
  day: number;
  level: number;
  /** Under construction and shielded */
  building: boolean;
  /** Epoch ms the stage's week ends (the next stage begins, or the realm leaves after the epic week) */
  stageEndsAt: number;
}

export interface LandmarkState {
  phase: 'rising' | 'crumbling';
  from: number;
  until: number;
}

export interface MapNPC {
  id: string;
  name: string;
  type: string;
  category?: NPCCategory;
  rarity?: NPCRarity;
  emblem: string;
  subtitle: string;
  description: string;
  x: number;
  z: number;
  region: string;
  /**
   * A fallen world boss slumbers until this epoch ms; set by the client from its BossStatus. Meanwhile the map NPC
   * wears the next boss of the pool (rising as a phantom where the old one fell) and `fallenName` names the fallen one.
   */
  slumberUntil?: number;
  fallenName?: string;
  resourceYield?: Record<string, number>;
  expiresAt?: string;
  bossIndex?: number;
  /** Index picked at map generation; `bossIndex` is this week's after the rotation */
  bossBaseIndex?: number;
  bossRotationPool?: Array<{ name: string; subtitle: string; emblem: string; description: string; type: string }>;
  /** Mobs / bandits: the pack, fogged to a band unless scouted */
  /** `health`: share of the full pack's HP left (0–1), public so anyone can see a wounded pack and finish it off */
  pack?: { unitName: string; band: string; wounded: boolean; health: number; exact: number | null; scoutedAt: number | null };
  /** Treasure: chest size band (contents only from a scout report) */
  chest?: { band: 'small' | 'large' | 'hoard'; scoutedAt: number | null };
  /** Epic landmarks on a rotation day (the 1st of the month, or an admin reset): rising or crumbling until `until` */
  landmarkState?: LandmarkState;
  /** Buffer realms: where it stands in its 28-day cycle (its rarity is the stage's) */
  realm?: RealmCycle;
}

/**
 * A Nethergarde Voidrift slot. Open slots are held by an NPC void kingdom (always at full
 * population) whose garrison must be destroyed — usually over many assaults — to claim the slot.
 */
export interface NethergardeSpire {
  id: string; // 'spire_1', 'spire_2', …
  slotIndex: number;
  occupiedByDevId: string | null;
  occupiedByDevName?: string | null;
  occupiedByDevUsername?: string | null;
  occupiedByCivilization?: CivilizationType | null;
  /** NPC void kingdom holding an open slot */
  npcName?: string | null;
  npcLevel?: number;
  population?: number;
  garrison?: number;
  maxGarrison?: number;
  /** Epoch ms of the last assault; the garrison only re-manifests once the siege has lapsed */
  lastAttackedAt?: number | null;
  regenResumesAt?: number | null;
  /** Attacked recently: the garrison won't regenerate until regenResumesAt */
  besieged?: boolean;
  loot?: BattleLoot;
  coordinates: [number, number];
  wallTier?: number;
  wallHp?: number;
  wallMaxHp?: number;
  burning?: boolean;
  burningEndsAt?: number | null;
  /** Fog of war for mortal viewers: garrison and wall HP hidden (unknown, or projected from their scout report) */
  fog?: { wall: 'intact' | 'damaged' | 'burning'; report?: ScoutReport | null } | null;
}

export interface BattleLoot {
  gold?: number;
  iron?: number;
  stone?: number;
  lumber?: number;
  food?: number;
  scarce?: Record<string, number>;
}

export type MarchTargetType = 'spire' | 'dev_kingdom' | 'npc';

/** What a march is aimed at (finer than MarchTargetType: `npc` splits by map category) */
export type MarchTargetKind = 'kingdom' | 'spire' | 'mob' | 'bandit' | 'boss' | 'npc_kingdom' | 'resource' | 'treasure' | 'landmark' | 'gathering';

/** A gathering / claiming march at its node: enough for the client to draw progress and the haul so far */
export interface GatherInfo {
  nodeId: string;
  treasure: boolean;
  /** The node's full yield (bulk resources + gems) */
  yieldMix: Record<string, number>;
  /** Bulk units the node had when this march started */
  totalAtStart: number;
  /** Full node bulk (for proportional shares) */
  nodeTotal: number;
  /** Bulk units this march will take (min(load, what's left)); treasure: 1 */
  amount: number;
  /** Units per second */
  rate: number;
  startedAt: number;
  /** Set while the gatherers are fighting off an attack (gathering paused) */
  pausedAt: number | null;
  /** Gatherers outside their safe territory can be attacked by other civilizations */
  exposed: boolean;
  region: string;
  /** The node's name and rarity, for the weekly story's rare finds */
  name?: string;
  rarity?: NPCRarity;
}

/** A zone's world boss this week (GET /map/roving `bosses`): HP is shared by the realm and public */
export interface BossStatus {
  name: string;
  type: string;
  emblem: string;
  subtitle: string;
  description: string;
  /** Active entry of the zone's rotation pool this week */
  bossIndex: number;
  hp: number;
  maxHp: number;
  dead: boolean;
  respawnAt: number | null;
  /** Next weekly rotation (Sunday 00:00 UTC) */
  rotatesAt: number;
  stats: { atk: number; def: number };
  /** Vengeance stacks: +10% HP, ATK and DEF for every time this zone's boss was felled this week (0 after Sunday's rotation) */
  vengeance: number;
  skills: string[];
  /** Rulers who damaged it most this life (they share the bounty) */
  topDamage: Array<{ userId: string; name: string; damage: number }>;
  /** While it slumbers: the battle that felled it, its hoard and the bounty shares */
  lastKill?: BossKill | null;
  /** While it slumbers: the boss that wakes in its place (the next of the pool) and when */
  next?: BossNext | null;
}

export interface BossNext {
  name: string;
  type: string;
  emblem: string;
  bossIndex: number;
  /** Its respawn, or the weekly rotation if that comes first */
  wakesAt: number;
  /** Vengeance stacks it wakes with */
  vengeance: number;
}

export interface BossKill {
  /** Epoch ms of the killing battle */
  at: number;
  /** Who led the killing army or rally */
  by: string;
  /** Carried home by the killing armies' survivors */
  hoard: BattleLoot | null;
  /** Shared by everyone who wounded it, by damage dealt */
  bounty: Array<{ name: string; damage: number; loot: BattleLoot }>;
}

/** A buffer realm or frontier gate (GET /map/roving `npcKingdoms`): always fogged, exact only from a scout report */
export interface NpcKingdomStatus {
  level: number;
  /** Civilization whose demographics and soldiers it borrows */
  civ: CivilizationType;
  wallTier: number;
  burning: boolean;
  burningEndsAt: number | null;
  wall: 'intact' | 'damaged' | 'burning';
  scoutedAt: number | null;
  /**
   * Frontier gates only: `sealed` while the gate stands (no other civ can attack a city in its province);
   * `catchChance` (0–1) for scouts heading into the province (0 while it burns)
   */
  gate?: { sealed: boolean; catchChance: number };
  /** 👑 Free realms only (public): its conquest hoard's tier, and when it is there to win again (null: now) */
  hoard?: { tier: 'common' | 'uncommon' | 'rare' | 'epic'; readyAt: number | null };
}

/** A resource node or chest someone touched, as one viewer sees it (GET /map/roving `nodes`) */
export interface NodeStatus {
  emptied: boolean;
  remainingBand: string;
  /** Exact when the viewer's own march gathers it or they scouted it */
  remaining: number | null;
  total: number;
  /** Share of the node left (0–1, public): its ground ring shows it, so anyone can see a node running dry */
  left: number;
  gatherer: { civ: CivilizationType; name: string; band: string; finishAt: number; exposed: boolean; mine: boolean } | null;
}

export type MarchKind = 'attack' | 'rally' | 'rally_join' | 'scout' | 'gather' | 'reinforce';

export type MarchServerPhase = 'outbound' | 'rallying' | 'acting' | 'stationed' | 'returning' | 'done';

export interface ActiveMarch {
  id: string;
  attackerId: string;
  attackerName: string;
  attackerUsername: string;
  attackerCiv: CivilizationType;
  kind?: MarchKind;
  phase?: MarchServerPhase;
  targetType: MarchTargetType;
  targetKind?: MarchTargetKind | null;
  targetId: string;
  targetName: string;
  soldiersCount: number;
  /** Civilians, not soldiers: a scouting party, or a gather march in the ruler's safe territory */
  civilian?: boolean;
  /** Scouts heading for a kingdom: the civilization they dress as (its people's look); unset for other targets */
  disguiseCiv?: CivilizationType;
  initialSoldiers?: number;
  /** Another civilization's march as this viewer sees it: its counts are only as exact as its figures on the map */
  fogged?: boolean;
  startX: number;
  startZ: number;
  targetX: number;
  targetZ: number;
  departTime: number; // Epoch ms
  arrivalTime: number; // Epoch ms
  battleId?: string | null;
  joinedRound?: number | null;
  actUntil?: number | null; // Epoch ms when acting phase finishes (or next round estimate)
  returnTime?: number | null; // Epoch ms when returning troops reach home
  rallyId?: string | null;
  carry?: BattleLoot | null;
  /** Gathering / claiming marches (kind `gather`) */
  gather?: GatherInfo | null;
  /** Rally members: ATK multiplier from the rally's joiners (+5% each) */
  atkBonus?: number | null;
  currentBattleRound?: number | null;
  /** Its place in the live battle (the order the armies joined): where it stands in the ring round the target */
  battleSlot?: number | null;
  /** The march the defenders are striking now: a boss or a pack faces it */
  battleFrontId?: string | null;
  /** The live battle's last round (soldiers lost and damage dealt per side), floated over the battle on the map */
  lastBattleRound?: BattleRound | null;
  /** Epoch ms that round was fought */
  lastRoundAt?: number | null;
  maxBattleRounds?: number | null;
  status: 'marching' | 'resolved' | 'retreated';
  /** Set once resolved; resolved marches are served for MARCH.SHOWCASE_MS so clients can animate the clash */
  battleResult?: BattleReport | null;
  /** 🌪️ Tempest Roads: marchers lost on the road as it set off (only in the reply that started it) */
  roadLosses?: number;
  /** 🪙 A mercenary band marching (GAME_GUIDE §13 *Mercenaries*): `soldiersCount` is its strength in soldier-equivalents */
  band?: MarchBand | null;
  /** The Armory set the march wears (GAME_GUIDE §13 *The Armory*); null in standard gear */
  armory?: MarchArmory | null;
  /** 🦸 The kingdom's champion leads this march (GAME_GUIDE §13 *Champions*) */
  champion?: MarchChampion | null;
}

/** A slot of a champion's rolled look (GAME_GUIDE §13 *Champions*) */
export type ChampionSlot = "head" | "face" | "body" | "armour" | "cloak" | "weapon" | "aura" | "mark";
/** A champion's look: an index into its civilization's part library per slot (a civ change re-dresses it at the same indices) */
export type ChampionLooks = Record<ChampionSlot, number>;

/** The champion leading a march: who it is and how it looks (its civilization is the march's) */
export interface MarchChampion {
  id: string;
  name: string;
  level: number;
  looks: ChampionLooks;
}

/** One line of a champion's Renown ledger */
export interface ChampionLedgerEntry {
  id: number;
  delta: number;
  reason: string;
  battleId: string | null;
  detail: string | null;
  levelBefore: number;
  levelAfter: number;
  createdAt: number;
}

/** GET /champion: the signed-in ruler's champion */
export interface ChampionView {
  id: string;
  name: string;
  civ: CivilizationType;
  looks: ChampionLooks;
  level: number;
  xp: number;
  /** Renown into this level, and what the next level needs (null at the City Hall's cap or level 30) */
  into: number;
  need: number | null;
  /** Renown earned at the City Hall's cap: it counts once the City Hall rises */
  banked: number;
  maxLevel: number;
  cityHallLevel: number;
  status: "home" | "away" | "wounded";
  marchId: string | null;
  /** Wounded: when it is whole again */
  woundedUntil: number | null;
  /** What hastening its healing costs now (null when not wounded) */
  hasten: { cost: Partial<Record<"gold" | "iron" | "stone" | "lumber" | "food", number>>; gems: Record<string, number> } | null;
  rerollGems: Record<string, number>;
  retrainCost: Partial<Record<"gold" | "iron" | "stone" | "lumber" | "food", number>>;
  /** The flat stat bonus the army it leads gets (shares) */
  stats: { hp: number; atk: number; def: number };
  /** Its kit slot by slot: what it knows there, the level that unlocks it, and the slot's whole pool (for Retraining) */
  kit: Array<{ slot: string; label: string; unlockLevel: number; unlocked: boolean; id: string; name: string; emblem: string; text: string; pool: Array<{ id: string; name: string; emblem: string; text: string }> }>;
  /** Its kit as it fights now, as lines */
  kitLines: string[];
  /** Renown earned this realm day (before diminishing), and the day's thresholds */
  today: { raw: number; full: number; half: number };
  ledger: ChampionLedgerEntry[];
}

/** Rarity of an Armory set (GAME_GUIDE §13 *The Armory*) */
export type ArmoryRarity = "uncommon" | "rare" | "epic";

/** The set a march wears: its civilization's set of `rarity`, one per soldier who set off (`count`) */
export interface MarchArmory {
  rarity: ArmoryRarity;
  civ: CivilizationType;
  name: string;
  emblem: string;
  /** Sets taken from the armory as it set off (survivors bring theirs home) */
  count: number;
}

/** Resources forging or keeping sets costs */
export type ArmoryCost = Partial<Record<"gold" | "iron" | "stone" | "lumber" | "food", number>>;

/** GET /armory: a ruler's armory, set by set */
export interface ArmoryView {
  civ: CivilizationType;
  sets: Array<{
    rarity: ArmoryRarity;
    name: string;
    emblem: string;
    /** At home in the armory (the garrison defends in them; marches take them) */
    home: number;
    /** Away on marches */
    away: number;
    /** Forging 100 sets */
    forge: ArmoryCost;
    gems: Record<string, number>;
    /** Keeping 100 sets, every harvest */
    upkeep: ArmoryCost;
    /** This harvest's upkeep of every set held */
    upkeepNow: ArmoryCost;
    /** Why it can't be forged (e.g. "Needs City Hall 16"), or null */
    blocked: string | null;
  }>;
}

/** A mercenary band on a march: what it is, and how much of it is left */
export interface MarchBand {
  id: string;
  /** Model key (MERCENARY_RIGS) */
  type: string;
  name: string;
  emblem: string;
  rarity: MercRarity;
  /** Soldier-equivalents at full strength (strength = soldiersCount / fullCount) */
  fullCount: number;
  /** Strength it set off with (0–1) */
  startStrength: number;
  /** Strength now (0–1) */
  strength: number;
}

/** Rarity of a mercenary band (GAME_GUIDE §13 *Mercenaries*) */
export type MercRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

/** Resources a hire, a heal or a harvest's upkeep costs */
export type MercCost = Partial<Record<"gold" | "iron" | "stone" | "lumber" | "food", number>>;

/** A band a ruler holds (GET /mercenaries/mine) */
export interface MercBand {
  id: string;
  rarity: MercRarity;
  type: string;
  name: string;
  emblem: string;
  /** Its owner's civilization now (a civ change carries it over as its counterpart) */
  civ: CivilizationType;
  /** 0–1: what is left of it (0 = dead) */
  strength: number;
  /** Defending: on its hirer's walls while the castle is attacked */
  status: "home" | "marching" | "healing" | "defending";
  marchId: string | null;
  /** Healing: strength it started from, when it began and when it is whole */
  healFrom: number | null;
  healStartedAt: number | null;
  healUntil: number | null;
  /** Soldier-equivalents at full strength */
  fullCount: number;
  hiredAt: number;
  campId: string;
  price: MercCost;
  upkeep: MercCost;
  /** Its upkeep went unpaid last harvest: unpaid again, it deserts */
  warned: boolean;
  /** Its Battle Arts as lines ("Instinct · Stoneskin: …") */
  kitLines: string[];
  /** What healing it to full would cost now and how long it would take (null when whole) */
  heal: { cost: MercCost; ms: number } | null;
}

/** One rarity at a Mercenary Camp */
export interface MercCampSlot {
  rarity: MercRarity;
  available: number;
  maxStock: number;
  restockMs: number;
  /** Epoch ms of the next recruit (null when the stock is full) */
  nextAt: number | null;
  /** The band the viewer would get: their civilization's mercenary of this rarity */
  type: string;
  name: string;
  emblem: string;
  models: number;
  /** Power as a share of one full march */
  power: number;
  minSlots: number;
  price: MercCost;
  upkeep: MercCost;
  kitLines: string[];
  /** Soldier-equivalents it would field for the viewer */
  fullCount: number | null;
  /** Why the viewer can't hire it (null = they can) */
  blocked: string | null;
}

/** A Mercenary Camp at a region's legendary landmark (GET /mercenaries/camps/:id) */
export interface MercCamp {
  id: string;
  name: string;
  region: string;
  slots: MercCampSlot[];
  /** The viewer's bands held, band cap, march slots and full march: the soldiers a band's power counts from (null when signed out) */
  viewer: { civ: CivilizationType; held: number; cap: number; marchSlots: number; fullMarch: number } | null;
}

/** Costs and timing of a march, computed by the server for the attack form */
export interface MarchPreview {
  distance: number;
  durationMs: number;
  /** Round-trip food per soldier (2x one-way supply ticks) */
  foodPerSoldier: number;
  oneWayFoodPerSoldier?: number;
  availableSoldiers: number;
  availableFood: number;
  /** Civilians go instead of soldiers (a scouting party, or a gather march in the ruler's safe territory): availableSoldiers = civilians free */
  civilianWorkers?: boolean;
  marchCapacity?: number;
  marchSlots?: number;
  activeMarchesCount?: number;
  targetWallTier?: number;
  targetWallDefMult?: number;
  targetWallHp?: number;
  targetWallMaxHp?: number;
  targetBurning?: boolean;
  /** Most soldiers this kind of march may take (scouts: SCOUT_MAX_SOLDIERS civilians) */
  maxSoldiers?: number;
  /** Reinforce marches: soldiers the castle still has room for (max population − its soldiers − allies stationed or on the way) */
  reinforceRoom?: number;
  kind?: MarchKind;
  targetKind?: MarchTargetKind;
  /** Wall HP / garrison of the target are fogged for this attacker */
  targetFogged?: boolean;
  /** Sending it shatters the attacker's own Royal Shield (it attacks a ruler) */
  breaksOwnShield?: boolean;
  /** Gather marches: what this march would bring home, how long it gathers, whether it is exposed */
  gatherPreview?: {
    exposed: boolean;
    /** Units per second for this civ on this node */
    rate: number;
    /** Bulk units left in the node, as far as the attacker knows (null = fogged: only the band) */
    remaining: number | null;
    remainingBand: string;
    nodeTotal: number;
    loadPerSoldier: number;
    yieldMix: Record<string, number>;
    treasure: boolean;
    claimMs: number;
  } | null;
  /**
   * Scout marches to a ruler's city or an NPC kingdom: the odds (0–1) by party size, index = scouts − 1 (GAME_GUIDE §13).
   * `gateCatch` is the Watched Borders share of the catch chance (a city behind its standing frontier gate).
   */
  scoutOdds?: { bySize: Array<{ caught: number; deceived: number; success: number }>; gateCatch: number };
  /** Reinforce marches to a frontier gate: what each soldier there costs per harvest on top of normal upkeep */
  gateDutyUpkeep?: { food: number; lumber: number; stone: number; iron: number };
  /** Why this attacker can't march on the target, if it can't */
  blockedReason?: string | null;
  /** 🪙 The attacker's mercenary bands (attack marches only): each may march instead of soldiers, unless `blocked` says why not */
  bands?: Array<MercBand & { blocked: string | null; /** ⚔️ Its power in the ruler's soldier-equivalents (the Muster) */ power: number }>;
  /** 🗡️ Attack and rally marches: the Armory sets at home the army may wear (the attacker's civilization's, by rarity); `forgeBlocked` says why the City Hall can't forge more (null = it can) */
  armory?: Array<{ rarity: ArmoryRarity; name: string; emblem: string; home: number; forgeBlocked: string | null }>;
  /** 🦸 Attack and rally marches: the attacker's champion, and why it can't lead this march (null = it can); `power` is about what it makes the march it leads worth (×) */
  champion?: { name: string; level: number; blocked: string | null; power: number };
  /** ⚔️ Attack and rally marches: what the Muster window needs to build its boxes and count power (GAME_GUIDE §13 *Launching marches: the Muster*) */
  muster?: MusterInfo;
}

/** ⚔️ The Muster: free march slots, the split chips and what each loadout is worth per soldier */
export interface MusterInfo {
  /** March slots not in use now */
  freeSlots: number;
  /** Shares of a full march (the march capacity) a soldier box may carry */
  splits: number[];
  /** Power of one soldier in each loadout, as a share of standard gear */
  setPower: Record<"standard" | ArmoryRarity, number>;
}

/** ⚔️ One march of a muster: a mercenary band, or a box of soldiers with its loadout and maybe the champion */
export interface MusterMarch {
  bandId?: string;
  soldiers?: number;
  /** "standard" or a set rarity */
  loadout?: string;
  champion?: boolean;
}

/** ⚔️ What `POST /marches/muster` returns: the marches set off (strongest first), all arriving at `arrivalTime` */
export interface MusterResult {
  marches: ActiveMarch[];
  arrivalTime: number;
  /** Set when the muster raised a rally (the marches wait in its lobby) */
  rallyId?: string;
}

export interface BattleRound {
  round: number;
  attackerDamage: number;
  defenderDamage: number;
  attackerLosses: number;
  defenderLosses: number;
  attackerRemaining: number;
  defenderRemaining: number;
  /** Battle Arts this round: casts, Finales, Instincts that showed and status ticks, in the order they happened */
  arts?: BattleArtEvent[];
  /** Statuses that held on each side this round (before they counted down): the spell-effects kit shows them while it plays */
  statuses?: { attacker?: BattleStatusKind[]; defender?: BattleStatusKind[] };
  /** 🪙 Mercenary bands among the attackers: their share of `attackerLosses` this round (shown as −% of the band) */
  bands?: Array<{ marchId: string; name: string; lost: number; fullCount: number }>;
}

/** A Battle Arts status (GAME_GUIDE §13 *Battle Arts*) */
export type BattleStatusKind = "burn" | "poison" | "bleed" | "paralyze" | "chill" | "freeze" | "ward" | "rally" | "sunder";

/**
 * One Battle Arts happening in a round (GAME_GUIDE §13 *Battle Arts*): an Art or a Finale cast, an Instinct showing
 * (Cleave's cut, Enrage waking), or a status ticking (Burn, Poison, Bleed). `side` is the side it belongs to: the
 * caster's for casts and Instincts, the afflicted army's for ticks.
 */
/** Rarity of a named unit's Battle Arts kit (GAME_GUIDE §13 *Battle Arts*): sets how many Instincts, Arts and Finales it carries */
export type UnitRarity = "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic";

/** A unit on the Sparring Grounds' roster (GET /sparring/roster): a drill band of one rarity, a world boss, or a mob or bandit pack */
export interface SparringRosterEntry {
  id: string;
  name: string;
  emblem: string;
  rarity: UnitRarity;
  kind: "drill" | "boss" | "npc";
  subtitle: string;
  /** Its kit as lines ("Instinct · Cleave: …") */
  kitLines: string[];
  unit: { hp: number; atk: number; def: number };
}

/** One side of a sparring fight */
export interface SparringSide {
  id: string;
  name: string;
  emblem: string;
  rarity: UnitRarity;
  kind: "drill" | "boss" | "npc";
  /** Soldiers (drill bands), units (a pack) or 1 (a boss) */
  count: number;
  /** HP of one of them */
  hp: number;
  kitLines: string[];
}

/** A fight on the Sparring Grounds (GET /sparring/fight): the real engine, 6 rounds, the first unit attacking */
export interface SparringResult {
  attacker: SparringSide;
  defender: SparringSide;
  rounds: BattleRound[];
  /** Share of each side's strength still standing */
  attackerLeft: number;
  defenderLeft: number;
  winner: "attacker" | "defender" | "draw";
}

export interface BattleArtEvent {
  kind: "cast" | "finale" | "instinct" | "tick";
  side: "attacker" | "defender";
  /** The unit that cast it, or the army a tick hurt */
  unit: string;
  /** Art / Finale / Instinct id, or the status for ticks */
  id: string;
  name: string;
  emblem: string;
  /** The one army it was aimed at, if one */
  target?: string;
  /** Soldiers it killed */
  losses?: number;
  damage?: number;
  /** Soldiers it brought back */
  healed?: number;
  /** A Finale fired early, its unit under a quarter of its strength */
  lastStand?: boolean;
  /** A Finale's kill: the armies it broke the last of */
  broke?: string[];
  /** The spell-effects kit's look and the sound cue of a cast */
  fx?: string;
  sound?: string;
}

export interface BattleReport {
  id: string;
  marchId?: string;
  timestamp: string;
  attackerId: string;
  attackerName: string;
  attackerCiv: CivilizationType;
  defenderId: string;
  defenderName: string;
  defenderCiv: CivilizationType;
  targetType: MarchTargetType;
  attackerInitialSoldiers: number;
  attackerCasualties: number;
  defenderInitialSoldiers: number;
  defenderCasualties: number;
  /** 🌙 Of the casualties, soldiers carried home wounded (Moonwell Healers) instead of dying */
  attackerWounded?: number;
  defenderWounded?: number;
  /** Garrison size before the battle when the defender is an NPC void kingdom */
  defenderMaxGarrison?: number;
  attackerWon: boolean;
  usurpedSlot: boolean;
  civilizationSwapped?: boolean;
  newAttackerCiv?: CivilizationType;
  newDefenderCiv?: CivilizationType;
  loot?: BattleLoot | null;
  rounds?: BattleRound[];
  combatLog: string[];
  wallHpBefore?: number;
  wallHpAfter?: number;
  wallMaxHp?: number;
  defenderBurning?: boolean;
  /** Every army in the battle: attacking stacks (with the round they joined) and stationed reinforcements */
  armies?: Array<{ side: 'attacker' | 'defender'; ownerId: string; name: string; civ: CivilizationType; initial: number; losses: number; /** 🌙 Of `losses`, carried home wounded */ wounded?: number; joinedRound?: number; atkBonusPct?: number; band?: { rarity: MercRarity; emblem: string; fullCount: number; dead?: boolean }; armory?: { rarity: ArmoryRarity; name: string; emblem: string; worn?: number }; champion?: { name: string; level: number; fell?: boolean } }>;
  /** Every ruler who fought in it (they all get the report) */
  participants?: string[];
  /** Set when the defender is a world NPC pack (mob / bandit) rather than a civilization */
  defenderNpc?: { type: string; emblem: string; category: NPCCategory; rarity?: NPCRarity; unitName: string } | null;
  /** World boss fights: shared HP before / after this battle */
  bossHp?: { before: number; after: number; max: number } | null;
  /** World boss killed: the bounty shared by everyone who damaged it this life */
  bossBounty?: Array<{ userId: string; name: string; damage: number; loot: BattleLoot }> | null;
  /** 👑 A free realm's conquest hoard won in this battle: each ruler's share by damage dealt, paid into their treasury */
  realmHoard?: Array<{ userId: string; name: string; damage: number; loot: BattleLoot }> | null;
  /** Special Overseer defending: Resolve stacks it fought with (+20% HP / ATK / DEF each) */
  defenderGrudgeStacks?: number;
  /** 🦸 The defending ruler's champion led the home garrison (it fell if the garrison was wiped) */
  defenderChampion?: { name: string; level: number; fell?: boolean } | null;
  /** 🦸 Renown each champion in the battle earned from it (after the day's diminishing) */
  championRenown?: Array<{ userId: string; name: string; renown: number; levelAfter: number }>;
}

/** A rally: leader + joiners of one civilization gathering at the leader's castle */
export interface Rally {
  id: string;
  leaderId: string;
  leaderName: string;
  civilization: CivilizationType;
  targetType: MarchTargetType;
  targetKind: MarchTargetKind;
  targetId: string;
  targetName: string;
  /** Epoch ms when the lobby sets off */
  launchAt: number;
  /** Joiners it takes besides the leader (3 / 4 / 5 by the leader's City Hall) */
  joinerCap: number;
  status: 'open' | 'launched' | 'cancelled';
  members: Array<{ marchId: string; userId: string; name: string; civ: CivilizationType; soldiers: number; leader: boolean; arrived: boolean; arrivesAt: number }>;
}

/** Intel brought home by scouts (GAME_GUIDE §13): exact numbers as they were when the scouts saw the target */
/** Kinds of herald notices (GAME_GUIDE §14) */
export type BroadcastKind = 'boss_slain' | 'while_away' | 'gift' | 'announcement' | 'punishment' | 'shield' | 'gate_fallen' | 'scouts_caught' | 'scouts_deceived' | 'gate_duty' | 'refund' | 'season_change' | 'deed' | 'omen' | 'festival' | 'disaster' | 'chronicle' | 'mercenary' | 'armory' | 'champion';

export type DisasterKind = 'blight' | 'tempest' | 'blood_moon' | 'plague' | 'barren';

/** /status → `disaster`: the world disaster in force, or the next one once the herald has warned of it (an hour ahead) */
export interface DisasterStatus {
  id: number;
  kind: DisasterKind;
  /** Epoch ms (server clock) */
  startsAt: number;
  endsAt: number;
  /** In force now (false: warned of, not yet struck) */
  active: boolean;
}

/** A herald notice: opens once per kingdom (reads are kept on the server) and stays in the War Room's Notices for 30 days */
export interface Broadcast {
  id: number;
  kind: BroadcastKind;
  title: string;
  /** Plain text (emoji allowed); one paragraph or line per newline */
  body: string;
  emblem: string;
  /** 'all' | 'civ:<civ>' | 'users' (only the listed recipients) */
  audience: string;
  /** Ruler id of the sender, or 'realm' for notices the realm itself raises */
  createdBy: string;
  /** ISO timestamps */
  createdAt: string;
  expiresAt: string;
  /** Whether the viewer has already read it (always false for signed-out visitors) */
  read: boolean;
  /** Announcements: kept at the top of the War Room's Notices until then (ISO), if pinned */
  pinnedUntil?: string | null;
}

/** 📜 Royal Proclamations of a kingdom (GAME_GUIDE §13): every time is epoch ms, 0 when it never happened */
export interface ProclamationState {
  /** 🏘️ Paid Settlers can be called again from then */
  settlersReadyAt: number;
  /** 🎉 The Festival lasts until then (over when it is in the past) */
  festivalEndsAt: number;
  /** A new Festival can be declared from then */
  festivalReadyAt: number;
  /** ⚔️ Called to Arms (attacked a ruler's city or a frontier gate) until then: no Festival meanwhile */
  callToArmsUntil: number;
}

/** 🛡️ Royal Shield on a kingdom (GAME_GUIDE §15): no attacks, rallies or scouts until it ends */
export interface RoyalShield {
  /** Epoch ms */
  startsAt: number;
  endsAt: number;
  /** The shield shatters if its holder attacks a ruler */
  breaksOnAttack: boolean;
  grantedBy: string;
}

/** ⛈️ Royal Punishment on a kingdom (GAME_GUIDE §15): no harvest, optionally fewer births / more deaths */
export interface RoyalPunishment {
  /** Epoch ms */
  startsAt: number;
  endsAt: number;
  /** Births ×0.25 */
  lowBirth: boolean;
  /** Civilian deaths ×3 */
  highDeath: boolean;
  grantedBy: string;
}

/** Base resources and gems of a royal gift */
export interface GiftAmounts {
  gold?: number;
  iron?: number;
  stone?: number;
  lumber?: number;
  food?: number;
  /** Scarce gem key → amount */
  gems?: Record<string, number>;
}

/** One line of the Royal Decrees audit (who did what, when) */
export interface DecreeAuditEntry {
  id: number;
  at: string;
  /** e.g. decree_shield, decree_punish, decree_gift, decree_announcement, decree_lift_shield, shield_broken */
  kind: string;
  actorId: string | null;
  actorName: string | null;
  targetId: string | null;
  targetName: string | null;
  summary: string;
}

export interface ScoutReport {
  id: string;
  ownerId: string;
  targetType: MarchTargetType;
  targetKind: MarchTargetKind;
  targetId: string;
  targetName: string;
  /** When the scouts saw the target */
  takenAt: number;
  /** When the scouts got home with it (reports show up then) */
  availableAt: number;
  details: ScoutDetails;
  /** The report projected to now (kingdoms, Voidrift and NPC kingdoms) */
  estimate?: ScoutEstimate;
  /** The scouts were caught: they died and nothing came back (a red row in the War Room, never used as intel) */
  caught?: { scouts: number; by: string };
}

export interface ScoutDetails {
  emblem?: string;
  civilization?: CivilizationType;
  cityHallLevel?: number;
  garrison?: number;
  maxGarrison?: number;
  population?: number;
  maxPopulation?: number;
  soldiersAway?: number;
  unitName?: string;
  unitStats?: { hp: number; atk: number; def: number };
  /** 🛡️ A mob or bandit pack's gear (rolled when it spawned; only a scout report shows it) */
  packGear?: { id: "ragged" | "armed" | "war_geared"; name: string; emblem: string; description: string };
  trait?: string;
  modifiers?: string[];
  treasury?: { gold: number; iron: number; stone: number; lumber: number; food: number };
  scarce?: Record<string, number>;
  wallTier?: number;
  wallHp?: number;
  wallMaxHp?: number;
  burning?: boolean;
  lastBattle?: { at: string; attackerName: string; attackerWon: boolean } | null;
  /** Mobs / bandits */
  rarity?: NPCRarity;
  packRemaining?: number;
  packSize?: number;
  loot?: BattleLoot;
  /** Resource nodes */
  resourceYield?: Record<string, number>;
  nodeRemaining?: number;
  nodeTotal?: number;
  gatheredBy?: { civ: CivilizationType; name: string } | null;
  /** Treasure */
  chest?: 'small' | 'large' | 'hoard';
  /** Landmarks, bosses, NPC kingdoms: what the scouts learned */
  lore?: string[];
  region?: string;
  bossRotation?: string[];
  /** World boss: shared HP when the scouts saw it, and its skills */
  bossHp?: number;
  bossMaxHp?: number;
  /** World boss, mob or bandit pack: its Battle Arts kit as lines */
  skills?: string[];
  /** Special Overseer: Resolve stacks this week */
  grudgeStacks?: number;
  /** Kingdom: what its last harvest paid (bulk resources and the gem drop), to project the treasury */
  harvestIncome?: { gold: number; iron: number; stone: number; lumber: number; food: number; scarce: number };
  /** ⚠️ The intel feels doubtful: the scouts may have been fed lies (only some false reports carry it, never a true one) */
  doubtful?: boolean;
}

export interface CivPlaceInfo {
  civ: CivilizationType;
  places: number;
  occupied: number;
  open: number;
  /** Recent rulers who vacated this mortal civ by ascending into the Voidrift */
  vacatedBy?: Array<{ userId: string; name: string; at: number }>;
}

export interface WarFrenzyPair {
  civA: CivilizationType;
  civB: CivilizationType;
  weekKey: string;
  lastBattleAt: number;
}

export interface CivPlacesResponse {
  places: Record<CivilizationType, CivPlaceInfo>;
  frenzyPairs: WarFrenzyPair[];
  weekKey: string;
  weekResetsAt: number;
}

/** A peaceful civilization swap between two mortal kingdoms (GAME_GUIDE §13) */
export interface CivSwapProposal {
  id: string;
  fromId: string;
  toId: string;
  fromCiv: CivilizationType;
  toCiv: CivilizationType;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';
  createdAt: number; // Epoch ms
  expiresAt: number;
  resolvedAt?: number | null;
}

export interface PopulationLedgerEntry {
  id: number;
  userId: string;
  userName?: string;
  timestamp: string;
  type: string;
  births: number;
  deaths: number;
  soldiersDelta: number;
  populationDelta: number;
  populationBalance: number;
  soldiersBalance: number;
  civiliansBalance: number;
  reason: string;
}




/* ------------------------------------------------------------------------- */
/* 🪶 The Scriptorium (GAME_GUIDE §17)                                         */
/* ------------------------------------------------------------------------- */

export interface ScriptoriumDivision { id: number; name: string; sort: number }
export interface ScriptoriumClient { id: number; divisionId: number; name: string; sort: number }
export interface ScriptoriumProject {
  id: number;
  clientId: number;
  name: string;
  description: string;
  createdBy: string;
  createdByName: string;
  repoIds: string[];
}
export interface ScriptoriumRepo {
  id: string;
  name: string;
  fullName: string;
  ownerLogin: string;
  projectId: number | null;
  /** Managers only: who worked on it ("Full Name @login" · …), for searching repos by developer */
  people?: string;
}
export interface ScriptoriumTree {
  divisions: ScriptoriumDivision[];
  clients: ScriptoriumClient[];
  projects: ScriptoriumProject[];
  /** Repos in a project, the viewer's own repos and (for managers) every repo with commits */
  repos: ScriptoriumRepo[];
  /** Repos the viewer may assign (their own; every repo for managers) */
  myRepoIds: string[];
  /** Repos the viewer may log deeds on: their own (owned or committed to), managers included */
  deedRepoIds: string[];
  role: { signedIn: boolean; manager: boolean; admin: boolean; viewerId: string | null };
}

export type DeedStatus = 'pending' | 'sealed' | 'rejected' | 'revoked';
export interface Deed {
  id: number;
  userId: string;
  userName: string;
  repoId: string;
  repoName: string;
  projectName: string | null;
  day: string;
  title: string;
  body: string;
  xp: number;
  status: DeedStatus;
  auto: boolean;
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  /** The author's deed XP that day: sealed, pending (rejected deeds don't count) */
  dayTotal?: { sealed: number; pending: number };
}
/** The viewer's deed allowance for today and yesterday */
export interface DeedAllowance {
  day: string;
  /** XP already used that day (sealed + pending + revoked) */
  used: number;
  sealed: number;
  pending: number;
  cap: number;
  autoSeal: number;
  /** XP choices that still fit */
  choices: number[];
}

/* ------------------------------------------------------------------------- */
/* 🔭 The Watchtower (GAME_GUIDE §18): analytics for managers                  */
/* ------------------------------------------------------------------------- */

export type WatchPeriodKind = 'week' | 'month';
export interface WatchPeriod {
  kind: WatchPeriodKind;
  /** ISO week (2026-W43) or month (2026-10) */
  key: string;
  label: string;
  /** First day, inclusive (YYYY-MM-DD) */
  from: string;
  /** Day after the last, exclusive */
  to: string;
  prevKey: string;
  /** null while the period is still running */
  nextKey: string | null;
  /** Mon–Fri days in the period, up to today */
  workingDays: number;
  current: boolean;
}
export interface WatchDevRow {
  userId: string;
  name: string;
  civ: string;
  commits: number;
  lines: number;
  prsOpened: number;
  prsMerged: number;
  reviews: number;
  deedsSealed: number;
  deedsPending: number;
  deedXp: number;
  /** XP from commits, PRs and reviews in the period */
  gitXp: number;
  activeDays: number;
  /** Things done per day of the period (commits, PRs, reviews, deeds) */
  byDay: number[];
  lastActivityAt: string | null;
  lastActivity: string | null;
  daysSince: number | null;
  quiet: boolean;
}
export interface WatchGlance {
  period: WatchPeriod;
  days: string[];
  kpis: { roster: number; activeDevs: number; quietDevs: number; commits: number; lines: number; deedsSealed: number; deedsPending: number; deedXp: number; gitXp: number; prsMerged: number; reviews: number };
  devs: WatchDevRow[];
  /** Commits by hour of the author's clock */
  hours: number[];
}
export interface WatchRepoStat {
  repoId: string;
  name: string;
  fullName: string;
  commits: number;
  lines: number;
  deeds: number;
  deedXp: number;
  prsMerged: number;
  devs: number;
  /** Commits in the period before */
  prevCommits: number;
}
export interface WatchTreeNode {
  kind: 'division' | 'client' | 'project' | 'unsorted';
  id: string;
  name: string;
  commits: number;
  lines: number;
  deeds: number;
  deedXp: number;
  prsMerged: number;
  prevCommits: number;
  devs: number;
  repos: number;
  staleRepos: number;
  children: WatchTreeNode[];
  repoStats?: WatchRepoStat[];
}
export interface WatchTree {
  period: WatchPeriod;
  roots: WatchTreeNode[];
  /** Repos in a project with nothing in the period */
  stale: WatchRepoStat[];
  staleCount: number;
  /** Biggest change in commits against the period before */
  movers: WatchRepoStat[];
}
export interface WatchPerson {
  period: WatchPeriod;
  userId: string;
  name: string;
  civ: string;
  /** XP by source over the last 12 periods, oldest first */
  xpSeries: Array<{ key: string; label: string; commits: number; prs: number; reviews: number; deeds: number }>;
  commitsPerDay: Array<{ day: string; commits: number }>;
  commits: number;
  medianLines: number;
  tinyShare: number;
  prsOpened: number;
  prsMerged: number;
  reviews: number;
  deeds: { sealed: number; rejected: number; pending: number; revoked: number };
  hours: number[];
  weekendShare: number;
  activeDays: number;
  repos: Array<{ name: string; commits: number; deedXp: number }>;
  projects: string[];
}
export interface WatchImpactMetrics {
  devs: number;
  commits: number;
  commitsPerDevDay: number;
  medianLines: number;
  tinyShare: number;
  commitsPerActiveDay: number;
  prsPerDev: number;
  reviewsPerDev: number;
}
export interface WatchImpact {
  launch: string;
  launchSource: 'env' | 'first_harvest' | 'today';
  windowDays: number;
  before: { from: string; to: string };
  after: { from: string; to: string };
  team: { before: WatchImpactMetrics; after: WatchImpactMetrics };
  devs: Array<{ userId: string; name: string; before: WatchImpactMetrics; after: WatchImpactMetrics; splitting: boolean }>;
  trend: Array<{ week: string; commits: number; devs: number; commitsPerDev: number; medianLines: number; tinyShare: number }>;
  tinyLines: number;
}

/* 🌠 Omens: feedback from the developers to the admins (GAME_GUIDE §11) */
export type OmenKind = 'bug' | 'idea' | 'balance' | 'praise' | 'other';
export interface Omen {
  id: number;
  userId: string;
  userName: string;
  kind: OmenKind;
  title: string;
  body: string;
  status: 'unread' | 'read';
  readBy: string | null;
  readByName: string | null;
  readAt: string | null;
  createdAt: string;
}

/** An email linked to a developer (admin → Developer Emails) */
export interface DevEmail {
  email: string;
  /** The Git account's own email: it can't be unassigned */
  primary: boolean;
  commits: number;
  /** Set on a per-repo match of a shared email: only its commits in this repo are the developer's */
  repoId?: string;
  repo?: string;
}

/** A commit email no developer owns yet */
export interface UnmatchedCommitEmail {
  email: string;
  /** Author names seen on its commits, comma-separated */
  names: string | null;
  commits: number;
  lastCommit: string;
  /** The repos its commits are in, most commits first */
  repos: Array<{ repoId: string; repo: string; commits: number; lastCommit: string }>;
}

/** The weekly story (GAME_GUIDE §15 *Weekly Chronicle*): one fact a detector found, told as legend */
export interface ChronicleHappening {
  /** Which detector found it (voidrift_first, boss_stolen, disaster…) */
  kind: string;
  emblem: string;
  /** Two or three words for the story's strip of happenings ("Solo kill") */
  label: string;
  text: string;
  /** Bigger first in the digest */
  weight: number;
}

/** What happened in one week (Sunday 00:00 UTC → the next Sunday) */
export interface ChronicleDigest {
  /** The week's Sunday, YYYY-MM-DD */
  weekKey: string;
  /** ISO */
  from: string;
  to: string;
  /** No detector found anything: the realm rests */
  quiet: boolean;
  happenings: ChronicleHappening[];
  /** The week's work per civilization, told as legend (never commits or lines) */
  labour: string[];
}

/** A published weekly story (the Codex's Chronicles) */
export interface ChronicleStory {
  id: number;
  weekKey: string;
  title: string;
  body: string;
  publishedBy: string;
  publishedByName: string;
  /** ISO */
  publishedAt: string;
  /** What the game adorns the story with (null for a story saved before marks) */
  marks: ChronicleMarks | null;
}

/** Saved with a story: its rulers' peoples (crest chips, the header's crests) and the week's strip of happenings */
export interface ChronicleMarks {
  rulers: Array<{ name: string; civ: CivilizationType }>;
  happenings: Array<{ kind: string; emblem: string; label: string }>;
}

/** GET /decrees/chronicle: the digest, the ready prompt and the week's story if it is out */
export interface ChronicleDraft {
  digest: ChronicleDigest;
  prompt: string;
  published: ChronicleStory | null;
  /** Weeks the panel can pick; only finished ones can be published */
  weeks: Array<{ weekKey: string; label: string; finished: boolean; published: boolean }>;
}
