import { Fragment, ReactNode, createElement } from "react";
import * as L from "lucide-react";
import type { LucideIcon } from "lucide-react";

/*
 * Glyphs: every emoji the UI shows is drawn as a lucide line icon instead (the top bar's look), from this one map.
 * `src/jsx/` wraps React's JSX runtime so any mapped emoji in a DOM element's text becomes its icon as the element
 * is created: literal text, data-driven strings (civ emblems, gems, the Guide Book) and text from the server (notices,
 * NPC names) alike. An emoji not in the map is left as it is. Attributes (`title`, `placeholder`) are text and keep
 * their emoji; so do elements that can't hold an SVG (see SKIP_TYPES) and anything painted on a canvas.
 *
 * Add an emoji here when new text uses one; pick the closest icon and an accent colour that says what it is.
 */

type Entry = [LucideIcon, string?];

const GOLD = "text-amber-300";
const FIRE = "text-orange-400";
const STEEL = "text-slate-300";
const SKY = "text-sky-300";
const VOID = "text-violet-300";
const LIFE = "text-emerald-300";
const BLOOD = "text-rose-400";
const EARTH = "text-stone-300";
const WOOD = "text-orange-300";
const GRAIN = "text-lime-300";

export const GLYPHS: Record<string, Entry> = {
  // ── resources & riches
  "🪙": [L.Coins, GOLD], "💰": [L.Coins, GOLD], "⚙": [L.Cog, STEEL], "🪨": [L.Mountain, EARTH], "🪵": [L.TreePine, WOOD],
  "🌾": [L.Wheat, GRAIN], "💎": [L.Gem, SKY], "🔴": [L.Gem, BLOOD], "🔷": [L.Gem, SKY], "🟢": [L.Gem, LIFE], "🌌": [L.Gem, VOID],
  "⚡": [L.Zap, "text-yellow-300"], "🐉": [L.Flame, "text-red-400"], "📜": [L.ScrollText, GOLD], "🪶": [L.Feather, GOLD],
  "🔮": [L.Sparkle, VOID], "🧱": [L.BrickWall, EARTH], "⛓": [L.Link, STEEL], "🎁": [L.Gift, "text-pink-300"], "💠": [L.Diamond, SKY],
  "💧": [L.Droplet, SKY], "🍇": [L.Grape, VOID], "🛒": [L.ShoppingCart, GOLD], "🧰": [L.Toolbox, STEEL],
  // ── war
  "⚔": [L.Swords, BLOOD], "🗡": [L.Sword, STEEL], "🛡": [L.Shield, SKY], "🏹": [L.Crosshair, LIFE], "🪓": [L.Axe, STEEL], "💣": [L.Bomb, FIRE],
  "🚩": [L.Flag, BLOOD], "🏴": [L.Flag, STEEL], "🎖": [L.Medal, GOLD], "🏅": [L.Medal, GOLD], "🥇": [L.Medal, GOLD], "🥈": [L.Medal, STEEL],
  "🥉": [L.Medal, "text-orange-400"], "🏆": [L.Trophy, GOLD], "💀": [L.Skull, STEEL], "☠": [L.Skull, STEEL], "🩸": [L.Droplet, BLOOD],
  // Battle Arts: Rally cry, Sunder, a heal, a falling-star Finale, the Sparring Grounds
  "💢": [L.Angry, BLOOD], "💔": [L.HeartCrack, BLOOD], "💚": [L.HeartPulse, LIFE], "☄": [L.Orbit, FIRE], "🤺": [L.Swords, GOLD],
  // Mercenaries: a band healing its wounds, a band deserting
  "🩹": [L.Bandage, LIFE], "🏃": [L.Footprints, STEEL],
  "💥": [L.Bomb, FIRE], "🎯": [L.Target, BLOOD], "👁": [L.Eye, SKY], "🕵": [L.ScanEye, SKY], "🦉": [L.Bird, GOLD], "🚧": [L.Construction, GOLD],
  "📯": [L.Megaphone, GOLD], "🎺": [L.Megaphone, GOLD], "🔱": [L.Anchor, SKY], "🛑": [L.OctagonX, BLOOD], "🚨": [L.Siren, BLOOD],
  "⛏": [L.Pickaxe, EARTH], "⚒": [L.Hammer, STEEL], "🔨": [L.Hammer, STEEL], "👥": [L.Users, STEEL], "👷": [L.HardHat, GOLD],
  "🧑": [L.User, STEEL], "👤": [L.User, STEEL], "👣": [L.Footprints, STEEL], "🤝": [L.Handshake, LIFE], "👋": [L.Hand, GOLD],
  // ── realm, castles, places
  "👑": [L.Crown, GOLD], "🦸": [L.Medal, GOLD], "🏦": [L.Vault, GOLD], "🏰": [L.Castle, GOLD], "🏯": [L.Castle, BLOOD], "🏛": [L.Landmark, GOLD], "🏠": [L.House, WOOD], "🏡": [L.House, LIFE],
  "🏘": [L.Building, WOOD], "🏙": [L.Building2, STEEL], "🏗": [L.Construction, GOLD], "🏚": [L.House, STEEL], "🗺": [L.Map, LIFE],
  "🗿": [L.Landmark, EARTH], "⛪": [L.Church, GOLD], "🕌": [L.Church, GOLD], "🛕": [L.Church, GOLD], "🗼": [L.TowerControl, STEEL],
  "🏮": [L.Lamp, FIRE], "🕯": [L.Flame, GOLD], "⛺": [L.Tent, WOOD], "🏕": [L.TentTree, LIFE], "🌉": [L.Route, STEEL], "🛣": [L.Route, EARTH],
  "⛲": [L.Droplets, SKY], "🚪": [L.DoorOpen, WOOD], "🏺": [L.Amphora, EARTH], "🌍": [L.Globe, LIFE], "📦": [L.Package, WOOD],
  "🪤": [L.Grip, STEEL], "🛶": [L.Sailboat, WOOD], "⛵": [L.Sailboat, SKY], "⚓": [L.Anchor, SKY], "🚚": [L.Truck, WOOD], "🐪": [L.Truck, GOLD],
  // ── nature, sky, seasons
  "☀": [L.Sun, GOLD], "🌤": [L.CloudSun, GOLD], "🌙": [L.Moon, SKY], "🌗": [L.MoonStar, SKY], "🌑": [L.Moon, VOID], "🌄": [L.Sunrise, "text-rose-300"],
  "🌅": [L.Sunrise, GOLD], "🌇": [L.Sunset, FIRE], "🌆": [L.Sunset, VOID], "🌸": [L.Flower2, "text-pink-300"], "🌷": [L.Flower, "text-pink-300"],
  "🥀": [L.Flower, STEEL], "🍂": [L.Leaf, FIRE], "🍃": [L.Leaf, LIFE], "🌿": [L.Sprout, LIFE], "❄": [L.Snowflake, SKY], "🌧": [L.CloudRain, SKY],
  "⛈": [L.CloudLightning, VOID], "🌪": [L.Wind, EARTH], "🌫": [L.CloudFog, STEEL], "🌀": [L.Tornado, VOID], "☯": [L.Contrast, VOID], "🔥": [L.Flame, FIRE], "🌋": [L.MountainSnow, FIRE],
  "🏔": [L.MountainSnow, SKY], "🏜": [L.Sun, GOLD], "🌲": [L.TreePine, LIFE], "🌳": [L.TreeDeciduous, LIFE], "🌴": [L.TreePalm, LIFE],
  "🌊": [L.Waves, SKY], "🍄": [L.Sprout, BLOOD], "🌟": [L.Star, GOLD], "✴": [L.Sparkle, GOLD], "✨": [L.Sparkles, GOLD], "🌠": [L.Sparkles, SKY],
  "🔺": [L.Triangle, BLOOD], "🪸": [L.Shell, "text-pink-300"], "🕊": [L.Bird, STEEL], "🎐": [L.Wind, SKY],
  // ── creatures
  "🐺": [L.PawPrint, STEEL], "🐑": [L.Cloud, STEEL], "🐄": [L.Beef, WOOD], "🐖": [L.PiggyBank, "text-pink-300"], "🐔": [L.Egg, GOLD],
  "🐎": [L.PawPrint, WOOD], "🐴": [L.PawPrint, WOOD], "🐇": [L.Rabbit, STEEL], "🦢": [L.Bird, STEEL], "🐐": [L.PawPrint, EARTH],
  "🐗": [L.PawPrint, WOOD], "🪿": [L.Bird, STEEL], "🦎": [L.Turtle, LIFE], "🐦": [L.Bird, SKY], "🐈": [L.Cat, GOLD], "🦁": [L.Cat, GOLD], "📈": [L.TrendingUp, GOLD], "🪦": [L.Cross, STEEL], "📧": [L.Mail, SKY], "🦌": [L.PawPrint, WOOD],
  "🐙": [L.Shell, VOID], "🧜": [L.Fish, SKY], "🐋": [L.Fish, SKY], "🦂": [L.Bug, FIRE], "🦅": [L.Bird, GOLD], "🦴": [L.Bone, STEEL],
  "🧚": [L.Sparkles, "text-pink-300"], "🦇": [L.Bird, VOID], "🧌": [L.Skull, LIFE], "🐲": [L.Flame, "text-red-400"], "🐀": [L.Rat, STEEL],
  "🕷": [L.Bug, STEEL], "👹": [L.Skull, BLOOD], "👺": [L.Skull, BLOOD], "👻": [L.Ghost, STEEL], "🐍": [L.Worm, LIFE], "🪱": [L.Worm, EARTH],
  "🦹": [L.VenetianMask, VOID], "🥷": [L.VenetianMask, STEEL], "🧙": [L.WandSparkles, VOID], "🐞": [L.Bug, BLOOD], "🎣": [L.Fish, SKY],
  "🍺": [L.Beer, GOLD], "🎭": [L.Drama, VOID],
  // ── UI & state
  "⚠": [L.TriangleAlert, GOLD], "❌": [L.CircleX, BLOOD], "✖": [L.X, BLOOD], "✕": [L.X, STEEL], "✅": [L.CircleCheck, LIFE], "✓": [L.Check, LIFE],
  "🔒": [L.Lock, STEEL], "💤": [L.Moon, STEEL], "↩": [L.Undo2, STEEL], "🔄": [L.RefreshCw, SKY], "🔁": [L.Repeat, SKY], "♻": [L.Recycle, LIFE],
  "🗑": [L.Trash2, STEEL], "▶": [L.Play, LIFE], "⏭": [L.SkipForward, STEEL], "◀": [L.ChevronLeft, STEEL], "⏳": [L.Hourglass, GOLD],
  "📌": [L.Pin, BLOOD], "🔭": [L.Telescope, SKY], "💡": [L.Lightbulb, GOLD], "🙌": [L.HandHeart, "text-pink-300"], "⚖": [L.Scale, STEEL],
  "🎲": [L.Dices, STEEL], "✎": [L.Pencil, STEEL], "🎮": [L.Gamepad2, VOID], "🔊": [L.Volume2, STEEL], "📖": [L.BookOpen, GOLD],
  "🎵": [L.Music, VOID], "🎼": [L.Music2, VOID], "🎉": [L.PartyPopper, GOLD], "☰": [L.Menu, STEEL], "❤": [L.Heart, BLOOD]
};

