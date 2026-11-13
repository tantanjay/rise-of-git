import { hash } from "./kingdomUtils.js";
import type { BattleArtEvent, UnitRarity } from "./types.js";

export type { UnitRarity };

/**
 * ⚔️ Battle Arts (GAME_GUIDE §13 *Battle Arts*): what a named unit (a world boss, a mob or bandit pack, a mercenary band,
 * a champion, the mythical horror) brings to a battle on top of its stats.
 *
 *   - **Instincts** are always on and stack like CIV_MODIFIERS (stat shares add up).
 *   - **Arts** are cast: at most one a round per unit, chosen by `pickArt` (deterministic, seeded per battle, unit and
 *     round, so a replay and the report always agree). Arts carry no rarity: every one is tuned to POWER_BUDGET
 *     (`npm run sim:arts`); a higher-rarity unit is stronger because it carries more of them (KIT_SIZES).
 *   - The **Finale** is a unit's ultimate: once per battle, in its own slot, on its `castRound` or earlier as a last
 *     stand when the unit drops under FINALE_LAST_STAND of its strength, never both.
 *
 * This file is data and pure rules; `combat.stepBattleRound` runs them. A unit carries its kit as a `UnitKit` of ids
 * (stored in battle JSON as it is), so attaching a kit to any fighter is setting `kit` on its stack or garrison.
 */

export const UNIT_RARITIES: UnitRarity[] = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];

/** Most Instincts / Arts / Finales a unit of each rarity carries */
export const KIT_SIZES: Record<UnitRarity, { instincts: number; arts: number; finale: number }> = {
  common: { instincts: 1, arts: 0, finale: 0 },
  uncommon: { instincts: 1, arts: 1, finale: 0 },
  rare: { instincts: 2, arts: 1, finale: 0 },
  epic: { instincts: 2, arts: 2, finale: 0 },
  legendary: { instincts: 2, arts: 2, finale: 1 },
  mythic: { instincts: 3, arts: 3, finale: 1 }
};

/** A world boss's kit, a colossus's: one Instinct more than a legendary unit's (Cleave on every boss), 2 Arts and its own Finale */
export const BOSS_KIT_SIZE = { instincts: 3, arts: 2, finale: 1 };

/** What each Art is worth over a 6-round fight, in rounds of its caster's own blow (`npm run sim:arts` keeps every Art within ±15%) */
export const POWER_BUDGET = 1.25;
/** A Finale fires early as a last stand once its unit is down to this share of its strength */
export const FINALE_LAST_STAND = 0.25;

/* ------------------------------------------------------------------------- */
/* Statuses                                                                  */
/* ------------------------------------------------------------------------- */

export type StatusKind = "burn" | "poison" | "bleed" | "paralyze" | "chill" | "freeze" | "ward" | "rally" | "sunder";

export interface StatusRule {
  name: string;
  emblem: string;
  /** Rounds it lasts, counting the round it lands */
  rounds: number;
  /** Lands on the enemy (else on the caster's own side) */
  harmful: boolean;
  /** Ticks damage at the end of each round */
  dot?: boolean;
  /** Stacks one source may build on a target (Poison) */
  maxStacks?: number;
  /** What it does, for the books */
  text: string;
}

/**
 * Starting numbers are each Art's own (its effect's `value`); these are the rules every status follows. The same
 * status from the same source refreshes; from different sources it stacks up to STATUS_MAX_SOURCES.
 */
export const STATUS_RULES: Record<StatusKind, StatusRule> = {
  burn: { name: "Burn", emblem: "🔥", rounds: 3, harmful: true, dot: true, text: "takes fire damage at the end of each round for 3 rounds" },
  poison: { name: "Poison", emblem: "☠️", rounds: 5, harmful: true, dot: true, maxStacks: 3, text: "weaker than Burn, lasts 5 rounds, and the same caster can stack it 3 deep" },
  bleed: { name: "Bleed", emblem: "🩸", rounds: 3, harmful: true, dot: true, text: "ticks for 3 rounds, harder the more soldiers its target has already lost" },
  paralyze: { name: "Paralyze", emblem: "⚡", rounds: 1, harmful: true, text: "−50% damage dealt the round it lands" },
  chill: { name: "Chill", emblem: "❄️", rounds: 2, harmful: true, text: "−ATK for 2 rounds" },
  freeze: { name: "Freeze", emblem: "❄️", rounds: 1, harmful: true, text: "frozen solid: no counter-strike for a round (a boss is only Chilled)" },
  ward: { name: "Ward", emblem: "🛡️", rounds: 2, harmful: false, text: "less damage taken from blows and strikes" },
  rally: { name: "Rally cry", emblem: "💢", rounds: 2, harmful: false, text: "+ATK for the caster's side" },
  sunder: { name: "Sunder", emblem: "💔", rounds: 3, harmful: true, text: "−DEF, so every blow bites deeper" }
};
/** Different sources stack the same status at most this many times on one target */
export const STATUS_MAX_SOURCES = 3;
/** Bleed's tick × (1 + this × the share of its target already lost) */
export const BLEED_GROWTH = 1;
/** Paralyze on a boss lands at this share of its strength, and never two rounds in a row */
export const BOSS_PARALYZE_MULT = 0.5;
/** Freeze on a boss is only a Chill of this share (−ATK for the Chill's 2 rounds): about one frozen round's worth */
export const BOSS_FREEZE_CHILL = 0.5;

