import type { LucideIcon } from "lucide-react";
import { BookOpen, Castle, CloudLightning, Coins, Crown, Feather, Flag, Flame, HeartPulse, Medal, Megaphone, MonitorSmartphone, Skull, Sun, Swords, Trophy, Wand2 } from "lucide-react";
import { BAND_BOSS_DAMAGE, MERC_RARITIES, MERC_RULES, bandCapForSlots, costText } from "@/utils/mercenaries";
import { ARMORY_RARITIES, ARMORY_RULES, ARMORY_TARGET_SHARE } from "@/utils/armory";
import { CHAMPION_MAX_LEVEL, CHAMPION_SLOTS, CHAMPION_STAT_PER_LEVEL, KIT_UNLOCKS, LOOK_OPTIONS, healMsFor } from "@/utils/champion";
import { BOSS_BATTLE_CAP, BOSS_WRATH, MOONWELL, hastenCostFor } from "@/utils/war";
import { DISASTER_SCHEDULE } from "@/utils/disasters";
import { REALM_CYCLE_DAYS } from "@/components/3d/world/realmTypes";
import { KIT_SIZES } from "@/utils/battleArts";
import { MARCH_SLOT_LEVELS, NPC_KINGDOM_TREASURY_PER_LEVEL, PACK_GEAR, PACK_GEAR_ORDER, REALM_CONQUEST_HOARD, REALM_TREASURY_TIER_MULT, realmHoardText } from "@/utils/civDemographics";

/*
 * 📣 What's New: the hard-coded update notices (WhatsNewModal.tsx). A notice of the newest version dated in the last
 * NEW_NOTICE_DAYS shows once after signing in (or entering the realm as a guest) until the player ticks "Don't show again"; ☰ menu → What's
 * New reopens every version's notices, picked by version.
 *
 * Versions are weekly and follow from the date: the week of the first release (Monday VERSION_EPOCH) is v1.0, and every
 * Monday starts the next (v1.1, v1.2, …), so a notice lands in its week's version by its date alone.
 *
 * Every major change or new game feature adds an entry here in the same change (CLAUDE.md), newest first. Numbers come
 * from the client mirrors of the server rules, never typed by hand, so a notice can't drift from the game.
 */

/** The colour a notice glows in (its banner, icon medallion and highlights) */
export type NoticeAccent = "gold" | "ember" | "steel" | "royal" | "moon" | "blood";

/** A headline design: its lettering, entrance and the effect behind it */
export type BannerStyle = "gilded" | "inferno" | "forge" | "arcane" | "moonlit" | "savage" | "storm" | "dawn" | "heroic";

