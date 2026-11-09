/*
 * The weekly story's marks (GAME_GUIDE §15 *Weekly Chronicle*): tags the bard (any LLM) writes into the story, drawn
 * by the game as line icons, the opening insignia, callouts and dividers. The prompt lists every key with its
 * meaning; publishing refuses a story with a tag the game can't draw.
 *
 *   [dragon]               an icon inline in the text
 *   [insignia:dragon]      once, at the start: the square crest beside the opening paragraph
 *   [callout:dragon]…[/callout]   a paragraph of its own, framed, with the icon at its side
 *   [divider:swords]       a line of its own: an ornament between parts of the tale
 *
 * Square brackets, because chat windows treat <tags> as HTML and drop them when a reply is copied. `tidyMarks` still
 * reads <angle> tags and the bare `insignia:dragon` / `callout:…` / `divider:…` a copy leaves at a paragraph's start.
 *
 * The client draws each key (src/utils/chronicleMarks.tsx mirrors this list); a key added here needs its drawing there.
 */

export interface ChronicleMark {
  key: string;
  /** What it stands for, as the prompt tells the bard */
  hint: string;
}

const group = (name: string, marks: Array<[string, string]>) => marks.map(([key, hint]) => ({ key, hint, group: name }));

export const CHRONICLE_MARKS: Array<ChronicleMark & { group: string }> = [
  ...group("Creatures", [
    ["dragon", "a dragon or wyrm, a world boss"],
    ["griffin", "a griffin, a beast of the sky"],
    ["phoenix", "a phoenix, rebirth, a Phoenix Feather"],
    ["wolf", "wolves, a pack, a hunt"],
    ["serpent", "a serpent, treachery"],
    ["kraken", "a sea monster, the deep"],
    ["raven", "a raven, ill news, a messenger"],
    ["beast", "a slain beast, bones on the field"]
  ]),
  ...group("War", [
    ["swords", "battle, crossed blades"],
    ["sword", "a single blade, a duel, a stolen kill"],
    ["axe", "an axe, a brutal blow"],
    ["bow", "archers, a well-aimed shot"],
    ["shield", "defence, walls that held"],
    ["siege", "a siege, an army at the gates"],
    ["castle", "a castle, a stronghold"],
    ["burning", "a castle burned, fire on the walls"],
    ["banner", "a banner raised, a host on the march"],
    ["skull", "death, the fallen"],
    ["bomb", "a breach, an explosion"],
    ["horn", "a war horn, a call to arms"],
    ["drum", "war drums"],
    ["trophy", "victory, a prize won"],
    ["medal", "honour, a title earned"]
  ]),
  ...group("The realm", [
    ["crown", "a crown, a ruler, a throne won"],
    ["fallen-crown", "a crown lost, a ruler cast down"],
    ["throne", "a seat of power, the Voidrift's seats"],
    ["void", "the Voidrift, the void, Nethergarde's power"],
    ["rift", "a rift opening, a portal"],
    ["spire", "a void spire"],
    ["temple", "a temple, a cathedral, prayer"],
    ["camp", "a camp, a host resting"],
    ["road", "a road, a long march"],
    ["map", "the map, far lands"],
    ["pact", "a pact, a trade of peoples, an alliance"]
  ]),
  ...group("Riches", [
    ["gem", "a gem, a legendary stone"],
    ["hoard", "gold, a treasure hoard"],
    ["relic", "a relic, the Relic Hoard, ancient magic"],
    ["key", "a key, a secret, a door opened"],
    ["scroll", "a scroll, a deed sealed, a decree"],
    ["book", "the chronicle itself, lore"]
  ]),
  ...group("Omens and nature", [
    ["blood-moon", "the Blood Moon, a red night"],
    ["moon", "night, the moon"],
    ["sun", "dawn, a bright day, hope"],
    ["storm", "a storm, a tempest"],
    ["wind", "wind, roads torn by gales"],
    ["plague", "plague, sickness"],
    ["blight", "blight on the fields, a failed harvest"],
    ["wither", "withering, a barren spell"],
    ["frost", "winter, frost"],
    ["fire", "fire, flame, a forge's heat"],
    ["star", "a star, a fortune, a sign"],
    ["mountain", "mountains, the high peaks"],
    ["sea", "the sea, rivers, waves"],
    ["forest", "the forest, the great trees"],
    ["omen", "an omen, a watching eye"],
    ["ghost", "a spirit, the dead remembered"],
    ["hourglass", "time, a long wait, many attempts"]
  ]),
  ...group("Labour", [
    ["hammer", "a hammer, smithing, building"],
    ["anvil", "an anvil, the forges"],
    ["pickaxe", "mining, digging deep"],
    ["quill", "a quill, writing, scribes"],
    ["harvest", "the harvest, grain, plenty"],
    ["bell", "bells ringing, a town's work"]
  ]),
  ...group("Peoples", [
    ["valoria", "the Humans of Valoria"],
    ["sylvandale", "the Elves of Sylvandale"],
    ["ironforge", "the Dwarves of Ironforge"],
    ["drakmar", "the Orcs of Drak'mar"],
    ["nethergarde", "Nethergarde and its sorcerers"]
  ])
];