/** A status on a fighter (stored with it in the battle's JSON) */
export interface StatusInstance {
  kind: StatusKind;
  /** Who cast it (stack march id or "home"), so a second cast refreshes instead of stacking */
  source: string;
  sourceName: string;
  /** Rounds left, counting the coming one */
  rounds: number;
  /** Share it changes (ATK, DEF, damage taken, damage dealt) */
  value: number;
  /** Damage over time: HP each tick, per stack */
  tick?: number;
  stacks?: number;
}

/* ------------------------------------------------------------------------- */
/* Arts, Finales, Instincts                                                  */
/* ------------------------------------------------------------------------- */

export type ArtTarget = "enemy_front" | "enemies" | "self" | "allies";

export type ArtEffect =
  /** An extra hit of `power` × the caster's own blow (split by headcount over several targets) */
  | { kind: "strike"; power: number }
  /** Brings back `share` of the soldiers (or HP) the target has lost */
  | { kind: "heal"; share: number }
  /** Lays a status: `value` is its share (−ATK, ward…) or, for damage over time, each tick × the caster's blow */
  | { kind: "status"; status: StatusKind; value: number; rounds?: number };

export type ArtCondition =
  /** The caster has lost at least this share of its strength */
  | { kind: "own_losses"; atLeast: number }
  /** The enemy front is down to this share or less */
  | { kind: "enemy_below"; share: number };

export interface Art {
  id: string;
  name: string;
  emblem: string;
  /** First round (of the caster's own, counted from its arrival) it may be cast */
  castRound: number;
  /** Cast at round r → ready again at r + cooldown + 1 */
  cooldown: number;
  /** Once per battle (cooldown ignored) */
  once?: boolean;
  target: ArtTarget;
  effect: ArtEffect[];
  /** Must hold when cast; failing it skips the Art without putting it on cooldown */
  condition?: ArtCondition;
  /** The spell-effects kit's look for this Art */
  fx: string;
  /** Sound cue played on cast */
  sound: string;
  description: string;
}

export type InstinctEffect =
  /** Shares added to HP / ATK / DEF, stacking with civ buffs */
  | { kind: "stat"; hp?: number; atk?: number; def?: number }
  /** Each round kills this share of every enemy army on top of the unit's blow */
  | { kind: "cull"; share: number }
  /** ATK × atkMult while the unit is below `below` of its strength */
  | { kind: "enrage"; atkMult: number; below: number };

export interface Instinct {
  id: string;
  name: string;
  emblem: string;
  effect: InstinctEffect;
  description: string;
}

/** Everything a unit fights with: its kit is ids into ARTS / FINALES / INSTINCTS */
export interface UnitKit {
  /** Shown in reports ("Ser Aldric", "Kraken") */
  name: string;
  rarity: UnitRarity;
  instincts: string[];
  arts: string[];
  finale?: string;
  /** Fights as one colossal unit: Paralyze halved, never Frozen (world bosses, the horror) */
  boss?: boolean;
}

/** Per-battle record of a unit's casts (stored with its stack or garrison) */
export interface ArtsState {
  /** Art id → round of the unit's own it is ready again */
  ready: Record<string, number>;
  /** Art id → rounds it was cast */
  cast: Record<string, number[]>;
  finaleUsed?: boolean;
  /** Damage the unit already carried as this battle began (one colossal unit's HP carries over between battles: its heals and losses count this battle's only) */
  carryAtStart?: number;
}

