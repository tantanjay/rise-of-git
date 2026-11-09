import { CivilizationType } from "@/types";

/* ------------------------------------------------------------------------- */
/* Each civilization's three soundtracks, written as scores the synthesized   */
/* orchestra in soundtrackEngine.ts plays. A track is a loop of measures;     */
/* a measure lists its notes as [beat, instrument, notes, beats long, loud].  */
/* ------------------------------------------------------------------------- */

export type Voice =
  | "lead"
  | "flute"
  | "harp"
  | "lute"
  | "strings"
  | "stacc"
  | "horns"
  | "brass"
  | "choir"
  | "glass"
  | "drum"
  | "tick"
  | "snare"
  | "anvil"
  | "chime"
  | "gong";

/** [beat in the measure, instrument, notes ("D3 A3", "" for drums), length in beats, loudness (default 1)] */
export type NoteEvent = [number, Voice, string, number, number?];

export interface Measure {
  /** Caption shown under the radio while it plays */
  desc: string;
  /** Instruments heard in it */
  instrument: string;
  events: NoteEvent[];
  /** Beats in this measure (default: the track's) */
  beats?: number;
}

export interface SoundtrackTrack {
  id: string;
  civ: CivilizationType;
  title: string;
  /** Realm theme, battle, lament… */
  mood: string;
  key: string;
  bpm: number;
  /** Beats per measure */
  beats: number;
  /** Low notes held under the whole track */
  drone: string[];
  summary: string;
  steps: Measure[];
}

/* Score helpers ------------------------------------------------------------ */

/** One chord (or note) */
const at = (beat: number, voice: Voice, notes: string, dur: number, vel = 1): NoteEvent[] => [[beat, voice, notes, dur, vel]];

/** A melody: notes one after another ("-" rests), each with its length in beats */
function seq(voice: Voice, start: number, notes: string, durs: number | number[], vel = 1): NoteEvent[] {
  const out: NoteEvent[] = [];
  let beat = start;
  notes.split(" ").forEach((n, i) => {
    const d = Array.isArray(durs) ? durs[i] ?? durs[durs.length - 1] : durs;
    if (n !== "-") out.push([beat, voice, n, d, vel]);
    beat += d;
  });
  return out;
}

/** A broken chord cycling through its notes every `every` beats, `count` times */
function arp(voice: Voice, start: number, notes: string, every: number, count: number, vel = 0.8): NoteEvent[] {
  const ns = notes.split(" ");
  return Array.from({ length: count }, (_, i) => [start + i * every, voice, ns[i % ns.length], every, vel] as NoteEvent);
}

/** Drum or percussion hits on the given beats */
const hits = (voice: Voice, beats: number[], note = "", vel = 1): NoteEvent[] => beats.map((b) => [b, voice, note, 1, vel] as NoteEvent);

function m(desc: string, instrument: string, ...groups: NoteEvent[][]): Measure {
  return { desc, instrument, events: groups.flat() };
}

/* The scores --------------------------------------------------------------- */

const lute = (notes: string, vel = 0.75) => arp("lute", 0, notes, 0.5, 8, vel);
const harp = (notes: string, vel = 0.7) => arp("harp", 0, notes, 0.5, 8, vel);
const march = (notes: string, vel = 0.9) => seq("stacc", 0, notes, 0.5, vel);
/** Smiths' hammers: high strike, low answer */
const hammers = (vel = 0.8) => [...hits("anvil", [0, 2], "D6", vel), ...hits("anvil", [1.5, 3.5], "A5", vel * 0.7)];
const warBeat = (vel = 0.9) => [...hits("drum", [0, 0.75, 1.5, 2, 3], "", vel), ...hits("drum", [3.5], "A2", vel * 0.7)];
const ritual = (vel = 0.35) => hits("tick", [0, 0.75, 1.5, 2, 3], "C#6", vel);

