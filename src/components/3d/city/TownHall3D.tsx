import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { CivilizationType } from "@/types";
import { castleStage, CITADEL_STAGE, EMPYREAN_STAGE, PALACE_STAGE, WONDER_STAGE } from "@/utils/castle";
import { useHd } from "@/utils/graphics";
import { rngFor } from "@/utils/random";
import { MergeStatic, DYNAMIC, type KitTag } from "./MergeStatic";
import { SURFACES, type Surface } from "./parts";
import { chamferedCylinder } from "@/components/3d/world/castleParts";
import { TierFx, TierFxItem } from "@/components/3d/TierFx";
import { useHdModels } from "@/components/3d/world/hdModelsLoader";

type V3 = [number, number, number];
type RoofKind = "cone" | "spike" | "flat" | "crystal";

interface CastleStyle {
  wall: string;
  wall2: string;
  roof: string;
  trim: string;
  glow: string;
  banner: string;
  door: string;
  round: boolean; // round or square towers
  roof3: RoofKind;
  roofTall: number; // tower roof height multiplier
}

const STYLES: Record<CivilizationType, CastleStyle> = {
  human: { wall: "#f8fafc", wall2: "#e2e8f0", roof: "#2563eb", trim: "#cbd5e1", glow: "#fde68a", banner: "#1d4ed8", door: "#3f2a14", round: true, roof3: "cone", roofTall: 1 },
  elf: { wall: "#eef2f7", wall2: "#cbd5e1", roof: "#0891b2", trim: "#a7f3d0", glow: "#22d3ee", banner: "#059669", door: "#14532d", round: true, roof3: "cone", roofTall: 1.8 },
  dwarf: { wall: "#475569", wall2: "#334155", roof: "#1e293b", trim: "#b45309", glow: "#f59e0b", banner: "#b45309", door: "#1c1917", round: false, roof3: "flat", roofTall: 1 },
  orc: { wall: "#3f3a36", wall2: "#1c1917", roof: "#7f1d1d", trim: "#fef3c7", glow: "#f97316", banner: "#991b1b", door: "#0c0a09", round: false, roof3: "spike", roofTall: 1 },
  arcane: { wall: "#1e1b4b", wall2: "#0f172a", roof: "#581c87", trim: "#c084fc", glow: "#a855f7", banner: "#7e22ce", door: "#020617", round: true, roof3: "crystal", roofTall: 1.2 }
};

const GOLD = "#fbbf24";
/** HD fittings: dull iron on the Keep and the Castle, black iron from the Citadel */
const DULL = "#57534e";
const IRON = "#3f3f46";

// ---- Primitive helpers ------------------------------------------------------

/**
 * HD: the hall's style while it is drawn through the model kit (null in Normal). The helpers then take bevelled twins
 * and `Mat` works out what each part is made of from the civilization's palette.
 */
const HallHd = createContext<CastleStyle | null>(null);

interface MatProps {
  c: string;
  glow?: number;
  metal?: boolean;
  /** HD: what it is made of, when the palette doesn't say (bark, leaves, bone, a painted crest) */
  surf?: Surface;
}

/** HD: a part's material from the palette: walls dressed stone (round on towers), roofs tiles, the door wood, banners cloth */
function kitOf(st: CastleStyle, { c, glow, metal, surf }: MatProps, round: boolean, flat: boolean): KitTag {
  if (surf) return { surf, flat };
  if ((glow ?? 0) >= 1) return { surf: "plain", flat };
  if (metal) return { surf: c === GOLD ? "gold" : "iron", flat };
  if (c === st.wall || c === st.wall2) return { surf: "plain", course: round ? 2 : 1, flat };
  if (c === st.roof) return { surf: "plain", course: 3, flat };
  if (c === st.trim) return { surf: "plain", flat };
  if (c === st.door) return { surf: "wood", flat };
  if (c === st.banner) return { surf: "cloth", flat };
  return { surf: "plain", flat };
}

function Mat({ round = false, flat = false, ...m }: MatProps & { round?: boolean; flat?: boolean }) {
  const st = useContext(HallHd);
  const { c, glow, metal } = m;
  if (st) {
    const kit = kitOf(st, m, round, flat);
    const surface = SURFACES[kit.surf ?? "plain"];
    return (
      <meshStandardMaterial
        color={c}
        roughness={surface.rough}
        metalness={surface.metal}
        emissive={glow ? c : "#000000"}
        emissiveIntensity={glow ?? 0}
        userData={{ kit }}
      />
    );
  }
  return (
    <meshStandardMaterial
      color={c}
      roughness={metal ? 0.3 : 0.8}
      metalness={metal ? 0.7 : 0}
      emissive={glow ? c : "#000000"}
      emissiveIntensity={glow ?? 0}
    />
  );
}

/** HD twins, made once and shared: rounded boxes, chamfered round towers and cones with more segments */
const twins = new Map<string, THREE.BufferGeometry>();
function twin(key: string, make: () => THREE.BufferGeometry) {
  let g = twins.get(key);
  if (!g) twins.set(key, (g = make()));
  return g;
}
const hdBox = (s: V3) => twin(`box:${s}`, () => new RoundedBoxGeometry(s[0], s[1], s[2], 1, Math.min(0.06, Math.min(...s) * 0.2)));
/** Round (8+ sides) towers and cones; fewer-sided ones keep the Normal geometry with its facets */
const hdRound = (top: number, bottom: number, h: number, seg: number) => twin(`cyl:${top},${bottom},${h},${seg}`, () => chamferedCylinder(top, bottom, h, Math.min(32, seg * 3)));

function Box({ p, s, r, ...m }: { p: V3; s: V3; r?: V3 } & MatProps) {
  const hd = useContext(HallHd) !== null;
  return (
    <mesh position={p} rotation={r} castShadow receiveShadow {...(hd ? { geometry: hdBox(s) } : {})}>
      {!hd && <boxGeometry args={s} />}
      <Mat {...m} />
    </mesh>
  );
}

function Cyl({ p, rt, rb, h, seg = 12, r, ...m }: { p: V3; rt: number; rb: number; h: number; seg?: number; r?: V3 } & MatProps) {
  const hd = useContext(HallHd) !== null;
  const round = seg >= 8;
  return (
    <mesh position={p} rotation={r} castShadow receiveShadow {...(hd && round ? { geometry: hdRound(rt, rb, h, seg) } : {})}>
      {!(hd && round) && <cylinderGeometry args={[rt, rb, h, seg]} />}
      <Mat {...m} round={round} flat={!round} />
    </mesh>
  );
}

function Cone({ p, rad, h, seg = 12, r, ...m }: { p: V3; rad: number; h: number; seg?: number; r?: V3 } & MatProps) {
  const hd = useContext(HallHd) !== null;
  const round = seg >= 7;
  return (
    <mesh position={p} rotation={r} castShadow {...(hd && round ? { geometry: hdRound(0, rad, h, seg) } : {})}>
      {!(hd && round) && <coneGeometry args={[rad, h, seg]} />}
      <Mat {...m} round={round} flat={!round} />
    </mesh>
  );
}

function Octa({ p, rad, s, ...m }: { p: V3; rad: number; s?: V3 } & MatProps) {
  return (
    <mesh position={p} scale={s}>
      <octahedronGeometry args={[rad]} />
      <Mat {...m} flat />
    </mesh>
  );
}

/** Crenellations along a straight wall top from (x1,z1) to (x2,z2) */
function Merlons({ y, x1, z1, x2, z2, c, size = 0.45 }: { y: number; x1: number; z1: number; x2: number; z2: number; c: string; size?: number }) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const n = Math.max(2, Math.floor(len / (size * 2.4)));
  const out: ReactNode[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(<Box key={i} p={[x1 + (x2 - x1) * t, y + size / 2, z1 + (z2 - z1) * t]} s={[size, size, size]} c={c} />);
  }
  return <>{out}</>;
}

function RectMerlons({ y, w, d, c, size }: { y: number; w: number; d: number; c: string; size?: number }) {
  const hw = w / 2 - 0.2;
  const hd = d / 2 - 0.2;
  return (
    <>
      <Merlons y={y} x1={-hw} z1={hd} x2={hw} z2={hd} c={c} size={size} />
      <Merlons y={y} x1={-hw} z1={-hd} x2={hw} z2={-hd} c={c} size={size} />
      <Merlons y={y} x1={-hw} z1={-hd} x2={-hw} z2={hd} c={c} size={size} />
      <Merlons y={y} x1={hw} z1={-hd} x2={hw} z2={hd} c={c} size={size} />
    </>
  );
}

function Flag({ p, h, st }: { p: V3; h: number; st: CastleStyle }) {
  return (
    <group position={p}>
      <Cyl p={[0, h / 2, 0]} rt={0.05} rb={0.05} h={h} seg={6} c="#78716c" surf="dull" />
      <Box p={[0.42, h - 0.35, 0]} s={[0.8, 0.5, 0.04]} c={st.banner} surf="cloth" />
      <Octa p={[0, h + 0.08, 0]} rad={0.09} c={GOLD} metal />
    </group>
  );
}

// ---- Tower --------------------------------------------------------------------

