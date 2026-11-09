import { useMemo } from "react";
import { CivilizationType, MapNPC } from "@/types";
import { Actors } from "@/components/3d/city/Actors";
import { Actor, ActorKind, Gesture } from "@/components/3d/city/parts";
import { SEA_LEVEL, Terrain } from "./terrain";
import { REALM_JETTY_R } from "./realms";
import { REALM_MODEL_TYPES, REALM_STAGE_SCALE, WATER_REALM_TYPES } from "./realmTypes";
import { MAGICAL_LANDMARK_TYPES } from "./landmarks";

/*
 * Life around the map's NPCs, like the townsfolk in a city: bandits patrol their camp, wolf packs and goblin
 * bands prowl around their lair, bats and harpies wheel overhead, herds graze at cattle and fleece nodes,
 * workers chop, reap and mine at resource nodes, villagers bustle around settlements and buffer kingdoms,
 * and pilgrims visit the great landmarks. While an army fights at an NPC, its figures stop what they were doing,
 * gather on the side facing the attackers and fight (livestock keeps grazing) until the battle is over.
 * Everything goes through one `Actors` set: a fixed handful of
 * cheap kinds (draw calls = their template parts, ~36), hidden when zoomed out past NPC_LIFE_LOD so the
 * overview map pays nothing.
 */

/** Camera-to-target distance under which the figures appear (the default overview is ~127) */
export const NPC_LIFE_LOD = 80;

const PERSON_SCALE = 1.7;

type Role = { kind: ActorKind; colors: string[]; scale?: number; y?: number; speed: number };

const BANDIT: Role = { kind: "villager_human", colors: ["#3f3f46", "#d6a77a", "#1c1917", "#7f1d1d"], scale: PERSON_SCALE, speed: 0.7 };
const PIRATE: Role = { kind: "villager_human", colors: ["#1e3a8a", "#d6a77a", "#7f1d1d", "#fbbf24"], scale: PERSON_SCALE, speed: 0.7 };
const CULTIST: Role = { kind: "villager_arcane", colors: ["#4c1d95", "#e9d5ff", "#1e1b4b", "#a855f7"], scale: PERSON_SCALE, speed: 0.5 };
const GOBLIN: Role = { kind: "villager_orc", colors: ["#3f6212", "#65a30d", "#1c1917", "#78350f"], scale: 1.5, speed: 0.8 };
const BRUTE: Role = { kind: "villager_orc", colors: ["#57534e", "#4d7c0f", "#1c1917", "#44403c"], scale: 2.5, speed: 0.45 };
const UNDEAD: Role = { kind: "villager_arcane", colors: ["#a8a29e", "#e7e5e4", "#57534e", "#1c1917"], scale: PERSON_SCALE, speed: 0.4 };
const WOLF: Role = { kind: "wolf", colors: ["#57534e", "#a8a29e", "#1c1917"], scale: 1.8, speed: 1.3 };
const FLYER: Role = { kind: "crow", colors: ["#1c1917", "#44403c", "#f59e0b"], scale: 2.2, y: 3.4, speed: 1.6 };
/** Vultures and crows wheeling high over bones, tombs and lairs */
const VULTURE: Role = { kind: "crow", colors: ["#292524", "#57534e", "#d6d3d1"], scale: 2.4, y: 5.2, speed: 1.1 };
const VILLAGER: Role = { kind: "villager_human", colors: ["#2563eb", "#e0b48a", "#4a3222", "#eab308"], scale: PERSON_SCALE, speed: 0.6 };
/** Robed Nethergarde (Spire) folk in violet and gold: the pilgrims at the Archon's seat */
const SPIRE_PILGRIM: Role = { kind: "villager_arcane", colors: ["#6d28d9", "#e9d5ff", "#1e1b4b", "#fbbf24"], scale: PERSON_SCALE, speed: 0.5 };
const WORKER: Role = { kind: "farmer_human", colors: ["#a16207", "#e0b48a", "#4a3222", "#facc15"], scale: PERSON_SCALE, speed: 0.6 };
const COW: Role = { kind: "cow", colors: ["#f5f5f4", "#1c1917", "#fda4af"], scale: 2, speed: 0.3 };
const SHEEP: Role = { kind: "sheep", colors: ["#f5f5f4", "#44403c"], scale: 2, speed: 0.3 };
/** Masons and porters raising a landmark on its rotation day; robed shapers at a magical site */
const MASON: Role = { kind: "farmer_human", colors: ["#78716c", "#e0b48a", "#4a3222", "#f59e0b"], scale: PERSON_SCALE, speed: 0.7 };
const SHAPER: Role = { kind: "villager_arcane", colors: ["#4338ca", "#e0e7ff", "#1e1b4b", "#a5b4fc"], scale: PERSON_SCALE, speed: 0.4 };