export const SOUNDTRACKS: SoundtrackTrack[] = [
  /* ---------------------------------------------------------------- Human */
  {
    id: "human-1",
    civ: "human",
    title: "The Dawn Banner",
    mood: "Realm theme",
    key: "D Major",
    bpm: 84,
    beats: 4,
    drone: ["D1", "D2", "A2"],
    summary: "Horns call from the walls of Valoria and the trumpets answer: the realm's anthem, rising to a full fanfare.",
    steps: [
      m("Horns call from the walls of Valoria", "French Horns & Strings", at(0, "horns", "D3 A3 D4", 4), at(0, "strings", "D2 A2 F#3", 4), hits("drum", [0, 2.5, 3], "", 0.7)),
      m("Trumpets answer, rising D – F♯ – A", "Brass Fanfare", seq("brass", 0, "D4 F#4 A4", [1, 1, 2]), at(0, "strings", "G2 D3 B3", 4), hits("drum", [0]), hits("tick", [2, 3], "", 0.5)),
      m("The melody climbs to B and steps down to F♯", "Solo Reed, Lute & Strings", seq("lead", 0, "B4 A4 G4 F#4", [1.5, 0.5, 1, 1]), at(0, "strings", "E2 B2 G3", 4), arp("lute", 0, "E3 G3 B3", 1, 4)),
      m("A half cadence: the realm stands ready", "Horns & Reed", at(0, "horns", "A2 E3 C#4", 4), seq("lead", 0, "E4 A4", [2, 2]), hits("drum", [0, 3], "", 0.8)),
      m("Second verse over a walking lute", "Lute, Reed & Strings", at(0, "strings", "B1 F#2 D3", 4), seq("lead", 0, "D5 C#5 B4", [1, 1, 2]), lute("B2 F#3 B3 D4")),
      m("A lift to G as the hosts gather", "Reed, Lute & Brass", at(0, "strings", "G1 D2 B2", 4), seq("lead", 0, "B4 D5 G5", [1, 1, 2]), at(2, "brass", "G3 D4", 2, 0.7), lute("G2 D3 G3 B3")),
      m(
        "The Dawn Banner unfurls: full fanfare",
        "Full Orchestra",
        at(0, "brass", "D4 F#4 A4", 2),
        at(2, "brass", "E4 G4 B4", 1),
        at(3, "brass", "F#4 A4 C#5", 1),
        at(0, "horns", "D3 A3", 4),
        at(0, "strings", "D2 A2", 4),
        hits("drum", [0, 1, 2, 3], "", 0.9),
        hits("snare", [1.5, 3.5], "", 0.6)
      ),
      m("Home to D as the high keep's bell rings out", "Bells, Horns & Strings", at(0, "strings", "D2 A2 D3 F#3", 4), at(0, "horns", "D3 A3 D4", 4, 0.8), at(0, "chime", "D5", 3, 0.8), at(0, "gong", "", 3, 0.5), at(0, "lead", "D5", 4, 0.9), hits("drum", [0]))
    ]
  },
  {
    id: "human-2",
    civ: "human",
    title: "Valoria at Harvest",
    mood: "Pastoral",
    key: "G Major",
    bpm: 100,
    beats: 4,
    drone: ["G1", "G2", "D3"],
    summary: "Lutes on the village green, a flute for the reapers and the chapel bells: a full granary is a human's greatest weapon.",
    steps: [
      m("Lutes strike up on the village green", "Lute", lute("G3 B3 D4 B3"), hits("tick", [0, 2], "A5", 0.3)),
      m("A flute joins the reapers' tune", "Flute & Lute", seq("flute", 0, "D5 B4 G4 A4 B4", [1, 0.5, 0.5, 1, 1]), lute("G3 B3 D4 B3")),
      m("Over to C as the carts roll in", "Flute, Lute & Strings", seq("flute", 0, "C5 E5 D5 C5", 1), lute("C3 E3 G3 E3"), at(0, "strings", "C2 G2", 4, 0.6)),
      m("A turn in the dance on D", "Flute, Lute & Strings", seq("flute", 0, "B4 A4 G4", [1, 1, 2]), lute("D3 F#3 A3 F#3"), at(0, "strings", "D2 A2", 4, 0.6)),
      m("The reapers sing back", "Strings, Flute & Lute", at(0, "strings", "E2 B2 G3", 4, 0.8), seq("flute", 0, "G5 F#5 E5 D5", [0.5, 0.5, 1, 2]), lute("E3 G3 B3 G3")),
      m("Harvest bells from the chapel", "Bells, Flute & Lute", at(0, "chime", "G5", 2, 0.5), at(2, "chime", "D5", 2, 0.5), seq("flute", 0, "E5 D5 C5 B4", 1), lute("C3 E3 G3 E3")),
      m("Everyone dances the last round", "Full Village Band", seq("flute", 0, "A4 B4 C5 D5", [0.5, 0.5, 0.5, 2.5]), lute("D3 F#3 A3 C4"), hits("tick", [0, 1, 2, 3], "A5", 0.35), hits("drum", [0, 2], "D3", 0.4)),
      m("Sheaves bound, the day's work done", "Flute, Lute & Horn", seq("flute", 0, "B4 G4", [2, 2], 0.9), at(0, "horns", "G2 D3 G3", 4, 0.6), at(0, "lute", "G3 B3 D4 G4", 1))
    ]
  },
  {
    id: "human-3",
    civ: "human",
    title: "March of Many Hands",
    mood: "War march",
    key: "D Minor",
    bpm: 112,
    beats: 4,
    drone: ["D1", "D2"],
    summary: "Snares beat the muster and ten thousand feet fall into step: the human host marches as one behind its grain wagons.",
    steps: [
      m("Drums beat the muster", "Snare & War Drums", hits("snare", [0, 0.5, 1, 2, 2.5, 3], "", 0.55), hits("drum", [0, 2])),
      m("Low strings set the pace", "Spiccato Strings & Drums", march("D2 D2 F2 D2 A1 A1 C2 A1"), hits("snare", [1, 3], "", 0.6), hits("drum", [0, 2])),
      m("Trumpets sound the call to arms", "Brass & Strings", seq("brass", 0, "D4 D4 F4 A4", [1, 0.5, 0.5, 2]), march("D2 D2 F2 D2 A1 A1 C2 A1"), hits("drum", [0, 2]), hits("snare", [1, 3], "", 0.6)),
      m("The column wheels through B♭ and C", "Brass & Strings", at(0, "brass", "Bb3 D4 F4", 2), at(2, "brass", "C4 E4 G4", 2), march("Bb1 Bb1 D2 Bb1 C2 C2 E2 C2"), hits("drum", [0, 2]), hits("snare", [1, 3], "", 0.6)),
      m("Ten thousand feet, one step", "Horns, Reed & Strings", at(0, "horns", "D3 F3 A3", 4), seq("lead", 0, "A4 G4 F4 E4", 1), march("D2 D2 F2 D2 A1 A1 C2 A1"), hits("snare", [0, 0.5, 1, 2, 2.5, 3], "", 0.5)),
      m("The banner swings to F", "Horns, Reed & Strings", at(0, "horns", "F3 A3 C4", 4), seq("lead", 0, "F4 G4 A4", [1, 1, 2]), march("F1 F1 A1 F1 C2 C2 A1 C2"), hits("drum", [0, 2]), hits("snare", [1, 3], "", 0.6)),
      m(
        "Charge! Full brass over the drums",
        "Full Orchestra",
        seq("brass", 0, "D5 C5 Bb4 A4", 1),
        at(0, "brass", "D4 F4", 4, 0.6),
        march("D2 D2 F2 D2 A1 A1 C2 A1"),
        hits("drum", [0, 1, 2, 3]),
        hits("snare", [0.5, 1.5, 2.5, 3.5], "", 0.6)
      ),
      m("Halt on A, ready for the next march", "Brass, Drums & Gong", at(0, "brass", "A3 C#4 E4", 4), at(0, "strings", "A1 E2 A2", 4), hits("drum", [0]), at(0, "gong", "", 3, 0.6))
    ]
  },

  /* ------------------------------------------------------------------ Elf */
  {
    id: "elf-1",
    civ: "elf",
    title: "Glades of Sylvandale",
    mood: "Realm theme",
    key: "E Dorian",
    bpm: 72,
    beats: 4,
    drone: ["E1", "E2", "B2"],
    summary: "Harp strings fall like leaves, a flute wakes the glade and an ancient choir hums under the trees of Sylvandale.",
    steps: [
      m("Harp strings fall like leaves", "Elven Harp & Glass", harp("E3 B3 E4 F#4 G4 F#4 E4 B3"), at(0, "glass", "E5 B5", 4, 0.4)),
      m("A flute wakes the glade", "Flute & Harp", seq("flute", 0, "B4 E5 F#5 E5", [1.5, 0.5, 1, 1]), harp("E3 B3 E4 F#4 G4 F#4 E4 B3")),
      m("Over to A: sunlight through the canopy", "Flute, Harp & Choir", harp("A2 E3 A3 C#4 E4 C#4 A3 E3"), seq("flute", 0, "G5 F#5 E5", [1, 1, 2]), at(0, "choir", "A3 C#4 E4", 4, 0.6)),
      m("The melody rests on D", "Flute, Harp & Strings", harp("D3 A3 D4 F#4 A4 F#4 D4 A3"), seq("flute", 0, "F#5 D5", [2, 2]), at(0, "strings", "D2 A2", 4, 0.5)),
      m("The old choir hums under the trees", "Choir, Harp & Bells", at(0, "choir", "E3 G3 B3", 4), harp("E3 B3 E4 F#4 G4 F#4 E4 B3", 0.55), at(0, "chime", "B5", 2, 0.4)),
      m("A brighter turn to G", "Flute, Choir & Harp", at(0, "choir", "G3 B3 D4", 4, 0.8), seq("flute", 0, "D5 E5 F#5 G5", 1), harp("G2 D3 G3 B3 D4 B3 G3 D3")),
      m(
        "All of Sylvandale sings",
        "Full Grove",
        seq("flute", 0, "A5 G5 F#5 E5", [1, 0.5, 0.5, 2]),
        at(0, "choir", "A3 C#4 E4", 4),
        at(0, "strings", "A1 E2 A2", 4, 0.7),
        harp("A2 E3 A3 C#4 E4 C#4 A3 E3"),
        at(0, "glass", "E6", 4, 0.3)
      ),
      m("Home to E, where the moonwells shine", "Harp, Glass & Choir", at(0, "harp", "E3 B3 E4 G4 B4", 1), at(0, "glass", "E5 B5 E6", 4, 0.5), at(0, "choir", "E3 B3", 4, 0.6), at(2, "chime", "E6", 2, 0.4))
    ]
  },
  {
    id: "elf-2",
    civ: "elf",
    title: "Echoes of the Thousand Years",
    mood: "Lament",
    key: "B Minor",
    bpm: 58,
    beats: 4,
    drone: ["B1", "F#2", "B2"],
    summary: "A lone flute remembers a hundred wars: the lament of a people so old that every ranger has buried a kingdom.",
    steps: [
      m("A lone flute remembers", "Solo Flute & Glass", seq("flute", 0, "F#5 E5 D5", [2, 1, 1]), at(0, "glass", "B4 F#5", 4, 0.35)),
      m("Strings answer softly", "Flute & Strings", at(0, "strings", "B2 F#3 D4", 4, 0.7), seq("flute", 0, "C#5 B4", [2, 2])),
      m("The choir of the old ones", "Choir, Strings & Flute", at(0, "choir", "G3 B3 D4", 4), at(0, "strings", "G2 D3", 4, 0.6), seq("flute", 0, "D5 E5 F#5", [1, 1, 2])),
      m("Grief turns to F♯", "Choir, Harp & Flute", at(0, "choir", "F#3 A#3 C#4", 4), at(0, "harp", "F#3 C#4 F#4 A#4", 1), seq("flute", 0, "A#4 C#5", [2, 2])),
      m("A hundred wars in one melody", "Flute, Strings & Bells", at(0, "strings", "E2 B2 G3", 4), seq("flute", 0, "G5 F#5 E5 D5", 1), at(0, "chime", "B5", 3, 0.4)),
      m("The harp counts the centuries", "Harp, Choir & Flute", harp("D3 F#3 A3 D4 F#4 D4 A3 F#3", 0.6), at(0, "choir", "D3 F#3 A3", 4, 0.7), at(0, "flute", "F#5", 4, 0.7)),
      m("The lament rises once more", "Full Strings & Choir", at(0, "strings", "G1 D2 B2 G3", 4), at(0, "choir", "B3 D4 G4", 4), seq("flute", 0, "B5 A5 G5 F#5", 1)),
      m("Silence returns to the glade", "Glass & Harp", at(0, "glass", "B4 D5 F#5", 4, 0.5), at(0, "harp", "B2 F#3 B3 D4 F#4", 1, 0.7), at(2, "chime", "F#5", 2, 0.3))
    ]
  },
  {
    id: "elf-3",
    civ: "elf",
    title: "Moonbow Vigil",
    mood: "Battle",
    key: "E Minor",
    bpm: 120,
    beats: 4,
    drone: ["E1", "E2"],
    summary: "Rangers string their bows at the treeline: quick harps, darting flutes and a volley under the moonbow.",
    steps: [
      m("Rangers string their bows", "Harp & Spiccato Strings", arp("harp", 0, "E4 B4 G4 B4", 0.5, 8, 0.6), march("E2 E2 E2 E2 E2 E2 G2 F#2", 0.75)),
      m("Arrows in the dark", "Flute & Harp", seq("flute", 0, "E5 F#5 G5 B5 A5 G5", [0.5, 0.5, 1, 1, 0.5, 0.5]), arp("harp", 0, "E4 B4 G4 B4", 0.5, 8, 0.6), hits("drum", [0, 2], "", 0.6)),
      m("Down to C, through the thorns", "Strings, Harp & Flute", arp("harp", 0, "C4 G4 E4 G4", 0.5, 8, 0.6), march("C2 C2 C2 C2 C2 C2 E2 D2", 0.75), seq("flute", 0, "G5 E5", [2, 2]), hits("drum", [0, 2], "", 0.6)),
      m("A glint of moonlit steel on D", "Brass, Harp & Strings", arp("harp", 0, "D4 A4 F#4 A4", 0.5, 8, 0.6), at(0, "brass", "D4 F#4 A4", 2, 0.6), at(2, "brass", "D4 G4 B4", 2, 0.6), march("D2 D2 D2 D2 D2 D2 F#2 E2", 0.75)),
      m("The vigil holds the treeline", "Choir, Strings & Rattles", at(0, "choir", "E3 G3 B3", 4, 0.8), march("E2 E2 E2 E2 E2 E2 G2 F#2", 0.75), hits("tick", [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], "E6", 0.22)),
      m(
        "Volley!",
        "Full Grove at War",
        seq("flute", 0, "B5 A5 G5 F#5 E5", [0.5, 0.5, 0.5, 0.5, 2]),
        march("C2 C2 C2 C2 C2 C2 E2 D2", 0.8),
        hits("drum", [0, 1, 2, 3], "", 0.7),
        arp("harp", 0, "C4 G4 E4 G4", 0.5, 8, 0.6)
      ),
      m("The moonbow flares", "Brass, Flute & Glass", at(0, "brass", "B3 D#4 F#4", 4, 0.7), at(0, "glass", "B5 F#6", 4, 0.4), seq("flute", 0, "F#5 G5 A5 B5", 1), hits("drum", [0, 2, 3], "", 0.7)),
      m("The forest falls quiet again", "Harp, Strings & Gong", at(0, "harp", "E3 B3 E4 G4 B4", 1), at(0, "gong", "", 3, 0.4), at(0, "strings", "E2 B2 E3", 4, 0.6), at(0, "chime", "E6", 2, 0.4))
    ]
  },

  /* ---------------------------------------------------------------- Dwarf */
  {
    id: "dwarf-1",
    civ: "dwarf",
    title: "Halls of Ironforge",
    mood: "Realm theme",
    key: "C Minor",
    bpm: 66,
    beats: 4,
    drone: ["C1", "C2", "G2"],
    summary: "Deep voices in the mountain, horns echoing down stone halls and the forge-fires catching: the anthem of the mountain halls.",
    steps: [
      m("Deep voices in the mountain", "Low Choir & Drum", at(0, "choir", "C2 G2 C3", 4), hits("drum", [0], "", 0.8)),
      m("The forge-fires catch", "Choir & Anvils", at(0, "choir", "C2 G2 Eb3", 4), hits("anvil", [1, 3], "", 0.6)),
      m("Horns echo through the halls", "Horns & Choir", at(0, "horns", "Ab2 Eb3 C4", 4), at(0, "choir", "Ab1 Eb2", 4, 0.7), hits("drum", [0, 2], "", 0.7)),
      m("A stone-deep answer on G", "Horns, Strings & Anvil", at(0, "horns", "G2 D3 B3", 4), at(0, "strings", "G1 D2 G2", 4), hits("anvil", [2], "", 0.6)),
      m("The king's theme in the low brass", "Brass, Choir & Drums", seq("brass", 0, "C3 Eb3 G3 F3", 1, 0.8), at(0, "choir", "C2 G2", 4), hits("drum", [0, 2]), hits("anvil", [3], "", 0.5)),
      m("Gold in the deep: E♭ major", "Brass, Horns & Anvils", at(0, "brass", "Eb3 G3 Bb3", 2, 0.7), at(2, "horns", "Bb2 F3 D4", 2), at(0, "choir", "Eb2 Bb2", 4), hits("anvil", [1, 3], "", 0.6)),
      m("The mountain answers: full chorus", "Choir, Brass & Drums", at(0, "choir", "C3 Eb3 G3", 4), seq("brass", 0, "G3 Ab3 G3 F3", 1), hits("drum", [0, 1, 2, 3], "", 0.9), hits("anvil", [0, 2], "", 0.8)),
      m("Home to C: the great doors shut with a boom", "Choir, Horns & Gong", at(0, "choir", "C2 G2 C3", 4), at(0, "horns", "C3 G3 C4", 4, 0.8), at(0, "gong", "", 3, 0.6), hits("drum", [0], "", 1.1))
    ]
  },
  {
    id: "dwarf-2",
    civ: "dwarf",
    title: "The Anvil Song",
    mood: "Work song",
    key: "A Minor",
    bpm: 104,
    beats: 4,
    drone: ["A1", "A2"],
    summary: "Hammers find the beat and the smiths hum along: a forge work song, one ingot at a time, until the quench.",
    steps: [
      m("Hammers find the beat", "Anvils & Drum", hammers(), hits("drum", [0, 2], "", 0.6)),
      m("The smiths start humming", "Anvils & Choir", hammers(), seq("choir", 0, "A2 C3 E3 D3", 1, 0.8)),
      m("Second line, down to G", "Choir, Strings & Anvils", hammers(), seq("choir", 0, "D3 C3 B2 G2", 1, 0.8), at(0, "strings", "G1 D2", 4, 0.5)),
      m("The bellows breathe", "Horns, Choir & Anvils", at(0, "horns", "F2 C3 A3", 4, 0.8), at(0, "choir", "F2 A2 C3", 4, 0.7), hammers()),
      m("Back to A, louder now", "Brass, Anvils & Drum", seq("brass", 0, "A3 C4 E4 D4", 1, 0.7), hammers(0.9), hits("drum", [0, 2], "", 0.7)),
      m("One more ingot", "Brass, Choir & Anvils", seq("brass", 0, "C4 B3 G3", [1, 1, 2], 0.7), at(0, "choir", "G2 B2 D3", 4), hammers()),
      m("Everyone strikes together", "Full Forge", hammers(1), hits("anvil", [0.5, 2.5], "E6", 0.5), at(0, "brass", "E3 G#3 B3", 4, 0.7), hits("drum", [0, 1, 2, 3], "", 0.8), at(0, "choir", "E2 B2", 4)),
      m("Quench! Steam and a last ring", "Anvil, Gong & Choir", hits("anvil", [0], "A5", 1), at(0, "gong", "", 2, 0.4), at(0, "choir", "A2 E3 A3", 4), at(0, "horns", "A2 E3", 4, 0.7))
    ]
  },
  {
    id: "dwarf-3",
    civ: "dwarf",
    title: "Oath at the Pass",
    mood: "Battle",
    key: "C Minor",
    bpm: 108,
    beats: 4,
    drone: ["C1", "C2"],
    summary: "Shields lock across the mountain pass and the oath is sworn: not one step back, whatever comes up the road.",
    steps: [
      m("Shields lock across the pass", "War Drums", hits("drum", [0, 1.5, 2, 3]), hits("snare", [3.5], "", 0.5)),
      m("The oath is sworn", "Low Choir & Drums", at(0, "choir", "C2 G2 C3", 4), hits("drum", [0, 1.5, 2, 3])),
      m("Strings drive like a battering ram", "Spiccato Strings & Drums", march("C2 C2 C2 Eb2 C2 C2 G1 Bb1"), hits("drum", [0, 2])),
      m("Horns blast from the ramparts", "Horns, Strings & Drums", at(0, "horns", "C3 G3 C4", 2), at(2, "horns", "Bb2 F3 D4", 2), march("C2 C2 C2 Eb2 C2 C2 G1 Bb1"), hits("drum", [0, 1.5, 2, 3])),
      m("The charge breaks on the shield wall", "Brass, Anvils & Strings", seq("brass", 0, "G3 Ab3 G3 F3 Eb3", [0.5, 0.5, 1, 1, 1]), hits("anvil", [1, 3], "", 0.6), march("C2 C2 C2 Eb2 C2 C2 G1 Bb1"), hits("drum", [0, 2])),
      m("Hold! Hold!", "Choir, Brass & Drums", at(0, "choir", "Ab2 C3 Eb3", 4), at(0, "brass", "Ab3 C4 Eb4", 2, 0.7), at(2, "brass", "Bb3 D4 F4", 2, 0.7), march("Ab1 Ab1 Ab1 Ab1 Ab1 Ab1 Bb1 Bb1"), hits("drum", [0, 1, 2, 3])),
      m(
        "Not one step back",
        "Full Host",
        at(0, "brass", "C4 Eb4 G4", 4, 0.9),
        at(0, "choir", "C3 G3", 4),
        march("C2 C2 C2 Eb2 C2 C2 G1 Bb1"),
        hits("drum", [0, 0.5, 1, 2, 2.5, 3]),
        hits("snare", [1.5, 3.5], "", 0.6)
      ),
      m("The pass holds", "Horns, Gong & Drums", at(0, "horns", "C3 G3 C4", 4), at(0, "gong", "", 3, 0.7), hits("drum", [0], "", 1.2), hits("anvil", [2], "", 0.6))
    ]
  },

  /* ------------------------------------------------------------------ Orc */
  {
    id: "orc-1",
    civ: "orc",
    title: "Drums of Drak'mar",
    mood: "Realm theme",
    key: "E Phrygian",
    bpm: 90,
    beats: 4,
    drone: ["E1", "E2", "B2"],
    summary: "War drums wake the camp, bone horns answer and a raw reed cries over the fires of Drak'mar.",
    steps: [
      m("War drums wake the camp", "War Drums", warBeat()),
      m("Horns of bone answer", "Bone Horns & Drums", at(0, "horns", "E2 B2 E3", 4), warBeat()),
      m("A raw reed cries over the fires", "Reed, Strings & Drums", seq("lead", 0, "E4 F4 E4 D4 E4", [1, 0.5, 0.5, 1, 1]), warBeat(0.8), at(0, "strings", "E2 B2", 4, 0.6)),
      m("Down to F: the Phrygian snarl", "Brass, Reed & Drums", at(0, "brass", "F2 C3 F3", 4, 0.8), seq("lead", 0, "F4 G4 F4", [1, 1, 2]), warBeat(0.8)),
      m("The chieftain's chant", "Choir, Reed & Drums", at(0, "choir", "E2 B2 E3", 4), seq("lead", 0, "B4 A4 G4 F4", 1), warBeat(0.8)),
      m("Grunts and stamping feet", "Low Brass & Drums", seq("brass", 0, "E2 E2 F2 E2", 1, 0.8), hits("snare", [0.5, 1.5, 2.5, 3.5], "", 0.5), hits("drum", [0, 1, 2, 3])),
      m(
        "The horde roars as one",
        "Full Horde",
        at(0, "brass", "E3 B3 E4", 2),
        at(2, "brass", "F3 C4 F4", 2),
        at(0, "choir", "E3 B3", 4),
        seq("lead", 0, "E5 D5 C5 B4", 1),
        hits("drum", [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], "", 0.7)
      ),
      m("Ash settles on Drak'mar", "Gong, Horns & Drum", at(0, "gong", "", 3, 0.7), at(0, "horns", "E2 B2 E3", 4), hits("drum", [0], "", 1.2), at(0, "lead", "E4", 4, 0.8))
    ]
  },
  {
    id: "orc-2",
    civ: "orc",
    title: "Blood Fury",
    mood: "Battle",
    key: "E Minor",
    bpm: 138,
    beats: 4,
    drone: ["E1", "E2"],
    summary: "The berserkers' frenzy: pounding drums, snarling brass and a war-chant that only grows louder.",
    steps: [
      m("Frenzy rising", "Spiccato Strings & Drums", march("E2 E2 F2 E2 E2 E2 G2 F2"), hits("drum", [0, 1, 2, 3])),
      m("Berserkers howl", "Brass, Strings & Drums", seq("brass", 0, "E3 E3 G3 F3", 1, 0.8), march("E2 E2 F2 E2 E2 E2 G2 F2"), hits("drum", [0, 1, 2, 3]), hits("snare", [1, 3], "", 0.6)),
      m("Axes up!", "Brass & Drums", at(0, "brass", "E3 B3", 2), at(2, "brass", "F3 C4", 2), march("E2 E2 F2 E2 E2 E2 G2 F2"), hits("drum", [0, 0.5, 1, 2, 2.5, 3]), hits("snare", [1, 3], "", 0.6)),
      m("Through the gate", "Brass, Strings & Drums", at(0, "brass", "C3 G3 C4", 4, 0.8), march("C2 C2 D2 C2 C2 C2 B1 C2"), hits("drum", [0, 1, 2, 3])),
      m("The war-chant", "Choir, Reed & Drums", at(0, "choir", "E3 G3 B3", 4), seq("lead", 0, "B4 B4 C5 B4 A4 G4", [0.5, 0.5, 1, 0.5, 0.5, 1]), march("E2 E2 F2 E2 E2 E2 G2 F2"), hits("drum", [0, 1, 2, 3])),
      m("Blood on the snow", "Reed, Brass & Strings", seq("lead", 0, "G4 A4 B4 E5", [0.5, 0.5, 1, 2]), at(0, "brass", "C3 G3", 4, 0.7), march("C2 C2 D2 C2 C2 C2 B1 C2"), hits("snare", [0.5, 1.5, 2.5, 3.5], "", 0.6), hits("drum", [0, 2])),
      m(
        "No mercy",
        "Full Horde",
        seq("brass", 0, "E4 D4 C4 B3", 1),
        at(0, "brass", "E3", 4, 0.6),
        at(0, "choir", "E3 B3", 4),
        hits("drum", [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], "", 0.75),
        hits("snare", [1, 3], "", 0.6)
      ),
      m("The fury breaks", "Brass, Gong & Drums", at(0, "brass", "B2 D#3 F#3", 2), at(0, "gong", "", 2, 0.7), hits("drum", [0, 2], "", 1.1), at(2, "stacc", "E2", 1))
    ]
  },
  {
    id: "orc-3",
    civ: "orc",
    title: "Ashes of the Warcamp",
    mood: "Lament",
    key: "A Phrygian",
    bpm: 60,
    beats: 4,
    drone: ["A1", "E2", "A2"],
    summary: "Embers, a lone drum and a mourning reed: the warcamp names its dead, and swears to avenge them.",
    steps: [
      m("Embers and a lone drum", "Reed & Drum", hits("drum", [0], "", 0.8), seq("lead", 0, "A3 Bb3 A3", [2, 1, 1], 0.8)),
      m("The reed mourns the fallen", "Reed, Strings & Drum", seq("lead", 0, "C4 Bb3 A3 G3", 1), at(0, "strings", "A1 E2 A2", 4, 0.6), hits("drum", [0], "", 0.7)),
      m("Low voices by the fire", "Choir & Reed", at(0, "choir", "A2 E3", 4), seq("lead", 0, "A3 C4 D4", [1, 1, 2])),
      m("B♭: the old grief", "Strings, Reed & Drum", at(0, "strings", "Bb1 F2 Bb2 D3", 4), seq("lead", 0, "D4 C4 Bb3", [1, 1, 2]), hits("drum", [0, 3], "", 0.6)),
      m("A war-horn far away", "Horns & Reed", at(0, "horns", "A2 E3 A3", 4, 0.6), seq("lead", 0, "E4 F4 E4 D4", 1), hits("drum", [0], "", 0.7)),
      m("The names of the dead", "Choir, Reed & Bell", at(0, "choir", "F2 C3 A3", 4), seq("lead", 0, "C4 D4 C4 Bb3", 1), at(0, "chime", "A4", 3, 0.3)),
      m("Vengeance swells", "Brass, Choir & Reed", at(0, "brass", "G2 D3 G3", 4, 0.7), at(0, "choir", "G2 D3 Bb3", 4), seq("lead", 0, "D4 E4 F4 E4", 1), hits("drum", [0, 2])),
      m("The fire dies to embers", "Gong, Reed & Strings", at(0, "gong", "", 3, 0.5), at(0, "lead", "A3", 4, 0.8), at(0, "strings", "A1 E2 A2", 4, 0.6), hits("drum", [0], "", 0.9))
    ]
  },

  /* --------------------------------------------------------------- Arcane */
  {
    id: "arcane-1",
    civ: "arcane",
    title: "The Voidrift Hums",
    mood: "Realm theme",
    key: "C Octatonic",
    bpm: 56,
    beats: 4,
    drone: ["C1", "C2", "F#2"],
    summary: "The rift breathes in glass and starlight while voices from beyond answer: the anthem of Nethergarde, outside the world's laws.",
    steps: [
      m("The rift breathes", "Void Glass & Bell", at(0, "glass", "C4 Eb4 F#4 A4", 4, 0.8), at(2, "chime", "A5", 2, 0.3)),
      m("Shards ring in the dark", "Void Glass & Bells", at(0, "glass", "C4 Eb4 G4", 4, 0.7), at(0, "chime", "C6", 2, 0.3), at(1.5, "chime", "F#5", 2, 0.3), at(3, "chime", "Eb6", 1, 0.3)),
      m("Voices from beyond", "Choir & Glass", at(0, "choir", "C3 Eb3 F#3", 4, 0.8), at(0, "glass", "A4 C5", 4, 0.5)),
      m("The weavers stir", "Choir, Glass & Flute", at(0, "choir", "Db3 E3 G3", 4, 0.8), at(0, "glass", "Bb4 Db5", 4, 0.5), seq("flute", 0, "E5 G5 F#5", [1, 1, 2], 0.6)),
      m("A slow pulse from the Eye", "Glass, Strings & Drum", hits("drum", [0, 2], "", 0.5), at(0, "glass", "C4 F#4 A4", 4, 0.7), at(0, "chime", "C6", 3, 0.3), at(0, "strings", "C2 F#2", 4, 0.6)),
      m("Starlight bends", "Glass, Choir & Flute", at(0, "glass", "Eb4 A4 C5", 4, 0.7), at(0, "choir", "Eb3 A3", 4, 0.7), seq("flute", 0, "C6 Bb5 A5", [1, 1, 2], 0.5)),
      m("The Unbound rise", "Full Rift Choir", at(0, "choir", "C3 F#3 A3 Eb4", 4), at(0, "horns", "C3 F#3", 4, 0.6), at(0, "glass", "C5 F#5", 4, 0.5), hits("drum", [0, 1.5, 2], "", 0.6)),
      m("The rift exhales", "Gong, Glass & Bells", at(0, "gong", "", 4, 0.5), at(0, "glass", "C4 G4 C5", 4, 0.6), at(0, "chime", "C6", 3, 0.4), at(2, "chime", "G5", 2, 0.3))
    ]
  },
  {
    id: "arcane-2",
    civ: "arcane",
    title: "Rites of the Unbound",
    mood: "Ritual",
    key: "F♯ Minor",
    bpm: 92,
    beats: 4,
    drone: ["F#1", "F#2", "C#3"],
    summary: "Ritual bells, glass circling the altar and a chant that grows louder until the sigils flare and the circle closes.",
    steps: [
      m("Ritual bells", "Ritual Bells", ritual(), at(0, "chime", "F#5", 2, 0.3)),
      m("Glass circles the altar", "Void Glass, Bells & Drum", arp("glass", 0, "F#4 A4 C#5 A4", 1, 4, 0.6), ritual(), hits("drum", [0, 2], "", 0.5)),
      m("The chant begins", "Choir, Bells & Drum", seq("choir", 0, "F#3 G#3 A3 G#3", 1, 0.8), ritual(), hits("drum", [0, 2], "", 0.6)),
      m("Down to D", "Choir, Glass & Bells", at(0, "choir", "D3 F#3 A3", 4), arp("glass", 0, "D4 F#4 A4 F#4", 1, 4, 0.6), ritual(), hits("drum", [0, 2], "", 0.6)),
      m("Sigils flare", "Brass, Horns & Glass", at(0, "brass", "F#3 C#4", 2, 0.5), at(2, "horns", "E3 B3", 2, 0.6), arp("glass", 0, "F#4 A4 C#5 A4", 1, 4, 0.6), hits("drum", [0, 1, 2, 3], "", 0.6), ritual()),
      m("The words grow louder", "Choir, Flute & Drum", at(0, "choir", "A3 C#4 E4", 4), seq("flute", 0, "C#5 D5 E5 F#5", 1, 0.7), hits("drum", [0, 2]), ritual()),
      m(
        "Power answers",
        "Full Rite",
        at(0, "choir", "D3 F#3 A3", 4),
        at(0, "brass", "D3 A3 D4", 4, 0.7),
        hits("chime", [0, 2], "F#5", 0.4),
        hits("drum", [0, 0.5, 1, 2, 2.5, 3]),
        ritual(0.4)
      ),
      m("The circle closes", "Gong, Choir & Glass", at(0, "gong", "", 3, 0.6), at(0, "choir", "C#3 F3 G#3", 4), at(0, "glass", "F#4 C#5", 4, 0.5))
    ]
  },
  {
    id: "arcane-3",
    civ: "arcane",
    title: "Under the Eye",
    mood: "Omen",
    key: "D Whole-tone",
    bpm: 52,
    beats: 4,
    drone: ["D1", "D2", "G#2"],
    summary: "The Eye over the Voidrift opens and its gaze sweeps the land: cold voices, a tolling from the deep and something vast turning.",
    steps: [
      m("The Eye opens", "Gong & Void Glass", at(0, "gong", "", 4, 0.6), at(0, "glass", "D4 G#4", 4, 0.5)),
      m("Its gaze sweeps the land", "Glass, Strings & Bell", at(0, "glass", "E4 A#4", 4, 0.6), at(0, "strings", "D2 G#2", 4, 0.6), at(2, "chime", "C6", 2, 0.3)),
      m("Cold voices", "Choir & Reed", at(0, "choir", "D3 F#3 A#3", 4, 0.8), seq("lead", 0, "D3 E3 F#3", [1, 1, 2], 0.6)),
      m("The weight of the void", "Choir, Reed & Drum", at(0, "choir", "C3 E3 G#3", 4, 0.8), seq("lead", 0, "G#3 F#3", [2, 2], 0.6), hits("drum", [0], "", 0.6)),
      m("A tolling from the deep", "Bells, Strings & Glass", at(0, "chime", "D5", 3, 0.4), at(2, "chime", "G#5", 2, 0.3), at(0, "strings", "D2 A#2", 4), at(0, "glass", "F#4 C5", 4, 0.4)),
      m("Something vast turns", "Horns, Choir & Reed", at(0, "horns", "D2 G#2 D3", 4, 0.7), at(0, "choir", "E3 G#3 C4", 4, 0.7), seq("lead", 0, "A#3 G#3 F#3 E3", 1, 0.7)),
      m("A shadow falls over the realm", "Full Rift Choir & Brass", at(0, "choir", "D3 F#3 A#3 D4", 4), at(0, "brass", "D3 G#3", 4, 0.6), hits("drum", [0, 1.5, 2], "", 0.7), at(2, "gong", "", 2, 0.4)),
      m("The Eye closes. For now.", "Glass, Strings & Bell", at(0, "glass", "D4 F#4 A#4", 4, 0.5), at(0, "strings", "D1 D2", 4, 0.6), at(0, "chime", "D6", 3, 0.3))
    ]
  }
];
