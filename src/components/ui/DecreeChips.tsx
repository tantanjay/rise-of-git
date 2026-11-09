import { DeveloperKingdom, RoyalPunishment, RoyalShield } from "@/types";
import { timeLeftLabel } from "@/utils/format";
import { FESTIVAL } from "@/utils/civDemographics";
import { callToArmsLeft, festivalLeft } from "./RoyalProclamations";

/** The kingdom's Royal Shield, if it is still up */
export const activeShield = (k: Pick<DeveloperKingdom, "shield">, now = Date.now()): RoyalShield | null => (k.shield && k.shield.endsAt > now ? k.shield : null);
/** The kingdom's Royal Punishment, if it still lasts */
export const activePunishment = (k: Pick<DeveloperKingdom, "punishment">, now = Date.now()): RoyalPunishment | null =>
  k.punishment && k.punishment.endsAt > now ? k.punishment : null;

/** "🛡️ Royal Shield — 3d 4h left" */
export const shieldLabel = (s: RoyalShield, now = Date.now()) => `🛡️ Royal Shield — ${timeLeftLabel(s.endsAt - now)} left`;
/** "⛈️ Punished · no harvest · ▼ births · ▼ life — 2d left" */
export const punishmentLabel = (p: RoyalPunishment, now = Date.now()) =>
  `⛈️ Punished · no harvest${p.lowBirth ? " · ▼ births" : ""}${p.highDeath ? " · ▼ life" : ""} — ${timeLeftLabel(p.endsAt - now)} left`;

/** Status chips for a kingdom's Royal Shield and Punishment, 🎉 Festival and ⚔️ Call to Arms (Kingdom panel, hover cards) */
export function DecreeChips({ kingdom, className = "" }: { kingdom: DeveloperKingdom; className?: string }) {
  const shield = activeShield(kingdom);
  const punishment = activePunishment(kingdom);
  const festival = festivalLeft(kingdom);
  const arms = callToArmsLeft(kingdom);
  if (!shield && !punishment && !festival && !arms) return null;
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {shield && (
        <span
          className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-950/80 text-sky-200 border border-sky-400/50"
          title={shield.breaksOnAttack ? "Can't be attacked, rallied on or scouted. Breaks if this ruler attacks another ruler." : "Can't be attacked, rallied on or scouted."}
        >
          {shieldLabel(shield)}
        </span>
      )}
      {punishment && (
        <span
          className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800/90 text-slate-200 border border-slate-500/60"
          title="Royal Punishment: nothing from the harvest pool, buildings or workforce"
        >
          {punishmentLabel(punishment)}
        </span>
      )}
      {festival > 0 && (
        <span
          className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-950/80 text-amber-200 border border-amber-500/60"
          title={`Festival: births ×${FESTIVAL.BIRTH_MULT} and +${Math.round((FESTIVAL.YIELD_MULT - 1) * 100)}% from the workforce for ${timeLeftLabel(festival)} more`}
        >
          🎉 Festival — {timeLeftLabel(festival)} left
        </span>
      )}
      {arms > 0 && (
        <span
          className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-950/80 text-rose-200 border border-rose-500/60"
          title="Call to Arms: this ruler attacked a ruler's city or a frontier gate within the hour. No Festival until it ends."
        >
          ⚔️ Call to Arms — {timeLeftLabel(arms)} left
        </span>
      )}
    </div>
  );
}
