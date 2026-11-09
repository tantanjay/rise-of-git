import { CivilizationType, BuildingType } from "./types.js";

export const CIVILIZATIONS: CivilizationType[] = ["human", "elf", "dwarf", "orc", "arcane"];
export const NORMAL_CIVILIZATIONS: CivilizationType[] = ["human", "elf", "dwarf", "orc"];

const TITLE_PREFIX: Record<CivilizationType, string> = {
  human: "Kingdom",
  elf: "Sanctuary",
  dwarf: "Bastion",
  orc: "Stronghold",
  arcane: "Spire"
};

/**
 * Distributes users across civilizations:
 * - Special users (managers/trackers) are permanently locked to Nethergarde Voidrift ('arcane').
 * - Non-special users are divided across the 4 normal civilizations:
 *     A = (Total Users - Special Users) / 4
 *     B = Floor(A)
 * - Each of the 4 normal civilizations receives B users randomly.
 * - Nethergarde Voidrift ('arcane') receives all special users plus any leftover remainder
 *     C = Total Users - (4 * B)
 *   The remainder is filled with administrators (`adminLogins`, in their listed order) first, then random users.
 */
export function distributeCivilizations<T extends { id: string; username?: string }>(
  users: T[],
  specialLogins: string[],
  adminLogins: string[] = []
): Map<string, CivilizationType> {
  const specialSet = new Set(specialLogins.map((s) => s.toLowerCase()));
  const specialUsers: T[] = [];
  const normalUsers: T[] = [];

  for (const u of users) {
    const id = u.id.toLowerCase();
    const username = (u.username || "").toLowerCase();
    if (specialSet.has(id) || (username && specialSet.has(username))) {
      specialUsers.push(u);
    } else {
      normalUsers.push(u);
    }
  }

  // Shuffle normal users randomly (Fisher-Yates)
  const shuffled = [...normalUsers];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const B = Math.floor(shuffled.length / 4);
  // The leftover places in Nethergarde go to administrators (in their listed order) before anyone else
  const leftover = shuffled.length - 4 * B;
  const adminIndex = (u: T) => adminLogins.findIndex((a) => a.toLowerCase() === u.id.toLowerCase() || a.toLowerCase() === (u.username || "").toLowerCase());
  const ascending = shuffled
    .filter((u) => adminIndex(u) >= 0)
    .sort((a, b) => adminIndex(a) - adminIndex(b))
    .slice(0, leftover);
  if (ascending.length > 0) {
    const rest = shuffled.filter((u) => !ascending.includes(u));
    shuffled.splice(0, shuffled.length, ...rest, ...ascending);
  }
  const result = new Map<string, CivilizationType>();

  // Special users always to Nethergarde Voidrift (arcane)
  for (const u of specialUsers) {
    result.set(u.id.toLowerCase(), "arcane");
  }

  // B users to each of the 4 normal civilizations
  let idx = 0;
  for (const civ of NORMAL_CIVILIZATIONS) {
    for (let c = 0; c < B && idx < shuffled.length; c++) {
      result.set(shuffled[idx++].id.toLowerCase(), civ);
    }
  }

  // Any remaining non-special users go to Nethergarde Voidrift (arcane)
  while (idx < shuffled.length) {
    result.set(shuffled[idx++].id.toLowerCase(), "arcane");
  }

  return result;
}

/** Stable string hash (FNV-1a) so deterministic assignments never change between syncs. */
export function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function getRandomCivilization(): CivilizationType {
  return CIVILIZATIONS[Math.floor(Math.random() * CIVILIZATIONS.length)];
}

export function pickCivilization(login: string): CivilizationType {
  return CIVILIZATIONS[hash(login) % CIVILIZATIONS.length];
}

