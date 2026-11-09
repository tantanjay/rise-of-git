import type { BattleStatusKind } from "@/types";

/*
 * The spell-effects kit's looks (GAME_GUIDE §13 *Battle Arts*): every Art's, Finale's and Instinct's look is data on one
 * shared kit, as the soundtracks are data on one orchestra. A look picks one option per stage:
 *   charge → core → trail → burst → reaction → aftermath
 * and `SpellFx.tsx` draws every cast on screen from it with one batch of GPU particles. The server names the look of a
 * cast (`BattleArtEvent.fx`, the Art's id today); a status's look while it lasts is keyed by the status.
 */

export type ChargeLook = "gather" | "swirl" | "rise" | "none";
export type CoreLook = "orb" | "shard" | "blade" | "flare" | "none";
export type TrailLook = "flame" | "frost" | "venom" | "streak" | "none";
export type BurstLook = "flash" | "shatter" | "splash" | "slash" | "bolt" | "dome" | "nova" | "sunburst" | "rain" | "vortex" | "dust" | "pack" | "breath" | "tentacles" | "song" | "maw" | "stingers" | "roots" | "petals" | "avalanche" | "gaze";
export type ReactionLook = "flinch" | "stagger" | "lift" | "none";

export interface SpellLook {
  /** As the server names it (npm run sim:arts checks) */
  name: string;
  emblem: string;
  charge: ChargeLook;
  core: CoreLook;
  trail: TrailLook;
  burst: BurstLook;
  reaction: ReactionLook;
  /** The status it leaves behind (its aftermath look plays while the status holds) */
  aftermath?: BattleStatusKind;
  /** Its colour and its hottest light */
  color: string;
  hot: string;
  /** Who it lands on: the enemy side (a bolt flies over), or the caster's own (it blooms where it stands) */
  aim: "enemy" | "self";
  /** Finales are bigger and the caster cries out (a boss rears up in a roar) */
  finale?: boolean;
  /** The sound cue's voice (`useSound.ts` playSpell) */
  voice: SpellVoice;
}

/** How a cast sounds: the whoosh's pitch and the impact's kind */
export type SpellVoice = "fire" | "frost" | "venom" | "steel" | "thunder" | "holy" | "war" | "water" | "sand" | "beast";

