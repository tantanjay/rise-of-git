import { BOSS_ACTIONS, BossHeroDef } from "./heroRig";
import { SEA_BOSSES } from "./heroBossesSea";
import { SAND_BOSSES } from "./heroBossesSand";
import { LAND_BOSSES } from "./heroBossesLand";
import { SKY_BOSSES } from "./heroBossesSky";
import { LEGENDARY_CREATURES, MERC_HEROES } from "./heroCreatures";
import { VOIDRIFT_MERCS } from "./heroMercs";
import { VALORIA_MERCS } from "./heroMercsHuman";
import { SYLVANDALE_MERCS } from "./heroMercsElf";
import { IRONFORGE_MERCS } from "./heroMercsDwarf";
import { DRAKMAR_MERCS } from "./heroMercsOrc";
import { championHero } from "./heroChampions";
import { OATHBOUND_DEF, OATHBOUND_TYPE } from "./heroOathbound";
import { VOID_HEROES } from "./heroVoid";

/**
 * Every creature on the map with a rigged hero for high graphics, by NPC type (drawn together by `BossBatch`): the world
 * bosses and the legendary creatures that stand on the map (the Bandit King)
 */
export const BOSS_HEROES: Record<string, BossHeroDef> = { ...SEA_BOSSES, ...SAND_BOSSES, ...LAND_BOSSES, ...SKY_BOSSES, ...LEGENDARY_CREATURES };

export const isBossHero = (type: string) => type in BOSS_HEROES;

/** Every mercenary with a rigged hero: every civilization's pool, common → legendary, and the Void Gate's Oathbound (coming soon) */
const MERCS: Record<string, BossHeroDef> = { ...VALORIA_MERCS, ...SYLVANDALE_MERCS, ...IRONFORGE_MERCS, ...DRAKMAR_MERCS, ...VOIDRIFT_MERCS, ...MERC_HEROES, [OATHBOUND_TYPE]: OATHBOUND_DEF };

/** Every rigged hero by type: the map's, the mercenaries and the Void Gate's creatures (never NPCs, so the map's filter never meets them) */
export const RIGGED_HEROES: Record<string, BossHeroDef> = { ...BOSS_HEROES, ...MERCS, ...VOID_HEROES };

/** A Void Gate creature (coming soon): a rigged hero shown only in its own Codex tab */
export const isVoidHero = (type: string) => type in VOID_HEROES;

export const isMercHero = (type: string) => type in MERCS;

/** A rigged hero by type: the fixed ones above, or a kingdom's champion built from its key (`champion:<civ>:<looks>`) */
export const riggedHero = (type: string): BossHeroDef | undefined => RIGGED_HEROES[type] ?? championHero(type);

/** The Codex's action buttons for a rigged hero */
export const heroActions = (type: string) => riggedHero(type)?.actions ?? BOSS_ACTIONS;