export const INSTINCTS: Record<string, Instinct> = {
  // World bosses (the numbers they have always fought with)
  cleave: { id: "cleave", name: "Cleave", emblem: "🪓", effect: { kind: "cull", share: 0.03 }, description: "every round it kills 3% of each enemy army on top of its blow" },
  enrage: { id: "enrage", name: "Enrage", emblem: "💢", effect: { kind: "enrage", atkMult: 1.5, below: 0.5 }, description: "+50% ATK below 50% HP" },
  // Shared Instincts any named unit may carry
  thick_hide: { id: "thick_hide", name: "Thick Hide", emblem: "🛡️", effect: { kind: "stat", hp: 0.3 }, description: "+30% HP" },
  bloodlust: { id: "bloodlust", name: "Bloodlust", emblem: "🩸", effect: { kind: "stat", atk: 0.15 }, description: "+15% ATK" },
  stoneskin: { id: "stoneskin", name: "Stoneskin", emblem: "🪨", effect: { kind: "stat", def: 0.4 }, description: "+40% DEF" },
  // Mobs and bandits (the same shares under the names of the wild)
  pack_hunter: { id: "pack_hunter", name: "Pack Hunter", emblem: "🐺", effect: { kind: "stat", atk: 0.15 }, description: "+15% ATK (they hunt together)" },
  swarming: { id: "swarming", name: "Swarm", emblem: "🦇", effect: { kind: "stat", hp: 0.3 }, description: "+30% HP (there are always more of them)" },
  undying: { id: "undying", name: "Undying", emblem: "💀", effect: { kind: "stat", hp: 0.3 }, description: "+30% HP (what is already dead is hard to put down)" },
  cutthroat: { id: "cutthroat", name: "Cutthroat", emblem: "🗡️", effect: { kind: "stat", atk: 0.15 }, description: "+15% ATK (they fight dirty)" },
  keen_eye: { id: "keen_eye", name: "Keen Eye", emblem: "🎯", effect: { kind: "stat", atk: 0.15 }, description: "+15% ATK (every shot finds a gap)" },
  light_footed: { id: "light_footed", name: "Light-Footed", emblem: "🪶", effect: { kind: "stat", def: 0.4 }, description: "+40% DEF (hard to pin down)" }
};