/** Art and Finale looks by `fx` id (every id in ARTS / FINALES of server/src/battleArts.ts) */
export const SPELL_LOOKS: Record<string, SpellLook> = {
  // Arts
  ward: { name: "Ward", emblem: "🛡️", charge: "rise", core: "flare", trail: "none", burst: "dome", reaction: "lift", aftermath: "ward", color: "#f59e0b", hot: "#fef3c7", aim: "self", voice: "holy" },
  fireball: { name: "Fireball", emblem: "🔥", charge: "gather", core: "orb", trail: "flame", burst: "flash", reaction: "flinch", aftermath: "burn", color: "#f97316", hot: "#fde68a", aim: "enemy", voice: "fire" },
  frost_lance: { name: "Frost Lance", emblem: "❄️", charge: "gather", core: "shard", trail: "frost", burst: "shatter", reaction: "flinch", aftermath: "chill", color: "#38bdf8", hot: "#e0f2fe", aim: "enemy", voice: "frost" },
  venom_volley: { name: "Venom Volley", emblem: "☠️", charge: "swirl", core: "orb", trail: "venom", burst: "splash", reaction: "stagger", aftermath: "poison", color: "#65a30d", hot: "#d9f99d", aim: "enemy", voice: "venom" },
  rending_blow: { name: "Rending Blow", emblem: "🩸", charge: "gather", core: "blade", trail: "streak", burst: "slash", reaction: "flinch", aftermath: "bleed", color: "#dc2626", hot: "#fecaca", aim: "enemy", voice: "steel" },
  thunderclap: { name: "Thunderclap", emblem: "⚡", charge: "swirl", core: "flare", trail: "none", burst: "bolt", reaction: "stagger", aftermath: "paralyze", color: "#facc15", hot: "#fefce8", aim: "enemy", voice: "thunder" },
  glacial_prison: { name: "Glacial Prison", emblem: "❄️", charge: "rise", core: "shard", trail: "frost", burst: "shatter", reaction: "stagger", aftermath: "freeze", color: "#7dd3fc", hot: "#f0f9ff", aim: "enemy", voice: "frost" },
  shield_wall: { name: "Shield Wall", emblem: "🛡️", charge: "rise", core: "flare", trail: "none", burst: "dome", reaction: "lift", aftermath: "ward", color: "#fbbf24", hot: "#fffbeb", aim: "self", voice: "holy" },
  war_cry: { name: "War Cry", emblem: "💢", charge: "rise", core: "flare", trail: "none", burst: "nova", reaction: "lift", aftermath: "rally", color: "#f43f5e", hot: "#fed7aa", aim: "self", voice: "war" },
  armor_break: { name: "Armor Break", emblem: "💔", charge: "gather", core: "blade", trail: "streak", burst: "shatter", reaction: "stagger", aftermath: "sunder", color: "#a855f7", hot: "#f5d0fe", aim: "enemy", voice: "steel" },
  second_wind: { name: "Second Wind", emblem: "💚", charge: "rise", core: "flare", trail: "none", burst: "nova", reaction: "lift", color: "#22c55e", hot: "#dcfce7", aim: "self", voice: "holy" },
  // Mobs' and bandits' Arts
  ambush: { name: "Ambush", emblem: "🗡️", charge: "none", core: "blade", trail: "streak", burst: "slash", reaction: "flinch", color: "#94a3b8", hot: "#f8fafc", aim: "enemy", voice: "steel" },
  venom_sting: { name: "Venom Sting", emblem: "🦂", charge: "gather", core: "shard", trail: "venom", burst: "splash", reaction: "flinch", aftermath: "poison", color: "#84cc16", hot: "#ecfccb", aim: "enemy", voice: "venom" },
  poison_blade: { name: "Poisoned Blade", emblem: "☠️", charge: "none", core: "blade", trail: "venom", burst: "slash", reaction: "flinch", aftermath: "poison", color: "#4d7c0f", hot: "#d9f99d", aim: "enemy", voice: "venom" },
  regenerate: { name: "Regenerate", emblem: "💚", charge: "rise", core: "none", trail: "none", burst: "nova", reaction: "lift", color: "#16a34a", hot: "#bbf7d0", aim: "self", voice: "beast" },
  dread_wail: { name: "Dread Wail", emblem: "👻", charge: "swirl", core: "none", trail: "none", burst: "nova", reaction: "stagger", aftermath: "paralyze", color: "#a5b4fc", hot: "#eef2ff", aim: "enemy", voice: "frost" },
  fire_breath: { name: "Fire Breath", emblem: "🐉", charge: "gather", core: "none", trail: "none", burst: "breath", reaction: "flinch", aftermath: "burn", color: "#ea580c", hot: "#fde68a", aim: "enemy", voice: "fire" },
  void_lash: { name: "Void Lash", emblem: "🌀", charge: "swirl", core: "blade", trail: "streak", burst: "slash", reaction: "stagger", aftermath: "sunder", color: "#7c3aed", hot: "#ddd6fe", aim: "enemy", voice: "thunder" },
  stone_gaze: { name: "Stone Gaze", emblem: "👁️", charge: "gather", core: "flare", trail: "none", burst: "dust", reaction: "stagger", aftermath: "freeze", color: "#a8a29e", hot: "#f5f5f4", aim: "enemy", voice: "sand" },
  raise_dead: { name: "Raise the Dead", emblem: "💀", charge: "rise", core: "flare", trail: "none", burst: "nova", reaction: "lift", color: "#4ade80", hot: "#d1fae5", aim: "self", voice: "venom" },
  blackpowder: { name: "Blackpowder Keg", emblem: "💣", charge: "gather", core: "orb", trail: "flame", burst: "rain", reaction: "flinch", aftermath: "burn", color: "#f59e0b", hot: "#fef3c7", aim: "enemy", voice: "fire" },
  // Finales (each world boss has its own)
  dawnbreaker: { name: "Dawnbreaker", emblem: "🌅", charge: "rise", core: "flare", trail: "streak", burst: "sunburst", reaction: "flinch", color: "#fbbf24", hot: "#fffbeb", aim: "enemy", finale: true, voice: "holy" },
  cataclysm: { name: "Cataclysm", emblem: "☄️", charge: "swirl", core: "orb", trail: "flame", burst: "rain", reaction: "flinch", aftermath: "burn", color: "#ef4444", hot: "#fed7aa", aim: "enemy", finale: true, voice: "fire" },
  maelstrom: { name: "Maelstrom", emblem: "🌊", charge: "swirl", core: "none", trail: "none", burst: "vortex", reaction: "stagger", aftermath: "chill", color: "#0ea5e9", hot: "#cffafe", aim: "enemy", finale: true, voice: "water" },
  sandstorm: { name: "Sandstorm", emblem: "🌪️", charge: "swirl", core: "none", trail: "none", burst: "dust", reaction: "stagger", aftermath: "sunder", color: "#d6a35c", hot: "#fef3c7", aim: "enemy", finale: true, voice: "sand" },
  wild_hunt: { name: "Wild Hunt", emblem: "🐺", charge: "rise", core: "none", trail: "none", burst: "pack", reaction: "flinch", aftermath: "bleed", color: "#4ade80", hot: "#ecfccb", aim: "enemy", finale: true, voice: "beast" },
  dragonfire: { name: "Dragonfire", emblem: "🐉", charge: "gather", core: "orb", trail: "flame", burst: "breath", reaction: "flinch", aftermath: "burn", color: "#f97316", hot: "#fef08a", aim: "enemy", finale: true, voice: "fire" },
  abyssal_grasp: { name: "Abyssal Grasp", emblem: "🐙", charge: "swirl", core: "none", trail: "none", burst: "tentacles", reaction: "stagger", aftermath: "freeze", color: "#7c3aed", hot: "#c4b5fd", aim: "enemy", finale: true, voice: "water" },
  sirens_requiem: { name: "Siren's Requiem", emblem: "🎵", charge: "swirl", core: "flare", trail: "none", burst: "song", reaction: "stagger", aftermath: "paralyze", color: "#22d3ee", hot: "#ecfeff", aim: "enemy", finale: true, voice: "frost" },
  devouring_maw: { name: "Devouring Maw", emblem: "🪱", charge: "none", core: "none", trail: "none", burst: "maw", reaction: "stagger", color: "#b45309", hot: "#fde68a", aim: "enemy", finale: true, voice: "sand" },
  stinger_storm: { name: "Stinger Storm", emblem: "🦂", charge: "gather", core: "shard", trail: "none", burst: "stingers", reaction: "flinch", aftermath: "poison", color: "#84cc16", hot: "#ecfccb", aim: "enemy", finale: true, voice: "venom" },
  grasping_roots: { name: "Grasping Roots", emblem: "🌳", charge: "rise", core: "none", trail: "none", burst: "roots", reaction: "stagger", aftermath: "bleed", color: "#15803d", hot: "#bbf7d0", aim: "enemy", finale: true, voice: "beast" },
  fae_glamour: { name: "Glamour of the Court", emblem: "🧚", charge: "swirl", core: "flare", trail: "none", burst: "petals", reaction: "stagger", aftermath: "chill", color: "#f472b6", hot: "#fdf2f8", aim: "enemy", finale: true, voice: "holy" },
  avalanche: { name: "Avalanche", emblem: "🏔️", charge: "none", core: "none", trail: "none", burst: "avalanche", reaction: "stagger", aftermath: "chill", color: "#94a3b8", hot: "#e2e8f0", aim: "enemy", finale: true, voice: "thunder" },
  petrifying_gaze: { name: "Petrifying Gaze", emblem: "👁️", charge: "gather", core: "flare", trail: "none", burst: "gaze", reaction: "stagger", aftermath: "freeze", color: "#84cc16", hot: "#f7fee7", aim: "enemy", finale: true, voice: "sand" }
};

