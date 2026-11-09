import { BossHeroDef } from "./heroRig";
import { STONE_HEROES } from "./heroVoidStone";
import { LION_HEROES } from "./heroVoidLion";
import { KNIGHT_HEROES } from "./heroVoidKnight";
import { GATE_HEROES } from "./heroVoidGate";
import { WRAITH_HEROES } from "./heroVoidWraith";
import { SPIDER_HEROES } from "./heroVoidSpider";

/**
 * The Void Gate's creatures in high graphics (coming soon), by type: every size of every family a rigged hero (drawn by
 * `BossBatch`, every copy in the same draws), as the mercenaries are. Their Normal rigs are in `voidRigs.ts`.
 */
export const VOID_HEROES: Record<string, BossHeroDef> = { ...STONE_HEROES, ...WRAITH_HEROES, ...SPIDER_HEROES, ...LION_HEROES, ...KNIGHT_HEROES, ...GATE_HEROES };
