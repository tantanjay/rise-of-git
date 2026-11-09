import { useEffect, useState } from "react";
import { ChronicleStory } from "@/types";
import { API_BASE } from "@/config";
import { ChronicleChapter } from "./ChronicleStoryView";

/** A week's dates from its Sunday ("18 – 24 October") */
export function weekLabel(weekKey: string) {
  const from = new Date(`${weekKey}T00:00:00Z`);
  const to = new Date(from.getTime() + 6 * 86_400_000);
  const day = (d: Date, month: boolean) => d.toLocaleDateString(undefined, { day: "numeric", ...(month ? { month: "long" } : {}), timeZone: "UTC" });
  return from.getUTCMonth() === to.getUTCMonth() ? `${day(from, false)} – ${day(to, true)}` : `${day(from, true)} – ${day(to, true)}`;
}

/**
 * 📜 The Codex's Chronicles (GAME_GUIDE §10): every weekly story the Crown has published, newest first. The open one
 * is drawn whole with its marks (ChronicleChapter); the others are a row each and unroll on a click.
 */
export function ChroniclesBook() {
  const [stories, setStories] = useState<ChronicleStory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`${API_BASE}/chronicle/stories`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((s: ChronicleStory[]) => {
        if (!live) return;
        setStories(s);
        setOpen(s[0]?.id ?? null);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);

  if (error) return <div className="p-4 text-sm text-red-300">Could not load the Chronicles: {error}</div>;
  if (!stories) return <div className="p-8 text-center text-sm text-slate-400">Unrolling the Chronicles…</div>;
  if (stories.length === 0)
    return (
      <div className="p-8 text-center text-sm text-slate-400">
        <p className="font-medieval text-base text-amber-200">The Chronicles are still blank.</p>
        <p className="mt-1">Each week the Crown tells the story of the week before. The first chapter is yet to be written.</p>
      </div>
    );

  return (
    <div className="space-y-3 pb-4">
      {stories.map((s, i) => {
        const chapter = stories.length - i;
        if (open === s.id)
          return (
            <article key={s.id} className="shadow-lg">
              <ChronicleChapter
                chapter={chapter}
                weekLabel={weekLabel(s.weekKey)}
                title={s.title}
                body={s.body}
                marks={s.marks}
                footer={`Set down by ${s.publishedByName}, ${new Date(s.publishedAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}`}
              />
            </article>
          );
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => setOpen(s.id)}
            className="w-full text-left px-4 py-3 flex items-center gap-3 rounded-xl border border-amber-900/50 bg-slate-900 hover:bg-slate-800/80 transition"
          >
            <span className="w-8 h-8 shrink-0 rounded-full bg-violet-900/70 border border-amber-400/50 flex items-center justify-center text-sm">📖</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] uppercase tracking-[0.2em] text-amber-300/70">
                Chapter {chapter} · the week of {weekLabel(s.weekKey)}
              </span>
              <span className="block font-medieval text-base font-bold text-amber-100 truncate">{s.title}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