/** Instincts that show (Cleave's cut, Enrage waking); stat Instincts are always on and have no moment to show */
export const INSTINCT_LOOKS: Record<string, SpellLook> = {
  cleave: { name: "Cleave", emblem: "🪓", charge: "none", core: "none", trail: "none", burst: "slash", reaction: "flinch", color: "#e2e8f0", hot: "#ffffff", aim: "enemy", voice: "steel" },
  enrage: { name: "Enrage", emblem: "💢", charge: "rise", core: "flare", trail: "none", burst: "nova", reaction: "lift", color: "#dc2626", hot: "#fca5a5", aim: "self", finale: true, voice: "beast" }
};

/** A status's look while it holds on an army */
export interface AftermathLook {
  name: string;
  /** What players see */
  text: string;
  color: string;
  hot: string;
}

export const AFTERMATH_LOOKS: Record<BattleStatusKind, AftermathLook> = {
  burn: { name: "Burning", text: "flames lick up through the ranks and embers rise", color: "#f97316", hot: "#fde68a" },
  poison: { name: "Poisoned", text: "green bubbles rise and burst in a sickly haze", color: "#65a30d", hot: "#bef264" },
  bleed: { name: "Bleeding", text: "red drops fall from the wounded", color: "#b91c1c", hot: "#fca5a5" },
  paralyze: { name: "Paralyzed", text: "sparks crackle and jump between the soldiers", color: "#facc15", hot: "#fefce8" },
  chill: { name: "Chilled", text: "frost drifts down in a pale mist", color: "#7dd3fc", hot: "#f0f9ff" },
  freeze: { name: "Frozen", text: "ice crystals stand round them, glinting", color: "#38bdf8", hot: "#ffffff" },
  ward: { name: "Warded", text: "a golden shimmer of shields round them", color: "#f59e0b", hot: "#fef3c7" },
  rally: { name: "Rallied", text: "red-gold sparks stream up off the ranks", color: "#f43f5e", hot: "#fed7aa" },
  sunder: { name: "Sundered", text: "violet flakes of broken armour fall away", color: "#a855f7", hot: "#f5d0fe" }
};

