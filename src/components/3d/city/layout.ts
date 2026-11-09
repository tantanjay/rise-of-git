import { BuildingType, RepoBuilding } from "@/types";

/** Half-size of the central plaza around the town hall */
export const PLAZA_HALF = 13;
export const ROAD_HALF = 1.6;
const LANE = 1.8; // street in front of every row of plots
const GAP = 0.8; // between neighbouring plots

/**
 * Each district owns one quadrant of the city:
 * houses front-left, soldiers front-right (by the gate), farms back-right, pastures back-left.
 */
export const DISTRICT_QUADRANT: Record<BuildingType, { sx: number; sz: number }> = {
  residential_commercial: { sx: -1, sz: 1 },
  soldier_building: { sx: 1, sz: 1 },
  food_field: { sx: 1, sz: -1 },
  animal_field: { sx: -1, sz: -1 }
};

/** Building design is driven by level */
export function effectiveLevel(b: RepoBuilding): number {
  return b.level;
}

/** Plot (land) size grows with level */
export function plotSizeForLevel(level: number): number {
  if (level <= 3) return 5;
  if (level <= 6) return 6;
  if (level <= 9) return 7.5;
  if (level <= 14) return 9;
  if (level <= 19) return 10.5;
  if (level <= 25) return 12.5;
  return 14; // Lv26–30: room for a Celestial structure
}

export interface PlotPlacement {
  key: string;
  building?: RepoBuilding; // undefined → vacant plot kept for a removed repo
  type: BuildingType;
  slot: number;
  size: number;
  x: number;
  z: number;
  rot: number; // plot front (+Z local) faces the street towards the town centre
}

export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface CityLayout {
  plots: PlotPlacement[];
  lanes: Rect[];
  half: number; // half-size of the whole city ground
}

export function computeCityLayout(
  buildings: RepoBuilding[],
  vacant: Array<{ buildingType: BuildingType; slot: number }>
): CityLayout {
  const plots: PlotPlacement[] = [];
  const lanes: Rect[] = [];
  let extent = PLAZA_HALF + 6;

  const types = Object.keys(DISTRICT_QUADRANT) as BuildingType[];
  for (const type of types) {
    const items: Array<Omit<PlotPlacement, "x" | "z" | "rot">> = [
      ...buildings
        .filter((b) => b.buildingType === type)
        .map((b) => ({ key: b.id, building: b, type, slot: b.slot ?? 0, size: plotSizeForLevel(effectiveLevel(b)) })),
      ...vacant
        .filter((v) => v.buildingType === type)
        .map((v) => ({ key: `vacant-${type}-${v.slot}`, type, slot: v.slot, size: plotSizeForLevel(1) }))
    ].sort((a, b) => a.slot - b.slot);

    if (items.length === 0) continue;

    // Shelf-pack rows outward from the plaza corner; slot 0 sits closest to the centre
    const area = items.reduce((sum, it) => sum + (it.size + GAP) * (it.size + LANE), 0);
    const maxSize = Math.max(...items.map((it) => it.size));
    const rowWidth = Math.max(maxSize, Math.sqrt(area) * 1.15);

    const { sx, sz } = DISTRICT_QUADRANT[type];
    const x0 = ROAD_HALF + 1.2;
    let rowZ = PLAZA_HALF + 1.5 + LANE;
    let cursorX = x0;
    let rowDepth = 0;
    let rowStartIdx = plots.length;

    const closeRow = () => {
      if (plots.length === rowStartIdx) return;
      const laneLen = cursorX - GAP - ROAD_HALF;
      lanes.push({ x: sx * (ROAD_HALF + laneLen / 2), z: sz * (rowZ - LANE / 2), w: laneLen, d: LANE });
    };

    for (const it of items) {
      if (cursorX > x0 && cursorX + it.size > x0 + rowWidth) {
        closeRow();
        rowZ += rowDepth + LANE;
        cursorX = x0;
        rowDepth = 0;
        rowStartIdx = plots.length;
      }
      const lx = cursorX + it.size / 2;
      const lz = rowZ + it.size / 2;
      plots.push({ ...it, x: sx * lx, z: sz * lz, rot: sz > 0 ? Math.PI : 0 });
      cursorX += it.size + GAP;
      rowDepth = Math.max(rowDepth, it.size);
      extent = Math.max(extent, lx + it.size / 2, lz + it.size / 2);
    }
    closeRow();
  }

  return { plots, lanes, half: extent + 7 };
}