export interface UpdateNotice {
  /** Stable id: what "Don't show again" remembers. Never reuse or rename one */
  id: string;
  /** Day it shipped, YYYY-MM-DD */
  date: string;
  /** Big headline */
  title: string;
  /** One line under the headline */
  tagline: string;
  /** A short paragraph */
  body: string;
  /** Key facts, one line each */
  highlights?: string[];
  icon: LucideIcon;
  accent: NoticeAccent;
  /** How its headline looks and enters (WhatsNewModal.tsx BANNERS): every update gets a design of its own */
  banner: BannerStyle;
  /** Guide Book chapter id (guideContent.ts) that tells the whole story */
  guideChapter?: string;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const x = (v: number) => `${v}×`;
const n = (v: number) => v.toLocaleString("en-US");
const hours = (ms: number) => {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.round((ms % 3_600_000) / 60_000);
  return m ? `${h} h ${m} m` : `${h} h`;
};
const hoardTotal = (t: keyof typeof REALM_CONQUEST_HOARD) => {
  const h = REALM_CONQUEST_HOARD[t];
  return h.gold + h.iron + h.stone + h.lumber + h.food;
};
const firstMerc = MERC_RULES[MERC_RARITIES[0]];
const lastMerc = MERC_RULES[MERC_RARITIES[MERC_RARITIES.length - 1]];
const epicArmory = ARMORY_RULES[ARMORY_RARITIES[ARMORY_RARITIES.length - 1]];
const epicTreasuryGold = NPC_KINGDOM_TREASURY_PER_LEVEL.gold * 25 * REALM_TREASURY_TIER_MULT.epic;
const wipedOut = 70;

export const UPDATE_NOTICES: UpdateNotice[] = [
  {
    id: "2026-11-battle-ring",
    date: "2026-11-09",
    title: "The Ring of Steel",
    tagline: "Armies now surround their target, and the enemy turns to meet them",
    body: `A battle no longer piles up on one road. Every army of a Muster or a rally walks round to its own place in a ring about the castle, boss or pack it attacks. A boss or pack turns to face the army it is striking, and when that army falls, it turns to the next.`,
    highlights: [
      "Marches that leave together walk side by side as one host, so a bigger attack looks bigger",
      "Each army takes its own place around the target, and stays there if another joins or falls",
      "Bosses and packs face the army they are striking now",
      "The round now shows between the crossed swords, clear of the fight",
      "Spells are softer on the world map, so you can see the armies through them",
      "The Muster now offers a smaller last march for your leftover soldiers while a slot is free"
    ],
    icon: Swords,
    accent: "steel",
    banner: "storm",
    guideChapter: "battles"
  },
  {
    id: "2026-11-free-realms-hoard",
    date: "2026-11-08",
    title: "The Conquest Hoard",
    tagline: "Free realms now pay like kings: break a garrison, claim a fortune",
    body: `The NPC kingdoms of the buffer zones grew rich. Their treasuries scale with their tier, and every realm guards a conquest hoard paid straight into the treasuries of those who break its garrison, by the damage each ruler dealt. An epic realm's hoard is ${realmHoardText("epic")}, more resources than a world boss's hoard, and it is back every day.`,
    highlights: [
      `Conquest hoard by tier: common ${realmHoardText("common")}, uncommon ${realmHoardText("uncommon")}, rare ${realmHoardText("rare")}, epic ${realmHoardText("epic")}`,
      `Paid straight into your treasury (no load needed), split by damage dealt; your bands and champion count for you`,
      `Once a day per realm: it is back 24 h after it was won, and the march form shows when`,
      `Treasuries × tier (common ${x(REALM_TREASURY_TIER_MULT.common)}, uncommon ${x(REALM_TREASURY_TIER_MULT.uncommon)}, rare ${x(REALM_TREASURY_TIER_MULT.rare)}, epic ${x(REALM_TREASURY_TIER_MULT.epic)}): a City Hall 25 realm holds ${n(epicTreasuryGold)} gold to plunder`,
      `An epic hoard alone is ${n(hoardTotal("epic"))} resources, ${Math.round(hoardTotal("epic") / hoardTotal("common"))}× a common one`
    ],
    icon: Crown,
    accent: "gold",
    banner: "gilded",
    guideChapter: "free-realms"
  },
  {
    id: "2026-11-moonwell-healers",
    date: "2026-11-08",
    title: "Moonwell Healers",
    tagline: "Elves: half the fallen come home wounded, not dead",
    body: `Elves are the fewest people in the realm, so every death cost them dearly. Now ${pct(MOONWELL.WOUNDED_SHARE)} of the soldiers an elf army loses in battle are carried home wounded to the Moonwell instead of dying, and the Moonwell heals a few of them at every harvest.`,
    highlights: [
      `${pct(MOONWELL.WOUNDED_SHARE)} of an elf army's battle losses come home wounded: attacking, defending or reinforcing`,
      `At every harvest ${pct(MOONWELL.HEAL_SHARE_PER_HARVEST)} of your soldier cap (at least ${MOONWELL.HEAL_MIN_PER_HARVEST}) rejoins the garrison, the longest-wounded first`,
      `Hasten them home at once: ${MOONWELL.HASTEN_PER_SOLDIER.food} food + ${MOONWELL.HASTEN_PER_SOLDIER.gold} gold each and 1 Sylvan Emerald per ${MOONWELL.HASTEN_SOLDIERS_PER_EMERALD} (${wipedOut} wounded: ${n(hastenCostFor(wipedOut).food)} food, ${n(hastenCostFor(wipedOut).gold)} gold)`,
      `The wounded keep their place in the population; road losses and caught scouts still die`
    ],
    icon: HeartPulse,
    accent: "moon",
    banner: "moonlit",
    guideChapter: "battles"
  },
  {
    id: "2026-11-champions",
    date: "2026-11-07",
    title: "Champions Rise",
    tagline: "Every kingdom has a legendary hero of its own",
    body: `Your kingdom has a champion: a legendary hero rolled once for you, with its own name, look and Battle Arts. Let it lead a march from the Muster, or let it lead your garrison at home. It rises on Renown from the battles it leads, and it falls but never dies.`,
    highlights: [
      `A legendary kit: Instinct at level ${KIT_UNLOCKS.instinct1}, Arts at ${KIT_UNLOCKS.art1} and ${KIT_UNLOCKS.art2}, a second Instinct at ${KIT_UNLOCKS.instinct2}, its Finale at ${KIT_UNLOCKS.finale}`,
      `Levels 1–${CHAMPION_MAX_LEVEL}, never above your City Hall: +${(CHAMPION_STAT_PER_LEVEL * 100).toFixed(1)}% HP, ATK and DEF a level for the march it leads (+${Math.round(CHAMPION_STAT_PER_LEVEL * CHAMPION_MAX_LEVEL * 100)}% at level ${CHAMPION_MAX_LEVEL})`,
      `Falls, never dies: heals by itself (${hours(healMsFor(20))} at level 20), or hasten it with gold and food`,
      `${n(LOOK_OPTIONS ** CHAMPION_SLOTS.length)} looks per civilization, ${CHAMPION_SLOTS.length} slots rolled like a collectible`
    ],
    icon: Medal,
    accent: "royal",
    banner: "heroic",
    guideChapter: "champions"
  },
  {
    id: "2026-11-armory",
    date: "2026-11-07",
    title: "The Armory Opens",
    tagline: "Quality instead of quantity: forge war gear for your soldiers",
    body: `Every civilization forges three sets of war gear of its own. A march in a set hits harder than the same march in standard gear, so your soldiers count for more once your march slots are full. Pick the Loadout in the Muster, and forge the shortfall right there.`,
    highlights: [
      ARMORY_RARITIES.map((r) => `${r[0].toUpperCase()}${r.slice(1)} ${x(ARMORY_RULES[r].power)} from City Hall ${ARMORY_RULES[r].minLevel}`).join(" · "),
      `Forged from iron, lumber and gold (an epic set also takes a gem of your civilization): 100 epic sets cost ${costText(epicArmory.forge)}`,
      `Sets cost upkeep every harvest; what the treasury can't pay rusts back to the stock pile`,
      `Scrap sets you no longer want at home (nothing comes back, and their upkeep stops)`,
      `Against raid content a set counts less: ${pct(ARMORY_TARGET_SHARE.boss!.share)} on a world boss, ${pct(ARMORY_TARGET_SHARE.gate!.share)} on a frontier gate`
    ],
    icon: Swords,
    accent: "steel",
    banner: "forge",
    guideChapter: "armory"
  },
  {
    id: "2026-11-mercenaries",
    date: "2026-11-07",
    title: "Swords for Hire",
    tagline: "Mercenary bands fill the march slots your soldiers can't",
    body: `No civilization's soldiers fill every march slot. Now your civilization's legendary landmark is your Mercenary Camp: hire a band there, and it marches as one whole march of its own, with no rations and no population, and Battle Arts of its rarity.`,
    highlights: [
      `A band is one march: ${x(firstMerc.power)} (common) to ${x(lastMerc.power)} (legendary) the power of one full march of yours`,
      `Hold at most ${bandCapForSlots(1)} band with 1–3 march slots, ${bandCapForSlots(4)} with 4–5; epic bands need ${MERC_RULES.epic.minSlots} slots, legendary ${MERC_RULES.legendary.minSlots}`,
      `Hire from ${costText(firstMerc.price)}; each band costs upkeep every harvest and one harvest's pay per fight`,
      `Bands attack and guard your walls, but don't scout, gather or rally; on a world boss they land only ${pct(BAND_BOSS_DAMAGE)} of their blows`,
      `Losses are strength: heal a band for resources and time, or it dies at 0%`
    ],
    icon: Coins,
    accent: "ember",
    banner: "inferno",
    guideChapter: "mercenaries"
  },
  {
    id: "2026-11-wild-arts",
    date: "2026-11-08",
    title: "The Wild Fights Back",
    tagline: "Mobs and bandits cast Battle Arts, strike back and hide their gear",
    body: `Every roving pack now fights with a Battle Arts kit sized by its rarity and themed to the creature, and its creatures lunge and rear back as they cast. New packs roll in every harvest, and each one hides its gear until you scout it.`,
    highlights: [
      `Kits by rarity: common ${KIT_SIZES.common.instincts} Instinct, uncommon + ${KIT_SIZES.uncommon.arts} Art, rare ${KIT_SIZES.rare.instincts} Instincts + ${KIT_SIZES.rare.arts} Art, epic ${KIT_SIZES.epic.instincts} + ${KIT_SIZES.epic.arts} Arts (a kit makes a pack different, not harder)`,
      `Every harvest each buffer zone rolls fresh encounters: a common for sure, more commons and uncommons by chance, a rare half the time, an epic one time in four`,
      `Hidden gear: ${PACK_GEAR_ORDER.map((g) => `${PACK_GEAR[g].name} ${pct(PACK_GEAR[g].chance)}`).join(", ")}; better gear is tougher and carries up to +${pct(PACK_GEAR.war_geared.loot - 1)} loot`,
      `Only a scout report shows a pack's gear: scouting before you attack pays`
    ],
    icon: Skull,
    accent: "blood",
    banner: "savage",
    guideChapter: "battle-arts"
  },
  {
    id: "2026-11-muster-colossi",
    date: "2026-11-07",
    title: "The Muster & the Colossi",
    tagline: "Launch every march at once, against bosses that fight like titans",
    body: `The Muster sends your bands and boxes of soldiers at one target with one Launch: they arrive in the same moment and all fight from round 1. The world bosses grew into true colossi to match: a full kit with Cleave, an ult of their own, and two new rules.`,
    highlights: [
      `One screen, one Launch: every march you send arrives together and fights from round 1`,
      `${BOSS_BATTLE_CAP.name}: no single battle can take more than ${pct(BOSS_BATTLE_CAP.share)} of a boss's max HP`,
      `${BOSS_WRATH.name}: one ruler taking ${pct(BOSS_WRATH.trigger)} of a boss's HP in a battle makes it rage (ATK ×${BOSS_WRATH.atkMult}); rallies never wake it`,
      `Every boss carries ${KIT_SIZES.legendary.instincts + 1} Instincts with Cleave, ${KIT_SIZES.legendary.arts} Arts and an ult of its own`
    ],
    icon: Flame,
    accent: "moon",
    banner: "storm",
    guideChapter: "battle-arts"
  },
  {
    id: "2026-10-battle-arts",
    date: "2026-10-29",
    title: "Battle Arts",
    tagline: "Instincts, cast Arts and Finales: battles become spellwork",
    body: `Named units now carry Battle Arts on top of their stats: Instincts that are always on, Arts they cast round by round, and a Finale, the ultimate, once a battle. World bosses came first with full kits, and every Art, Finale and status got a look of its own on the map.`,
    highlights: [
      `Statuses that bite: burn, poison, bleed, paralyze, chill and freeze, wards, rally cries and sunder`,
      `A legendary kit: ${KIT_SIZES.legendary.instincts} Instincts, ${KIT_SIZES.legendary.arts} Arts and ${KIT_SIZES.legendary.finale} Finale`,
      `Rally battles last longer, room for a Finale to land`,
      `Try them in the Sparring Grounds of the Royal Codex`
    ],
    icon: Wand2,
    accent: "royal",
    banner: "arcane",
    guideChapter: "battle-arts"
  },
  {
    id: "2026-10-weekly-chronicle",
    date: "2026-10-29",
    title: "The Weekly Chronicle",
    tagline: "Every week the bard tells the realm's story",
    body: `Each week's battles, conquests and records become a chapter of the realm's story, illustrated and marked by the bard. Read the newest in its banner, and every past chapter in the Royal Codex's Chronicles tab.`,
    icon: BookOpen,
    accent: "gold",
    banner: "dawn",
    guideChapter: "chronicle"
  },
  {
    id: "2026-10-world-disasters",
    date: "2026-10-28",
    title: "World Disasters",
    tagline: "Storms, plagues and blood moons sweep the realm",
    body: `Up to ${DISASTER_SCHEDULE.MAX_PER_WEEK} disasters a week strike the whole realm, each for ${DISASTER_SCHEDULE.DURATION_H} hours with ${DISASTER_SCHEDULE.WARNING_H} hour's warning. Every civilization copes with one of them and suffers another, so a disaster is bad luck for some and a chance for others.`,
    highlights: [
      `${DISASTER_SCHEDULE.DURATION_H} hours each, never two on one day, announced ${DISASTER_SCHEDULE.WARNING_H} hour ahead`,
      `Each civilization copes with one disaster (half the effect) and suffers another (double)`
    ],
    icon: CloudLightning,
    accent: "moon",
    banner: "storm",
    guideChapter: "disasters"
  },
  {
    id: "2026-10-battle-numbers",
    date: "2026-10-28",
    title: "Battles You Can Read",
    tagline: "Numbers over every round, remains on the field, disguised scouts",
    body: `Battle numbers now rise over both sides after every round, routed armies leave their remains on the battlefield, and scouts ride their civilization's mount disguised as the target's people. A fresh wave of resource nodes appears with every other roving window, and boss hoards and NPC treasuries grew richer.`,
    icon: Swords,
    accent: "steel",
    banner: "forge",
    guideChapter: "battles"
  },
  {
    id: "2026-10-hd-graphics",
    date: "2026-10-23",
    title: "The Realm in HD",
    tagline: "A Normal / HD switch and hand-built heroes",
    body: `Game settings now offer HD graphics: real terrain and water, swaying grass, and HD versions of every model in the realm, from common bands to rigged world bosses, legendary landmarks and Wonder castles. Normal graphics stay light for older machines.`,
    icon: MonitorSmartphone,
    accent: "moon",
    banner: "moonlit",
    guideChapter: "rarity"
  },
  {
    id: "2026-10-scriptorium",
    date: "2026-10-21",
    title: "Scriptorium, Watchtower & Omens",
    tagline: "Your project tree, deed reports and a voice to the admins",
    body: `The Scriptorium maps every repository into the realm's project tree and takes your deed reports. Managers watch the work from the Watchtower. And any ruler can send an Omen, feedback to the admins, heeded as a herald notice.`,
    icon: Feather,
    accent: "gold",
    banner: "dawn",
    guideChapter: "scriptorium"
  },
  {
    id: "2026-10-proclamations",
    date: "2026-10-21",
    title: "Royal Proclamations",
    tagline: "Paid Settlers, Festivals and the Call to Arms",
    body: `Rulers can now proclaim: pay settlers to grow the population, throw a Festival, or sound the Call to Arms. Admins can give a kingdom a Festival from the Royal Decrees.`,
    icon: Megaphone,
    accent: "ember",
    banner: "gilded",
    guideChapter: "proclamations"
  },
  {
    id: "2026-10-day-night-realms",
    date: "2026-10-19",
    title: "Seasons, Day & Night",
    tagline: "The seasons turn, the realm wakes and sleeps, and its free realms grow",
    body: `Day and night now take turns with the harvest, and each week brings a season that favours one civilization over another. The buffer realms grow from common to epic over a ${REALM_CYCLE_DAYS}-day cycle and move on, and the map's creatures walk, hop, slither and fly on their own.`,
    highlights: [
      `Day and night take turns every harvest; the season changes every week`,
      `Buffer realms climb common → uncommon → rare → epic over ${REALM_CYCLE_DAYS} days`,
      `Dangerous scouting and the Spymaster's Tower`
    ],
    icon: Sun,
    accent: "gold",
    banner: "dawn",
    guideChapter: "seasons"
  },
  {
    id: "2026-10-renown-decrees",
    date: "2026-10-18",
    title: "Heralds, Decrees & Renown",
    tagline: "The realm speaks, the crown rules, the best are remembered",
    body: `The herald brings notices of realm events to every kingdom. Royal Decrees let the crown announce, gift, shield and punish. The Hall of Renown ranks the rulers, and the Archon of the Realm stands over all.`,
    icon: Trophy,
    accent: "royal",
    banner: "gilded",
    guideChapter: "titles"
  },
  {
    id: "2026-10-frontier-gates",
    date: "2026-10-18",
    title: "Frontier Gates & Landmarks",
    tagline: "Each province is sealed behind a gate of its own",
    body: `Frontier gates guard the four mortal provinces: while a gate stands unburnt, no other civilization can march on its cities. Province-heart landmarks draw pilgrims of their own people, and epic landmarks rise and crumble in rotation.`,
    icon: Flag,
    accent: "steel",
    banner: "forge",
    guideChapter: "gates"
  },
  {
    id: "2026-10-war",
    date: "2026-10-16",
    title: "The Realm Goes to War",
    tagline: "March, scout, gather, rally and slay colossi",
    body: `Armies march across the map in live battles: walls rise and burn, scouts lift the fog of war, gatherers work the resource nodes, and rallies bring allies together against world bosses, NPC kingdoms and the Special Overseers. Milestone titles reward every ruler's deeds.`,
    highlights: [
      `March slots open at City Hall ${MARCH_SLOT_LEVELS.join(", ")}`,
      `Live battles with walls, burning and the War Room's reports`,
      `World bosses, NPC kingdoms and Special Overseers to raid together`
    ],
    icon: Swords,
    accent: "blood",
    banner: "inferno",
    guideChapter: "armies"
  },
  {
    id: "2026-10-launch",
    date: "2026-10-14",
    title: "The Realm Rises",
    tagline: "Rise of Git: a kingdom built from your Git activity",
    body: `Every developer rules a kingdom built from their commits: each repository becomes a building, XP raises its level, and the castle grows with you. Five civilizations share a world map of provinces, harvest resources and rare gems, and spend them on city improvements.`,
    highlights: [
      `Commits earn XP; repositories become buildings that level up`,
      `Five civilizations: Valoria, Sylvandale, Ironforge, Drak'mar and the Nethergarde Voidrift`,
      `A harvest of resources and scarce gems, the Ledger and city improvements`,
      `The Guide Book and Royal Codex tell every rule and show every model`
    ],
    icon: Castle,
    accent: "gold",
    banner: "gilded",
    guideChapter: "realm"
  }
];

/** Ids the player has dismissed for good ("Don't show again") */
const STORAGE_KEY = "rogt.whatsNew.dismissed";

export function readDismissedNotices(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(list) ? list.filter((v): v is string => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

export function dismissNotices(ids: string[]) {
  try {
    const all = readDismissedNotices();
    ids.forEach((id) => all.add(id));
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...all]));
  } catch {
    // Storage blocked (private window): the notice shows again next visit
  }
}

