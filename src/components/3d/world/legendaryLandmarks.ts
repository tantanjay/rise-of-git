import { Builder, IDLE_KIND } from "@/components/3d/city/parts";

/*
 * The four legendary landmarks, one at the heart of each mortal province in its civilization's style, always standing:
 * the top of the rarity ladder for sites, so each is bigger, richer and busier than any epic landmark (and the TierFx
 * kit adds its curtain of light, beam and embers). Every one is alive: the golden sun turns, banners fly, canopies sway, hammers circle,
 * totems burn and fires smoke.
 */

export const LEGENDARY_LANDMARK_TYPES = new Set(["lm-bloodfire-throne", "lm-dawn-cathedral", "lm-heart-oak", "lm-anvil-of-gods"]);

const GOLD = "#fbbf24";

/** Three puffs of smoke rising one after another */
function smoke(b: Builder, x: number, y: number, z: number, s: number, color: string) {
  for (let i = 0; i < 3; i++) b.add("sphere", x, y, z, 0.42 * s, 0.38 * s, 0.42 * s, color, { idle: IDLE_KIND.smoke, phase: 0.01 + (i * Math.PI * 2) / 3 });
}

/** A ring of `n` parts orbiting the model's centre at radius r, height y */
function orbit(b: Builder, n: number, r: number, y: number, size: number, color: string, shape: "octa" | "sphere" | "box" = "octa", glow = true) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    b.add(shape, Math.cos(a) * r, y + (i % 2) * 0.35, Math.sin(a) * r, size, size * 1.5, size, color, { glow, idle: IDLE_KIND.spin, pivot: [0, 0], phase: 0.01 });
  }
}