function Tower({ x, z, r, h, st, stage, flag }: { x: number; z: number; r: number; h: number; st: CastleStyle; stage: number; flag: boolean }) {
  const hdOn = useContext(HallHd) !== null;
  const crenel = stage >= 1 || st.roof3 === "flat";
  const roofY = h + (crenel ? 0.45 : 0);
  return (
    <group position={[x, 0, z]}>
      {st.round ? (
        <Cyl p={[0, h / 2, 0]} rt={r * 0.9} rb={r} h={h} seg={14} c={st.wall2} />
      ) : (
        <Box p={[0, h / 2, 0]} s={[r * 1.8, h, r * 1.8]} c={st.wall2} />
      )}
      {/* Window slit facing the plaza */}
      <Box p={[0, h * 0.62, r * (st.round ? 0.92 : 0.91)]} s={[0.22, 0.7, 0.06]} c={stage >= 3 ? st.glow : "#0f172a"} glow={stage >= 3 ? 1.4 : 0} />
      {/* Wider crenellated parapet */}
      {crenel && (
        <>
          {st.round ? (
            <Cyl p={[0, h + 0.12, 0]} rt={r * 1.08} rb={r * 1.08} h={0.24} seg={14} c={st.wall} />
          ) : (
            <Box p={[0, h + 0.12, 0]} s={[r * 2.1, 0.24, r * 2.1]} c={st.wall} />
          )}
          {Array.from({ length: st.round ? 8 : 4 }, (_, i) => {
            const a = (i / (st.round ? 8 : 4)) * Math.PI * 2 + (st.round ? 0 : Math.PI / 4);
            const rr = st.round ? r * 0.95 : r * 1.2;
            return <Box key={i} p={[Math.cos(a) * rr, h + 0.42, Math.sin(a) * rr]} s={[0.34, 0.36, 0.34]} c={st.wall} />;
          })}
        </>
      )}
      {/* Gold bands on Wonder-stage towers */}
      {stage >= 4 && (
        <>
          <Cyl p={[0, h * 0.35, 0]} rt={r * 1.02} rb={r * 1.02} h={0.14} seg={st.round ? 14 : 4} c={GOLD} metal />
          <Cyl p={[0, h * 0.75, 0]} rt={r * 0.98} rb={r * 0.98} h={0.14} seg={st.round ? 14 : 4} c={GOLD} metal />
        </>
      )}
      {stage >= 4 && hdOn && <TowerGilt r={r} h={h} st={st} crenel={crenel} roofY={roofY} />}
      {/* Roof */}
      {st.roof3 === "cone" && <Cone p={[0, roofY + r * 0.9 * st.roofTall, 0]} rad={r * 1.25} h={r * 1.8 * st.roofTall} c={st.roof} glow={st.glow === "#22d3ee" ? 0.25 : 0} />}
      {st.roof3 === "spike" && (
        <>
          <Cone p={[0, roofY + r * 0.8, 0]} rad={r * 1.2} h={r * 1.6} seg={4} c={st.roof} r={[0, Math.PI / 4, 0]} />
          {[0, 1, 2, 3].map((i) => {
            const a = (i / 4) * Math.PI * 2;
            return <Cone key={i} p={[Math.cos(a) * r * 1.05, h * 0.8, Math.sin(a) * r * 1.05]} rad={0.12} h={0.7} seg={6} c={st.trim} surf={st.roof3 === "spike" ? "bone" : undefined} r={[Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2]} />;
          })}
        </>
      )}
      {st.roof3 === "flat" && (
        <>
          <Cyl p={[0, h + 0.5, 0]} rt={0.32} rb={0.22} h={0.4} seg={8} c="#1c1917" surf="dull" />
          <mesh position={[0, h + 0.82, 0]}>
            <sphereGeometry args={[0.24, 10, 8]} />
            <meshBasicMaterial color={st.glow} />
          </mesh>
        </>
      )}
      {st.roof3 === "crystal" && (
        <>
          <Cone p={[0, roofY + r * 0.6, 0]} rad={r * 1.05} h={r * 1.2} seg={8} c={st.roof} />
          <Octa p={[0, roofY + r * 1.6, 0]} rad={0.35} s={[1, 1.6, 1]} c={st.trim} glow={2} />
        </>
      )}
      {flag && <Flag p={[0, roofY + (st.roof3 === "cone" ? r * 1.8 * st.roofTall : st.roof3 === "spike" ? r * 1.6 : 0.6) - 0.1, 0]} h={1.6} st={st} />}
    </group>
  );
}

// ---- HD detail ------------------------------------------------------------------

/** A ball (HD detail: heads, orbs, pearls, blossom, leaf clumps) */
function Ball({ p, r, s, ...m }: { p: V3; r: number; s?: V3 } & MatProps) {
  return (
    <mesh position={p} scale={s} castShadow>
      <sphereGeometry args={[r, 12, 8]} />
      <Mat {...m} round />
    </mesh>
  );
}

const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _sq = new THREE.Quaternion();
const _se = new THREE.Euler();
/** A box laid from point a to point b (struts, flying buttresses, roots), `w` × `d` thick */
function Strut({ a, b, w, d, ...m }: { a: V3; b: V3; w: number; d: number } & MatProps) {
  _dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = _dir.length();
  _sq.setFromUnitVectors(_up, _dir.normalize());
  const r = _se.setFromQuaternion(_sq).toArray().slice(0, 3) as V3;
  return <Box p={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]} s={[w, len, d]} r={r} {...m} />;
}

/**
 * HD Wonder towers: the gold bands become moulded gilt rings (square bands on square towers), lancets lit all round
 * and a gilt corbel ring under the parapet
 */
function TowerGilt({ r, h, st, crenel, roofY }: { r: number; h: number; st: CastleStyle; crenel: boolean; roofY: number }) {
  const lancets = st.round ? [1, 3, 5, 7].map((k) => (k * Math.PI) / 4) : [Math.PI / 2, Math.PI, -Math.PI / 2];
  const at = st.round ? r * 0.955 : r * 0.92;
  return (
    <>
      {[h * 0.35, h * 0.75].flatMap((y) =>
        st.round
          ? [-0.1, 0.1].map((dy) => <Cyl key={`${y}${dy}`} p={[0, y + dy, 0]} rt={r * 1.08} rb={r * 1.08} h={0.05} seg={14} c={GOLD} metal />)
          : [<Box key={y} p={[0, y, 0]} s={[r * 2.1, 0.16, r * 2.1]} c={GOLD} metal />, ...[-0.11, 0.11].map((dy) => <Box key={`${y}${dy}`} p={[0, y + dy, 0]} s={[r * 2.22, 0.05, r * 2.22]} c={GOLD} metal />)]
      )}
      {lancets.map((a) => (
        <Box key={a} p={[Math.sin(a) * at, h * 0.55, Math.cos(a) * at]} s={[0.2, 0.55, 0.06]} r={[0, a, 0]} c={st.glow} glow={1.3} />
      ))}
      {(st.roof3 === "cone" || st.roof3 === "crystal") && <RoofRibs r={st.roof3 === "cone" ? r * 1.25 : r * 1.05} y0={roofY} h={st.roof3 === "cone" ? r * 1.8 * st.roofTall : r * 1.2} metal={st.roof3 === "cone" && st.round && st !== STYLES.elf ? GOLD : "#e5e7eb"} />}
      {st.roof3 === "spike" && <Cyl p={[0, roofY + 0.05, 0]} rt={r * 1.16} rb={r * 1.2} h={0.12} seg={4} r={[0, Math.PI / 4, 0]} c={IRON} metal />}
      {st.roof3 === "flat" && <Cyl p={[0, h + 0.82, 0]} rt={0.3} rb={0.3} h={0.06} seg={12} c={GOLD} metal />}
      {crenel &&
        (st.round ? (
          <Cyl p={[0, h - 0.1, 0]} rt={r * 1.12} rb={r * 1.04} h={0.12} seg={14} c={GOLD} metal />
        ) : (
          <Box p={[0, h - 0.1, 0]} s={[r * 2.25, 0.12, r * 2.25]} c={GOLD} metal />
        ))}
    </>
  );
}

/** HD Wonder: gilt (or silver) ribs up a conical roof from its eaves to its tip, crockets climbing them */
function RoofRibs({ r, y0, h, metal }: { r: number; y0: number; h: number; metal: string }) {
  const surf = metal === GOLD ? undefined : ("steel" as const);
  return (
    <>
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        const [cx, cz] = [Math.cos(a), Math.sin(a)];
        return (
          <group key={i}>
            <Strut a={[cx * r * 0.98, y0 + 0.03, cz * r * 0.98]} b={[cx * 0.06, y0 + h * 0.96, cz * 0.06]} w={0.07} d={0.07} c={metal} metal={!surf} surf={surf} />
            {[0.3, 0.6].map((t) => (
              <Octa key={t} p={[cx * (r * (1 - t) + 0.07), y0 + h * t, cz * (r * (1 - t) + 0.07)]} rad={0.08} c={metal} metal={!surf} surf={surf} />
            ))}
          </group>
        );
      })}
    </>
  );
}

/** HD: a gilt (or bone, or silver) statue of the civilization's champion on a moulded plinth, spear and shield in hand */
function Statue({ x, z, st, c, surf, metal }: { x: number; z: number; st: CastleStyle; c: string; surf?: Surface; metal?: boolean }) {
  const m = { c, surf, metal };
  return (
    <group position={[x, 0, z]}>
      <Box p={[0, 0.45, 0]} s={[0.8, 0.9, 0.8]} c={st.wall2} />
      <Box p={[0, 0.95, 0]} s={[0.92, 0.1, 0.92]} c={st.trim} />
      <Box p={[0, 0.08, 0]} s={[0.92, 0.16, 0.92]} c={st.trim} />
      <Cone p={[0, 1.65, 0]} rad={0.34} h={1.3} seg={10} {...m} />
      <Cyl p={[0, 2.3, 0]} rt={0.22} rb={0.17} h={0.5} seg={10} {...m} />
      <Box p={[0, 2.5, 0]} s={[0.62, 0.14, 0.26]} {...m} />
      <Ball p={[0, 2.72, 0.01]} r={0.15} {...m} />
      <Cyl p={[0, 2.86, 0]} rt={0.15} rb={0.16} h={0.1} seg={10} {...m} />
      {[-1, 1].map((sx) => (
        <Box key={sx} p={[sx * 0.31, 2.24, 0.05]} s={[0.1, 0.48, 0.12]} r={[0.25, 0, sx * 0.12]} {...m} />
      ))}
      <Cyl p={[0.36, 2.0, 0.14]} rt={0.025} rb={0.025} h={2.4} seg={6} {...m} />
      <Cone p={[0.36, 3.32, 0.14]} rad={0.06} h={0.26} seg={6} {...m} />
      <Cyl p={[-0.38, 2.12, 0.18]} rt={0.24} rb={0.24} h={0.05} seg={14} r={[Math.PI / 2, 0, 0]} {...m} />
    </group>
  );
}

