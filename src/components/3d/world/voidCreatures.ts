import { NPCRarity } from "@/types";

/*
 * The Void Gate's creatures (not in the realm yet: the Royal Codex shows them as coming soon): what the Codex lists.
 *
 * One family per stage of five levels, each ONE creature that grows up the rarity ladder (docs/MODEL_STYLE.md): its
 * four normal levels are packs of it at four sizes (common → uncommon → rare → epic), and its fifth is the family grown
 * up into one big boss (legendary). The Gate Sentinels are one creature over four levels (epic, epic, legendary,
 * legendary), and the Gate Warden its own mythic one, with the Oathbound's koi circling its head as its guard.
 *
 * Each size is a rigged hero, as the mercenaries are: a Normal rig (`voidRigs.ts`, drawn by `BossModel`) and an HD hero
 * (`heroVoid*.ts`, drawn by `BossBatch`, every copy in the same draws), with its own idle, walk and strike. This file
 * holds only the names, levels and sizes both read.
 */

export type BroodId = "stone" | "wraith" | "spider" | "lion" | "knight" | "sentinel";

export interface BroodSize {
  name: string;
  level: number;
  rarity: NPCRarity;
  blurb: string;
}

export interface Brood {
  id: BroodId;
  /** Its stage of the climb (1 … 6) */
  stage: number;
  /** "The Stone Giant's brood" */
  title: string;
  emblem: string;
  description: string;
  /** Its levels' creatures in order: the normal levels' packs, then the boss (none for the Sentinels) */
  sizes: BroodSize[];
  /** The fifth level's boss (index 4 in `sizes`) */
  boss: boolean;
}