/** Drak'mar: a throne hewn from a titan's skull on a red mesa, the first Warchief's bones on it, war drums and burning totems round it */
function bloodfireThrone(b: Builder) {
  const BONE = "#efe6cf";
  const IRON = "#3f3f46";
  b.add("cyl", 0, 0, 0, 9.4, 0.9, 9.4, "#7c2d12"); // the red mesa
  b.add("cyl", 0, 0.9, 0, 6.6, 0.5, 6.6, "#9a3412");
  // Cracks of fire across the mesa top
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    b.add("box", Math.cos(a) * 2.6, 1.35, Math.sin(a) * 2.6, 0.22, 0.1, 1.6, "#f97316", { glow: true, ry: -a, idle: IDLE_KIND.pulse });
  }
  // The throne: a titan's skull for its back, an iron seat, tusks for armrests
  const t = b.child(0, -0.6, 0, 1.4);
  t.add("box", 0, 0, 0, 2.4, 1.0, 1.8, IRON); // seat
  t.add("sphere", 0, 1.0, -0.9, 3.2, 3.6, 1.8, BONE); // the skull
  for (const sx of [-1, 1]) {
    t.add("box", sx * 0.7, 2.9, -0.05, 0.55, 0.5, 0.12, "#1c1917"); // eye sockets…
    t.add("sphere", sx * 0.7, 2.95, 0.08, 0.32, 0.3, 0.1, "#ef4444", { glow: true, idle: IDLE_KIND.pulse }); // …burning
    t.add("cone", sx * 1.3, 0, 0.6, 0.38, 2.0, 0.38, BONE, { rx: 0.5, rz: sx * 0.25 }); // tusk armrests
    t.add("cone", sx * 1.5, 3.9, -0.9, 0.5, 1.8, 0.5, BONE, { rz: -sx * 0.5 }); // horns
  }
  for (let i = 0; i < 5; i++) t.add("cone", -0.8 + i * 0.4, 1.75, 0.05, 0.16, 0.38, 0.12, BONE, { rx: Math.PI }); // teeth
  // The first Warchief's bones, seated, war-axe raised
  const w = t.child(0, 0.2, 0, 1.0);
  w.add("box", -0.3, 0, 0.5, 0.36, 0.36, 1.0, BONE); // thighs
  w.add("box", 0.3, 0, 0.5, 0.36, 0.36, 1.0, BONE);
  w.add("box", -0.3, -1.0, 0.95, 0.3, 1.0, 0.3, BONE); // shins
  w.add("box", 0.3, -1.0, 0.95, 0.3, 1.0, 0.3, BONE);
  w.add("box", 0, 0.36, 0, 1.2, 1.3, 0.6, "#57534e"); // iron cuirass
  w.add("sphere", 0, 1.75, 0, 0.6, 0.65, 0.6, BONE); // skull
  for (const sx of [-1, 1]) w.add("cone", sx * 0.35, 2.05, 0, 0.16, 0.6, 0.16, IRON, { rz: -sx * 0.6 }); // horned helm
  w.add("box", -0.8, 1.0, 0.1, 0.28, 0.8, 0.28, BONE, { rz: 0.5 }); // resting arm
  w.add("box", 0.8, 1.2, 0.1, 0.28, 1.0, 0.28, BONE, { rz: -0.3 }); // raised arm
  w.add("cyl", 1.05, 0.2, 0.15, 0.12, 3.6, 0.12, "#5b3b22"); // axe haft
  w.add("box", 1.4, 3.1, 0.15, 0.7, 0.9, 0.12, "#a8a29e"); // axe blade
  w.add("box", 1.4, 3.1, 0.24, 0.5, 0.2, 0.06, "#ef4444", { glow: true, idle: IDLE_KIND.pulse }); // blood-rune
  // War drums before the throne
  for (const sx of [-1, 1]) {
    const d = b.child(sx * 2.2, 1.9, 0, 1.4);
    d.add("cyl", 0, 0, 0, 1.1, 0.9, 1.1, "#7c4a24");
    d.add("cyl", 0, 0.9, 0, 1.0, 0.08, 1.0, "#e7d3b0", { idle: IDLE_KIND.pulse }); // hide skin, thrumming
    d.add("box", 0, 0.35, 0.56, 0.9, 0.12, 0.08, "#b91c1c");
  }
  // Burning totems ringing the mesa, smoke rising, war banners
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const x = Math.cos(a) * 4.0;
    const z = Math.sin(a) * 4.0;
    b.add("cyl", x, 0.9, z, 0.32, 3.0, 0.32, "#4a3322");
    b.add("sphere", x, 3.0, z, 0.55, 0.55, 0.5, BONE); // skull on the pole
    b.add("cone", x, 3.55, z, 0.5, 0.8, 0.5, "#f97316", { glow: true, idle: IDLE_KIND.pulse });
    smoke(b, x, 4.2, z, 0.9, "#44403c");
    if (i % 2 === 0) b.add("box", x + 0.32, 2.0, z, 0.55, 0.9, 0.04, "#b91c1c", { idle: IDLE_KIND.flutter });
  }
  // Embers circling the throne
  orbit(b, 6, 2.2, 4.4, 0.2, "#fb923c");
}

