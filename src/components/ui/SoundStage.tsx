import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Actor, Builder, emptyScene, SceneOut } from "@/components/3d/city/parts";
import { FOLK } from "@/components/3d/city/palette";
import { InstancedParts } from "@/components/3d/city/InstancedParts";
import { Actors } from "@/components/3d/city/Actors";
import { NPCModel } from "@/components/3d/world/NPCModel";
import { SoundCueId } from "@/utils/soundCues";
import { SpellFx, SpellFxStore } from "@/components/3d/SpellFx";
import { SPELL_LOOKS } from "@/utils/spellFx";

/* ------------------------------------------------------------------------- */
/* Little looping scenes for the Codex's Sounds tab: a model doing the thing  */
/* each sound stands for. Props go through Builder → InstancedParts, people   */
/* through Actors; the few moving props animate in useFrame and cast no       */
/* shadows. Only one stage is mounted at a time (the selected cue).          */
/* ------------------------------------------------------------------------- */

const f = FOLK.human;
const SOLDIER = [f.armour[0], f.skins[0], f.helmOrHood[0], f.accents[0]];
const VILLAGER = [f.clothes[0], f.skins[1] ?? f.skins[0], f.hair[0], f.accents[0]];
const FARMER = [f.clothes[1] ?? f.clothes[0], f.skins[0], f.farmerHats[0], f.accents[0]];

/** Banner pole with a flag */
function banner(b: Builder, x: number, z: number, flag: string) {
  b.add("cyl", x, 0, z, 0.08, 2.2, 0.08, "#78350f");
  b.add("box", x + 0.38, 1.45, z, 0.7, 0.5, 0.05, flag);
}