const KEYS = new Set(CHRONICLE_MARKS.map((m) => m.key));
/** Longest first, so a bare `insignia:dragonWhen…` finds "dragon" and leaves the rest as text */
const KEYS_BY_LENGTH = [...KEYS].sort((a, b) => b.length - a.length);
/** At most this many of each in one story */
export const MARK_LIMITS = { insignia: 1, callout: 2, divider: 3 };

/** Every tag in a tidied story: `[key]`, `[insignia:key]`, `[callout:key]`, `[/callout]`, `[divider:key]` */
const TAG = /\[(\/?)([a-z-]+)(?::([a-z-]+))?\]/g;
const BLOCK_AT_START = /^\[?(insignia|callout|divider)\s*:\s*([a-z-]+)\]?/;

/**
 * A pasted story's marks in their one written form: <angle> tags become [square] ones, a block tag that lost its
 * brackets at a paragraph's start gets them back, and a callout left open is closed at its paragraph's end
 */
export function tidyMarks(body: string): string {
  return body
    .replace(/\r\n/g, "\n")
    .replace(/<(\/?[a-z-]+(?::[a-z-]+)?)>/g, "[$1]")
    .split(/\n\s*\n/)
    .map((para) => {
      // Two spaces in a row are where a copy dropped an inline mark
      let p = para.trim().replace(/ {2,}/g, " ");
      const m = BLOCK_AT_START.exec(p);
      if (m) {
        // A copy can glue the key to the next word ("dragonthe"): take the longest key it starts with, the rest is text
        const key = KEYS_BY_LENGTH.find((k) => m[2].startsWith(k)) ?? m[2];
        p = `[${m[1]}:${key}]${m[2].slice(key.length)}${p.slice(m[0].length)}`;
      }
      if (/^\[callout:[a-z-]+\]/.test(p) && !p.includes("[/callout]")) p += "[/callout]";
      return p;
    })
    .filter(Boolean)
    .join("\n\n");
}

/** What's wrong with a story's marks (empty: the game can draw it all) */
export function checkMarks(body: string): string[] {
  const errors: string[] = [];
  const count = { insignia: 0, callout: 0, divider: 0 };
  let open = false;
  for (const m of body.matchAll(TAG)) {
    const [tag, close, name, key] = m;
    if (close) {
      if (name !== "callout" || !open) errors.push(`${tag} closes nothing.`);
      open = false;
      continue;
    }
    if (name === "insignia" || name === "callout" || name === "divider") {
      count[name] += 1;
      if (!key) errors.push(`${tag} needs a mark, like [${name}:dragon].`);
      else if (!KEYS.has(key)) errors.push(`${tag}: the game has no "${key}" mark.`);
      if (name === "callout") {
        if (open) errors.push("A callout opens before the last one closed.");
        open = true;
      }
    } else if (key || !KEYS.has(name)) errors.push(`${tag}: the game has no such mark.`);
  }
  if (open) errors.push("A [callout:…] is never closed with [/callout].");
  for (const k of Object.keys(MARK_LIMITS) as Array<keyof typeof MARK_LIMITS>)
    if (count[k] > MARK_LIMITS[k]) errors.push(`Use at most ${MARK_LIMITS[k]} ${k}${MARK_LIMITS[k] === 1 ? "" : "s"} (found ${count[k]}).`);
  return [...new Set(errors)];
}

/** The prompt's part on marks: the syntax, the rules and every key */
export function marksPrompt(): string[] {
  const groups = [...new Set(CHRONICLE_MARKS.map((m) => m.group))];
  return [
    "MARKS (the game draws these as icons; use only the keys listed)",
    "- Write marks in square brackets exactly as shown, never in <angle brackets>.",
    "- [key] puts a small icon in the text, right before the word it adorns: \"the [dragon] Molten Wyrm\". Use 4 to 10 of them.",
    "- [insignia:key] once, at the very start of the story: the square crest beside the opening paragraph. Pick the mark of the week's greatest happening.",
    "- [callout:key]One sentence or two.[/callout] as a paragraph of its own frames the week's most striking moment. At most 2.",
    "- [divider:key] on a line of its own, between parts of the tale. At most 3.",
    "- Write rulers' names as plain text; the game adorns them with their people's crest.",
    "",
    ...groups.map((g) => `${g}: ${CHRONICLE_MARKS.filter((m) => m.group === g).map((m) => `${m.key} (${m.hint})`).join("; ")}`)
  ];
}