/** Valoria: the Cathedral of the Dawn Banner — white stone and blue slate on a green hill, a bell tower crowned by a turning golden sun, the First King raising the Dawn Banner before it */
function dawnCathedral(b: Builder) {
  const STONE = "#f1ede4";
  const STONE_DARK = "#d6cfc0";
  const SLATE = "#1e40af";
  const ROYAL = "#2563eb";
  b.add("cyl", 0, 0, 0, 9.4, 0.3, 9.4, "#4d8f3a"); // the green hill
  b.add("box", 0, 0.3, -0.4, 6.4, 0.35, 5.2, STONE_DARK); // terrace
  b.add("box", 0, 0.3, 2.6, 2.2, 0.2, 1.0, STONE_DARK); // front steps
  // The nave under a blue slate roof
  b.add("box", 0, 0.65, -1.0, 2.6, 2.6, 4.4, STONE);
  b.add("prism", 0, 3.25, -1.0, 2.9, 1.4, 4.6, SLATE, { ry: Math.PI / 2 });
  for (const z of [-2.4, -1.4, -0.4]) for (const sx of [-1, 1]) b.add("box", sx * 1.33, 1.5, z, 0.06, 1.0, 0.36, "#93c5fd", { glow: true, idle: IDLE_KIND.pulse }); // lancet windows
  // The transept
  b.add("box", 0, 0.65, -1.6, 4.6, 2.2, 1.6, STONE);
  b.add("prism", 0, 2.85, -1.6, 4.8, 1.2, 1.7, SLATE);
  // Twin front towers with blue cones
  for (const sx of [-1, 1]) {
    b.add("box", sx * 1.25, 0.65, 1.05, 1.1, 4.0, 1.1, STONE);
    b.add("box", sx * 1.25, 4.65, 1.05, 1.24, 0.22, 1.24, "#fbbf24"); // gold band
    b.add("cone", sx * 1.25, 4.87, 1.05, 1.3, 1.6, 1.3, SLATE);
    b.add("cyl", sx * 1.25, 6.47, 1.05, 0.05, 0.5, 0.05, "#fbbf24");
  }
  // The great door and the rose window
  b.add("box", 0, 0.65, 1.25, 1.0, 1.6, 0.08, "#1e3a8a");
  b.add("cyl", 0, 2.6, 1.27, 1.1, 0.08, 1.1, "#fde68a", { rx: Math.PI / 2, glow: true, idle: IDLE_KIND.pulse });
  // The bell tower at the crossing, crowned by the turning golden sun
  b.add("box", 0, 3.4, -1.6, 1.4, 3.4, 1.4, STONE);
  b.add("box", 0, 5.4, -1.6, 1.54, 0.25, 1.54, "#fbbf24");
  b.add("box", 0, 5.0, -0.89, 0.5, 0.7, 0.06, "#1c1917"); // belfry opening
  b.add("cone", 0, 6.8, -1.6, 1.7, 2.6, 1.7, SLATE);
  b.add("cyl", 0, 9.4, -1.6, 0.08, 0.6, 0.08, "#fbbf24");
  b.add("cyl", 0, 10.0, -1.6, 1.0, 0.1, 1.0, "#fbbf24", { rx: Math.PI / 2, glow: true, idle: IDLE_KIND.spin }); // the golden sun
  b.add("sphere", 0, 9.95, -1.6, 0.4, 0.4, 0.4, "#fef3c7", { glow: true, idle: IDLE_KIND.pulse });
  // The First King raising the Dawn Banner before the doors
  const k = b.child(0, 3.6, 0, 0.3);
  k.add("box", 0, 0, 0, 1.0, 0.6, 1.0, STONE_DARK); // plinth
  k.add("cone", 0, 0.6, 0, 0.8, 1.2, 0.8, ROYAL); // royal cloak
  k.add("sphere", 0, 1.9, 0, 0.42, 0.42, 0.42, "#e7e5e4"); // stone head
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    k.add("cone", Math.cos(a) * 0.17, 2.1, Math.sin(a) * 0.17, 0.08, 0.2, 0.08, "#fbbf24"); // crown
  }
  k.add("cyl", 0.45, 0.6, 0, 0.07, 3.2, 0.07, "#fbbf24"); // banner pole
  k.add("box", 0.95, 2.8, 0, 0.95, 0.8, 0.04, ROYAL, { idle: IDLE_KIND.flutter }); // the Dawn Banner
  k.add("box", 0.95, 2.8, 0.03, 0.3, 0.3, 0.02, "#fde68a", { glow: true }); // its golden sun
  // Royal gardens and banners round the terrace
  for (const sx of [-1, 1]) {
    for (const z of [-3.6, -1.2, 1.2]) b.add("sphere", sx * 3.9, 0.3, z, 0.9, 0.7, 0.9, "#2f7d32", { idle: IDLE_KIND.sway }); // clipped hedges
    b.add("cyl", sx * 2.6, 0.3, 3.4, 0.07, 2.8, 0.07, "#3f2a1a");
    b.add("box", sx * 2.6 + 0.3, 2.3, 3.4, 0.55, 0.8, 0.03, sx > 0 ? "#fbbf24" : ROYAL, { idle: IDLE_KIND.flutter });
    b.add("cyl", sx * 2.2, 0.3, 2.0, 1.0, 0.3, 1.0, STONE_DARK); // fountain basins
    b.add("cyl", sx * 2.2, 0.6, 2.0, 0.8, 0.06, 0.8, "#38bdf8", { idle: IDLE_KIND.pulse });
  }
  // Golden motes circling the bell tower
  orbit(b, 6, 2.2, 6.2, 0.2, "#fde68a");
}