/** Elements that can't hold an SVG child: their text keeps its emoji */
export const SKIP_TYPES = new Set(["option", "optgroup", "textarea", "title", "text", "tspan", "textPath", "style", "script", "desc"]);

// Longest first so a sequence wins over a part of it. The variation selector (U+FE0F), a skin tone and joined tails
// (the zero-width joiner and ♀ of a mermaid) ride along with the emoji they belong to
const KEYS = Object.keys(GLYPHS).sort((a, b) => b.length - a.length);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PATTERN = new RegExp(`(${KEYS.map(esc).join("|")})(?:️|[\u{1F3FB}-\u{1F3FF}]|‍.️?)*`, "gu");
const TEST = new RegExp(PATTERN.source, "u");

/** One emoji as its line icon, sized to the text around it (1em) */
export function Glyph({ e, className }: { e: string; className?: string }) {
  const entry = GLYPHS[e.replace(/️/g, "")];
  if (!entry) return createElement(Fragment, null, e);
  const [Icon, color] = entry;
  return createElement(Icon, {
    className: `inline-block w-[1.05em] h-[1.05em] align-[-0.15em] shrink-0 ${className ?? color ?? ""}`,
    strokeWidth: 2,
    "aria-hidden": true
  });
}

/** True when a string holds an emoji the map knows */
export const hasGlyph = (s: string) => TEST.test(s);

/**
 * A string with its emoji as icons: the same string when it has none, else text and icons (keyed, so they can sit in
 * a list of children). One space after an icon is kept; the icon's own width takes the emoji's place.
 */
export function glyphText(s: string): ReactNode {
  if (!TEST.test(s)) return s;
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of s.matchAll(PATTERN)) {
    const i = m.index ?? 0;
    if (i > last) out.push(s.slice(last, i));
    out.push(createElement(Glyph, { key: `g${n++}`, e: m[1] }));
    last = i + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

/** A string split into text runs and the line icons of its emoji, for text drawn outside the DOM (the 3D number kit) */
export function glyphParts(s: string): Array<string | { icon: LucideIcon; color?: string }> {
  if (!TEST.test(s)) return [s];
  const out: Array<string | { icon: LucideIcon; color?: string }> = [];
  let last = 0;
  for (const m of s.matchAll(PATTERN)) {
    const i = m.index ?? 0;
    if (i > last) out.push(s.slice(last, i));
    const [icon, color] = GLYPHS[m[1]];
    out.push({ icon, color });
    last = i + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