/**
 * HD Wonder detail on the hall (legendary, above the Palace's): statues of the civilization's champion either side of
 * the gate, flying buttresses from the hall's roof to the upper hall with gilt pinnacles on their piers, gilt pinnacles
 * at the upper hall's corners and lancets lit down its sides, a gilt cresting along the gate arch
 */
function WonderDetail({ civ, st, hh, hw, hd, upperH }: { civ: CivilizationType; st: CastleStyle; hh: number; hw: number; hd: number; upperH: number }) {
  const statue = civ === "orc" ? { c: st.trim, surf: "bone" as const } : civ === "elf" || civ === "arcane" ? { c: "#e5e7eb", surf: "steel" as const } : { c: GOLD, metal: true };
  const ux = (hw * 0.58) / 2;
  const uz = (hd * 0.62) / 2;
  return (
    <>
      {[-1, 1].map((sx) => (
        <Statue key={sx} x={sx * 3.7} z={3.95} st={st} {...statue} />
      ))}
      <group position={[0, hh, 0]}>
        {[-1, 1].flatMap((sx) =>
          [-0.9, 0.9].map((z) => (
            <group key={`${sx}${z}`}>
              <Box p={[sx * 4.1, 0.35, z]} s={[0.42, 0.7, 0.42]} c={st.wall2} />
              <Cone p={[sx * 4.1, 1.0, z]} rad={0.2} h={0.6} seg={8} c={GOLD} metal />
              <Strut a={[sx * 4.0, 0.62, z]} b={[sx * (ux + 0.05), upperH * 0.78, z]} w={0.22} d={0.3} c={st.wall2} />
            </group>
          ))
        )}
        {[-1, 1].flatMap((sx) =>
          [-1, 1].map((sz) => (
            <group key={`${sx}${sz}`}>
              <Cyl p={[sx * (ux + 0.05), upperH + 0.3, sz * (uz + 0.05)]} rt={0.13} rb={0.15} h={0.6} seg={8} c={GOLD} metal />
              <Cone p={[sx * (ux + 0.05), upperH + 1.05, sz * (uz + 0.05)]} rad={0.16} h={0.9} seg={8} c={GOLD} metal />
            </group>
          ))
        )}
        {[-1, 1].flatMap((sx) =>
          [-0.45, 0.45].map((z) => <Box key={`${sx}${z}`} p={[sx * (ux + 0.03), upperH * 0.5, z]} s={[0.06, 1.0, 0.3]} c={st.glow} glow={1.3} />)
        )}
      </group>
      {[-1.2, -0.6, 0, 0.6, 1.2].map((x) => (
        <Cone key={x} p={[x, 2.6 * (hh / 5) + 0.47, 3]} rad={0.1} h={0.36} seg={6} c={GOLD} metal />
      ))}
    </>
  );
}

/** HD: a lantern hung from an iron bracket on a wall facing +z at `z`, its light lit (frame gilt on the Palace) */
function Lantern({ x, y, z, st, gilt }: { x: number; y: number; z: number; st: CastleStyle; gilt: boolean }) {
  const frame = gilt ? GOLD : IRON;
  const lz = z + 0.26;
  return (
    <>
      <Box p={[x, y + 0.3, z + 0.17]} s={[0.06, 0.06, 0.34]} c={IRON} metal />
      <Box p={[x, y + 0.25, lz]} s={[0.03, 0.1, 0.03]} c={IRON} metal />
      <Box p={[x, y + 0.175, lz]} s={[0.28, 0.05, 0.28]} c={frame} metal />
      <Box p={[x, y - 0.175, lz]} s={[0.24, 0.05, 0.24]} c={frame} metal />
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Box key={`${sx}${sz}`} p={[x + sx * 0.1, y, lz + sz * 0.1]} s={[0.035, 0.3, 0.035]} c={frame} metal />))}
      <Box p={[x, y, lz]} s={[0.16, 0.26, 0.16]} c={st.glow} glow={1.3} />
    </>
  );
}

/**
 * HD-only detail, climbing the ladder by stage. Keep (common): dull door bands, arch stones round the door, steps up to
 * it, window sills and arched window heads, fence rails. Castle (uncommon): the civilization's banners in cloth by the
 * door. Citadel (rare): iron bands and studs, a portcullis drawn up in the curtain gate, lit lanterns on the wall.
 * Palace (epic): gilt fittings, a gold rim round the crest, a glowing rose window and lanterns on the upper hall.
 */
function HallDetail({
  st,
  stage,
  grow,
  hw,
  hh,
  hd,
  upperH,
  upper,
  walls,
  windowXs,
  windowsLit
}: {
  st: CastleStyle;
  stage: number;
  grow: number;
  hw: number;
  hh: number;
  hd: number;
  upperH: number;
  upper: boolean;
  walls: boolean;
  windowXs: number[];
  windowsLit: boolean;
}) {
  const zf = hd / 2;
  const gilt = stage >= 3;
  const fit = gilt ? GOLD : stage >= 2 ? IRON : DULL;
  const fitMat = stage >= 2 ? { metal: true } : { surf: "dull" as const };
  const crestY = Math.min(hh - 0.6, 2.9);
  // Arch stones round the door; from the Castle the crest sits in the arch as its keystone
  const stones = Array.from({ length: 9 }, (_, i) => (i / 8) * Math.PI).filter((a) => stage === 0 || Math.hypot(Math.cos(a) * 0.8, 2.1 + Math.sin(a) * 0.8 - crestY) > 0.58);
  const bannerTop = hh - 0.3;
  return (
    <>
      {[0.45, 1.15].map((y) => (
        <Box key={y} p={[0, y, zf + 0.12]} s={[1.3, 0.1, 0.05]} c={fit} {...fitMat} />
      ))}
      {stones.map((a) => (
        <Box key={a} p={[Math.cos(a) * 0.8, 2.1 + Math.sin(a) * 0.8, zf + 0.1]} s={[0.22, 0.18, 0.2]} r={[0, 0, a - Math.PI / 2]} c={st.trim} />
      ))}
      <Box p={[0, 0.1, zf + 0.55]} s={[1.8, 0.2, 0.3]} c={st.wall2} />
      <Box p={[0, 0.05, zf + 0.85]} s={[1.9, 0.1, 0.3]} c={st.wall2} />
      {windowXs.map((x) => (
        <group key={x}>
          <Box p={[x, hh * 0.62 - 0.44, zf + 0.08]} s={[0.62, 0.08, 0.16]} c={st.trim} />
          <Cyl p={[x, hh * 0.62 + 0.4, zf + 0.03]} rt={0.225} rb={0.225} h={0.06} r={[Math.PI / 2, 0, 0]} c={windowsLit ? st.glow : "#0f172a"} glow={windowsLit ? 1.3 : 0} />
        </group>
      ))}
      {stage === 0 &&
        [0.32, 0.68].flatMap((y) =>
          (
            [
              [0, -3.3, 8.4],
              [-2.8, 3.3, 2.8],
              [2.8, 3.3, 2.8]
            ] as V3[]
          ).map(([x, z, len]) => <Box key={`${y}${x}${z}`} p={[x, y, z]} s={[len, 0.07, 0.05]} c="#7c4f24" surf="wood" />)
        )}

      {/* Castle: banners by the door */}
      {stage >= 1 &&
        [-1, 1].map((sx) => (
          <group key={sx} position={[sx * 1.12, bannerTop, zf]}>
            <Box p={[0, 0, 0.07]} s={[0.4, 0.05, 0.14]} c={gilt ? GOLD : DULL} {...(gilt ? { metal: true } : { surf: "dull" as const })} />
            <Box p={[0, -0.6, 0.07]} s={[0.28, 1.15, 0.04]} c={st.banner} surf="cloth" />
            <Box p={[0, -1.19, 0.07]} s={[0.18, 0.08, 0.14]} c={gilt ? GOLD : st.trim} metal={gilt} />
          </group>
        ))}

      {/* Citadel: studs on the bands, a portcullis drawn up in the gate, lanterns on the curtain wall */}
      {stage >= 2 &&
        [0.45, 1.15].flatMap((y) => [-0.5, -0.17, 0.17, 0.5].map((x) => <Box key={`${x}${y}`} p={[x, y, zf + 0.165]} s={[0.08, 0.08, 0.06]} c={fit} metal />))}
      {walls && (
        <group position={[0, 2.6 * grow - 0.3, 3]}>
          {[-0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9].map((x) => (
            <group key={x}>
              <Box p={[x, -0.4, 0]} s={[0.07, 1, 0.07]} c={IRON} metal />
              <Cone p={[x, -0.98, 0]} rad={0.05} h={0.16} seg={4} r={[Math.PI, 0, 0]} c={IRON} metal />
            </group>
          ))}
          {[-0.2, -0.65].map((y) => (
            <Box key={y} p={[0, y, 0]} s={[2, 0.07, 0.07]} c={IRON} metal />
          ))}
        </group>
      )}
      {walls && [-1, 1].map((sx) => <Lantern key={sx} x={sx * 3} y={1.5 * grow} z={3.3} st={st} gilt={gilt} />)}

      {/* Palace: a gold rim round the crest; a rose window, sills, arched heads and lanterns on the upper hall */}
      {gilt && <Cyl p={[0, crestY, zf + 0.035]} rt={0.5} rb={0.5} h={0.05} seg={6} r={[Math.PI / 2, 0, 0]} c={GOLD} metal />}
      {upper && (
        <group position={[0, hh, 0]}>
          {[-1, 1].map((sx) => (
            <group key={sx}>
              <Box p={[sx * hw * 0.14, upperH * 0.55 - 0.44, hd * 0.31 + 0.08]} s={[0.62, 0.08, 0.16]} c={st.trim} />
              <Cyl p={[sx * hw * 0.14, upperH * 0.55 + 0.4, hd * 0.31 + 0.03]} rt={0.225} rb={0.225} h={0.06} r={[Math.PI / 2, 0, 0]} c={st.glow} glow={1.3} />
              <Lantern x={sx * hw * 0.24} y={upperH * 0.5} z={hd * 0.31} st={st} gilt={gilt} />
            </group>
          ))}
          <Cyl p={[0, upperH * 0.55, hd * 0.31 + 0.05]} rt={0.32} rb={0.32} h={0.1} seg={16} r={[Math.PI / 2, 0, 0]} c={st.glow} glow={1.3} />
          <Cyl p={[0, upperH * 0.55, hd * 0.31 + 0.025]} rt={0.42} rb={0.42} h={0.05} seg={16} r={[Math.PI / 2, 0, 0]} c={GOLD} metal />
        </group>
      )}
    </>
  );
}