/** Sylvandale: the first tree, roots holding up the forest floor, its hollow heart burning green */
function heartOak(b: Builder) {
  b.add("cyl", 0, 0, 0, 9.2, 0.05, 9.2, "#2f5d32"); // mossy floor
  // Roots
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    b.add("cyl", Math.cos(a) * 1.9, -0.2, Math.sin(a) * 1.9, 0.6, 2.6, 0.6, "#4a3322", {
      rx: Math.sin(a) * 1.1,
      rz: -Math.cos(a) * 1.1
    });
  }
  // The trunk, twisting as it rises
  b.add("cyl", 0, 0, 0, 2.6, 3.2, 2.6, "#5b3b22");
  b.add("cyl", 0, 3.2, 0, 2.1, 2.6, 2.1, "#664428", { ry: 0.4 });
  b.add("cyl", 0, 5.8, 0, 1.6, 1.4, 1.6, "#5b3b22");
  // The hollow heart, glowing green
  b.add("box", 0, 1.1, 1.25, 1.0, 1.5, 0.12, "#14532d");
  b.add("sphere", 0, 1.45, 1.37, 0.75, 0.75, 0.32, "#86efac", { glow: true, idle: IDLE_KIND.pulse });
  // Boughs
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.6;
    b.add("cyl", Math.cos(a) * 1.4, 5.6, Math.sin(a) * 1.4, 0.45, 2.6, 0.45, "#5b3b22", { rx: Math.sin(a) * 0.9, rz: -Math.cos(a) * 0.9 });
  }
  // The canopy: layered crowns that sway in the wind
  b.add("sphere", 0, 7.0, 0, 7.4, 3.6, 7.4, "#1f6b2a", { idle: IDLE_KIND.sway });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.add("sphere", Math.cos(a) * 2.8, 6.6 + (i % 2) * 0.8, Math.sin(a) * 2.8, 3.0, 2.2, 3.0, i % 2 ? "#2f8a3a" : "#3f9a3a", { idle: IDLE_KIND.sway });
  }
  b.add("sphere", 0, 9.6, 0, 3.4, 2.2, 3.4, "#4caf50", { idle: IDLE_KIND.sway });
  // Standing stones of the elven wardens, runes glowing
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const x = Math.cos(a) * 3.9;
    const z = Math.sin(a) * 3.9;
    b.add("box", x, 0, z, 0.6, 1.8, 0.45, "#6b7280", { ry: -a + Math.PI / 2 });
    b.add("box", x + Math.cos(a) * 0.28, 0.8, z + Math.sin(a) * 0.28, 0.24, 0.6, 0.24, "#a7f3d0", { glow: true, ry: -a + Math.PI / 2 });
  }
  // Wisps circling the crown and the roots
  orbit(b, 7, 4.4, 5.2, 0.2, "#bbf7d0", "sphere");
  orbit(b, 5, 2.9, 1.6, 0.16, "#fef9c3", "sphere");
}

