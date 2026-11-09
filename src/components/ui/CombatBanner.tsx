/** Red banner on a target panel while a battle is being fought there (round from the live march) */
export function CombatBanner({ combat, siege = false }: { combat?: { round: number; maxRounds: number } | null; siege?: boolean }) {
  if (!combat) return null;
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-rose-500/60 bg-rose-950/50 text-rose-100 text-xs font-mono">
      <span className="text-base leading-none animate-pulse" aria-hidden>
        ⚔️
      </span>
      <span>
        <b className="font-medieval text-sm">
          {siege ? "Under Siege" : "In Combat"} (Round {combat.round}/{combat.maxRounds})
        </b>
        <span className="text-rose-200/80"> · join as a reinforcing wave or wait for the outcome</span>
      </span>
    </div>
  );
}
