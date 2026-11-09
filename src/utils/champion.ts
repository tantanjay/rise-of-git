// Client copy of the numbers in server/src/championRules.ts (GAME_GUIDE §13 *Champions*) the books and the card quote:
// `npm run sim:balance` checks the two match.
import type { ChampionLooks, ChampionSlot } from "@/types";

export type { ChampionLooks, ChampionSlot };

/** Highest level; a champion is never above its kingdom's City Hall level */
export const CHAMPION_MAX_LEVEL = 30;
/** Renown (XP) needed to reach `level` from level 1 */
export const xpForLevel = (level: number) => 20 * Math.max(0, Math.floor(level) - 1) ** 2;
/** Level each part of the kit unlocks at */
export const KIT_UNLOCKS = { instinct1: 1, art1: 5, art2: 10, instinct2: 15, finale: 20 } as const;
/** Stat shares the army a champion leads gains per champion level (HP, ATK and DEF alike) */
export const CHAMPION_STAT_PER_LEVEL = 0.003;
/** Share of its army's blow a champion's Arts and Instincts carry */
export const CHAMPION_ART_SHARE = 0.13;
/** A max-level champion's march scores at most this much over the same march without it */
export const CHAMPION_MAX_GAIN = 0.25;
/** Renown a battle the champion led brings, before the day's diminishing */
export const RENOWN = { perRound: 2, perSqrtKill: 2, killsCap: 30, win: 15, bossFelled: 60, realmFelled: 40, finaleKill: 20 } as const;
/** Renown counts whole to `full` a realm day, half to `half`, then a quarter */
export const DAILY_RENOWN = { full: 200, half: 500 } as const;
/** Share of a champion's worth that counts against a frontier gate or an epic / legendary roving pack */
export const CHAMPION_TARGET_SHARE: Record<"gate" | "epic_pack", { share: number; name: string; emblem: string; description: string }> = {
  gate: {
    share: 0.1,
    name: "Marked from the Gatehouse",
    emblem: "🏯",
    description: "a champion counts a tenth of its worth against a frontier gate (every crossbow on the walls looks for the hero under the banner)"
  },
  epic_pack: {
    share: 0.3,
    name: "Legends of the Wild",
    emblem: "🐉",
    description: "a champion counts 30% of its worth against an epic or legendary roving pack (beasts and outlaws of legend don't break before a hero's banner)"
  }
};
/** A fallen champion heals by itself in 2 h + 10 min per level */
export const healMsFor = (level: number) => 2 * 3_600_000 + 10 * 60_000 * Math.max(1, level);
/** Level from which hastening a champion's healing also takes a gem */
export const HASTEN_GEM_LEVEL = 20;

/** The slots of a champion's rolled look, in the card's order */
export const CHAMPION_SLOTS: ChampionSlot[] = ["head", "face", "body", "armour", "cloak", "weapon", "aura", "mark"];
/** Options in every slot of every civilization's part library */
export const LOOK_OPTIONS = 4;

/** The flat stat bonus (a share) a champion of `level` gives the army it leads */
export const championStatAt = (level: number) => Math.round(CHAMPION_STAT_PER_LEVEL * Math.max(1, Math.min(CHAMPION_MAX_LEVEL, level)) * 10000) / 10000;

/** The model key of a champion of `civ` with `looks` (the HD champion kit builds it from the key) */
export const championModelType = (civ: string, looks: ChampionLooks) => `champion:${civ}:${CHAMPION_SLOTS.map((s) => looks[s] ?? 0).join("")}`;
