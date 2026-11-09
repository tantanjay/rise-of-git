import type { CSSProperties } from "react";
import * as L from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CivilizationType } from "@/types";

/*
 * How the weekly story's marks are drawn (mirrors the keys of server/src/chronicleMarks.ts): each key is a line icon
 * and an ink colour for the parchment. The dragon is drawn by hand (lucide has none); a key the client doesn't know
 * falls back to a sparkle.
 */

const RED = "#A32D2D";
const GOLD = "#854F0B";
const IRON = "#5F5E5A";
const VOID = "#534AB7";
const SEA = "#185FA5";
const LIFE = "#3B6D11";
const FIRE = "#C2410C";

/** The hand-drawn dragon rampant, in the icon's colour */
function DragonIcon({ className, style }: { className?: string; style?: CSSProperties; strokeWidth?: number }) {
  return (
    <svg viewBox="12 15 54 50" className={className} style={style} fill="currentColor" aria-hidden>
      <path d="M24 62 C22 52 28 44 36 42 C30 38 28 30 32 24 C34 30 38 32 42 31 C40 26 42 20 48 18 C47 23 49 26 53 27 C57 28 60 32 59 37 L54 36 C55 40 53 44 49 45 C53 48 54 54 51 60 C48 55 44 53 40 54 C38 58 33 62 24 62Z" />
      <path d="M42 31 C34 26 26 26 18 30 C24 31 28 34 30 38 C24 38 20 41 17 46 C24 44 30 44 36 42Z" opacity={0.7} />
      <path d="M59 37 L64 35 L61 39Z" />
      <path d="M24 62 C20 64 16 62 14 58 C18 60 21 59 24 57Z" />
    </svg>
  );
}

type Draw = LucideIcon | typeof DragonIcon;

export const MARK_DRAWINGS: Record<string, { Icon: Draw; ink: string }> = {
  dragon: { Icon: DragonIcon, ink: RED },
  griffin: { Icon: L.Bird, ink: GOLD },
  phoenix: { Icon: L.Feather, ink: FIRE },
  wolf: { Icon: L.PawPrint, ink: IRON },
  serpent: { Icon: L.Worm, ink: LIFE },
  kraken: { Icon: L.Shell, ink: SEA },
  raven: { Icon: L.Bird, ink: "#2C2C2A" },
  beast: { Icon: L.Bone, ink: IRON },
  swords: { Icon: L.Swords, ink: RED },
  sword: { Icon: L.Sword, ink: IRON },
  axe: { Icon: L.Axe, ink: IRON },
  bow: { Icon: L.Crosshair, ink: LIFE },
  shield: { Icon: L.Shield, ink: SEA },
  siege: { Icon: L.Castle, ink: RED },
  castle: { Icon: L.Castle, ink: GOLD },
  burning: { Icon: L.FlameKindling, ink: FIRE },
  banner: { Icon: L.Flag, ink: RED },
  skull: { Icon: L.Skull, ink: IRON },
  bomb: { Icon: L.Bomb, ink: FIRE },
  horn: { Icon: L.Megaphone, ink: GOLD },
  drum: { Icon: L.Drum, ink: RED },
  trophy: { Icon: L.Trophy, ink: GOLD },
  medal: { Icon: L.Medal, ink: GOLD },
  crown: { Icon: L.Crown, ink: GOLD },
  "fallen-crown": { Icon: L.Crown, ink: IRON },
  throne: { Icon: L.Landmark, ink: VOID },
  void: { Icon: L.Tornado, ink: VOID },
  rift: { Icon: L.Orbit, ink: VOID },
  spire: { Icon: L.TowerControl, ink: VOID },
  temple: { Icon: L.Church, ink: GOLD },
  camp: { Icon: L.Tent, ink: GOLD },
  road: { Icon: L.Route, ink: IRON },
  map: { Icon: L.Map, ink: LIFE },
  pact: { Icon: L.Handshake, ink: LIFE },
  gem: { Icon: L.Gem, ink: SEA },
  hoard: { Icon: L.Coins, ink: GOLD },
  relic: { Icon: L.Sparkles, ink: VOID },
  key: { Icon: L.Key, ink: GOLD },
  scroll: { Icon: L.ScrollText, ink: GOLD },
  book: { Icon: L.BookOpen, ink: VOID },
  "blood-moon": { Icon: L.Moon, ink: RED },
  moon: { Icon: L.Moon, ink: SEA },
  sun: { Icon: L.Sun, ink: GOLD },
  storm: { Icon: L.CloudLightning, ink: VOID },
  wind: { Icon: L.Wind, ink: IRON },
  plague: { Icon: L.Biohazard, ink: LIFE },
  blight: { Icon: L.Wheat, ink: IRON },
  wither: { Icon: L.Flower2, ink: IRON },
  frost: { Icon: L.Snowflake, ink: SEA },
  fire: { Icon: L.Flame, ink: FIRE },
  star: { Icon: L.Star, ink: GOLD },
  mountain: { Icon: L.Mountain, ink: IRON },
  sea: { Icon: L.Waves, ink: SEA },
  forest: { Icon: L.TreePine, ink: LIFE },
  omen: { Icon: L.Eye, ink: VOID },
  ghost: { Icon: L.Ghost, ink: IRON },
  hourglass: { Icon: L.Hourglass, ink: GOLD },
  hammer: { Icon: L.Hammer, ink: IRON },
  anvil: { Icon: L.Anvil, ink: IRON },
  pickaxe: { Icon: L.Pickaxe, ink: IRON },
  quill: { Icon: L.Feather, ink: GOLD },
  harvest: { Icon: L.Wheat, ink: GOLD },
  bell: { Icon: L.Bell, ink: GOLD },
  valoria: { Icon: L.Crown, ink: SEA },
  sylvandale: { Icon: L.Leaf, ink: LIFE },
  ironforge: { Icon: L.Hammer, ink: IRON },
  drakmar: { Icon: L.Shield, ink: "#993C1D" },
  nethergarde: { Icon: L.Tornado, ink: VOID }
};