function stage(cue: SoundCueId): SceneOut {
  const out = emptyScene();
  const b = new Builder(out);
  const actor = (a: Partial<Actor> & Pick<Actor, "kind" | "x" | "z" | "motion">) =>
    out.actors.push({ y: 0, yaw: 0, speed: 1, phase: 0, scale: 1.1, ...a });
  const sparks = (x: number, z: number, colors: string[], count: number, spread: number, y = 0.4) => {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      actor({ kind: "sparkle", x: x + Math.cos(a) * spread, y, z: z + Math.sin(a) * spread, motion: "float", speed: 1.4, phase: i / count, colors: [colors[i % colors.length]], scale: 0.6 });
    }
  };

  switch (cue) {
    case "click": {
      // Anvil on a stump; the smith bends over it (work) and sparks jump
      b.add("cyl", 0, 0, 0, 0.7, 0.45, 0.7, "#7c4a24");
      b.add("box", 0, 0.45, 0, 0.36, 0.22, 0.3, "#3f3f46");
      b.add("box", 0, 0.67, 0, 0.7, 0.18, 0.34, "#52525b");
      b.add("cone", 0.45, 0.67, 0, 0.2, 0.18, 0.2, "#52525b", { rz: -Math.PI / 2 });
      actor({ kind: "villager_human", x: 0, z: 0.85, yaw: Math.PI, motion: "work", colors: VILLAGER });
      sparks(0, 0, ["#fb923c", "#fde047"], 4, 0.15, 0.9);
      break;
    }
    case "levelUp": {
      banner(b, 0, 0, "#2563eb");
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.3;
        actor({ kind: "soldier_human", x: Math.cos(a) * 1.2, z: Math.sin(a) * 1.2, yaw: Math.atan2(-Math.cos(a), -Math.sin(a)), motion: "cheer", phase: i * 0.21, colors: SOLDIER });
      }
      sparks(0, 0, ["#fde047", "#fbbf24"], 8, 0.7, 0.2);
      break;
    }
    case "defeat": {
      b.add("cyl", 0, -0.2, -0.3, 0.08, 2.0, 0.08, "#78350f", { rz: 0.75 }); // the broken standard, leaning
      b.add("box", 0.9, 0, -0.6, 0.6, 0.06, 0.4, "#7f1d1d", { ry: 0.6 }); // torn flag on the ground
      for (const [x, z, yaw] of [[-0.9, 0.5, 0.4], [0.6, 0.9, 2], [-0.2, -1.1, 4]]) {
        actor({ kind: "soldier_human", x, z, yaw, motion: "fallen", colors: SOLDIER });
      }
      actor({ kind: "soldier_human", x: 0.2, z: 1.3, yaw: Math.PI, motion: "idle", colors: SOLDIER });
      break;
    }
    case "herald": {
      // Proclamation board: two posts with the scroll unrolling between them (see HeraldScroll)
      b.add("cyl", -0.48, 0, 0, 0.1, 1.85, 0.1, "#78350f");
      b.add("cyl", 0.48, 0, 0, 0.1, 1.85, 0.1, "#78350f");
      b.add("cone", -0.48, 1.85, 0, 0.16, 0.18, 0.16, "#fbbf24");
      b.add("cone", 0.48, 1.85, 0, 0.16, 0.18, 0.16, "#fbbf24");
      banner(b, -1.4, -0.5, "#7c3aed");
      actor({ kind: "villager_human", x: 0.95, z: 0.55, yaw: -0.4, motion: "idle", colors: ["#7c3aed", f.skins[0], f.hair[1] ?? f.hair[0], "#fbbf24"] });
      break;
    }
    case "harvest": {
      // Open chest beside a heap of coins (the flying coins are CoinSpill)
      b.add("box", -0.5, 0, 0, 0.8, 0.5, 0.55, "#78350f");
      b.add("box", -0.5, 0.5, -0.3, 0.8, 0.45, 0.08, "#92400e", { rx: -0.5 }); // lid, tipped open
      b.add("box", -0.5, 0.5, 0, 0.7, 0.06, 0.45, "#fbbf24", { glow: true }); // gold inside, above the rim
      b.add("cone", 0.6, 0, 0.2, 0.9, 0.45, 0.9, "#eab308");
      actor({ kind: "farmer_human", x: 0.7, z: 1.1, yaw: Math.PI, motion: "work", colors: FARMER });
      break;
    }
    case "water": {
      // Stone well: ring, dark water, posts and a little roof
      b.add("cyl", 0, 0, 0, 1.2, 0.5, 1.2, "#a8a29e");
      b.add("cyl", 0, 0, 0, 0.9, 0.55, 0.9, "#1e3a8a");
      b.add("box", -0.55, 0.5, 0, 0.1, 1.0, 0.1, "#78350f");
      b.add("box", 0.55, 0.5, 0, 0.1, 1.0, 0.1, "#78350f");
      b.add("pyramid", 0, 1.5, 0, 1.4, 0.45, 0.9, "#7c2d12");
      actor({ kind: "villager_human", x: 0, z: 1.0, yaw: Math.PI, motion: "work", speed: 0.8, colors: VILLAGER });
      sparks(0, 0, ["#7dd3fc", "#bae6fd", "#38bdf8"], 6, 0.25, 0.4);
      break;
    }
    case "step": {
      b.add("box", 0, 0, 0, 1.6, 0.04, 5, "#a8a29e");
      for (let i = 0; i < 6; i++) {
        const x = i % 2 ? 0.4 : -0.4;
        const z = -1.6 + Math.floor(i / 2) * 0.8;
        actor({ kind: "soldier_human", x, z, x2: x, z2: z + 1.6, motion: "walk", speed: 0.9, phase: 0, colors: SOLDIER });
      }
      break;
    }
    case "squash": {
      actor({ kind: "soldier_human", x: -1.0, z: 0, yaw: Math.PI / 2, motion: "fight", speed: Math.PI * 2 * SQUASH_HZ, phase: 0, colors: SOLDIER });
      break;
    }
    case "spellCast":
    case "spellImpact":
    case "finaleHorn": {
      // A battle mage (or a champion, for the Finale) casting at a straw foe on its post (the spell is SpellLoop)
      actor({ kind: "soldier_human", x: -SPELL_APART, z: 0, yaw: Math.PI / 2, motion: cue === "finaleHorn" ? "cheer" : "idle", colors: cue === "finaleHorn" ? ["#b45309", f.skins[0], "#fbbf24", "#fde68a"] : MAGE });
      b.add("cyl", SPELL_APART, 0, 0, 0.08, 1.5, 0.08, "#78350f");
      b.add("box", SPELL_APART, 0.75, 0, 0.5, 0.55, 0.32, "#d6b26a");
      b.add("box", SPELL_APART, 1.3, 0, 0.3, 0.3, 0.3, "#e2c27f");
      b.add("box", SPELL_APART, 1.0, 0, 0.9, 0.08, 0.08, "#a16207");
      break;
    }
  }
  return out;
}

const MAGE = ["#4338ca", f.skins[0], "#312e81", "#a5b4fc"];
/** Caster and straw foe stand this far either side of the middle */
const SPELL_APART = 1.6;
/** Seconds between casts on a spell stage */
const SPELL_EVERY_S = 3;
const STAGE_SPELL: Partial<Record<SoundCueId, string>> = { spellCast: "fireball", spellImpact: "frost_lance", finaleHorn: "dawnbreaker" };