/** What each stage option looks like, for the Sparring Grounds and the Guide Book */
export const STAGE_TEXT = {
  charge: {
    gather: "its colour is pulled out of the air into the caster's hand",
    swirl: "motes spiral in round the caster",
    rise: "light rises off the ground round the caster",
    none: "no wind-up"
  } as Record<ChargeLook, string>,
  core: {
    orb: "a hot ball swells in the hand",
    shard: "a spike of ice grows",
    blade: "the weapon glows along its edge",
    flare: "a bright flare over the caster",
    none: "no core"
  } as Record<CoreLook, string>,
  trail: {
    flame: "tongues of flame behind it",
    frost: "glittering frost behind it",
    venom: "drops of venom flung behind several bolts",
    streak: "a thin streak of light",
    none: "nothing flies: it lands at once"
  } as Record<TrailLook, string>,
  burst: {
    flash: "a flash and sparks over the enemy",
    shatter: "shards burst out",
    splash: "a green splash over every enemy army",
    slash: "a cut of light across their line",
    bolt: "lightning strikes from above",
    dome: "a dome of shields closes round the caster",
    nova: "a ring of light bursts out from the caster",
    sunburst: "a blinding sunrise sweeps rays over every enemy",
    rain: "burning stones rain from the sky",
    vortex: "a whirlpool of water spins round the enemy",
    dust: "a wall of sand swirls over the enemy",
    pack: "spectral wolves run down on the enemy",
    breath: "fire pours from the caster: a short, narrow jet (an Art), a long cone over the whole enemy that leaves the ground burning (a Finale)",
    tentacles: "tentacles burst up through the enemy, sway and drag it down",
    song: "rings of song roll out over the enemy, notes drifting through them",
    maw: "the ground gapes under the enemy front, a ring of teeth closing round it",
    stingers: "stingers rain straight down on every enemy army",
    roots: "roots race along the ground and thorns spear up through the enemy",
    petals: "a whirl of glowing petals wraps the enemy and drifts down on it",
    avalanche: "a slide of snow and ice pours down across the enemy",
    gaze: "twin beams from the caster's eyes, and the enemy crusts over in grey stone"
  } as Record<BurstLook, string>,
  reaction: {
    flinch: "the enemy flashes white and flinches",
    stagger: "the enemy is jolted, rocked by the blow",
    lift: "the caster's side glows, lifted",
    none: "no reaction"
  } as Record<ReactionLook, string>
};

/** A cast's look: an Art or Finale by its `fx` id, else an Instinct by its id */
export const lookOf = (fx: string | undefined, id: string): SpellLook | undefined => (fx ? SPELL_LOOKS[fx] : undefined) ?? SPELL_LOOKS[id] ?? INSTINCT_LOOKS[id];

/** Seconds after a cast starts that its bolt lands */
export function impactAt(look: SpellLook): number {
  const wind = look.charge === "none" ? 0 : look.finale ? 0.9 : 0.6;
  return wind + (look.aim === "self" || look.trail === "none" ? 0.15 : 0.5);
}