const drawingOf = (key: string) => MARK_DRAWINGS[key] ?? { Icon: L.Sparkles, ink: GOLD };

/** A mark as an inline icon in the story's text */
export function MarkIcon({ mark, size = 15 }: { mark: string; size?: number }) {
  const { Icon, ink } = drawingOf(mark);
  return <Icon className="inline-block shrink-0 align-[-2px] mx-0.5" style={{ width: size, height: size, color: ink }} aria-hidden />;
}

/** The square crest beside a story's opening paragraph: the mark on gold, in a dark wooden frame */
export function Insignia({ mark, size = 76 }: { mark: string; size?: number }) {
  const { Icon, ink } = drawingOf(mark);
  return (
    <span
      className="shrink-0 inline-flex items-center justify-center"
      style={{ width: size, height: size, background: "#412402", borderRadius: 6, padding: size * 0.05 }}
      aria-hidden
    >
      <span className="w-full h-full flex items-center justify-center" style={{ background: "#FAC775", borderRadius: 4, boxShadow: "inset 0 0 0 1px #854F0B" }}>
        <Icon style={{ width: size * 0.62, height: size * 0.62, color: ink }} strokeWidth={1.6} />
      </span>
    </span>
  );
}

/** Each people's crest and chip colours, for rulers' names and the chapter's header */
export const CIV_CREST: Record<CivilizationType, { Icon: LucideIcon; bg: string; ink: string; label: string }> = {
  human: { Icon: L.Crown, bg: "#E6F1FB", ink: "#0C447C", label: "Valoria" },
  elf: { Icon: L.Leaf, bg: "#EAF3DE", ink: "#27500A", label: "Sylvandale" },
  dwarf: { Icon: L.Hammer, bg: "#F1EFE8", ink: "#444441", label: "Ironforge" },
  orc: { Icon: L.Shield, bg: "#FAECE7", ink: "#712B13", label: "Drak'mar" },
  arcane: { Icon: L.Tornado, bg: "#EEEDFE", ink: "#3C3489", label: "Nethergarde" }
};