/** Every family of the climb, in the order they are met */
export const VOID_BROODS: Brood[] = [
  {
    id: "stone",
    stage: 1,
    title: "The Stone Giant's brood",
    emblem: "🪨",
    description:
      "The first thing to come through the Void Gate is the rubble of the world it tore open: broken stone the void has woken and given arms. They are all shoulders and fists, their heads sunk low between boulders, and they grow by pulling more of the world onto themselves, until the eldest stands as tall as a tower.",
    boss: true,
    sizes: [
      { name: "Pebblings", level: 1, rarity: "common", blurb: "Knee-high lumps of grey rock on stumpy legs, all arms and knuckles, a dark pit for each eye." },
      { name: "Rubblekin", level: 2, rarity: "uncommon", blurb: "Waist-high and broader, a shard of violet crystal grown from each back, pebbles studding their fists." },
      { name: "Rockling Brutes", level: 3, rarity: "rare", blurb: "Man-sized and hunched, knuckles near the ground; void light glows through the cracks of their chests and eyes, swelling as they breathe." },
      { name: "Boulderbacks", level: 4, rarity: "epic", blurb: "Big and bent under boulder shoulders where moss and lit crystals grow; loose stones circle them as they lumber." },
      { name: "The Stone Giant", level: 5, rarity: "legendary", blurb: "The brood grown up: a titan of living rock with fists like boulders, its small head sunk between its shoulders under a crown of crystal, a burning core in its chest." }
    ]
  },
  {
    id: "wraith",
    stage: 2,
    title: "The Hollow Wraith's brood",
    emblem: "👻",
    description:
      "Past the stone, the gate breathes out what the void keeps of the dead: little hooded scraps of pale smoke with two dark eyes, which grow hands and hems as they drift, and in the end grow into wraiths that remember nothing but hunger.",
    boss: true,
    sizes: [
      { name: "Void Wisps", level: 6, rarity: "common", blurb: "Little hooded scraps of pale void smoke with two dark eyes, bobbing and drifting in a loose cloud." },
      { name: "Shade Wisps", level: 7, rarity: "uncommon", blurb: "Bigger and ragged, with a violet sash knotted round each and a small cracked bell hanging from it." },
      { name: "Wraithlings", level: 8, rarity: "rare", blurb: "Shrouded and reaching, with bony hands; their eyes and the heart-light in their chests pulse cold violet, an old chain trailing behind." },
      { name: "Void Wraiths", level: 9, rarity: "epic", blurb: "Tall wraiths with lit runes along their tattered hems and the souls they took circling them." },
      { name: "The Hollow Wraith", level: 10, rarity: "legendary", blurb: "The brood grown up: a towering shroud with a crown of shards, long claws and a hollow chest where the void burns behind its ribs, lanterns of souls circling it." }
    ]
  },
  {
    id: "spider",
    stage: 3,
    title: "The Crystal Broodmother's brood",
    emblem: "🕷️",
    description:
      "Shard spiders nest in the gate's cracks, and the crystal they grow on their backs is the void itself, set hard. The older they get, the more of it they carry, until the eldest is more geode than spider.",
    boss: true,
    sizes: [
      { name: "Shardlings", level: 11, rarity: "common", blurb: "Small dark spiders, each with one dull grey shard on its back, skittering in a swarm." },
      { name: "Shard Spiders", level: 12, rarity: "uncommon", blurb: "Bigger spiders with a cluster of violet crystal on the abdomen and a crystal egg carried on the back." },
      { name: "Crystal Weavers", level: 13, rarity: "rare", blurb: "Their crystals are lit from inside and pulse, and their eyes glow." },
      { name: "Prism Stalkers", level: 14, rarity: "epic", blurb: "Big, long-legged and spined with lit crystal, broken shards orbiting them as they stalk." },
      { name: "The Crystal Broodmother", level: 15, rarity: "legendary", blurb: "The brood grown up: a spider the size of a house, her abdomen a burning geode, a crown of crystal spines and shards turning round her." }
    ]
  },
  {
    id: "lion",
    stage: 4,
    title: "The Void Lion's pride",
    emblem: "🦁",
    description:
      "Lions of the void are born at the gate's foot as clumsy, spotted cubs, all paws and ears, and grow into the hunters that stalk the dark between worlds. Their manes grow with them, and the void sets in the mane as crystal, until the pride's lord wears a mane of burning shards.",
    boss: true,
    sizes: [
      { name: "Void Cubs", level: 16, rarity: "common", blurb: "Clumsy dusky cubs with big paws, big ears and faint spots, tumbling after one another." },
      { name: "Young Void Lions", level: 17, rarity: "uncommon", blurb: "Lanky young lions with the first ruff of a mane, violet at its tips, and a violet tuft to each tail." },
      { name: "Maned Void Lions", level: 18, rarity: "rare", blurb: "Grown lions with full dark manes and eyes that glow, a rift of light pulsing down each spine." },
      { name: "Crystal-Maned Lions", level: 19, rarity: "epic", blurb: "Big, heavy lions whose manes have set into lit crystal, motes of the void circling them as they stalk." },
      { name: "The Void Lion", level: 20, rarity: "legendary", blurb: "The pride grown up: a lion as tall as a horse, a mane of burning crystal shards, a crown of them over its brow and the rift torn open along its flanks." }
    ]
  },
  {
    id: "knight",
    stage: 5,
    title: "The Obsidian Knight's brood",
    emblem: "⚔️",
    description:
      "The gate's own order: knights cut from obsidian who swore to keep it before anyone now living was born. They start as squires in plain black plate and earn their way, trim, cape and crown, to the one who leads them.",
    boss: true,
    sizes: [
      { name: "Obsidian Squires", level: 21, rarity: "common", blurb: "Young figures in plain, dull black plate with short swords and open helms." },
      { name: "Obsidian Men-at-Arms", level: 22, rarity: "uncommon", blurb: "Taller, with violet heater shields and a pennant flying from each back." },
      { name: "Obsidian Knights-Errant", level: 23, rarity: "rare", blurb: "Full plate with steel trim and long swords, the slit of each visor glowing and fading." },
      { name: "Obsidian Champions", level: 24, rarity: "epic", blurb: "Tall, caped and horned, lit runes down their plate and shards circling them." },
      { name: "The Obsidian Knight", level: 25, rarity: "legendary", blurb: "The brood grown up: a knight as tall as a gatehouse, a greatsword with a burning edge in both hands, a horned crown and a long cape." }
    ]
  },
  {
    id: "sentinel",
    stage: 6,
    title: "The Gate Sentinels",
    emblem: "🛡️",
    description:
      "The last four levels before the Warden have no boss of their own: the Sentinels are the gate's walls given a will, floating suits of obsidian with one crimson eye each and a halberd that never rests. They grow no younger or older, only stronger.",
    boss: false,
    sizes: [
      { name: "Gate Sentinels", level: 26, rarity: "epic", blurb: "Floating obsidian sentinels, a crimson eye in each helm, halberds held ready and shards circling them." },
      { name: "Gate Sentinels", level: 27, rarity: "epic", blurb: "Bigger and heavier, with more runes lit down their plate." },
      { name: "Gate Sentinels", level: 28, rarity: "legendary", blurb: "Crowned now, their halberds' blades burning." },
      { name: "Gate Sentinels", level: 29, rarity: "legendary", blurb: "The tallest and the last before the Warden, their crowns and blades the brightest." }
    ]
  }
];

