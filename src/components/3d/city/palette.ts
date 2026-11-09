import { CivilizationType } from "@/types";
import type { AnimalKind } from "./parts";

export interface CivPalette {
  wall: string;
  wood: string;
  roof: string;
  thatch: string;
  stone: string;
  accent: string;
  grass: string;
  yard: string;
  dirt: string;
  soil: string;
  path: string;
  road: string;
  plaza: string;
  foliage: string;
  foliage2: string;
  trunk: string;
  canvas: string;
  window: string;
  bone: string;
  barn: string;
  water: string;
}

export const PALETTES: Record<CivilizationType, CivPalette> = {
  human: {
    wall: "#efe3c8", wood: "#8b5a2b", roof: "#3563c9", thatch: "#d6b25e", stone: "#a3a8b0",
    accent: "#fbbf24", grass: "#5a9a3c", yard: "#6aa84f", dirt: "#a68a5b", soil: "#6b4423",
    path: "#c9b58a", road: "#9a958b", plaza: "#bdb6a8", foliage: "#3f8f3a", foliage2: "#5fae4a",
    trunk: "#6b4423", canvas: "#efe6d2", window: "#fde68a", bone: "#f5ecd6", barn: "#9b2c2c", water: "#3b82c4"
  },
  elf: {
    wall: "#e7efe9", wood: "#6b5a3e", roof: "#1f9e8f", thatch: "#8cc084", stone: "#c3cfc9",
    accent: "#67e8f9", grass: "#3f9a5c", yard: "#4fae6c", dirt: "#9a8a64", soil: "#5a4a2e",
    path: "#d8d4c0", road: "#b9c2bb", plaza: "#d9e2dc", foliage: "#2fa37a", foliage2: "#7dd3a8",
    trunk: "#d7d2c4", canvas: "#e0f7f4", window: "#a5f3fc", bone: "#f5f5f4", barn: "#2f7d6d", water: "#22a3c4"
  },
  dwarf: {
    wall: "#8a8f98", wood: "#5b3b22", roof: "#a3472a", thatch: "#8a6a3a", stone: "#5f6672",
    accent: "#f97316", grass: "#6b7a4f", yard: "#727c66", dirt: "#7a6a55", soil: "#4a3a2a",
    path: "#9ca3af", road: "#6b7280", plaza: "#7c8390", foliage: "#2f5d3a", foliage2: "#3f6f45",
    trunk: "#4a3322", canvas: "#d6c7a8", window: "#fdba74", bone: "#e7e5e4", barn: "#7c2d12", water: "#3b6f9c"
  },
  orc: {
    wall: "#7c4a2d", wood: "#4a2a16", roof: "#7f1d1d", thatch: "#a1784a", stone: "#57483f",
    accent: "#ef4444", grass: "#8a6a3d", yard: "#94683f", dirt: "#9a6a42", soil: "#5a3520",
    path: "#b08158", road: "#7a5a45", plaza: "#8a7060", foliage: "#5c6b2a", foliage2: "#7a7a32",
    trunk: "#3f2a1a", canvas: "#c8a27a", window: "#fca5a5", bone: "#f3ead7", barn: "#5a1d12", water: "#4a7a8c"
  },
  arcane: {
    wall: "#3b3170", wood: "#2a2145", roof: "#6d28d9", thatch: "#4c3d80", stone: "#2e2b45",
    accent: "#c084fc", grass: "#4b4785", yard: "#5a559a", dirt: "#5e5790", soil: "#2f2850",
    path: "#8c86c4", road: "#6d67aa", plaza: "#837dbf", foliage: "#7c3aed", foliage2: "#a78bfa",
    trunk: "#1e1b3a", canvas: "#ddd6fe", window: "#e9d5ff", bone: "#e9d5ff", barn: "#4c1d95", water: "#6366f1"
  }
};

export const SKIN_TONES = ["#f1c9a5", "#e0ac83", "#c68a5a", "#8d5a3a", "#f6d7b8"];
export const HAIR_COLORS = ["#2b1d14", "#5a3a22", "#a0662d", "#d9b36c", "#1f1f1f", "#8a8a8a"];
export const TUNIC_COLORS = ["#2563eb", "#16a34a", "#d97706", "#b91c1c", "#7c3aed", "#0f766e", "#a16207", "#be185d"];
export const FLOWER_COLORS = ["#f472b6", "#facc15", "#ffffff", "#a78bfa", "#f87171", "#fb923c", "#60a5fa"];

/** Colour pools for each civilization's townsfolk */
export interface Folk {
  skins: string[];
  hair: string[];
  clothes: string[];
  farmerHats: string[];
  armour: string[];
  helmOrHood: string[];
  accents: string[]; // shields, beards, flower crowns, staff orbs
}