export const ARTS: Record<string, Art> = {
  // World bosses
  ward: {
    id: "ward",
    name: "Ward",
    emblem: "🛡️",
    castRound: 1,
    cooldown: 0,
    once: true,
    target: "self",
    effect: [{ kind: "status", status: "ward", value: 0.8, rounds: 1 }],
    fx: "ward",
    sound: "ward",
    description: "−80% damage taken in the first round of each battle"
  },
  // Shared Arts
  fireball: {
    id: "fireball",
    name: "Fireball",
    emblem: "🔥",
    castRound: 1,
    cooldown: 2,
    target: "enemy_front",
    effect: [{ kind: "strike", power: 0.25 }, { kind: "status", status: "burn", value: 0.09 }],
    fx: "fireball",
    sound: "fireball",
    description: "a strike that leaves the enemy front burning"
  },
  frost_lance: {
    id: "frost_lance",
    name: "Frost Lance",
    emblem: "❄️",
    castRound: 1,
    cooldown: 2,
    target: "enemy_front",
    effect: [{ kind: "strike", power: 0.2 }, { kind: "status", status: "chill", value: 0.15 }],
    fx: "frost_lance",
    sound: "frost_lance",
    description: "a strike that Chills the enemy front (−15% ATK)"
  },
  venom_volley: {
    id: "venom_volley",
    name: "Venom Volley",
    emblem: "☠️",
    castRound: 1,
    cooldown: 1,
    target: "enemies",
    effect: [{ kind: "status", status: "poison", value: 0.11 }],
    fx: "venom_volley",
    sound: "venom_volley",
    description: "Poisons every enemy army, a stack deeper each time"
  },
  rending_blow: {
    id: "rending_blow",
    name: "Rending Blow",
    emblem: "🩸",
    castRound: 1,
    cooldown: 2,
    target: "enemy_front",
    effect: [{ kind: "strike", power: 0.2 }, { kind: "status", status: "bleed", value: 0.08 }],
    fx: "rending_blow",
    sound: "rending_blow",
    description: "a strike that leaves the enemy front Bleeding"
  },
  thunderclap: {
    id: "thunderclap",
    name: "Thunderclap",
    emblem: "⚡",
    castRound: 2,
    cooldown: 2,
    target: "enemies",
    effect: [{ kind: "strike", power: 0.15 }, { kind: "status", status: "paralyze", value: 0.5 }],
    fx: "thunderclap",
    sound: "thunderclap",
    description: "a crash over every enemy army that Paralyzes them"
  },
  glacial_prison: {
    id: "glacial_prison",
    name: "Glacial Prison",
    emblem: "❄️",
    castRound: 2,
    cooldown: 4,
    target: "enemy_front",
    effect: [{ kind: "status", status: "freeze", value: 1 }],
    fx: "glacial_prison",
    sound: "glacial_prison",
    description: "Freezes the enemy front: no counter-strike for a round"
  },
  shield_wall: {
    id: "shield_wall",
    name: "Shield Wall",
    emblem: "🛡️",
    castRound: 1,
    cooldown: 3,
    target: "self",
    effect: [{ kind: "status", status: "ward", value: 0.3 }],
    fx: "shield_wall",
    sound: "shield_wall",
    description: "Wards the caster: −30% damage taken for 2 rounds"
  },
  war_cry: {
    id: "war_cry",
    name: "War Cry",
    emblem: "💢",
    castRound: 1,
    cooldown: 3,
    target: "allies",
    effect: [{ kind: "status", status: "rally", value: 0.3 }],
    fx: "war_cry",
    sound: "war_cry",
    description: "a Rally cry: +30% ATK for 2 rounds for the caster's side"
  },
  armor_break: {
    id: "armor_break",
    name: "Armor Break",
    emblem: "💔",
    castRound: 1,
    cooldown: 3,
    target: "enemy_front",
    effect: [{ kind: "status", status: "sunder", value: 0.35 }],
    fx: "armor_break",
    sound: "armor_break",
    description: "Sunders the enemy front: −35% DEF for 3 rounds"
  },
  second_wind: {
    id: "second_wind",
    name: "Second Wind",
    emblem: "💚",
    castRound: 2,
    cooldown: 0,
    once: true,
    target: "self",
    effect: [{ kind: "heal", share: 0.6 }],
    condition: { kind: "own_losses", atLeast: 0.1 },
    fx: "second_wind",
    sound: "second_wind",
    description: "once a battle, once the caster has lost 10%: 60% of its fallen rise again"
  },
  // Mobs and bandits
  ambush: {
    id: "ambush",
    name: "Ambush",
    emblem: "🗡️",
    castRound: 1,
    cooldown: 0,
    once: true,
    target: "enemy_front",
    effect: [{ kind: "strike", power: 0.72 }],
    fx: "ambush",
    sound: "ambush",
    description: "they strike from cover before the fight is joined: one hard blow on the enemy front in the first round"
  },
  venom_sting: {
    id: "venom_sting",
    name: "Venom Sting",
    emblem: "🦂",
    castRound: 1,
    cooldown: 2,
    target: "enemy_front",
    effect: [{ kind: "strike", power: 0.15 }, { kind: "status", status: "poison", value: 0.1 }],
    fx: "venom_sting",
    sound: "venom_sting",
    description: "a sting that Poisons the enemy front"
  },
  poison_blade: {
    id: "poison_blade",
    name: "Poisoned Blade",
    emblem: "☠️",
    castRound: 1,
    cooldown: 2,
    target: "enemy_front",
    effect: [{ kind: "strike", power: 0.15 }, { kind: "status", status: "poison", value: 0.1 }],
    fx: "poison_blade",
    sound: "poison_blade",
    description: "a cut with a smeared edge that Poisons the enemy front"
  },
  regenerate: {
    id: "regenerate",
    name: "Regenerate",
    emblem: "💚",
    castRound: 2,
    cooldown: 2,
    target: "self",
    effect: [{ kind: "heal", share: 0.2 }],
    condition: { kind: "own_losses", atLeast: 0.1 },
    fx: "regenerate",
    sound: "regenerate",
    description: "once the caster has lost 10%, its wounds close: 20% of its fallen stand again"
  },
  dread_wail: {
    id: "dread_wail",
    name: "Dread Wail",
    emblem: "👻",
    castRound: 1,
    cooldown: 2,
    target: "enemies",
    effect: [{ kind: "status", status: "paralyze", value: 0.5 }],
    fx: "dread_wail",
    sound: "dread_wail",
    description: "a wail that freezes the blood: every enemy army is Paralyzed"
  },
  fire_breath: {
    id: "fire_breath",
    name: "Fire Breath",
    emblem: "🐉",
    castRound: 1,
    cooldown: 2,
    target: "enemies",
    effect: [{ kind: "strike", power: 0.2 }, { kind: "status", status: "burn", value: 0.08 }],
    fx: "fire_breath",
    sound: "fire_breath",
    description: "a gout of fire over every enemy army, leaving them burning"
  },
  void_lash: {
    id: "void_lash",
    name: "Void Lash",
    emblem: "🌀",
    castRound: 1,
    cooldown: 2,
    target: "enemy_front",
    effect: [{ kind: "strike", power: 0.1 }, { kind: "status", status: "sunder", value: 0.25 }],
    fx: "void_lash",
    sound: "void_lash",
    description: "a tendril of the rift that Sunders the enemy front (−25% DEF)"
  },
  stone_gaze: {
    id: "stone_gaze",
    name: "Stone Gaze",
    emblem: "👁️",
    castRound: 2,
    cooldown: 4,
    target: "enemy_front",
    effect: [{ kind: "status", status: "freeze", value: 1 }],
    fx: "stone_gaze",
    sound: "stone_gaze",
    description: "turns the enemy front to stone: no counter-strike for a round"
  },
  raise_dead: {
    id: "raise_dead",
    name: "Raise the Dead",
    emblem: "💀",
    castRound: 2,
    cooldown: 3,
    target: "self",
    effect: [{ kind: "heal", share: 0.4 }],
    condition: { kind: "own_losses", atLeast: 0.15 },
    fx: "raise_dead",
    sound: "raise_dead",
    description: "once the caster has lost 15%, 40% of its fallen claw their way back up"
  },
  blackpowder: {
    id: "blackpowder",
    name: "Blackpowder Keg",
    emblem: "💣",
    castRound: 2,
    cooldown: 2,
    target: "enemies",
    effect: [{ kind: "strike", power: 0.4 }, { kind: "status", status: "burn", value: 0.06 }],
    fx: "blackpowder",
    sound: "blackpowder",
    description: "a lit keg rolled into every enemy army, leaving them burning"
  }
};

