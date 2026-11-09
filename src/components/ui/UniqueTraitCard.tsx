import { CivilizationType } from "@/types";
import { traitModifiers, UNIQUE_TRAITS } from "@/utils/civLore";

/**
 * A civilization's Unique Trait: its legend and the buffs/debuffs it explains.
 * `compact` shows the name and motto only, with the story on hover (the caller lists the ▲/▼ chips itself).
 */
export function UniqueTraitCard({ civ, compact = false }: { civ: CivilizationType; compact?: boolean }) {
  const trait = UNIQUE_TRAITS[civ];
  const mods = traitModifiers(civ);
  return (
    <div
      title={compact ? trait.story : undefined}
      className={`rounded-xl border border-amber-700/40 bg-linear-to-br from-amber-950/50 via-slate-950/60 to-slate-950/60 space-y-2 ${compact ? "p-2" : "p-3"}`}
    >
      <div>
        <div className="text-[10px] uppercase tracking-widest font-bold text-amber-500/80">Unique Trait</div>
        <div className="font-medieval text-sm font-bold text-amber-200 leading-tight">{trait.name}</div>
        <div className="text-[11px] italic text-amber-100/70">{trait.motto}</div>
      </div>
      {!compact && <p className="text-xs text-slate-300 leading-relaxed">{trait.story}</p>}
      {!compact && (
        <ul className="space-y-1.5">
          {mods.map((m) => (
            <li key={m.id} className="text-xs leading-snug">
              <span className={`font-bold ${m.kind === "buff" ? "text-emerald-300" : "text-rose-300"}`}>
                {m.kind === "buff" ? "▲" : "▼"} {m.name}
              </span>
              <span className="text-slate-400"> · {m.description}</span>
              {m.lore && <div className="text-[11px] italic text-slate-400/90 pl-3">{m.lore}</div>}
            </li>
          ))}
        </ul>
      )}
      {!compact && trait.behind && <p className="text-[11px] text-slate-500 leading-snug">⚖️ {trait.behind}</p>}
      {!compact && (
        <div className="text-xs leading-snug space-y-1">
          <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500">World disasters</div>
          <div>
            <span className="font-bold text-emerald-300">▲ Copes · </span>
            <span className="text-slate-400">{trait.disasters.copes}</span>
          </div>
          <div>
            <span className="font-bold text-rose-300">▼ Suffers · </span>
            <span className="text-slate-400">{trait.disasters.suffers}</span>
          </div>
        </div>
      )}
    </div>
  );
}