/** Pilgrims at each province's legendary landmark, in their civilization's festival colours (robe, skin, hair, accent) */
const PILGRIM_COLORS: Record<"human" | "orc" | "elf" | "dwarf", string[]> = {
  human: ["#1d4ed8", "#e0b48a", "#6b4423", "#fbbf24"],
  orc: ["#9a3412", "#65a30d", "#1c1917", "#efe6cf"],
  elf: ["#15803d", "#f1d9c2", "#fef3c7", "#a5f3fc"],
  dwarf: ["#78350f", "#e0b48a", "#c2410c", "#fbbf24"]
};

/** Gate guards in their civilization's colours (tunic, skin, hair, accent) */
const GATE_GUARD_COLORS: Record<"human" | "orc" | "elf" | "dwarf", string[]> = {
  human: ["#1d4ed8", "#e0b48a", "#4a3222", "#fbbf24"],
  orc: ["#7f1d1d", "#65a30d", "#1c1917", "#efe6cf"],
  elf: ["#0d9488", "#f1d9c2", "#fef3c7", "#e2e8f0"],
  dwarf: ["#57534e", "#e0b48a", "#b45309", "#f59e0b"]
};

/** Lunge speed of figures in a fight (same as the armies on the map) */
const FIGHT_SPEED = 7;
const LIVESTOCK = new Set<ActorKind>(["cow", "sheep"]);

const TUNICS = ["#2563eb", "#b91c1c", "#15803d", "#7c3aed", "#c2410c", "#0f766e"];
const GESTURES: Gesture[] = ["admire", "bow", "lookUp"];

type Activity = "patrol" | "work" | "graze" | "visit" | "wheel";
interface LifePlan {
  role: Role;
  count: number;
  activity: Activity;
  /** Patrol on this exact ring (world units from the centre) along a short arc: a sea realm's jetty */
  ring?: number;
}

/** Soldiers on a buffer realm's walls by stage: it musters more as it grows */
const REALM_SOLDIERS = [2, 4, 6, 8];

