import type { ActiveMarch } from "@/types";
import { MERC_RULES } from "@/utils/mercenaries";

/** How many of a band's models stand on the map: its share of strength of its rarity's models, at least one while it lives */
export const bandModelsStanding = (m: Pick<ActiveMarch, "band" | "soldiersCount">) => {
  const b = m.band;
  if (!b || m.soldiersCount <= 0) return 0;
  const n = MERC_RULES[b.rarity].models;
  return Math.max(1, Math.min(n, Math.ceil(n * b.strength - 1e-6)));
};