export const FOLK: Record<CivilizationType, Folk> = {
  human: {
    skins: SKIN_TONES,
    hair: HAIR_COLORS,
    clothes: TUNIC_COLORS,
    farmerHats: ["#d6b25e", "#e5c97a", "#c9a04a"],
    armour: ["#9ca3af", "#6b7280", "#1d4ed8"],
    helmOrHood: ["#9ca3af"],
    accents: ["#1d4ed8", "#b91c1c", "#fbbf24", "#f8fafc"]
  },
  elf: {
    skins: ["#f6e3d0", "#efd9c4", "#e8cfb6", "#f3dccb"],
    hair: ["#f5f0d0", "#e5e7eb", "#d9b36c", "#c4b5a0", "#f8fafc"],
    clothes: ["#15803d", "#0f766e", "#65a30d", "#0e7490", "#047857", "#a7f3d0"],
    farmerHats: ["#f5f0d0", "#d9b36c"],
    armour: ["#166534", "#14532d", "#3f6212"],
    helmOrHood: ["#14532d", "#1e3a2b", "#365314"],
    accents: ["#f472b6", "#facc15", "#ffffff", "#67e8f9"]
  },
  dwarf: {
    skins: ["#e8b48f", "#d9a07a", "#c68a5a", "#f1c9a5"],
    hair: ["#a0522d", "#7c2d12", "#d97706", "#3f2a1a", "#9ca3af"],
    clothes: ["#7c2d12", "#1e3a8a", "#4b5563", "#92400e", "#713f12", "#365314"],
    farmerHats: ["#a16207", "#78350f"],
    armour: ["#6b7280", "#52525b", "#78716c"],
    helmOrHood: ["#9ca3af"],
    accents: ["#a0522d", "#7c2d12", "#d97706", "#e5e7eb", "#3f2a1a"] // beards
  },
  orc: {
    skins: ["#6b8e23", "#556b2f", "#7a9a3a", "#4d7c0f", "#65743a"],
    hair: ["#1c1917", "#292524", "#44403c"],
    clothes: ["#78350f", "#57534e", "#7f1d1d", "#a16207", "#44403c"],
    farmerHats: ["#1c1917"],
    armour: ["#57534e", "#44403c", "#7f1d1d"],
    helmOrHood: ["#44403c"],
    accents: ["#a1784a", "#7c4a2d", "#d6c3a0"] // hide shields
  },
  arcane: {
    skins: ["#f1c9a5", "#e0ac83", "#c68a5a", "#dbe4ff", "#e9d5ff"],
    hair: ["#4c1d95", "#312e81", "#1e1b4b", "#6d28d9"],
    clothes: ["#4c1d95", "#1e3a8a", "#6d28d9", "#312e81", "#0e7490", "#7e22ce"],
    farmerHats: ["#312e81", "#4c1d95", "#1e1b4b"],
    armour: ["#2e1065", "#1e1b4b", "#4c1d95"],
    helmOrHood: ["#1e1b4b", "#4c1d95", "#312e81"],
    accents: ["#e879f9", "#67e8f9", "#c084fc", "#fde68a"] // glowing orbs and lanterns
  }
};

/** Livestock kept in pens (one species per plot) and the small birds/pets that roam yards */
export const CIV_ANIMALS: Record<CivilizationType, { pen: readonly AnimalKind[]; small: AnimalKind }> = {
  human: { pen: ["sheep", "cow", "pig"], small: "chicken" },
  elf: { pen: ["deer", "horse", "rabbit"], small: "swan" },
  dwarf: { pen: ["goat", "boar", "pony"], small: "goose" },
  orc: { pen: ["wolf", "boar", "lizard"], small: "crow" },
  arcane: { pen: ["sheep", "stag", "cat"], small: "owl" }
};

/** Flower colours per civilization (arcane and elf flowers glow) */
export const CIV_FLOWERS: Record<CivilizationType, { colors: string[]; glow: boolean }> = {
  human: { colors: FLOWER_COLORS, glow: false },
  elf: { colors: ["#67e8f9", "#a5f3fc", "#f0abfc", "#ffffff", "#86efac"], glow: true },
  dwarf: { colors: ["#fb923c", "#facc15", "#ef4444", "#f5f5f4"], glow: false },
  orc: { colors: ["#dc2626", "#7f1d1d", "#f97316", "#facc15"], glow: false },
  arcane: { colors: ["#c084fc", "#e879f9", "#818cf8", "#67e8f9"], glow: true }
};