/** Who lives around an NPC type (none for sea monsters, bosses and quiet sites); `civ`: a buffer realm's donor civilization */
function planFor(npc: MapNPC, civ?: CivilizationType): LifePlan[] {
  const t = npc.type;
  if (npc.category === "bandit") {
    const role = t === "bandit-riverpirate" || t === "bandit-corsair" || t === "bandit-smuggler" ? PIRATE : t === "bandit-cultist" ? CULTIST : BANDIT;
    return [{ role, count: t === "bandit-warlord" || t === "bandit-syndicate" ? 4 : 3, activity: "patrol" }];
  }
  if (npc.category === "mob") {
    if (t === "mob-wolf" || t === "mob-werewolf") return [{ role: WOLF, count: 3, activity: "patrol" }];
    if (t === "mob-goblin" || t === "mob-lizardfolk") return [{ role: GOBLIN, count: 3, activity: "patrol" }];
    if (t === "mob-troll" || t === "mob-ogre") return [{ role: BRUTE, count: 2, activity: "patrol" }];
    if (t === "mob-skeleton" || t === "mob-lich") return [{ role: UNDEAD, count: 3, activity: "patrol" }];
    if (t === "mob-bat" || t === "mob-harpy" || t === "mob-drake") return [{ role: FLYER, count: 3, activity: "wheel" }];
    return [];
  }
  if (t === "res-cattle") return [{ role: COW, count: 3, activity: "graze" }, { role: WORKER, count: 1, activity: "patrol" }];
  if (t === "res-fleece") return [{ role: SHEEP, count: 4, activity: "graze" }, { role: WORKER, count: 1, activity: "patrol" }];
  if (t.startsWith("res-")) return [{ role: WORKER, count: 2, activity: "work" }, { role: WORKER, count: 1, activity: "patrol" }];
  if (t === "goblin_camp") return [{ role: GOBLIN, count: 4, activity: "patrol" }];
  // Frontier gates: the province's own soldiers walk the wall
  if (t.startsWith("gate-")) {
    const civ = t.slice(5) as "human" | "orc" | "elf" | "dwarf";
    return [{ role: { kind: `soldier_${civ}`, colors: GATE_GUARD_COLORS[civ], scale: PERSON_SCALE, speed: 0.55 }, count: 3, activity: "patrol" }];
  }
  if (t === "beast_skeleton" || t === "pyramid" || t === "dragon_nest") return [{ role: VULTURE, count: 3, activity: "wheel" }];
  // Rotation day: masons hammer and porters haul at a rising landmark (shapers at a magical one); a crumbling one draws
  // a few onlookers and the carrion birds
  if (npc.landmarkState?.phase === "rising") {
    return MAGICAL_LANDMARK_TYPES.has(t)
      ? [{ role: SHAPER, count: 3, activity: "work" }]
      : [{ role: MASON, count: 3, activity: "work" }, { role: MASON, count: 2, activity: "patrol" }];
  }
  if (npc.landmarkState?.phase === "crumbling") return [{ role: VILLAGER, count: 2, activity: "visit" }, { role: VULTURE, count: 2, activity: "wheel" }];
  // A buffer realm's soldiers (its donor civilization's) patrol round it, more at each stage; a sea realm's walk its
  // jetty, a land realm's townsfolk go about between the houses
  if (npc.realm && REALM_MODEL_TYPES.has(t)) {
    const c = civ && civ !== "arcane" ? civ : "human";
    const soldiers: LifePlan = { role: { kind: `soldier_${c}`, colors: GATE_GUARD_COLORS[c], scale: PERSON_SCALE, speed: 0.55 }, count: REALM_SOLDIERS[npc.realm.stage] ?? 2, activity: "patrol" };
    if (WATER_REALM_TYPES.has(t)) return [{ ...soldiers, ring: REALM_JETTY_R * (REALM_STAGE_SCALE[npc.realm.stage] ?? 1) }];
    return [soldiers, { role: VILLAGER, count: 1 + Math.min(2, npc.realm.stage), activity: "patrol" }];
  }
  if (t === "lm-titan-skeleton" || t === "lm-obsidian-pyramid" || t === "lm-tomb-of-kings") {
    return [{ role: VULTURE, count: 3, activity: "wheel" }, { role: VILLAGER, count: 2, activity: "visit" }];
  }
  if (["fishing_village", "hunter_lodge", "tavern", "caravan", "wizard_tower"].includes(t) || t.startsWith("bk-")) {
    return [{ role: VILLAGER, count: 3, activity: "patrol" }, { role: WORKER, count: 1, activity: "work" }];
  }
  // A province's legendary landmark draws a crowd of its own people (`legend-<civ>`), as the Archon's seat draws Nethergarde folk
  const legendCiv = npc.id.startsWith("legend-") ? (npc.id.slice(7) as keyof typeof PILGRIM_COLORS) : null;
  if (legendCiv && PILGRIM_COLORS[legendCiv]) {
    return [{ role: { kind: `villager_${legendCiv}`, colors: PILGRIM_COLORS[legendCiv], scale: PERSON_SCALE, speed: 0.5 }, count: 5, activity: "visit" }];
  }
  if (t.startsWith("lm-")) return [{ role: VILLAGER, count: 2, activity: "visit" }];
  // Nethergarde pilgrims kneel at the Archon's citadel under the risen Eye
  if (t === "ruins-ascended") return [{ role: SPIRE_PILGRIM, count: 4, activity: "visit" }];
  return [];
}

function hash(s: string, salt: number) {
  let h = salt >>> 0;
  for (const ch of s) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  return h;
}

/**
 * Figures for every living NPC. `radiusOf` is the NPC's footprint on the map, so figures walk around the
 * model, never through it; NPCs standing in the sea (`onWater`) get no figures. `combat` maps NPCs under
 * attack to the point the attackers come from.
 */