export const FINALES: Record<string, Art> = {
  dawnbreaker: {
    id: "dawnbreaker",
    name: "Dawnbreaker",
    emblem: "🌅",
    castRound: 5,
    cooldown: 0,
    once: true,
    target: "enemies",
    effect: [{ kind: "strike", power: 2.2 }],
    fx: "dawnbreaker",
    sound: "dawnbreaker",
    description: "a blinding sweep over every enemy army"
  },
  cataclysm: {
    id: "cataclysm",
    name: "Cataclysm",
    emblem: "☄️",
    castRound: 5,
    cooldown: 0,
    once: true,
    target: "enemies",
    effect: [{ kind: "strike", power: 1.8 }, { kind: "status", status: "burn", value: 0.25 }],
    fx: "cataclysm",
    sound: "cataclysm",
    description: "fire from the sky over every enemy army, leaving them burning"
  },
  // World bosses: each its own Finale
  abyssal_grasp: {
    id: "abyssal_grasp",
    name: "Abyssal Grasp",
    emblem: "🐙",
    castRound: 5,
    cooldown: 0,
    once: true,
    target: "enemies",
    effect: [{ kind: "strike", power: 1.25 }, { kind: "status", status: "freeze", value: 1 }],
    fx: "abyssal_grasp",
    sound: "abyssal_grasp",
    description: "tentacles burst from the deep and drag at every enemy army, holding them Frozen in their grip"
  },
  sirens_requiem: {
    id: "sirens_requiem",
    name: "Siren's Requiem",
    emblem: "🎵",
    castRound: 5,
    cooldown: 0,
    once: true,
    target: "enemies",
    effect: [{ kind: "strike", power: 1.45 }, { kind: "status", status: "paralyze", value: 0.5 }],
    fx: "sirens_requiem",
    sound: "sirens_requiem",
    description: "a deathly song washes over every enemy army and leaves them Paralyzed"
  },
  devouring_maw: {
    id: "devouring_maw",
    name: "Devouring Maw",
    emblem: "🪱",
    castRound: 5,
    cooldown: 0,
    once: true,
    target: "enemy_front",
    effect: [{ kind: "strike", power: 2.0 }],
    fx: "devouring_maw",
    sound: "devouring_maw",
    description: "the ground opens under the enemy front and the worm swallows whole ranks"
  },
  stinger_storm: {
    id: "stinger_storm",
    name: "Stinger Storm",
    emblem: "🦂",
    castRound: 5,
    cooldown: 0,
    once: true,
    target: "enemies",
    effect: [{ kind: "strike", power: 1.45 }, { kind: "status", status: "poison", value: 0.2 }],
    fx: "stinger_storm",
    sound: "stinger_storm",
    description: "a rain of stingers over every enemy army, leaving them Poisoned"
  },
  grasping_roots: {
    id: "grasping_roots",
    name: "Grasping Roots",
    emblem: "🌳",
    castRound: 5,
    cooldown: 0,
    once: true,
    target: "enemies",
    effect: [{ kind: "strike", power: 1.65 }, { kind: "status", status: "bleed", value: 0.1 }],
    fx: "grasping_roots",
    sound: "grasping_roots",
    description: "thorned roots tear up through every enemy army and leave them Bleeding"
  },
  fae_glamour: {
    id: "fae_glamour",
    name: "Glamour of the Court",
    emblem: "🧚",
    castRound: 5,
    cooldown: 0,
    once: true,
    target: "enemies",
    effect: [{ kind: "strike", power: 1.4 }, { kind: "status", status: "chill", value: 0.3 }],
    fx: "fae_glamour",
    sound: "fae_glamour",
    description: "a whirl of enchanted petals dazes every enemy army: they strike back Chilled, −30% ATK"
  },
  avalanche: {
    id: "avalanche",
    name: "Avalanche",
    emblem: "🏔️",
    castRound: 5,
    cooldown: 0,
    once: true,
    target: "enemies",
    effect: [{ kind: "strike", power: 1.7 }, { kind: "status", status: "chill", value: 0.2 }],
    fx: "avalanche",
    sound: "avalanche",
    description: "the mountainside comes down on every enemy army and leaves them Chilled"
  },
  petrifying_gaze: {
    id: "petrifying_gaze",
    name: "Petrifying Gaze",
    emblem: "👁️",
    castRound: 5,
    cooldown: 0,
    once: true,
    target: "enemies",
    effect: [{ kind: "strike", power: 1.2 }, { kind: "status", status: "freeze", value: 1 }],
    fx: "petrifying_gaze",
    sound: "petrifying_gaze",
    description: "its eyes blaze and every enemy army turns half to stone: Frozen for a round"
  },
  maelstrom: {
    id: "maelstrom",
    name: "Maelstrom",
    emblem: "🌊",
    castRound: 5,
    cooldown: 0,
    once: true,
    target: "enemies",
    effect: [{ kind: "strike", power: 1.6 }, { kind: "status", status: "chill", value: 0.25 }],
    fx: "maelstrom",
    sound: "maelstrom",
    description: "a whirlpool drags at every enemy army and leaves them Chilled"
  },
  sandstorm: {
    id: "sandstorm",
    name: "Sandstorm",
    emblem: "🌪️",
    castRound: 5,
    cooldown: 0,
    once: true,
    target: "enemies",
    effect: [{ kind: "strike", power: 1.6 }, { kind: "status", status: "sunder", value: 0.3 }],
    fx: "sandstorm",
    sound: "sandstorm",
    description: "a wall of sand scours every enemy army and Sunders their armour"
  },
  wild_hunt: {
    id: "wild_hunt",
    name: "Wild Hunt",
    emblem: "🐺",
    castRound: 5,
    cooldown: 0,
    once: true,
    target: "enemies",
    effect: [{ kind: "strike", power: 1.6 }, { kind: "status", status: "bleed", value: 0.12 }],
    fx: "wild_hunt",
    sound: "wild_hunt",
    description: "the forest's beasts fall on every enemy army and leave them Bleeding"
  },
  dragonfire: {
    id: "dragonfire",
    name: "Dragonfire",
    emblem: "🐉",
    castRound: 5,
    cooldown: 0,
    once: true,
    target: "enemies",
    effect: [{ kind: "strike", power: 1.6 }, { kind: "status", status: "burn", value: 0.15 }],
    fx: "dragonfire",
    sound: "dragonfire",
    description: "the peaks breathe fire over every enemy army, leaving them burning"
  },
  the_devouring: {
    id: "the_devouring",
    name: "The Devouring",
    emblem: "🌑",
    castRound: 5,
    cooldown: 0,
    once: true,
    target: "enemies",
    effect: [{ kind: "strike", power: 1.6 }, { kind: "status", status: "sunder", value: 0.3 }],
    fx: "the_devouring",
    sound: "the_devouring",
    description: "the black core drags every enemy army toward it, tearing the armour from their backs"
  }
};

