import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { MapNPC } from "@/types";

/*
 * Foot icons: a small badge on the front of every NPC's ground ring saying what it is
 * (⚔️ mob, 🗡️ bandit, 🔥 boss, 🚩 NPC kingdom, ⛏️/🌾/🪵… resource, 💰 treasure, 👁️ landmark; the risen
 * Nethergarde Core over the Archon's citadel wears the Archon's Seal).
 * Every badge is one instance of a single flat disc whose texture cell comes from a shared emoji
 * atlas (per-instance UV offset), so all icons on the map cost one draw call.
 */

const GRID = 4;
const CELL = 1 / GRID;
const CELL_PX = 128;

/** `emoji: null` cells are drawn by hand (the Archon's Seal) */
type IconDef = { emoji: string | null; rim: string };

const RED = "#ef4444";
const ORANGE = "#f97316";
const GREEN = "#22c55e";
const GOLD = "#eab308";
const BLUE = "#38bdf8";

/** Atlas cells, in order (max GRID × GRID) */
const ICONS: Record<string, IconDef> = {
  mob: { emoji: "⚔️", rim: RED },
  bandit: { emoji: "🗡️", rim: RED },
  boss: { emoji: "🔥", rim: ORANGE },
  kingdom: { emoji: "🚩", rim: ORANGE },
  "resource-iron": { emoji: "⛏️", rim: GREEN },
  "resource-stone": { emoji: "🪨", rim: GREEN },
  "resource-lumber": { emoji: "🪵", rim: GREEN },
  "resource-food": { emoji: "🌾", rim: GREEN },
  "resource-gold": { emoji: "🪙", rim: GREEN },
  "resource-gem": { emoji: "💎", rim: GREEN },
  treasure: { emoji: "💰", rim: GOLD },
  terrain: { emoji: "👁️", rim: BLUE },
  archon: { emoji: null, rim: "#fbbf24" }
};
const ICON_KEYS = Object.keys(ICONS);

/** Which badge an NPC wears (null = none, e.g. decorative terrain NPCs without a category) */
export function footIconKey(npc: MapNPC): string | null {
  if (npc.type === "ruins-ascended") return "archon";
  switch (npc.category) {
    case "mob":
    case "bandit":
    case "boss":
    case "kingdom":
    case "treasure":
    case "terrain":
      return npc.category;
    case "resource": {
      const main = Object.keys(npc.resourceYield ?? {})[0];
      return main && ICONS[`resource-${main}`] ? `resource-${main}` : "resource-gem";
    }
    default:
      return null;
  }
}

/** The Archon's Seal (as in CivFrame's ArchonSeal): an eight-point crimson starburst with a gold rim and gold heart */
function drawArchonSeal(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.49 : r;
    ctx[i ? "lineTo" : "moveTo"](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = "#b91c1c";
  ctx.fill();
  ctx.lineJoin = "round";
  ctx.lineWidth = r * 0.1;
  ctx.strokeStyle = "#fbbf24";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.34, 0, Math.PI * 2);
  ctx.fillStyle = "#fbbf24";
  ctx.fill();
  ctx.lineWidth = r * 0.06;
  ctx.strokeStyle = "#7f1d1d";
  ctx.stroke();
}

let atlas: THREE.CanvasTexture | null = null;

/** Emoji atlas, drawn once on a canvas: a dark disc with a coloured rim and the emoji per cell */
function getAtlas(): THREE.CanvasTexture {
  if (atlas) return atlas;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = CELL_PX * GRID;
  const ctx = canvas.getContext("2d")!;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ICON_KEYS.forEach((key, i) => {
    const { emoji, rim } = ICONS[key];
    const cx = (i % GRID) * CELL_PX + CELL_PX / 2;
    const cy = Math.floor(i / GRID) * CELL_PX + CELL_PX / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, CELL_PX * 0.46, 0, Math.PI * 2);
    ctx.fillStyle = "#0f172a";
    ctx.fill();
    ctx.lineWidth = CELL_PX * 0.08;
    ctx.strokeStyle = rim;
    ctx.stroke();
    if (emoji === null) {
      drawArchonSeal(ctx, cx, cy, CELL_PX * 0.34);
      return;
    }
    ctx.font = `${Math.round(CELL_PX * 0.56)}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
    ctx.fillText(emoji, cx, cy + CELL_PX * 0.03);
  });
  atlas = new THREE.CanvasTexture(canvas);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;
  return atlas;
}

/** Flat unit disc lying on the ground; texture top points away from the default camera (-z) */
const DISC = new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2);

export interface FootIcon {
  key: string;
  x: number;
  y: number;
  z: number;
  r: number;
}

export function FootIcons({ icons }: { icons: FootIcon[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  // Power-of-two capacity: spawns appearing / disappearing never remount the mesh
  const capacity = Math.max(16, 2 ** Math.ceil(Math.log2(Math.max(1, icons.length))));

  const geometry = useMemo(() => {
    const g = DISC.clone();
    g.setAttribute("iconUv", new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2));
    return g;
  }, [capacity]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const material = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ map: getAtlas(), alphaTest: 0.5, toneMapped: false });
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace("void main() {", "attribute vec2 iconUv;\nvoid main() {")
        .replace("#include <uv_vertex>", `#include <uv_vertex>\n  vMapUv = uv * ${CELL.toFixed(4)} + iconUv;`);
    };
    m.customProgramCacheKey = () => "foot-icons";
    return m;
  }, []);
  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const uv = geometry.getAttribute("iconUv") as THREE.InstancedBufferAttribute;
    icons.forEach((icon, i) => {
      const cell = Math.max(0, ICON_KEYS.indexOf(icon.key));
      mesh.setMatrixAt(i, m.makeScale(icon.r, 1, icon.r).setPosition(icon.x, icon.y, icon.z));
      // Canvas row 0 is the top of the texture (v = 1)
      uv.setXY(i, (cell % GRID) * CELL, 1 - (Math.floor(cell / GRID) + 1) * CELL);
    });
    mesh.count = icons.length;
    mesh.instanceMatrix.needsUpdate = true;
    uv.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [icons, geometry]);

  return <instancedMesh ref={ref} args={[geometry, material, capacity]} frustumCulled={false} raycast={() => null} />;
}
