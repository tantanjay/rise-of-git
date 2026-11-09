import { RepoBuilding } from "@/types";
import { RED_STAR_FROM } from "@/utils/castle";

/**
 * Prestige stars of a Lv25 building: ★ up to 4, then one red ★ with the real total (e.g. red ★ 7 = seven stars).
 * ★1–★4 add effects step by step; the red ★ gives the plot the grand, legendary-class effects.
 */
export function PrestigeStars({ building, className = "" }: { building: Pick<RepoBuilding, "prestige" | "stars">; className?: string }) {
  const stars = building.stars ?? building.prestige;
  if (stars <= 0) return null;
  const title = `${stars} prestige star${stars === 1 ? "" : "s"} (one per 200 XP past Lv 25)`;
  if (stars < RED_STAR_FROM) {
    return (
      <span className={`text-yellow-300 ${className}`} title={title}>
        {"★".repeat(stars)}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-0.5 font-bold ${className}`} title={title}>
      <span className="text-red-500 drop-shadow-[0_0_4px_rgba(239,68,68,0.7)]">★</span>
      <span className="text-red-300 tabular-nums">{stars}</span>
    </span>
  );
}