/** An Art or Finale by id */
export const artById = (id: string): Art | undefined => ARTS[id] ?? FINALES[id];

/* ------------------------------------------------------------------------- */
/* Rules                                                                      */
/* ------------------------------------------------------------------------- */

/** A kit is within its rarity's sizes and names only known Arts / Instincts */
export function kitProblems(kit: UnitKit): string[] {
  // The mythic horror fights as a colossus but carries the mythic kit
  const size = kit.boss && kit.rarity !== "mythic" ? BOSS_KIT_SIZE : KIT_SIZES[kit.rarity];
  const who = kit.boss && kit.rarity !== "mythic" ? "world boss" : kit.rarity;
  const out: string[] = [];
  if (kit.instincts.length > size.instincts) out.push(`${kit.name}: ${kit.instincts.length} Instincts (a ${who} carries ${size.instincts})`);
  if (kit.arts.length > size.arts) out.push(`${kit.name}: ${kit.arts.length} Arts (a ${who} carries ${size.arts})`);
  if (kit.finale && size.finale === 0) out.push(`${kit.name}: a ${kit.rarity} carries no Finale`);
  for (const id of kit.instincts) if (!INSTINCTS[id]) out.push(`${kit.name}: unknown Instinct ${id}`);
  for (const id of kit.arts) if (!ARTS[id]) out.push(`${kit.name}: unknown Art ${id}`);
  if (kit.finale && !FINALES[kit.finale]) out.push(`${kit.name}: unknown Finale ${kit.finale}`);
  return out;
}