/** The spell of a spell stage, cast again every few seconds on its own effects store (silent: the ▶ button plays the cue) */
function SpellLoop({ cue }: { cue: SoundCueId }) {
  const store = useMemo(() => new SpellFxStore(), []);
  useEffect(() => {
    const look = SPELL_LOOKS[STAGE_SPELL[cue] ?? "fireball"];
    let n = 0;
    const cast = () => {
      store.cast(look, { x: -SPELL_APART, y: 0, z: 0, r: 0.55, h: 1.0 }, { x: SPELL_APART, y: 0, z: 0, r: 0.55, h: 1.2 }, { seed: `stage:${cue}:${n++}`, sound: false });
    };
    cast();
    const id = setInterval(cast, SPELL_EVERY_S * 1000);
    return () => clearInterval(id);
  }, [cue, store]);
  return <SpellFx store={store} />;
}

/** Squash: one whack (and one flatten) per second */
const SQUASH_HZ = 1;

/** The slime flattens when the footman's blow lands and wobbles back */
function SquashedSlime() {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    // The fight lunge peaks at sin = 1 (a quarter cycle in); the splat follows it
    const cycle = (state.clock.elapsedTime * SQUASH_HZ) % 1;
    const hit = cycle < 0.25 ? cycle / 0.25 : Math.max(0, 1 - (cycle - 0.25) / 0.35);
    const wobble = cycle > 0.25 ? Math.sin((cycle - 0.25) * 30) * 0.08 * (1 - cycle) : 0;
    const s = 0.32;
    g.scale.set(s * (1 + hit * 0.4 - wobble), s * (1 - hit * 0.55 + wobble), s * (1 + hit * 0.4 - wobble));
  });
  return (
    <group ref={ref} position={[0.35, 0, 0]}>
      <NPCModel npc={{ id: "sound-slime", type: "mob-slime", x: 0, z: 0, rarity: "common" }} />
    </group>
  );
}

const COINS = 12;
const COIN_GEOMETRY = new THREE.CylinderGeometry(0.09, 0.09, 0.03, 12);
const COIN_MATERIAL = new THREE.MeshStandardMaterial({ color: "#fbbf24", metalness: 0.7, roughness: 0.3, emissive: "#78350f", emissiveIntensity: 0.3 });
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

/** Coins leap from the chest in arcs and land on the heap (one instanced mesh) */
function CoinSpill() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const coins = useMemo(() => Array.from({ length: COINS }, (_, i) => ({ phase: i / COINS, spread: ((i * 7) % 5) / 5 - 0.4, height: 1.1 + ((i * 3) % 4) * 0.15 })), []);
  useFrame((state) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = state.clock.elapsedTime;
    coins.forEach((c, i) => {
      const u = (t * 0.6 + c.phase) % 1;
      // From the chest (x −0.5, y 0.6) over to the heap (x 0.6, y 0.35)
      _p.set(-0.5 + 1.1 * u, 0.6 + c.height * 4 * u * (1 - u) - 0.25 * u, c.spread * 0.5 + 0.2 * u);
      _e.set(t * 6 + i, 0, t * 4 + i);
      _q.setFromEuler(_e);
      mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[COIN_GEOMETRY, COIN_MATERIAL, COINS]} frustumCulled={false} />;
}

/** The herald's scroll unrolls down the proclamation board, is read, and rolls back up */
function HeraldScroll() {
  const sheet = useRef<THREE.Mesh>(null);
  const roller = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    const u = (state.clock.elapsedTime * 0.25) % 1;
    const open = u < 0.25 ? u / 0.25 : u < 0.75 ? 1 : 1 - (u - 0.75) / 0.25;
    const len = 0.05 + open * 1.0;
    if (sheet.current) {
      sheet.current.scale.y = len;
      sheet.current.position.y = -len / 2;
    }
    if (roller.current) roller.current.position.y = -len;
  });
  // Top roller rests across the posts; the sheet hangs 0.05 in front of their axis
  return (
    <group position={[0, 1.7, 0.05]}>
      <mesh ref={sheet}>
        <boxGeometry args={[0.7, 1, 0.01]} />
        <meshStandardMaterial color="#fef3c7" roughness={0.9} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.045, 0.045, 0.86, 10]} />
        <meshStandardMaterial color="#92400e" />
      </mesh>
      <mesh ref={roller} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.045, 0.045, 0.8, 10]} />
        <meshStandardMaterial color="#92400e" />
      </mesh>
    </group>
  );
}

/** The little looping scene for one sound cue */
export function SoundStage({ cue }: { cue: SoundCueId }) {
  const scene = useMemo(() => stage(cue), [cue]);
  return (
    <>
      <InstancedParts parts={scene.parts} />
      <Actors actors={scene.actors} lodDistance={200} />
      {cue === "squash" && <SquashedSlime />}
      {cue === "harvest" && <CoinSpill />}
      {cue === "herald" && <HeraldScroll />}
      {STAGE_SPELL[cue] && <SpellLoop cue={cue} />}
    </>
  );
}
