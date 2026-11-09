/**
 * Distributes N kingdoms evenly over the globe using a Fibonacci lattice,
 * keeping clear of NPC islands and shrinking islands when the planet gets crowded.
 */

type LatLon = [number, number];

const DEG = 180 / Math.PI;
const SPHERE_AREA_DEG2 = 41253; // full sphere in square degrees
const KINGDOM_RADIUS_DEG = 22;  // angular radius of a full-size kingdom island (incl. beach & islets)
const NPC_RADIUS_DEG = 18;

export function angularDistance([lat1, lon1]: LatLon, [lat2, lon2]: LatLon): number {
  const p1 = lat1 / DEG, p2 = lat2 / DEG;
  const dp = (lat2 - lat1) / DEG, dl = (lon2 - lon1) / DEG;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * DEG;
}

function fibonacciSphere(count: number): LatLon[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_, i) => {
    const y = 1 - ((i + 0.5) / count) * 2; // stay off the exact poles
    const lat = Math.asin(y) * DEG;
    const lon = ((((i * golden * DEG) % 360) + 540) % 360) - 180;
    return [lat, lon];
  });
}

export function computeKingdomPlacements(n: number, npcCoords: LatLon[]): { coords: LatLon[]; scale: number } {
  if (n <= 0) return { coords: [], scale: 1 };

  for (let m = n + npcCoords.length; m < n * 6 + 50; m++) {
    const spacing = Math.sqrt(SPHERE_AREA_DEG2 / m);           // typical gap between lattice points
    const scale = Math.max(0.3, Math.min(1, spacing / (KINGDOM_RADIUS_DEG * 2)));
    const npcClearance = NPC_RADIUS_DEG + KINGDOM_RADIUS_DEG * scale;

    const free = fibonacciSphere(m).filter((p) => npcCoords.every((npc) => angularDistance(p, npc) >= npcClearance));
    if (free.length >= n) {
      // Spread picks across the whole list so both hemispheres are used
      const coords = Array.from({ length: n }, (_, i) => free[Math.floor((i * free.length) / n)]);
      return { coords, scale };
    }
  }
  // Extremely crowded fallback
  return { coords: fibonacciSphere(n), scale: 0.3 };
}