/** Ironforge: a plateau crowned by a keep-sized anvil, a god's hammer circling above, forge-fire running down */
function anvilOfGods(b: Builder) {
  b.add("cyl", 0, 0, 0, 9.4, 1.0, 9.4, "#3a3946"); // the plateau
  b.add("cyl", 0, 1.0, 0, 7.0, 0.6, 7.0, "#4b4a57");
  // Rivers of forge-fire running down the rock
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    b.add("box", Math.cos(a) * 3.9, 0.05, Math.sin(a) * 3.9, 0.5, 1.0, 2.0, "#f97316", { glow: true, ry: -a + Math.PI / 2, rx: 0.35 });
  }
  b.add("cyl", 0, 1.6, 0, 3.6, 0.1, 3.6, "#ea580c", { glow: true }); // the forge floor glowing round the anvil
  // The anvil
  b.add("box", 0, 1.7, 0, 2.6, 0.8, 1.8, "#27272a"); // foot
  b.add("box", 0, 2.5, 0, 1.4, 1.2, 1.0, "#3f3f46"); // waist
  b.add("box", 0, 3.7, 0, 3.4, 0.8, 1.5, "#52525b"); // face
  b.add("cone", 2.5, 4.15 - 0.8, 0, 0.7, 1.6, 0.7, "#52525b", { rz: -Math.PI / 2 }); // horn, out of the face
  b.add("box", -0.3, 4.5, 0, 1.8, 0.1, 0.9, "#fbbf24", { glow: true }); // white-hot bar on the face
  // Runes along the anvil's flanks
  for (const x of [-1.1, 0, 1.1]) b.add("box", x, 3.95, 0.8, 0.36, 0.3, 0.1, "#fde68a", { glow: true });
  // The god's hammer, circling slowly over the anvil
  b.add("cyl", 1.6, 6.0, 0, 0.26, 3.0, 0.26, "#78350f", { rz: 0.5, idle: IDLE_KIND.spin, pivot: [0, 0] });
  b.add("box", 0.75, 7.0, 0, 1.0, 1.6, 2.0, "#71717a", { rz: 0.5, idle: IDLE_KIND.spin, pivot: [0, 0] });
  b.add("box", 0.75, 7.55, 0, 1.1, 0.4, 2.1, GOLD, { rz: 0.5, glow: true, idle: IDLE_KIND.spin, pivot: [0, 0] });
  // Four great braziers, burning and smoking
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const x = Math.cos(a) * 3.0;
    const z = Math.sin(a) * 3.0;
    b.add("cyl", x, 1.6, z, 0.5, 2.0, 0.5, "#44403c");
    b.add("cyl", x, 3.6, z, 1.0, 0.35, 1.0, "#57534e");
    b.add("cone", x, 3.95, z, 0.75, 1.0, 0.75, "#fb923c", { glow: true, idle: IDLE_KIND.pulse });
    smoke(b, x, 4.8, z, 0.9, "#57534e");
  }
  // Rune stones ringing the plateau
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const x = Math.cos(a) * 4.1;
    const z = Math.sin(a) * 4.1;
    b.add("box", x, 1.0, z, 0.6, 1.9, 0.5, "#27272a", { ry: -a + Math.PI / 2 });
    b.add("box", x + Math.cos(a) * 0.3, 1.9, z + Math.sin(a) * 0.3, 0.28, 0.7, 0.28, "#f59e0b", { glow: true, ry: -a + Math.PI / 2 });
  }
  // Sparks rising off the anvil in a circle
  orbit(b, 6, 1.7, 5.2, 0.18, "#fde68a");
}

export function buildLegendaryLandmark(type: string, b: Builder): boolean {
  switch (type) {
    case "lm-bloodfire-throne":
      bloodfireThrone(b);
      return true;
    case "lm-dawn-cathedral":
      dawnCathedral(b);
      return true;
    case "lm-heart-oak":
      heartOak(b);
      return true;
    case "lm-anvil-of-gods":
      anvilOfGods(b);
      return true;
  }
  return false;
}