export function buildNpcLife(
  npcs: MapNPC[],
  radiusOf: (npc: MapNPC) => number,
  onWater: (npc: MapNPC) => boolean,
  combat: Map<string, { x: number; z: number }> = new Map(),
  civOf: (npc: MapNPC) => CivilizationType | undefined = () => undefined
): Actor[] {
  const out: Actor[] = [];
  for (const npc of npcs) {
    const plans = planFor(npc, civOf(npc));
    if (plans.length === 0 || onWater(npc)) continue;
    const r = radiusOf(npc);
    const enemy = combat.get(npc.id);
    // Fighters line up on an arc facing the attackers
    const front = enemy ? Math.atan2(enemy.z - npc.z, enemy.x - npc.x) : 0;
    const fighters = enemy ? plans.reduce((n, p) => n + (LIVESTOCK.has(p.role.kind) ? 0 : p.count), 0) : 0;
    let slot = 0;
    let i = 0;
    for (const plan of plans) {
      for (let k = 0; k < plan.count; k++, i++) {
        const h = hash(npc.id, i * 7919 + 13);
        const a = ((h % 3600) / 3600) * Math.PI * 2;
        const ring = plan.ring ?? r + 0.6 + ((h >> 12) % 100) / 100;
        const at = (ang: number, rad: number) => ({ x: npc.x + Math.cos(ang) * rad, z: npc.z + Math.sin(ang) * rad });
        const from = at(a, ring);
        const phase = ((h >> 8) % 1000) / 1000;
        const role = plan.role;
        // Each figure keeps its own pace, so a pack never moves in lockstep
        const pace = role.speed * (0.8 + ((h >> 20) % 100) / 220);
        // Villagers wear different tunics; everyone else keeps their role's look
        const colors = role === VILLAGER ? [TUNICS[h % TUNICS.length], ...role.colors.slice(1)] : role.colors;
        const base = { kind: role.kind, x: from.x, y: role.y ?? 0, z: from.z, phase, colors, scale: role.scale };
        if (enemy && !LIVESTOCK.has(role.kind)) {
          const ang = front + (fighters > 1 ? (slot / (fighters - 1) - 0.5) * 1.2 : 0);
          slot++;
          const p = at(ang, r + 0.9);
          out.push({ ...base, x: p.x, z: p.z, yaw: Math.atan2(enemy.x - p.x, enemy.z - p.z), motion: "fight", speed: FIGHT_SPEED });
        } else if (plan.activity === "patrol") {
          // Back and forth along an arc of the camp's edge (a jetty: a short stretch of it, staying on the planks)
          const to = plan.ring !== undefined ? at(a + 0.25 + phase * 0.1, ring) : at(a + 0.7 + phase * 0.6, ring + (phase - 0.5));
          out.push({ ...base, x2: to.x, z2: to.z, yaw: 0, motion: "walk", speed: pace });
        } else if (plan.activity === "wheel") {
          // Flying round and round over the site, each at its own height, radius and speed
          const orbit = at(a, r + 1.2 + phase * 2.4);
          out.push({ ...base, x: orbit.x, z: orbit.z, y: (role.y ?? 3) + phase * 1.6, x2: npc.x, z2: npc.z, yaw: 0, motion: "circle", phase: a, speed: pace });
        } else if (plan.activity === "graze") {
          out.push({ ...base, yaw: a, motion: "graze", speed: pace });
        } else if (plan.activity === "work") {
          // Facing the node, bent over the work
          out.push({ ...base, yaw: Math.atan2(npc.x - from.x, npc.z - from.z), motion: "work", speed: 1 });
        } else {
          // Pilgrims walk up to the landmark, pay their respects and wander back
          const start = at(a, ring + 3);
          const stop = at(a, ring);
          out.push({
            ...base,
            x: start.x,
            z: start.z,
            x2: stop.x,
            z2: stop.z,
            yaw: Math.atan2(npc.x - stop.x, npc.z - stop.z),
            motion: "visit",
            gesture: GESTURES[h % GESTURES.length],
            speed: pace
          });
        }
      }
    }
  }
  return out;
}

/** Planks of a sea realm's jetty over the water (figures elsewhere stand on land) */
const JETTY_TOP = SEA_LEVEL + 0.28;

/** Draws the life around NPCs; standing on the terrain (or a sea realm's jetty) */
export function NpcLife({ actors, terrain }: { actors: Actor[]; terrain: Terrain }) {
  const heightAt = useMemo(() => (x: number, z: number) => Math.max(terrain.height(x, z), JETTY_TOP), [terrain]);
  if (actors.length === 0) return null;
  return <Actors actors={actors} heightAt={heightAt} lodDistance={NPC_LIFE_LOD} />;
}
