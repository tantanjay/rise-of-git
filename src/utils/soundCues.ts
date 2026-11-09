import { sound } from "@/hooks/useSound";

export type SoundCueId = "click" | "levelUp" | "defeat" | "herald" | "harvest" | "water" | "step" | "squash" | "spellCast" | "spellImpact" | "finaleHorn";

/** Every sound cue in useSound.ts, for the Royal Codex's Game sounds tab */
export interface SoundCue {
  id: SoundCueId;
  name: string;
  emblem: string;
  /** What the little model on its stage is doing */
  description: string;
  /** Where the game plays it (null: in the sound library, not played in the game yet) */
  heard: string | null;
  /** How it is made (Web Audio synthesis) */
  voice: string;
}

export const SOUND_CUES: SoundCue[] = [
  {
    id: "click",
    name: "The Smith's Tap",
    emblem: "🔨",
    description: "A smith taps the anvil and a few sparks jump: one short tick for every button and menu.",
    heard: "Buttons, menus, tabs, picking a kingdom, closing notices",
    voice: "One 30 ms triangle blip at 600 Hz"
  },
  {
    id: "levelUp",
    name: "Victory Fanfare",
    emblem: "🎺",
    description: "Soldiers cheer round their banner while golden sparks rise: things went your way.",
    heard: "A march or caravan sent off, an improvement bought, a Royal Proclamation given, the garrison set, a void ritual, a civilization changed or swapped, plots swapped, a battle won (or a raid on you repelled), admin and decree actions done",
    voice: "Four rising square-wave notes, A4 → A5"
  },
  {
    id: "defeat",
    name: "The Fallen Standard",
    emblem: "🥀",
    description: "The standard leans broken over the fallen while the last soldier stands alone.",
    heard: "One of your marches was repelled (with the red Chronicle alert)",
    voice: "Three falling sawtooth notes, like a fading horn"
  },
  {
    id: "herald",
    name: "The Herald's Call",
    emblem: "📯",
    description: "The realm's news unrolls on the proclamation board while the herald stands by to read it.",
    heard: "A new herald notice arrives; an announcement is proclaimed",
    voice: "A short rising horn fanfare, G4 → E5"
  },
  {
    id: "harvest",
    name: "The Coin Spill",
    emblem: "🪙",
    description: "Coins leap out of an open chest and rain down on the pile while a farmer sorts the haul.",
    heard: null,
    voice: "Four quick triangle notes up a C major chord"
  },
  {
    id: "water",
    name: "The Village Well",
    emblem: "💧",
    description: "Droplets sparkle up from the well as a villager draws water.",
    heard: null,
    voice: "Four sine bubbles that bend upwards"
  },
  {
    id: "step",
    name: "Marching Feet",
    emblem: "👣",
    description: "Two files of soldiers march up and down the road.",
    heard: null,
    voice: "A soft 40 ms sine thump, 120 → 60 Hz"
  },
  {
    id: "squash",
    name: "Squash!",
    emblem: "🟢",
    description: "A footman whacks a slime, which flattens and bounces back.",
    heard: null,
    voice: "A falling sawtooth splat, 280 → 70 Hz"
  },
  {
    id: "spellCast",
    name: "The Spell's Whoosh",
    emblem: "🔥",
    description: "A battle mage pulls fire out of the air and flings a fireball at a straw foe.",
    heard: "A Battle Art is cast in a battle near the camera on the world map, and every cast in the Sparring Grounds",
    voice: "A burst of noise swept up through a band-pass filter; its pitch is the Art's voice (fire low, frost high)"
  },
  {
    id: "spellImpact",
    name: "The Spell's Boom",
    emblem: "💥",
    description: "A frost lance strikes a straw foe and bursts into shards.",
    heard: "A Battle Art lands (its burst), on the map near the camera and in the Sparring Grounds",
    voice: "A falling sine thump under a crack of filtered noise, with a ringing overtone for frost, steel and holy light"
  },
  {
    id: "finaleHorn",
    name: "The Finale's Horn",
    emblem: "🎺",
    description: "A champion's Finale: a sun rises over the ranks and its rays sweep down on the foe.",
    heard: "A Finale is cast (a boss rears up in its battle cry), on the map near the camera and in the Sparring Grounds",
    voice: "Three sawtooth horn notes, G3 B3 D4, over the whoosh"
  }
];

const PLAYERS: Record<SoundCueId, () => void> = {
  click: () => sound.playClick(),
  levelUp: () => sound.playLevelUp(),
  defeat: () => sound.playDefeat(),
  herald: () => sound.playHerald(),
  harvest: () => sound.playHarvest(),
  water: () => sound.playWater(),
  step: () => sound.playStep(),
  squash: () => sound.playSquash(),
  spellCast: () => sound.playSpell("cast", "fire"),
  spellImpact: () => sound.playSpell("impact", "frost"),
  finaleHorn: () => sound.playSpell("finale", "holy")
};

/** Plays a cue on request, even while game sounds are switched off (the ▶ button is an explicit ask) */
export function playCue(id: SoundCueId) {
  const was = sound.enabled;
  sound.enabled = true;
  try {
    PLAYERS[id]();
  } finally {
    sound.enabled = was;
  }
}
