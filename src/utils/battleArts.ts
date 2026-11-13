import type { BattleArtEvent } from "@/types";

/**
 * Client copy of the Battle Arts rules the books quote (server/src/battleArts.ts and COMBAT in warConfig.ts;
 * `npm run sim:arts` checks they match). The server runs every cast; the client only shows what it is told.
 */

export type UnitRarity = "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic";

/** Most Instincts / Arts / Finales a unit of each rarity carries */
export const KIT_SIZES: Record<UnitRarity, { instincts: number; arts: number; finale: number }> = {
  common: { instincts: 1, arts: 0, finale: 0 },
  uncommon: { instincts: 1, arts: 1, finale: 0 },
  rare: { instincts: 2, arts: 1, finale: 0 },
  epic: { instincts: 2, arts: 2, finale: 0 },
  legendary: { instincts: 2, arts: 2, finale: 1 },
  mythic: { instincts: 3, arts: 3, finale: 1 }
};

/** A world boss's kit, a colossus's: one Instinct more than a legendary unit's (Cleave on every boss), 2 Arts and its own Finale (mirrors BOSS_KIT_SIZE in server/src/battleArts.ts) */
export const BOSS_KIT_SIZE = { instincts: 3, arts: 2, finale: 1 };

export type StatusKind = "burn" | "poison" | "bleed" | "paralyze" | "chill" | "freeze" | "ward" | "rally" | "sunder";

export const STATUS_RULES: Record<StatusKind, { name: string; emblem: string; rounds: number; harmful: boolean; text: string }> = {
  burn: { name: "Burn", emblem: "🔥", rounds: 3, harmful: true, text: "takes fire damage at the end of each round for 3 rounds" },
  poison: { name: "Poison", emblem: "☠️", rounds: 5, harmful: true, text: "weaker than Burn, lasts 5 rounds, and the same caster can stack it 3 deep" },
  bleed: { name: "Bleed", emblem: "🩸", rounds: 3, harmful: true, text: "ticks for 3 rounds, harder the more soldiers its target has already lost" },
  paralyze: { name: "Paralyze", emblem: "⚡", rounds: 1, harmful: true, text: "−50% damage dealt the round it lands" },
  chill: { name: "Chill", emblem: "❄️", rounds: 2, harmful: true, text: "−ATK for 2 rounds" },
  freeze: { name: "Freeze", emblem: "❄️", rounds: 1, harmful: true, text: "frozen solid: no counter-strike for a round (a boss is only Chilled)" },
  ward: { name: "Ward", emblem: "🛡️", rounds: 2, harmful: false, text: "less damage taken from blows and strikes" },
  rally: { name: "Rally cry", emblem: "💢", rounds: 2, harmful: false, text: "+ATK for the caster's side" },
  sunder: { name: "Sunder", emblem: "💔", rounds: 3, harmful: true, text: "−DEF, so every blow bites deeper" }
};

export const FINALE_LAST_STAND = 0.25;
export const STATUS_MAX_SOURCES = 3;
export const BOSS_PARALYZE_MULT = 0.5;
/** Freeze on a boss is only a Chill of this share for 2 rounds (mirrors BOSS_FREEZE_CHILL) */
export const BOSS_FREEZE_CHILL = 0.5;
export const BLEED_GROWTH = 1;
/** Rounds of a battle, and of a rally's */
export const BATTLE_ROUNDS = 6;
export const RALLY_BATTLE_ROUNDS = 8;

/** A happening as one line (the battle report's rounds) */
export function artEventText(e: BattleArtEvent): string {
  const lost = e.losses ? ` −${e.losses.toLocaleString()}` : "";
  if (e.kind === "finale") {
    const head = `🎺 ${e.unit}'s Finale — ${e.name}${e.lastStand ? ", a last stand" : ""}`;
    return e.broke?.length ? `${head} — broke the last of ${e.broke.join(" and ")}` : `${head}${lost}`;
  }
  if (e.kind === "cast") return `${e.emblem} ${e.unit}: ${e.name}${e.target ? ` → ${e.target}` : ""}${lost}${e.healed ? ` +${e.healed.toLocaleString()} back` : ""}`;
  if (e.kind === "instinct") return `${e.emblem} ${e.unit}'s ${e.name}${e.losses ? lost : " wakes"}`;
  return `${e.emblem} ${e.name} on ${e.unit}${lost}`;
}