/** The kit as lines for a panel or the Codex ("Instinct · Cleave: …") */
export function kitLines(kit: Pick<UnitKit, "instincts" | "arts" | "finale">): string[] {
  return [
    ...kit.instincts.map((id) => INSTINCTS[id]).filter(Boolean).map((i) => `Instinct · ${i.name}: ${i.description}`),
    ...kit.arts.map((id) => ARTS[id]).filter(Boolean).map((a) => `Art · ${a.name}: ${a.description}${artTiming(a)}`),
    ...(kit.finale && FINALES[kit.finale] ? [`Finale · ${FINALES[kit.finale].name}: ${FINALES[kit.finale].description} (round ${FINALES[kit.finale].castRound}, or as a last stand under ${FINALE_LAST_STAND * 100}%)`] : [])
  ];
}

function artTiming(a: Art): string {
  if (a.once) return a.castRound > 1 ? ` (once, from round ${a.castRound})` : "";
  return ` (from round ${a.castRound}, every ${a.cooldown + 1} rounds)`;
}

/** Instincts' stat shares, added up */
export function instinctStats(kit: UnitKit | undefined): { hp: number; atk: number; def: number } {
  const s = { hp: 0, atk: 0, def: 0 };
  for (const id of kit?.instincts ?? []) {
    const e = INSTINCTS[id]?.effect;
    if (e?.kind !== "stat") continue;
    s.hp += e.hp ?? 0;
    s.atk += e.atk ?? 0;
    s.def += e.def ?? 0;
  }
  return s;
}

/** Share of every enemy army a unit's Instincts kill each round */
export const cullShare = (kit: UnitKit | undefined) =>
  (kit?.instincts ?? []).reduce((sum, id) => {
    const e = INSTINCTS[id]?.effect;
    return sum + (e?.kind === "cull" ? e.share : 0);
  }, 0);

/** ATK multiplier from Enrage-like Instincts at `strength` (share of the unit still standing) */
export function enrageMult(kit: UnitKit | undefined, strength: number): number {
  let m = 1;
  for (const id of kit?.instincts ?? []) {
    const e = INSTINCTS[id]?.effect;
    if (e?.kind === "enrage" && strength < e.below) m *= e.atkMult;
  }
  return m;
}

/** The seeded roll that breaks a tie between Arts: from the battle, the unit and the round, so the replay agrees */
export const artRoll = (battleSeed: string, unitKey: string, round: number) => hash(`${battleSeed}:${unitKey}:${round}:arts`) / 4294967296;

export interface CastContext {
  /** The caster's own round (counted from its arrival) */
  round: number;
  /** Share of the caster still standing */
  strength: number;
  /** Share of the caster lost in this battle */
  lost: number;
  /** Share of the enemy front still standing */
  enemyFront: number;
}

function conditionHolds(c: ArtCondition | undefined, ctx: CastContext): boolean {
  if (!c) return true;
  if (c.kind === "own_losses") return ctx.lost >= c.atLeast;
  return ctx.enemyFront <= c.share;
}

/**
 * The Art a unit casts this round, if any (at most one): candidates are off cooldown, past their castRound and meet
 * their condition (a failed condition skips without cooldown). An Art whose castRound is exactly this round and that
 * was never cast wins; otherwise the one waiting longest; ties by the seeded roll.
 */
export function pickArt(kit: UnitKit, state: ArtsState, ctx: CastContext, roll: number): Art | null {
  const candidates = kit.arts
    .map((id) => ARTS[id])
    .filter((a): a is Art => Boolean(a))
    .filter((a) => {
      if (a.castRound > ctx.round) return false;
      if (a.once && (state.cast[a.id]?.length ?? 0) > 0) return false;
      if ((state.ready[a.id] ?? 0) > ctx.round) return false;
      return conditionHolds(a.condition, ctx);
    });
  if (candidates.length === 0) return null;
  const fresh = candidates.filter((a) => a.castRound === ctx.round && !state.cast[a.id]?.length);
  const pool = fresh.length > 0 ? fresh : candidates;
  // Waiting since: the round it became ready (its castRound, or the end of its cooldown)
  const since = (a: Art) => Math.max(a.castRound, state.ready[a.id] ?? 0);
  const oldest = Math.min(...pool.map(since));
  const tied = pool.filter((a) => since(a) === oldest);
  return tied[Math.min(tied.length - 1, Math.floor(roll * tied.length))];
}

