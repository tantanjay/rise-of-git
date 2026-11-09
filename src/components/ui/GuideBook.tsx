import { useMemo, useState } from "react";
import { Lock, Search } from "lucide-react";
import { CivilizationType } from "@/types";
import { SoonBadge } from "./SoonBadge";
import { CIV_META } from "./TopHUD";
import { ModelViewer } from "./CodexPreview";
import { GUIDE_CHAPTERS, GUIDE_GROUPS } from "./guideContent";
import { UniqueTraitCard } from "./UniqueTraitCard";
import { Combobox } from "./Combobox";

const CIVS: CivilizationType[] = ["human", "elf", "dwarf", "orc", "arcane"];

/** The Guide Book: the game's rules chapter by chapter, each with its 3D models */
export function GuideBook({ initialChapter }: { initialChapter?: string } = {}) {
  const [chapterId, setChapterId] = useState(() => GUIDE_CHAPTERS.find((c) => c.id === initialChapter)?.id ?? GUIDE_CHAPTERS[0].id);
  const [modelIdx, setModelIdx] = useState(0);
  const [civ, setCiv] = useState<CivilizationType>("human");
  const [castleView, setCastleView] = useState<"world" | "city">("world");
  const [query, setQuery] = useState("");

  const chapters = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return GUIDE_CHAPTERS;
    return GUIDE_CHAPTERS.filter((c) =>
      [c.title, c.summary, ...c.sections.flatMap((s) => [s.heading ?? "", s.body ?? "", ...(s.facts ?? []).flat()])].join(" ").toLowerCase().includes(q)
    );
  }, [query]);

  const chapter = chapters.find((c) => c.id === chapterId) ?? chapters[0] ?? null;
  const model = chapter ? chapter.models[Math.min(modelIdx, chapter.models.length - 1)] : null;
  // Civilization chapters dress buildings and improvements in their own style
  const styleCiv = chapter?.civ ?? civ;

  const pick = (id: string) => {
    setChapterId(id);
    setModelIdx(0);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] gap-3">
      {/* Chapters */}
      <div className="flex flex-col min-h-0">
        <label className="flex items-center gap-2 h-8 px-2 mb-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-400">
          <Search className="w-3.5 h-3.5 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the guide…"
            className="w-full bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-500"
          />
        </label>
        <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-y-auto md:max-h-[34rem] pr-1">
          {GUIDE_GROUPS.map((group) => {
            const list = chapters.filter((c) => c.group === group);
            if (list.length === 0) return null;
            return (
              <div key={group} className="contents">
                <div className="hidden md:block px-2 pt-2 pb-0.5 text-[10px] uppercase tracking-widest font-bold text-amber-500/70">{group}</div>
                {list.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => pick(c.id)}
                    className={`shrink-0 md:shrink text-left flex items-center gap-2 px-2 py-1.5 rounded-lg border transition ${
                      chapter?.id === c.id ? "bg-slate-800 border-amber-500/50" : "bg-slate-900/60 border-transparent hover:bg-slate-800/70"
                    }`}
                  >
                    <span className="text-lg leading-none">{c.emblem}</span>
                    <span className="block text-xs font-semibold text-slate-200 truncate">{c.title}</span>
                  </button>
                ))}
              </div>
            );
          })}
          {chapters.length === 0 && <div className="text-xs text-slate-500 p-2">Nothing matches.</div>}
        </div>
      </div>

      {/* Chapter */}
      {chapter && model && (
        <div className="flex flex-col gap-3 min-w-0">
          <div className="relative h-72 sm:h-80 rounded-xl overflow-hidden border border-slate-700 bg-slate-950">
            <ModelViewer preview={model.preview} civ={styleCiv} view={castleView} prestige={4} />
            {model.soon && <SoonBadge variant="ribbon" />}
            <div className="absolute left-2 top-2 right-2 flex flex-wrap gap-1">
              {chapter.models.map((m, i) => (
                <button
                  key={m.label}
                  onClick={() => setModelIdx(i)}
                  className={`inline-flex items-center gap-1 px-2 h-7 rounded-md text-[11px] font-semibold border ${
                    model === m ? "bg-amber-900/80 border-amber-500/60 text-amber-200" : "bg-slate-900/80 border-slate-700 text-slate-300 hover:text-slate-100"
                  }`}
                >
                  {m.label}
                  {m.soon && <Lock className="w-3 h-3 text-rose-300" aria-label="Coming soon" />}
                </button>
              ))}
              {model.preview.kind === "castle" && (
                <button
                  onClick={() => setCastleView((v) => (v === "world" ? "city" : "world"))}
                  className="px-2 h-7 rounded-md text-[11px] font-semibold border bg-slate-900/80 border-slate-700 text-slate-300 hover:text-slate-100"
                  title="Switch between the world-map castle and the city town hall"
                >
                  {castleView === "world" ? "🗺️ World map" : "🏙️ City town hall"}
                </button>
              )}
              {!chapter.civ && (model.preview.kind === "building" || model.preview.kind === "improvement") && (
                <div className="w-32">
                  <Combobox size="sm" options={CIVS.map((c) => ({ value: c, label: `${CIV_META[c].icon} ${CIV_META[c].label}` }))} value={civ} onChange={(v) => setCiv(v as CivilizationType)} title="Civilization style" ariaLabel="Civilization style" />
                </div>
              )}
            </div>
            <div className="absolute right-2 bottom-2 text-[10px] text-slate-500">Drag to rotate · scroll to zoom</div>
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <span className="text-2xl leading-none">{chapter.emblem}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-widest font-bold text-slate-500">{chapter.group}</div>
                <h3 className="font-medieval text-base font-bold text-amber-200 leading-tight">{chapter.title}</h3>
              </div>
            </div>
            <p className="text-sm text-slate-200 leading-relaxed">{chapter.summary}</p>

            {chapter.civ && <UniqueTraitCard civ={chapter.civ} />}

            {chapter.sections.map((s, i) => (
              <section key={s.heading ?? i} className="space-y-1.5">
                {s.heading && <h4 className="text-xs font-bold text-amber-300/90 uppercase tracking-wider">{s.heading}</h4>}
                {s.body && <p className="text-xs text-slate-300 leading-relaxed">{s.body}</p>}
                {s.facts && (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs rounded-lg bg-slate-950/60 border border-slate-800 p-2">
                    {s.facts.map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="text-slate-500">{k}</dt>
                        <dd className="text-slate-200 break-words">{v}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