/** HD: the Wonder's crown jewelled: a velvet cap in the civilization's colour, gems round the band, pearls on its
 * points and a finial (Valoria's orb and cross, a gilt spike elsewhere) */
function CrownHd({ civ, st }: { civ: CivilizationType; st: CastleStyle }) {
  return (
    <>
      <Ball p={[0, 0.12, 0]} r={0.62} s={[1, 0.55, 1]} c={st.banner} surf="cloth" />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        const g = a + Math.PI / 8;
        return (
          <group key={i}>
            <Ball p={[Math.cos(a) * 0.65, 0.56, Math.sin(a) * 0.65]} r={0.055} c={GOLD} metal />
            <Octa p={[Math.cos(g) * 0.79, 0, Math.sin(g) * 0.79]} rad={0.07} c={st.glow} glow={1.3} />
          </group>
        );
      })}
      <Ball p={[0, 0.98, 0]} r={0.11} c={GOLD} metal />
      {civ === "human" ? (
        <>
          <Box p={[0, 1.24, 0]} s={[0.06, 0.32, 0.06]} c={GOLD} metal />
          <Box p={[0, 1.27, 0]} s={[0.22, 0.06, 0.06]} c={GOLD} metal />
        </>
      ) : (
        <Cone p={[0, 1.22, 0]} rad={0.06} h={0.36} seg={8} c={GOLD} metal />
      )}
    </>
  );
}

/** The Wonder's three crystals circling the hall; HD rings each in gilt and trails two motes behind it */
function OrbitCrystals({ st, hd }: { st: CastleStyle; hd: boolean }) {
  return (
    <>
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2;
        return <Octa key={i} p={[Math.cos(a) * 3.4, Math.sin(i * 2) * 0.6, Math.sin(a) * 3.4]} rad={0.4} s={[1, 1.7, 1]} c={st.glow} glow={2.2} />;
      })}
      {hd &&
        [0, 1, 2].map((i) => {
          const a = (i / 3) * Math.PI * 2;
          const y = Math.sin(i * 2) * 0.6;
          return (
            <group key={`hd${i}`}>
              <Cyl p={[Math.cos(a) * 3.4, y, Math.sin(a) * 3.4]} rt={0.36} rb={0.36} h={0.06} seg={16} c={GOLD} metal />
              {[0.22, 0.4].map((d, k) => (
                <Octa key={d} p={[Math.cos(a + d) * 3.4, y - 0.1 * k, Math.sin(a + d) * 3.4]} rad={0.14 - k * 0.04} c={st.glow} glow={2.2} />
              ))}
            </group>
          );
        })}
    </>
  );
}

// ---- HD prestige ----------------------------------------------------------------

/** A vertical fade (bright at the foot, gone at the top) for the HD prestige curtain, made once */
let fadeTex: THREE.CanvasTexture | null = null;
function fadeTexture() {
  if (fadeTex) return fadeTex;
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, "#000");
  grad.addColorStop(0.55, "#555");
  grad.addColorStop(1, "#fff");
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 64);
  return (fadeTex = new THREE.CanvasTexture(c));
}

/** HD prestige beacon: brightest down its middle (facing the eye), fading as it climbs, with slow bands of light rising */
function beamMaterial(color: string) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) } },
    vertexShader: /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
  float core = abs(dot(normalize(vN), normalize(vV + vec3(0.0, 0.0, 1e-4))));
  core *= core;
  float fade = clamp(1.0 - vUv.y, 0.0, 1.0);
  fade *= fade;
  float bands = 0.72 + 0.28 * sin(vUv.y * 70.0 - uTime * 2.4);
  float a = (0.12 + core * 0.88) * fade * bands * 0.6;
  gl_FragColor = vec4(uColor * a, a);
}`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });
}

const SPARKS = 72;
/** HD ★★★★: sparkles rising round the castle and twinkling as they go, one point cloud (one draw) */
function sparkleCloud(a: string, b: string) {
  const rng = rngFor("wonder-sparkles");
  const pos = new Float32Array(SPARKS * 3);
  const seed = new Float32Array(SPARKS);
  for (let i = 0; i < SPARKS; i++) {
    const ang = rng() * Math.PI * 2;
    const r = 5.6 + rng() * 2.6;
    pos.set([Math.cos(ang) * r, 1 + rng() * 1.5, Math.sin(ang) * r], i * 3);
    seed[i] = rng();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uA: { value: new THREE.Color(a) }, uB: { value: new THREE.Color(b) } },
    vertexShader: /* glsl */ `
uniform float uTime;
uniform vec3 uA;
uniform vec3 uB;
attribute float aSeed;
varying float vFade;
varying vec3 vCol;
void main() {
  vec3 p = position;
  float rise = fract(aSeed * 7.13 + uTime * (0.05 + aSeed * 0.05));
  p.y += rise * 9.0;
  vFade = sin(rise * 3.14159) * (0.55 + 0.45 * sin(uTime * 3.0 + aSeed * 40.0));
  vCol = mix(uA, uB, step(0.5, fract(aSeed * 13.7)));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = (0.4 + aSeed * 0.4) * 1100.0 / max(-mv.z, 1.0);
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: /* glsl */ `
varying float vFade;
varying vec3 vCol;
void main() {
  float d = length(gl_PointCoord - vec2(0.5));
  float a = (1.0 - smoothstep(0.0, 0.5, d)) * max(vFade, 0.0);
  gl_FragColor = vec4(vCol * 1.6, a);
}`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  return { geometry, material };
}

/**
 * HD prestige (the Wonder past Lv25), legendary-class in place of the plain meshes: ★ a ring of gilt light-standards
 * with a low curtain of light round the castle (no ring on the ground), ★★ a beam of light brightest down its middle with
 * bands rising, ★★★ a gilt halo with rays and a second ring of light turning the other way, ★★★★ sparkles rising round
 * the castle (one draw)
 */