/** A notice shows by itself while it is this many days old or younger; older ones live under ☰ → What's New */
export const NEW_NOTICE_DAYS = 7;

/** Monday of v1.0's week (the first release shipped Wednesday 2026-10-14); every Monday after starts the next version */
export const VERSION_EPOCH = "2026-10-12";
const DAY_MS = 86_400_000;
const dayOf = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
const versionIndex = (version: string) => Number(version.split(".")[1] ?? 0);

/** "v1.3": the version of the week a date falls in */
export const versionOf = (date: string) => `v1.${Math.max(0, Math.floor((dayOf(date) - dayOf(VERSION_EPOCH)) / (7 * DAY_MS)))}`;

/** A version's week, Monday to Sunday (YYYY-MM-DD) */
export function versionWeek(version: string): { from: string; to: string } {
  const from = dayOf(VERSION_EPOCH) + versionIndex(version) * 7 * DAY_MS;
  return { from: new Date(from).toISOString().slice(0, 10), to: new Date(from + 6 * DAY_MS).toISOString().slice(0, 10) };
}

/** A name for each version's week, shown beside its number in the picker */
export const VERSION_TITLES: Record<string, string> = {
  "v1.0": "The Realm Rises",
  "v1.1": "Seasons, Day, Night & HD",
  "v1.2": "Arts & Omens of War",
  "v1.3": "Swords, Steel & Heroes",
  "v1.4": "The Ring of Steel"
};

export interface UpdateVersion {
  version: string;
  title?: string;
  from: string;
  to: string;
  notices: UpdateNotice[];
}

/** Every version that has notices, newest first (its notices newest first) */
export const UPDATE_VERSIONS: UpdateVersion[] = (() => {
  const byVersion = new Map<string, UpdateNotice[]>();
  [...UPDATE_NOTICES]
    .sort((a, b) => b.date.localeCompare(a.date))
    .forEach((u) => {
      const v = versionOf(u.date);
      byVersion.set(v, [...(byVersion.get(v) ?? []), u]);
    });
  return [...byVersion.entries()]
    .map(([version, notices]) => ({ version, title: VERSION_TITLES[version], ...versionWeek(version), notices }))
    .sort((a, b) => versionIndex(b.version) - versionIndex(a.version));
})();

/** Notices that show by themselves: the newest version's, dated in the last NEW_NOTICE_DAYS and not dismissed, newest first */
export const unseenNotices = (now = Date.now()) => {
  const dismissed = readDismissedNotices();
  return (UPDATE_VERSIONS[0]?.notices ?? []).filter((u) => !dismissed.has(u.id) && now - dayOf(u.date) <= NEW_NOTICE_DAYS * DAY_MS);
};
