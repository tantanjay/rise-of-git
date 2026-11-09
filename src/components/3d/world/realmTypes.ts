/**
 * The buffer realms' model types (mirrors the server's BUFFER_POOLS kingdoms: 3 per buffer zone). Their staged models
 * are in realms.ts; kept apart so landmarks.ts can list them without importing the models.
 */
export const REALM_MODEL_TYPES = new Set<string>([
  "bk-corsair-citadel",
  "bk-port-royale",
  "bk-merfolk-enclave",
  "bk-nomad-pavilions",
  "bk-brass-sultanate",
  "bk-sandstrider",
  "bk-ranger-barony",
  "bk-dryad-court",
  "bk-greenwood-bastion",
  "bk-forgehold",
  "bk-thunderpeak",
  "bk-rider-eyrie"
]);

/** Sea realms: they stand in the water on a plank jetty ring (their soldiers walk it) */
export const WATER_REALM_TYPES = new Set<string>(["bk-corsair-citadel", "bk-port-royale", "bk-merfolk-enclave"]);

/** Stages of a realm's cycle, common → epic (server: REALM_CYCLE.STAGES) */
export const REALM_STAGES = ["common", "uncommon", "rare", "epic"] as const;
/** City Hall levels a stage climbs through (server: realmLevelOn): building at the first, then a level a day */
export const REALM_STAGE_LEVELS: Array<[number, number]> = [
  [6, 10],
  [11, 15],
  [16, 20],
  [21, 25]
];
/** Days a stage lasts, and the cycle (4 stages) */
export const REALM_STAGE_DAYS = 7;
export const REALM_CYCLE_DAYS = REALM_STAGE_DAYS * REALM_STAGES.length;
/** "Uncommon realm · City Hall 12 · day 3 of 7" */
export function realmStageLabel(r: { stage: number; day: number; level: number }): string {
  const name = REALM_STAGES[r.stage] ?? "epic";
  return `${name[0].toUpperCase()}${name.slice(1)} realm · City Hall ${r.level} · day ${r.day + 1} of ${REALM_STAGE_DAYS}`;
}

/** The realm's size on the map by stage: it grows from smaller than a landmark to far bigger */
export const REALM_STAGE_SCALE = [0.75, 0.85, 0.95, 1.1];