function PrestigeHd({
  prestige,
  crownY,
  st,
  auraRef,
  haloRef,
  halo2Ref,
  sparkRef,
  timed
}: {
  prestige: number;
  crownY: number;
  st: CastleStyle;
  auraRef: React.RefObject<THREE.MeshBasicMaterial | null>;
  haloRef: React.RefObject<THREE.Group | null>;
  halo2Ref: React.RefObject<THREE.Group | null>;
  sparkRef: React.RefObject<THREE.Group | null>;
  timed: React.RefObject<THREE.ShaderMaterial[]>;
}) {
  const beam = useMemo(() => beamMaterial(st.glow), [st.glow]);
  const sparks = useMemo(() => sparkleCloud(GOLD, st.glow), [st.glow]);
  useEffect(() => {
    timed.current = [beam, sparks.material];
    return () => {
      timed.current = [];
      beam.dispose();
      sparks.geometry.dispose();
      sparks.material.dispose();
    };
  }, [beam, sparks, timed]);
  return (
    <>
      {prestige >= 1 && (
        <>
          <mesh position={[0, 0.9, 0]}>
            <cylinderGeometry args={[7.55, 7.55, 1.8, 64, 1, true]} />
            <meshBasicMaterial ref={auraRef} color="#fde68a" alphaMap={fadeTexture()} transparent opacity={0.3} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
            const [x, z] = [Math.cos(a) * 7.55, Math.sin(a) * 7.55];
            return (
              <group key={i}>
                <Box p={[x, 0.75, z]} s={[0.3, 1.5, 0.3]} r={[0, -a, 0]} c={st.wall2} />
                <Cyl p={[x, 1.56, z]} rt={0.2} rb={0.16} h={0.12} c={GOLD} metal />
                <Ball p={[x, 1.78, z]} r={0.16} c={st.glow} glow={1.3} />
                <Cone p={[x, 2.05, z]} rad={0.1} h={0.24} seg={8} c={GOLD} metal />
              </group>
            );
          })}
        </>
      )}
      {prestige >= 2 && (
        <mesh position={[0, crownY + 21, 0]} material={beam}>
          <cylinderGeometry args={[0.7, 1.15, 40, 24, 1, true]} />
        </mesh>
      )}
      {prestige >= 3 && (
        <>
          <group ref={haloRef} userData={DYNAMIC} position={[0, crownY + 1.6, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <MergeStatic deps={[st]} hd ground={-1e4}>
              <mesh>
                <torusGeometry args={[1.6, 0.09, 12, 64]} />
                <Mat c={GOLD} metal />
              </mesh>
              {Array.from({ length: 12 }, (_, i) => {
                const a = (i / 12) * Math.PI * 2;
                return <Cone key={i} p={[Math.cos(a) * 1.85, Math.sin(a) * 1.85, 0]} rad={0.06} h={0.36} seg={6} r={[0, 0, a - Math.PI / 2]} c={GOLD} metal />;
              })}
              {Array.from({ length: 6 }, (_, i) => {
                const a = (i / 6) * Math.PI * 2 + Math.PI / 12;
                return <Ball key={i} p={[Math.cos(a) * 1.6, Math.sin(a) * 1.6, 0]} r={0.1} c={st.glow} glow={1.3} />;
              })}
            </MergeStatic>
          </group>
          <group ref={halo2Ref} userData={DYNAMIC} position={[0, crownY + 1.6, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <mesh>
              <torusGeometry args={[2.15, 0.035, 8, 72]} />
              <meshBasicMaterial color={st.glow} />
            </mesh>
          </group>
        </>
      )}
      {prestige >= 4 && (
        <group ref={sparkRef} userData={DYNAMIC}>
          <points geometry={sparks.geometry} material={sparks.material} frustumCulled={false} />
        </group>
      )}
    </>
  );
}

// ---- Stage specs ----------------------------------------------------------------

interface TowerSpec {
  x: number;
  z: number;
  r: number;
  h: number;
}

function stageSpec(stage: number) {
  const hall: V3 = (
    [
      [6, 3.2, 4.4],
      [8, 3.8, 5],
      [9, 4.2, 5.2],
      [9.6, 4.6, 5.2],
      [10, 5, 5.4]
    ] as V3[]
  )[stage];
  const corners = (r: number, h: number): TowerSpec[] => [
    { x: -5.4, z: 3, r, h },
    { x: 5.4, z: 3, r, h },
    { x: -5.4, z: -3, r, h },
    { x: 5.4, z: -3, r, h }
  ];
  const gate = (h: number): TowerSpec[] => [
    { x: -1.75, z: 3.4, r: 0.75, h },
    { x: 1.75, z: 3.4, r: 0.75, h }
  ];
  const towers: TowerSpec[] = [
    [{ x: -2.7, z: -1.6, r: 0.95, h: 5.2 }],
    [
      { x: -4.3, z: 2, r: 1.1, h: 5.8 },
      { x: 4.3, z: 2, r: 1.1, h: 5.8 }
    ],
    corners(1.25, 6.6),
    [...corners(1.3, 7.4), ...gate(4.6)],
    [...corners(1.4, 8.2), ...gate(5.2)]
  ][stage];
  return {
    hall,
    towers,
    walls: stage >= 2,
    upper: stage >= 3, // second hall tier
    spire: stage >= 2, // central keep tower on the roof
    spireH: [0, 0, 3, 3.4, 4.4][stage],
    spireR: [0, 0, 1.3, 1.35, 1.45][stage]
  };
}

// ---- Castle -----------------------------------------------------------------

interface TownHall3DProps {
  civ: CivilizationType;
  level: number;
  prestige?: number;
  /** Draw the hall's rarity kit here (the city draws it with its plots instead, in one batch) */
  tierFx?: boolean;
  /** HD: the hall through the model kit, with its HD-only detail (defaults to the Graphics setting) */
  hd?: boolean;
  /** HD Empyrean in the Codex: the hero model with its own showcase lights and reflections */
  showcase?: boolean;
}

/** The Empyrean hero model's size as the Archon's town hall (its top about where the city's own hall reaches) */
const EMPYREAN_HERO_SCALE = 2.2;

/**
 * The town hall on the rarity ladder: the Citadel (Lv11–15) is rare-class (glints), the Palace (Lv16–20) epic-class
 * (a low aura, orbiting motes), the Wonder (Lv21–25) legendary-class, the Empyrean mythic-class; the Keep and the
 * Castle get none. (x, y, z) is where the hall stands.
 */
export function hallFxItem(level: number, x = 0, y = 0, z = 0): TierFxItem | null {
  const { index } = castleStage(level);
  if (index === EMPYREAN_STAGE) return { id: "hall-empyrean", x, y, z, size: 7, tier: "mythical", color: "#dc2626", accent: "#fbbf24", beam: 50 };
  if (index === WONDER_STAGE) return { id: "hall-wonder", x, y, z, size: 6, tier: "legendary", beam: 40 };
  if (index === PALACE_STAGE) return { id: "hall-palace", x, y, z, size: 5.6, tier: "epic" };
  if (index === CITADEL_STAGE) return { id: "hall-citadel", x, y, z, size: 5.2, tier: "rare" };
  return null;
}

function HallTierFx({ level }: { level: number }) {
  const items = useMemo(() => {
    const it = hallFxItem(level);
    return it ? [it] : [];
  }, [level]);
  return items.length ? <TierFx items={items} /> : null;
}

/**
 * Civilization-themed castle at the centre of every city. It is rebuilt bigger every 5 castle levels:
 * Keep (1–5) → Castle (6–10) → Citadel (11–15) → Palace (16–20) → Wonder (21–25); each level inside a
 * stage adds a little height. Prestige past Lv25 adds effects only (aura, beacon, halo, sparkles).
 * Lv26–30 is the Empyrean, the Archon of the Realm's floating citadel (no mortal castle gets there).
 */
export function TownHall3D(props: TownHall3DProps) {
  const hdSetting = useHd("castles");
  const hd = props.hd ?? hdSetting;
  const empyrean = castleStage(props.level).index === EMPYREAN_STAGE;
  // HD: the Archon's hall is the Empyrean's hero model, the same as on the world map and in the Codex (it brings its own
  // aura); its HD kit's Empyrean stands in while the hero chunk loads
  const hdm = useHdModels(hd && empyrean);
  if (hdm) {
    return (
      <group scale={EMPYREAN_HERO_SCALE}>
        <hdm.HighGraphicsEmpyrean lights={!!props.showcase} studio={!!props.showcase} />
      </group>
    );
  }
  // Remounted on a quality switch: HD swaps the helpers' geometries and materials
  return (
    <>
      <HallHd.Provider key={hd ? "hd" : "normal"} value={hd ? (STYLES[props.civ] ?? STYLES.human) : null}>
        {empyrean ? <EmpyreanHall level={props.level} /> : <MortalHall {...props} />}
      </HallHd.Provider>
      {props.tierFx !== false && <HallTierFx level={props.level} />}
    </>
  );
}

function MortalHall({ civ, level, prestige = 0 }: TownHall3DProps) {
  const hdOn = useContext(HallHd) !== null;
  const st = STYLES[civ] ?? STYLES.human;
  const { index: stage, step } = castleStage(level);
  const grow = 1 + (step - 1) * 0.05;
  const spec = stageSpec(stage);

  const [hw, hhBase, hd] = spec.hall;
  const hh = hhBase * grow;
  const upperH = 2.6 * grow;
  const roofBase = spec.upper ? hh + upperH : hh; // top of the stacked halls
  const spireH = spec.spireH * grow;
  const topY = spec.spire ? roofBase + spireH : roofBase; // where the crown / signature sits

  // Height above the keep tower's roof / signature where the Wonder crown sits
  const sigK = 1 + stage * 0.22;
  const crownY =
    civ === "dwarf"
      ? topY + 0.5 + 1.8 * sigK + 0.8
      : civ === "arcane"
        ? topY + 2 + 2.6 * sigK + 0.9
        : topY + 0.45 + spec.spireR * (st.roof3 === "cone" ? 1.8 * st.roofTall : 1.6) + 0.3;

  const floatRef = useRef<THREE.Group>(null);
  const orbitRef = useRef<THREE.Group>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const auraRef = useRef<THREE.MeshBasicMaterial>(null);
  const sparkRef = useRef<THREE.Group>(null);
  // HD: the gilt halo and its counter-turning ring of light, the beam's and sparkles' clocks
  const haloHdRef = useRef<THREE.Group>(null);
  const halo2Ref = useRef<THREE.Group>(null);
  const timed = useRef<THREE.ShaderMaterial[]>([]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    if (haloHdRef.current) haloHdRef.current.rotation.z += delta * 0.4;
    if (halo2Ref.current) halo2Ref.current.rotation.z -= delta * 0.25;
    for (const m of timed.current) m.uniforms.uTime.value = t;
    if (floatRef.current) {
      floatRef.current.position.y = Math.sin(t * 1.6) * 0.18;
      floatRef.current.rotation.y += delta * 0.6;
    }
    if (orbitRef.current) orbitRef.current.rotation.y += delta * 0.5;
    if (haloRef.current) haloRef.current.rotation.z += delta * 0.4;
    if (sparkRef.current) sparkRef.current.rotation.y -= delta * 0.25;
    if (auraRef.current) auraRef.current.opacity = (prestige >= 4 ? 0.45 : 0.3) + Math.sin(t * 2) * 0.08;
  });

  const windowsLit = stage >= 3;
  const windowXs: number[] = [];
  for (let x = -hw / 2 + 1; x <= hw / 2 - 1 + 0.01; x += 1.5) if (Math.abs(x) > 1.1) windowXs.push(x);

  return (
    <MergeStatic deps={[civ, level, prestige]} hd={hdOn}>
      {hdOn && <HallDetail st={st} stage={stage} grow={grow} hw={hw} hh={hh} hd={hd} upperH={upperH} upper={spec.upper} walls={spec.walls} windowXs={windowXs} windowsLit={windowsLit} />}
      {hdOn && stage >= 4 && <WonderDetail civ={civ} st={st} hh={hh} hw={hw} hd={hd} upperH={upperH} />}
      {/* Foundation */}
      <Box p={[0, 0.15, 0]} s={[hw + 0.8, 0.3, hd + 0.8]} c={st.wall2} />

      {/* Main hall */}
      <Box p={[0, hh / 2, 0]} s={[hw, hh, hd]} c={st.wall} />
      <Box p={[0, hh - 0.08, 0]} s={[hw + 0.25, 0.24, hd + 0.25]} c={st.trim} />
      {/* Door, arch and windows facing the plaza */}
      <Box p={[0, 1.05, hd / 2 + 0.04]} s={[1.4, 2.1, 0.1]} c={st.door} glow={civ === "dwarf" ? 0.5 : 0} />
      <Cyl p={[0, 2.1, hd / 2 + 0.1]} rt={0.75} rb={0.75} h={0.1} seg={16} c={st.trim} r={[Math.PI / 2, 0, 0]} />
      {windowXs.map((x) => (
        <Box key={x} p={[x, hh * 0.62, hd / 2 + 0.03]} s={[0.45, 0.8, 0.06]} c={windowsLit ? st.glow : "#0f172a"} glow={windowsLit ? 1.3 : 0} />
      ))}
      {/* Royal crest above the door */}
      {stage >= 1 && <Cyl p={[0, Math.min(hh - 0.6, 2.9), hd / 2 + 0.08]} rt={0.42} rb={0.42} h={0.08} seg={6} c={stage >= 4 ? GOLD : st.banner} metal={stage >= 4} surf={stage >= 4 ? undefined : "plain"} r={[Math.PI / 2, 0, 0]} />}

      {/* Hall roof: pitched for the first two stages, crenellated with a keep tower after that */}
      {!spec.spire && st.roof3 !== "flat" && st.roof3 !== "crystal" && (
        <group position={[0, hh, 0]} scale={[hw * 0.74, 2.2 * grow, hd * 0.74]}>
          <mesh position={[0, 0.5, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <coneGeometry args={[1, 1, 4]} />
            <Mat c={st.roof} flat />
          </mesh>
        </group>
      )}
      {(spec.spire || st.roof3 === "flat" || st.roof3 === "crystal") && <RectMerlons y={hh} w={hw} d={hd} c={st.wall} />}
      {!spec.spire && st.roof3 === "flat" && <Box p={[0, hh + 0.6, 0]} s={[hw * 0.6, 1.2 * grow, hd * 0.6]} c={st.wall2} />}

      {/* Second tier (Palace and Wonder) */}
      {spec.upper && (
        <group position={[0, hh, 0]}>
          <Box p={[0, upperH / 2, 0]} s={[hw * 0.58, upperH, hd * 0.62]} c={st.wall} />
          <Box p={[0, upperH - 0.06, 0]} s={[hw * 0.58 + 0.2, 0.2, hd * 0.62 + 0.2]} c={stage >= 4 ? GOLD : st.trim} metal={stage >= 4} />
          {[-1, 1].map((sx) => (
            <Box key={sx} p={[sx * hw * 0.14, upperH * 0.55, hd * 0.31 + 0.03]} s={[0.45, 0.8, 0.06]} c={st.glow} glow={1.3} />
          ))}
          <RectMerlons y={upperH} w={hw * 0.58} d={hd * 0.62} c={st.wall} size={0.38} />
        </group>
      )}

      {/* Central keep tower (Citadel+) */}
      {spec.spire && (
        <group position={[0, roofBase, 0]}>
          <Tower x={0} z={0} r={spec.spireR} h={spireH} st={st} stage={stage} flag={stage === 3} />
        </group>
      )}

      {/* Towers */}
      {spec.towers.map((t, i) => (
        <Tower key={i} x={t.x} z={t.z} r={t.r} h={t.h * grow} st={st} stage={stage} flag={stage >= 3 || i === 0} />
      ))}

      {/* Curtain walls with a gate (Citadel+) */}
      {spec.walls && (
        <group>
          {(
            [
              [0, -3, 10.8, 0],
              [-5.4, 0, 6, Math.PI / 2],
              [5.4, 0, 6, Math.PI / 2],
              [-3.45, 3, 3.9, 0],
              [3.45, 3, 3.9, 0]
            ] as Array<[number, number, number, number]>
          ).map(([x, z, len, rot], i) => {
            const wh = 2.2 * grow;
            const half = len / 2;
            const dx = Math.cos(rot) * half;
            const dz = -Math.sin(rot) * half;
            return (
              <group key={i}>
                <Box p={[x, wh / 2, z]} s={[len, wh, 0.6]} r={[0, rot, 0]} c={st.wall2} />
                <Merlons y={wh} x1={x - dx} z1={z - dz} x2={x + dx} z2={z + dz} c={st.wall2} size={0.4} />
              </group>
            );
          })}
          {/* Gate arch */}
          <Box p={[0, 2.6 * grow, 3]} s={[3.6, 0.6, 0.7]} c={st.wall} />
          {civ === "orc" &&
            [-4.6, -3.6, -2.4, 2.4, 3.6, 4.6].map((x) => <Cone key={x} p={[x, 1.2, 3.45]} rad={0.14} h={0.9} seg={6} c={st.trim} r={[1.2, 0, 0]} />)}
        </group>
      )}

      {/* Front banners for the smaller stages */}
      {stage <= 1 && (
        <>
          <Flag p={[hw / 2 + 0.8, 0, hd / 2 + 0.6]} h={3 * grow} st={st} />
          {stage === 1 && <Flag p={[-hw / 2 - 0.8, 0, hd / 2 + 0.6]} h={3 * grow} st={st} />}
        </>
      )}
      {/* Wooden fence around the Keep */}
      {stage === 0 &&
        Array.from({ length: 14 }, (_, i) => {
          const x = -4.2 + (i % 7) * 1.4;
          const side = i < 7 ? -1 : 1;
          if (side === 1 && Math.abs(x) < 1.2) return null; // gate gap
          return <Box key={i} p={[x, 0.45, side * 3.3]} s={[0.15, 0.9, 0.15]} c="#8b5a2b" surf="wood" />;
        })}

      {/* Civilization signature, growing with each stage */}
      <Signature civ={civ} st={st} stage={stage} grow={grow} hw={hw} hh={hh} topY={topY} hasSpire={spec.spire} floatRef={floatRef} />

      {/* Wonder: golden crown, orbiting crystals and drifting motes */}
      {stage >= 4 && (
        <>
          <group position={[0, crownY, 0]}>
            <Cyl p={[0, 0, 0]} rt={0.75} rb={0.75} h={0.2} seg={16} c={GOLD} metal />
            {Array.from({ length: 8 }, (_, i) => {
              const a = (i / 8) * Math.PI * 2;
              return <Cone key={i} p={[Math.cos(a) * 0.65, 0.3, Math.sin(a) * 0.65]} rad={0.12} h={0.45} seg={6} c={GOLD} metal />;
            })}
            <Octa p={[0, 0.55, 0]} rad={0.28} c="#fde047" glow={2.5} />
            {hdOn && <CrownHd civ={civ} st={st} />}
          </group>
          <group ref={orbitRef} userData={DYNAMIC} position={[0, topY - 1, 0]}>
            {hdOn ? (
              <MergeStatic deps={[civ, level]} hd ground={-1e4}>
                <OrbitCrystals st={st} hd />
              </MergeStatic>
            ) : (
              <OrbitCrystals st={st} hd={false} />
            )}
          </group>
        </>
      )}

      {/* Prestige effects (castle level beyond 25); HD draws its legendary versions */}
      {hdOn && prestige >= 1 && <PrestigeHd prestige={prestige} crownY={crownY} st={st} auraRef={auraRef} haloRef={haloHdRef} halo2Ref={halo2Ref} sparkRef={sparkRef} timed={timed} />}
      {!hdOn && prestige >= 1 && (
        <mesh position={[0, 0.35, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[7.2, 7.9, 64]} />
          <meshBasicMaterial ref={auraRef} color={GOLD} transparent opacity={0.3} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
      {!hdOn && prestige >= 2 && (
        <mesh position={[0, crownY + 21, 0]}>
          <cylinderGeometry args={[0.6, 1.1, 40, 16, 1, true]} />
          <meshBasicMaterial color={st.glow} transparent opacity={0.3} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
      {!hdOn && prestige >= 3 && (
        <mesh ref={haloRef} userData={DYNAMIC} position={[0, crownY + 1.6, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.6, 0.1, 8, 40]} />
          <meshBasicMaterial color="#fde68a" />
        </mesh>
      )}
      {!hdOn && prestige >= 4 && (
        <group ref={sparkRef} userData={DYNAMIC}>
          {Array.from({ length: 24 }, (_, i) => {
            const a = (i / 24) * Math.PI * 2;
            const rr = 6 + (i % 3) * 0.9;
            return (
              <mesh key={i} position={[Math.cos(a) * rr, 2 + ((i * 7) % 10) * 0.9, Math.sin(a) * rr]}>
                <sphereGeometry args={[0.12, 6, 5]} />
                <meshBasicMaterial color={i % 2 ? GOLD : st.glow} />
              </mesh>
            );
          })}
        </group>
      )}
    </MergeStatic>
  );
}

function Signature({
  civ,
  st,
  stage,
  grow,
  hw,
  hh,
  topY,
  hasSpire,
  floatRef
}: {
  civ: CivilizationType;
  st: CastleStyle;
  stage: number;
  grow: number;
  hw: number;
  hh: number;
  topY: number;
  hasSpire: boolean;
  floatRef: React.RefObject<THREE.Group | null>;
}) {
  const k = 1 + stage * 0.22;
  // HD Wonder: each signature rebuilt richer (its moving parts merged within their own moving group)
  const wonder = useContext(HallHd) !== null && stage >= 4;
  switch (civ) {
    case "orc":
      // Mammoth tusks on the hall roof (HD Wonder: iron-banded and capped, a mammoth skull between them, bonfires)
      return (
        <>
          {[-1, 1].map((sx) => (
            <group key={sx} position={[sx * hw * 0.38, hh + 0.4, 1.2]} rotation={[0, sx * -0.4, sx * -0.7]} scale={k}>
              <Cone p={[0, 0, 0]} rad={0.42} h={2.8} c={st.trim} surf="bone" />
              {wonder && (
                <>
                  {[-0.6, -0.1].map((y) => (
                    <Cyl key={y} p={[0, y, 0]} rt={(0.42 * (1.4 - y)) / 2.8 + 0.04} rb={(0.42 * (1.4 - y)) / 2.8 + 0.04} h={0.14} seg={12} c={IRON} metal />
                  ))}
                  <Cone p={[0, 1.15, 0]} rad={0.1} h={0.5} seg={8} c={IRON} metal />
                </>
              )}
            </group>
          ))}
          {wonder && (
            <>
              <Ball p={[0, hh + 0.75, 2.1]} r={0.75} s={[1.1, 0.85, 0.9]} c={st.trim} surf="bone" />
              {[-1, 1].map((sx) => (
                <group key={sx}>
                  <Ball p={[sx * 0.32, hh + 0.85, 2.7]} r={0.16} c="#0c0a09" />
                  <Cone p={[sx * 0.34, hh + 0.2, 2.75]} rad={0.1} h={0.7} seg={8} r={[2.4, 0, sx * 0.3]} c={st.trim} surf="bone" />
                </group>
              ))}
              <Ball p={[0, hh + 0.52, 2.72]} r={0.13} c="#0c0a09" />
              <Box p={[0, hh + 1.2, 2.05]} s={[1.3, 0.1, 0.9]} c={IRON} metal />
              <Braziers st={st} hw={hw} hh={hh} hd={5.4} />
            </>
          )}
        </>
      );
    case "elf": {
      // Living great tree rising behind the hall (HD Wonder: roots, leafy clumps round the canopy, blossom and lantern-fruit
      // glowing in it, a silver cradle round the crystal)
      const trunkH = (5 + stage * 1.6) * grow;
      const canopy = 2.4 + stage * 0.55;
      const base = trunkH - canopy * 0.15;
      const rng = rngFor("wonder-tree");
      return (
        <group position={[0, 0, stage >= 2 ? -4.1 : -3]}>
          <Cyl p={[0, trunkH / 2, 0]} rt={0.5 + stage * 0.08} rb={0.9 + stage * 0.12} h={trunkH} seg={10} c="#e2e8f0" surf="wood" />
          <Cone p={[0, trunkH + canopy * 0.6, 0]} rad={canopy} h={canopy * 1.5} seg={12} c="#0e7490" glow={0.25} surf="leaf" />
          <Cone p={[0, trunkH + canopy * 1.25, 0]} rad={canopy * 0.65} h={canopy * 1.1} seg={12} c="#0891b2" glow={0.3} surf="leaf" />
          {wonder && (
            <>
              {Array.from({ length: 6 }, (_, i) => {
                const a = (i / 6) * Math.PI * 2 + 0.3;
                return <Strut key={`r${i}`} a={[Math.cos(a) * 0.9, 1.1, Math.sin(a) * 0.9]} b={[Math.cos(a) * 2.1, 0.05, Math.sin(a) * 2.1]} w={0.45} d={0.35} c="#e2e8f0" surf="wood" />;
              })}
              {(
                [
                  [16, 0.94, 0, 0.62, "#0e7490", 0.25],
                  [12, 0.76, 0.32, 0.55, "#0e7490", 0.25],
                  [10, 0.6, 0.85, 0.48, "#0891b2", 0.3]
                ] as const
              ).flatMap(([n, rr, t, size, c, glow], ring) =>
                Array.from({ length: n }, (_, i) => {
                  const a = (i / n) * Math.PI * 2 + ring * 0.4;
                  const y = base + t * canopy * 1.0 + (i % 2) * 0.18;
                  return <Ball key={`c${ring}-${i}`} p={[Math.cos(a) * canopy * rr, y, Math.sin(a) * canopy * rr]} r={size + (i % 3) * 0.07} s={[1, 0.72, 1]} c={c} glow={glow} surf="leaf" />;
                })
              )}
              {Array.from({ length: 18 }, (_, i) => {
                const a = rng() * Math.PI * 2;
                const t = 0.12 + rng() * 0.5;
                const r = canopy * (1 - t) + 0.08;
                return <Ball key={`b${i}`} p={[Math.cos(a) * r, base + t * canopy * 1.5, Math.sin(a) * r]} r={0.17} c="#f9a8d4" glow={1.3} />;
              })}
              {Array.from({ length: 6 }, (_, i) => {
                const a = (i / 6) * Math.PI * 2 + 0.55;
                const [x, z] = [Math.cos(a) * canopy * 0.8, Math.sin(a) * canopy * 0.8];
                return (
                  <group key={`l${i}`}>
                    <Cyl p={[x, base - 0.35, z]} rt={0.02} rb={0.02} h={0.7} seg={6} c="#e5e7eb" surf="steel" />
                    <Ball p={[x, base - 0.8, z]} r={0.2} c={st.glow} glow={1.3} />
                  </group>
                );
              })}
            </>
          )}
          <group position={[0, trunkH + canopy * 2.1, 0]}>
            <group ref={floatRef} userData={DYNAMIC}>
              <Octa p={[0, 0, 0]} rad={0.5 + stage * 0.08} c="#67e8f9" glow={2} />
              {wonder && (
                <MergeStatic deps={[stage]} hd ground={-1e4}>
                  {Array.from({ length: 3 }, (_, i) => {
                    const a = (i / 3) * Math.PI * 2;
                    const [cx, cz] = [Math.cos(a), Math.sin(a)];
                    return (
                      <group key={i}>
                        <Strut a={[cx * 0.25, -1.0, cz * 0.25]} b={[cx * 0.75, -0.1, cz * 0.75]} w={0.08} d={0.08} c="#e5e7eb" surf="steel" />
                        <Strut a={[cx * 0.75, -0.1, cz * 0.75]} b={[cx * 0.45, 0.8, cz * 0.45]} w={0.08} d={0.08} c="#e5e7eb" surf="steel" />
                        <Ball p={[cx * 0.45, 0.82, cz * 0.45]} r={0.09} c="#e5e7eb" surf="steel" />
                      </group>
                    );
                  })}
                  <Ball p={[0, -1.02, 0]} r={0.22} c="#e5e7eb" surf="steel" />
                </MergeStatic>
              )}
            </group>
          </group>
        </group>
      );
    }
    case "dwarf":
      // War hammer monument on the highest roof (HD Wonder: gilt bands, runes burning on its faces, a wrapped grip and a
      // gilt pommel; braziers on the hall's roof)
      return (
        <>
          <group position={[0, (hasSpire ? topY + 0.5 : hh + 1.2 * grow) + 0.9 * k, 0]} scale={k}>
            <Box p={[0, 0, 0]} s={[2.2, 0.95, 0.95]} c={st.trim} metal />
            <Cyl p={[0, -0.8, 0]} rt={0.16} rb={0.16} h={1.2} seg={8} c="#1e293b" surf="wood" />
            {wonder && (
              <>
                {[-1, 1].map((sx) => (
                  <Box key={sx} p={[sx * 0.92, 0, 0]} s={[0.16, 1.05, 1.05]} c={GOLD} metal />
                ))}
                {[-1, 1].flatMap((sz) => [
                  <Box key={`a${sz}`} p={[0, 0, sz * 0.5]} s={[0.9, 0.09, 0.05]} c={st.glow} glow={1.3} />,
                  <Box key={`b${sz}`} p={[0, 0, sz * 0.5]} s={[0.09, 0.6, 0.05]} c={st.glow} glow={1.3} />
                ])}
                {[-0.55, -0.85, -1.15].map((y) => (
                  <Cyl key={y} p={[0, y, 0]} rt={0.19} rb={0.19} h={0.08} seg={10} c="#78350f" surf="leather" />
                ))}
                <Ball p={[0, -1.48, 0]} r={0.2} c={GOLD} metal />
                <Cone p={[0, 0.72, 0]} rad={0.14} h={0.5} seg={8} c={GOLD} metal />
              </>
            )}
          </group>
          {wonder && <Braziers st={st} hw={hw} hh={hh} hd={5.4} />}
        </>
      );
    case "arcane":
      // Void ring and a hovering monolith above the top (HD Wonder: a silver twin to the ring, and a tilted silver ring with
      // shards turning with the monolith, so the two read as a gyroscope)
      return (
        <group position={[0, (hasSpire ? topY + 2 : hh + 1.4) + 0.4 * k, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[1.5 * k, 0.09, 8, 40]} />
            <meshStandardMaterial color="#c084fc" emissive="#9333ea" emissiveIntensity={2.5} />
          </mesh>
          {wonder && (
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[1.5 * k + 0.22, 0.05, 8, 48]} />
              <Mat c="#e5e7eb" surf="steel" />
            </mesh>
          )}
          <group ref={floatRef} userData={DYNAMIC}>
            <Octa p={[0, 0, 0]} rad={0.9 * k} s={[1, 1.5, 1]} c="#581c87" />
            <Cone p={[0, 1.7 * k, 0]} rad={0.35 * k} h={0.9 * k} seg={6} c="#e9d5ff" glow={2} />
            {wonder && (
              <MergeStatic deps={[stage]} hd ground={-1e4}>
                <group rotation={[0.5, 0, 0.2]}>
                  <mesh rotation={[Math.PI / 2, 0, 0]}>
                    <torusGeometry args={[2.3 * k, 0.05, 8, 56]} />
                    <Mat c="#e5e7eb" surf="steel" />
                  </mesh>
                  {Array.from({ length: 4 }, (_, i) => {
                    const a = (i / 4) * Math.PI * 2;
                    return <Octa key={i} p={[Math.cos(a) * 2.3 * k, 0, Math.sin(a) * 2.3 * k]} rad={0.22} s={[1, 1.6, 1]} c={st.glow} glow={1.3} />;
                  })}
                </group>
                <Cyl p={[0, 1.24 * k, 0]} rt={0.42 * k} rb={0.42 * k} h={0.08} seg={16} c="#e5e7eb" surf="steel" />
              </MergeStatic>
            )}
          </group>
        </group>
      );
    default:
      return null;
  }
}

/** HD Wonder (Ironforge, Drak'mar): braziers burning at the corners of the hall's roof */
function Braziers({ st, hw, hh, hd }: { st: CastleStyle; hw: number; hh: number; hd: number }) {
  return (
    <>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => {
          const [x, z] = [sx * (hw / 2 - 0.75), sz * (hd / 2 - 0.75)];
          return (
            <group key={`${sx}${sz}`}>
              <Cyl p={[x, hh + 0.25, z]} rt={0.12} rb={0.18} h={0.5} seg={8} c={IRON} metal />
              <Cyl p={[x, hh + 0.62, z]} rt={0.4} rb={0.24} h={0.25} seg={10} c={IRON} metal />
              <Cone p={[x, hh + 1.1, z]} rad={0.3} h={0.75} seg={8} c={st.glow} glow={1.3} />
            </group>
          );
        })
      )}
    </>
  );
}

// ---- Empyrean (the Archon of the Realm) -------------------------------------------

const EMP = {
  rock: "#292524",
  rock2: "#44403c",
  spur: "#3f3f46",
  marble: "#fafaf9",
  marble2: "#e7e5e4",
  crimson: "#b91c1c",
  deep: "#7f1d1d",
  banner: "#dc2626",
  window: "#fde68a"
};
/** Height the citadel floats at over its rock base */
const EMPYREAN_FLOAT_Y = 6.4;
const EMPYREAN_CORNERS: Array<[number, number]> = [
  [-3.05, -3.05],
  [3.05, -3.05],
  [-3.05, 3.05],
  [3.05, 3.05]
];

/**
 * Empyrean (castle Lv26–30): a floating citadel over a broken rock base. Marble halls ringed in gold, crimson-gold
 * spires flying red banners, a slow halo round the great spire and three shards orbiting it. Legendary treatment:
 * a pulsing crimson aura with rising sparks round the base and a beam of light from the crown. The floating citadel
 * and the shards are merged within their own moving groups, so the whole castle stays a handful of draw calls.
 */
function EmpyreanHall({ level }: { level: number }) {
  const { step } = castleStage(level);
  const grow = 1 + (step - 1) * 0.04;
  const hh = 3.2 * grow; // main hall
  const kh = 3 * grow; // keep
  const sh = 6 * grow; // great spire
  const th = 5.6 * grow; // corner spires
  const hallTop = 0.9 + hh;
  const keepBase = hallTop + 0.2;
  const spireBase = keepBase + kh;
  const spireTop = spireBase + sh;

  const floatRef = useRef<THREE.Group>(null);
  const haloRef = useRef<THREE.Group>(null);
  const shardRef = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    if (floatRef.current) floatRef.current.position.y = EMPYREAN_FLOAT_Y + Math.sin(t * 0.8) * 0.25;
    if (haloRef.current) haloRef.current.rotation.y += delta * 0.35;
    if (shardRef.current) shardRef.current.rotation.y -= delta * 0.3;
  });

  return (
    <MergeStatic deps={[level]}>
      {/* Broken rock base, jagged stones round it */}
      <Cyl p={[0, 0.6, 0]} rt={6.2} rb={7.4} h={1.2} seg={9} c={EMP.rock} />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2 + 0.2;
        return <Cone key={i} p={[Math.cos(a) * 7, 1.0, Math.sin(a) * 7]} rad={0.75} h={2.8} seg={5} c={i % 2 ? EMP.rock2 : EMP.rock} r={[Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3]} />;
      })}
      {/* Crimson sigil burnt into the rock: a ring, eight rays and a molten vent where the citadel's light falls */}
      <mesh position={[0, 1.26, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[4.4, 5.0, 40]} />
        <Mat c={EMP.banner} glow={2} />
      </mesh>
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return <Box key={i} p={[Math.cos(a) * 2.9, 1.24, Math.sin(a) * 2.9]} s={[2.6, 0.08, 0.3]} r={[0, -a, 0]} c={EMP.banner} glow={1.6} />;
      })}
      <Cyl p={[0, 1.26, 0]} rt={1.4} rb={1.4} h={0.12} seg={16} c="#f97316" glow={2.2} />

      {/* The floating citadel */}
      <group ref={floatRef} userData={DYNAMIC} position={[0, EMPYREAN_FLOAT_Y, 0]}>
        <MergeStatic deps={[level]}>
          {/* Inverted rock spur and hanging stones under a marble platform with a gold rim */}
          <Cone p={[0, -2.3, 0]} rad={4.2} h={4.6} seg={9} c={EMP.spur} r={[Math.PI, 0, 0]} />
          {[0, 1, 2].map((i) => {
            const a = (i / 3) * Math.PI * 2 + 0.5;
            return <Cone key={i} p={[Math.cos(a) * 3.2, -1.15, Math.sin(a) * 3.2]} rad={0.9} h={2.2} seg={5} c={EMP.rock2} r={[Math.PI, 0, 0]} />;
          })}
          <Cyl p={[0, 0.45, 0]} rt={4.8} rb={4.4} h={0.9} seg={16} c={EMP.marble2} />
          <Cyl p={[0, 0.85, 0]} rt={4.95} rb={4.95} h={0.25} seg={16} c={GOLD} metal />

          {/* Main hall: lit windows, a crimson door, gold cornice and marble merlons */}
          <Box p={[0, 0.9 + hh / 2, 0]} s={[5.4, hh, 5.4]} c={EMP.marble} />
          <Box p={[0, 1.9, 2.75]} s={[1.4, 2.0, 0.1]} c={EMP.deep} glow={0.4} />
          {[-1.6, 1.6].map((x) => (
            <Box key={x} p={[x, 0.9 + hh * 0.62, 2.73]} s={[0.45, 0.8, 0.06]} c={EMP.window} glow={1.4} />
          ))}
          {[-1, 1].flatMap((sx) =>
            [-1.2, 1.2].map((z) => <Box key={`${sx}${z}`} p={[sx * 2.73, 0.9 + hh * 0.62, z]} s={[0.06, 0.8, 0.45]} c={EMP.window} glow={1.4} />)
          )}
          <Box p={[0, hallTop + 0.05, 0]} s={[5.8, 0.3, 5.8]} c={GOLD} metal />
          <RectMerlons y={hallTop + 0.2} w={5.4} d={5.4} c={EMP.marble} size={0.4} />

          {/* Keep with a gold band, the great crimson spire and its gold star */}
          <Cyl p={[0, keepBase + kh / 2, 0]} rt={1.6} rb={1.9} h={kh} seg={16} c={EMP.marble} />
          <Cyl p={[0, keepBase + kh / 2, 0]} rt={2.0} rb={2.0} h={0.25} seg={16} c={GOLD} metal />
          <Cone p={[0, spireBase + sh / 2, 0]} rad={1.75} h={sh} seg={12} c={EMP.crimson} />
          <Octa p={[0, spireTop + 0.6, 0]} rad={0.55} s={[1, 1.6, 1]} c={GOLD} glow={2.2} />

          {/* Four crimson-roofed spires, each flying a red banner with a gold hem */}
          {EMPYREAN_CORNERS.map(([x, z]) => {
            const a = Math.atan2(z, x);
            const bx = x + Math.cos(a) * 0.75;
            const bz = z + Math.sin(a) * 0.75;
            const by = 0.9 + th * 0.6;
            return (
              <group key={`${x}${z}`}>
                <Cyl p={[x, 0.9 + th / 2, z]} rt={0.6} rb={0.7} h={th} seg={12} c={EMP.marble} />
                <Cyl p={[x, 0.9 + th * 0.55, z]} rt={0.75} rb={0.75} h={0.2} seg={12} c={GOLD} metal />
                <Cone p={[x, 0.9 + th + 1.4, z]} rad={0.9} h={2.8} seg={12} c={EMP.deep} />
                <Octa p={[x, 0.9 + th + 2.95, z]} rad={0.2} c={GOLD} metal />
                <Box p={[bx, by, bz]} s={[0.06, 2.4, 1.1]} r={[0, -a, 0]} c={EMP.banner} />
                <Box p={[bx, by - 1.2, bz]} s={[0.16, 0.22, 1.22]} r={[0, -a, 0]} c={GOLD} metal />
              </group>
            );
          })}
        </MergeStatic>

        {/* Halo turning slowly round the great spire */}
        <group ref={haloRef} userData={DYNAMIC} position={[0, spireTop - 1.6, 0]}>
          <mesh rotation={[Math.PI / 2 - 0.25, 0, 0]}>
            <torusGeometry args={[2.6, 0.16, 8, 48]} />
            <meshBasicMaterial color="#fde68a" />
          </mesh>
        </group>

        {/* Three shards orbiting the citadel */}
        <group ref={shardRef} userData={DYNAMIC} position={[0, 4, 0]}>
          <MergeStatic deps={[]}>
            {[0, 1, 2].map((i) => {
              const a = (i / 3) * Math.PI * 2;
              return <Octa key={i} p={[Math.cos(a) * 7.2, (i - 1) * 0.8, Math.sin(a) * 7.2]} rad={0.7} s={[1, 1.8, 1]} c={i === 1 ? GOLD : "#ef4444"} glow={2.2} />;
            })}
          </MergeStatic>
        </group>
      </group>

      {/* The mythic aura, sigil, beam and embers come from the rarity kit (hallFxItem) */}
    </MergeStatic>
  );
}