/** The Finale fires now: on its castRound, or earlier as a last stand; once per battle */
export function finaleNow(kit: UnitKit, state: ArtsState, ctx: CastContext): { art: Art; lastStand: boolean } | null {
  const art = kit.finale ? FINALES[kit.finale] : undefined;
  if (!art || state.finaleUsed) return null;
  if (ctx.round === art.castRound) return { art, lastStand: false };
  if (ctx.round < art.castRound && ctx.strength < FINALE_LAST_STAND) return { art, lastStand: true };
  return null;
}

export function markCast(state: ArtsState, art: Art, round: number, finale: boolean) {
  if (finale) {
    state.finaleUsed = true;
    return;
  }
  (state.cast[art.id] ??= []).push(round);
  state.ready[art.id] = round + art.cooldown + 1;
}

/**
 * Lay a status on a target's list: the same source refreshes (Poison adds a stack), other sources stack up to
 * STATUS_MAX_SOURCES (a fourth replaces the one closest to running out). On a boss, Paralyze is halved and never lands
 * two rounds in a row, and Freeze is only a Chill. Returns false when it did not land.
 */
export function applyStatus(
  target: { statuses?: StatusInstance[]; paralyzedRound?: number },
  inst: StatusInstance,
  boss: boolean,
  round: number
): boolean {
  let s = inst;
  if (boss && s.kind === "freeze") s = { ...s, kind: "chill", rounds: STATUS_RULES.chill.rounds, value: BOSS_FREEZE_CHILL * Math.min(1, s.value) };
  if (s.kind === "paralyze") {
    if (boss && target.paralyzedRound !== undefined && target.paralyzedRound >= round - 1) return false;
    if (boss) s = { ...s, value: s.value * BOSS_PARALYZE_MULT };
    target.paralyzedRound = round;
  }
  const list = (target.statuses ??= []);
  const same = list.find((x) => x.kind === s.kind && x.source === s.source);
  if (same) {
    const max = STATUS_RULES[s.kind].maxStacks ?? 1;
    same.stacks = Math.min(max, (same.stacks ?? 1) + (max > 1 ? 1 : 0));
    same.rounds = s.rounds;
    same.value = s.value;
    same.tick = s.tick;
    return true;
  }
  const others = list.filter((x) => x.kind === s.kind);
  if (others.length >= STATUS_MAX_SOURCES) {
    const weakest = others.reduce((a, b) => (b.rounds < a.rounds ? b : a));
    list.splice(list.indexOf(weakest), 1);
  }
  list.push({ ...s, stacks: 1 });
  return true;
}

/** What a fighter's statuses do to it this round */
export function statusMods(statuses: StatusInstance[] | undefined): { atkMult: number; defMult: number; takenMult: number; frozen: boolean } {
  let atkMult = 1;
  let rally = 0;
  let defMult = 1;
  let takenMult = 1;
  let frozen = false;
  for (const s of statuses ?? []) {
    if (s.rounds <= 0) continue;
    if (s.kind === "chill" || s.kind === "paralyze") atkMult *= 1 - s.value;
    else if (s.kind === "rally") rally += s.value;
    else if (s.kind === "sunder") defMult *= 1 - s.value;
    else if (s.kind === "ward") takenMult *= Math.round((1 - s.value) * 1e9) / 1e9;
    else if (s.kind === "freeze") frozen = true;
  }
  return { atkMult: atkMult * (1 + rally), defMult, takenMult, frozen };
}

/** One happening as a line of the battle log ("🎺 Ser Aldric's Finale — Dawnbreaker — broke the last of the Riftguard") */
export function artEventLine(e: BattleArtEvent): string {
  const lost = e.losses ? ` (−${e.losses.toLocaleString()})` : "";
  if (e.kind === "finale") {
    const head = `🎺 ${e.unit}'s Finale — ${e.name}${e.lastStand ? ", a last stand" : ""}`;
    return e.broke?.length ? `${head} — broke the last of ${e.broke.join(" and ")}.` : `${head}${lost}.`;
  }
  if (e.kind === "cast") return `${e.emblem} ${e.unit} casts ${e.name}${e.target ? ` on ${e.target}` : ""}${lost}${e.healed ? ` (+${e.healed.toLocaleString()} back on their feet)` : ""}.`;
  if (e.kind === "instinct") return e.losses ? `${e.emblem} ${e.unit}'s ${e.name} cuts down ${e.losses.toLocaleString()}.` : `${e.emblem} ${e.unit}'s ${e.name} wakes.`;
  return `${e.emblem} ${e.name} ticks on ${e.unit}${lost}.`;
}