/** The climb's last level: the Gate Warden, mythic, with the Oathbound's koi as its guard */
export const VOID_WARDEN = {
  name: "The Gate Warden",
  level: 30,
  rarity: "mythical" as NPCRarity,
  emblem: "👁️",
  description:
    "The one who keeps the gate: a titan in black-crimson plate whose every edge breaks the light into colours, masked, a great key-staff in its hand and a crown of shards turning over its head. Two void koi circle above its head as its guard, one obsidian and one pale as pearl, casting for it and never striking. When the Warden falls, the koi swear themselves to the ruler who beat it and follow them from then on, as the Warden's Oathbound."
};

/** A family's creature at one size (a rigged hero: the Normal rig and the HD hero share the type) */
export const vgType = (id: BroodId, size: number) => `vg-${id}-${size}`;
export const VG_WARDEN_TYPE = "vg-warden";

/** How each family's sizes stand: height (world units), ground radius, and how many walk in a normal level's pack */
export const BROOD_SIZES: Record<BroodId, { height: number[]; foot: number[]; pack: number[] }> = {
  stone: { height: [0.5, 0.85, 1.45, 2.0, 4.8], foot: [0.25, 0.4, 0.65, 0.9, 2.0], pack: [6, 4, 3, 2] },
  wraith: { height: [0.7, 1.1, 1.8, 2.5, 5.0], foot: [0.2, 0.3, 0.45, 0.6, 1.3], pack: [6, 5, 4, 3] },
  spider: { height: [0.3, 0.45, 0.7, 1.05, 2.4], foot: [0.35, 0.5, 0.75, 1.1, 2.5], pack: [6, 5, 4, 3] },
  lion: { height: [0.5, 0.8, 1.15, 1.5, 3.0], foot: [0.35, 0.55, 0.8, 1.05, 2.1], pack: [5, 4, 4, 3] },
  knight: { height: [1.3, 1.6, 1.85, 2.2, 4.2], foot: [0.35, 0.42, 0.5, 0.6, 1.2], pack: [5, 4, 4, 3] },
  sentinel: { height: [2.9, 3.2, 3.5, 3.9], foot: [0.8, 0.9, 1.0, 1.1], pack: [3, 3, 2, 2] }
};

/** How many walk together at a level (the boss alone) */
export const packOf = (id: BroodId, size: number) => (VOID_BROODS.find((b) => b.id === id)?.boss && size === 4 ? 1 : BROOD_SIZES[id].pack[size] ?? 1);

/** Where each size stands in the Codex's line-up, left to right (smallest first), centred on x = 0 */
export function broodLineup(id: BroodId): Array<{ size: number; x: number; foot: number; height: number }> {
  const f = BROOD_SIZES[id];
  const gap = 0.5;
  const total = f.foot.reduce((a, r) => a + r * 2, 0) + gap * (f.foot.length - 1);
  let x = -total / 2;
  return f.foot.map((r, size) => {
    const out = { size, x: x + r, foot: r, height: f.height[size] };
    x += r * 2 + gap;
    return out;
  });
}

/** How far apart a pack's copies walk (so none walks through another) */
export const packSpread = (id: BroodId, size: number) => Math.max(0.6, BROOD_SIZES[id].foot[size] * 2.2);