export function kingdomTitleFor(civ: CivilizationType, displayName: string): string {
  const first = displayName.includes(",")
    ? displayName.split(",")[1].trim().split(" ")[0]
    : displayName.split(" ")[0];
  return `${TITLE_PREFIX[civ]} of ${first || displayName}`;
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days}d ago` : `${Math.floor(days / 30)}mo ago`;
}

/** Days off allowed in a row without breaking a streak (e.g. a weekend or a Wed–Thu rest) */
export const STREAK_GRACE_DAYS = 2;

/**
 * Commit streak: the number of days with commits, counting back from today. Up to
 * STREAK_GRACE_DAYS empty days in a row are forgiven (they don't add to the streak);
 * one more empty day ends it. Today never counts against the streak while it's in progress.
 */
export function streakFrom(days: Set<string>, now = new Date()): number {
  const d = new Date(now);
  const key = () => d.toISOString().slice(0, 10);
  if (!days.has(key())) d.setUTCDate(d.getUTCDate() - 1);
  let streak = 0;
  let gap = 0;
  for (let i = 0; i < 3660; i++) {
    if (days.has(key())) {
      streak++;
      gap = 0;
    } else if (++gap > STREAK_GRACE_DAYS) {
      break;
    }
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return streak;
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const MAX_BUILDING_LEVEL = 25;

/** The Archon of the Realm's fixed seat: an Empyrean castle and a full city of Celestial buildings beyond the mortal cap */
export const ARCHON_CASTLE_LEVEL = 30;
export const ARCHON_BUILDING_LEVEL = 30;
export const ARCHON_BUILDING_COUNT = 50;

/** True when a user's id or login is in a list of lower-case logins (SPECIAL_USERS, ARCHON_USERS…) */
export function loginListed(list: string[], user: { id?: string; username?: string }): boolean {
  const id = user.id?.toLowerCase() ?? "";
  const name = user.username?.toLowerCase() ?? "";
  return list.some((s) => (id && s === id) || (name && s === name));
}

/** A repo counts toward the Repo Holdings title once its building reaches this level */
export const REPO_HOLDING_MIN_LEVEL = 3;

/** A UTC day counts as a play day once the ruler made this many game actions (marches, rallies, trades, upgrades…) */
export const PLAY_DAY_MIN_ACTIONS = 5;
/** Play streak: activity score bonus per consecutive play day, and its cap (+20% at a 10-day streak) */
export const PLAY_STREAK_BONUS_PER_DAY = 0.02;
export const PLAY_STREAK_BONUS_MAX = 0.2;
/** Harvest bonus from titles is paid on at most this multiple of the realm's average harvest per ruler */
export const HARVEST_BONUS_CAP_MULT = 2;
/** Harvest pool weight = round(HARVEST_WEIGHT_SCALE × √activity score) + 1: 4× the work earns 2× the share */
export const HARVEST_WEIGHT_SCALE = 10;
/** No kingdom takes more than this share of a harvest pool (each resource and the gem drop); the excess goes to the others by weight */
export const HARVEST_SHARE_CAP = 0.1;

/** Harvest pool weight from a kingdom's activity score (sub-linear, so one heavy week can't take the pool) */
export function harvestWeight(activityScore: number): number {
  return Math.round(HARVEST_WEIGHT_SCALE * Math.sqrt(Math.max(0, activityScore))) + 1;
}

/**
 * Shares of a pool by weight, none above `maxShare`: capped kingdoms keep the cap and the excess is handed to the
 * others by weight, again until nobody is over. A cap too small for the realm (fewer kingdoms than 1 / cap) is lifted.
 */
export function cappedShares(weights: number[], maxShare: number): number[] {
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return weights.map(() => 0);
  const shares = weights.map((w) => w / total);
  if (maxShare * weights.length < 1) return shares;
  const capped = new Set<number>();
  for (;;) {
    let excess = 0;
    shares.forEach((s, i) => {
      if (!capped.has(i) && s > maxShare) {
        excess += s - maxShare;
        shares[i] = maxShare;
        capped.add(i);
      }
    });
    if (excess <= 1e-12) return shares;
    const free = shares.reduce((sum, s, i) => sum + (capped.has(i) ? 0 : s), 0);
    if (free <= 0) return shares;
    shares.forEach((s, i) => {
      if (!capped.has(i)) shares[i] = s + (excess * s) / free;
    });
  }
}

/** Consecutive play days ending today; today still in progress never breaks the streak */
export function playStreakFrom(days: Set<string>, now = new Date()): number {
  const day = (offset: number) => new Date(now.getTime() - offset * 86_400_000).toISOString().slice(0, 10);
  let offset = days.has(day(0)) ? 0 : 1;
  let streak = 0;
  while (days.has(day(offset))) {
    streak++;
    offset++;
  }
  return streak;
}
/** XP past the Lv25 threshold needed for each extra prestige (effects) tier */
const PRESTIGE_STEP = 200;
const MAX_PRESTIGE = 4;

/**
 * Contribution XP required to reach a building level (1 XP ≈ one ordinary commit, see scoring.ts).
 * Lv1 covers 0–5 XP; after that each level costs a little more (quadratic curve).
 * Lv2 = 6, Lv5 = 18, Lv10 = 70, Lv15 = 162, Lv20 = 294, Lv25 = 466.
 */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.ceil(5 + 0.8 * (level - 1) ** 2);
}

/**
 * Building level (1–25) plus prestige for XP beyond the level cap: `stars` counts one star per PRESTIGE_STEP XP
 * (uncapped), `prestige` is the visual effect tier, capped at MAX_PRESTIGE.
 */
export function calculateBuildingLevel(xp: number): {
  level: number;
  prestige: number;
  stars: number;
  levelXp: number;
  nextLevelXp: number | null;
} {
  let level = 1;
  while (level < MAX_BUILDING_LEVEL && xp >= xpForLevel(level + 1)) level++;

  const overflow = xp - xpForLevel(MAX_BUILDING_LEVEL);
  const stars = level === MAX_BUILDING_LEVEL ? 1 + Math.floor(Math.max(0, overflow) / PRESTIGE_STEP) : 0;
  const prestige = Math.min(MAX_PRESTIGE, stars);

  return {
    level,
    prestige,
    stars,
    levelXp: xpForLevel(level),
    nextLevelXp: level < MAX_BUILDING_LEVEL ? xpForLevel(level + 1) : null
  };
}

export const MAX_CITY_HALL_LEVEL = 25;

/**
 * What a building adds to the castle sum: its level, and past Lv25 its XP at the Lv25 rate
 * (25 per 466 XP), so a few deep repos weigh as much as the same XP spread over many repos.
 */
export function castleWeight(level: number, xp: number): number {
  if (level < MAX_BUILDING_LEVEL) return level;
  return Math.max(MAX_BUILDING_LEVEL, Math.floor((MAX_BUILDING_LEVEL * xp) / xpForLevel(MAX_BUILDING_LEVEL)));
}

/**
 * Castle level grows with the whole city: 1 + √(sum of castle weights), capped at 25 like buildings.
 * Square root keeps one huge repo from dwarfing a well-rounded kingdom; past Lv25 a repo's weight keeps
 * growing with its XP (castleWeight), so concentrated work is not lost at the building cap.
 * e.g. 1 hut → Lv2, ten Lv5 buildings → Lv8, twenty Lv20 buildings → Lv21, three repos at 3,866 XP → Lv25.
 * Past the cap the castle earns prestige tiers (1–4, every 3 raw levels) which only add effects.
 */
export function calculateCityHallLevel(buildings: Array<{ level: number; xp: number }>): { level: number; prestige: number } {
  const total = buildings.reduce((sum, b) => sum + castleWeight(b.level, b.xp), 0);
  const raw = 1 + Math.floor(Math.sqrt(total));
  const level = clamp(raw, 1, MAX_CITY_HALL_LEVEL);
  const prestige = raw > MAX_CITY_HALL_LEVEL ? Math.min(MAX_PRESTIGE, 1 + Math.floor((raw - MAX_CITY_HALL_LEVEL - 1) / 3)) : 0;
  return { level, prestige };
}

export const DISTRICT_QUOTAS: Array<{ type: BuildingType; quota: number }> = [
  { type: "residential_commercial", quota: 0.35 },
  { type: "animal_field", quota: 0.25 },
  { type: "food_field", quota: 0.25 },
  { type: "soldier_building", quota: 0.15 }
];

/** District that is furthest below its quota once one more building is added */
export function mostNeededDistrict(counts: Record<BuildingType, number>): BuildingType {
  const total = Object.values(counts).reduce((a, b) => a + b, 0) + 1;
  let best = DISTRICT_QUOTAS[0];
  let bestDeficit = -Infinity;
  for (const d of DISTRICT_QUOTAS) {
    const deficit = d.quota * total - (counts[d.type] || 0);
    if (deficit > bestDeficit) {
      best = d;
      bestDeficit = deficit;
    }
  }
  return best.type;
}

/**
 * Distributes kingdom repository count into 4 types according to exact occupancy requirements:
 * - 35% Houses for people (residential and commercial)
 * - 25% Animal field
 * - 25% Food field
 * - 15% Soldier buildings
 */
export function assignBuildingDistricts(totalRepos: number): BuildingType[] {
  if (totalRepos <= 0) return [];
  if (totalRepos === 1) return ["residential_commercial"];
  if (totalRepos === 2) return ["residential_commercial", "food_field"];
  if (totalRepos === 3) return ["residential_commercial", "animal_field", "food_field"];

  const targets = DISTRICT_QUOTAS;

  // Largest remainder method to ensure total strictly equals totalRepos
  const allocated = targets.map((t) => {
    const ideal = totalRepos * t.quota;
    const floor = Math.max(1, Math.floor(ideal)); // Ensure at least 1 when totalRepos >= 4
    const remainder = ideal - floor;
    return { type: t.type, count: floor, remainder };
  });

  let currentSum = allocated.reduce((sum, a) => sum + a.count, 0);

  // If sum exceeds totalRepos due to min 1 constraint, decrement from lowest quota types
  while (currentSum > totalRepos) {
    // Find the one with highest count > 1
    const cand = allocated.filter((a) => a.count > 1).sort((a, b) => a.remainder - b.remainder)[0];
    if (cand) {
      cand.count--;
      currentSum--;
    } else {
      break;
    }
  }

  // If sum is less than totalRepos, add to highest remainders
  while (currentSum < totalRepos) {
    allocated.sort((a, b) => b.remainder - a.remainder);
    allocated[0].count++;
    allocated[0].remainder -= 1;
    currentSum++;
  }

  const result: BuildingType[] = [];
  for (const item of allocated) {
    for (let i = 0; i < item.count; i++) {
      result.push(item.type);
    }
  }

  return result;
}
