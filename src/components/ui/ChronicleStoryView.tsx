import { ReactNode } from "react";
import { BookOpen } from "lucide-react";
import { ChronicleMarks } from "@/types";
import { CIV_CREST, Insignia, MARK_DRAWINGS, MarkIcon } from "@/utils/chronicleMarks";

/*
 * Draws a weekly story with its marks (GAME_GUIDE §15 *Weekly Chronicle*): the [insignia:key] crest beside the
 * opening paragraph, [key] icons in the text, [callout:key]…[/callout] boxes and [divider:key] ornaments, and
 * rulers' names as chips with their people's crest. Unknown tags are dropped, never shown. Stories saved with
 * <angle> tags read the same.
 */

type Block = { type: "p"; text: string } | { type: "callout"; mark: string; text: string } | { type: "divider"; mark: string };

/** A mark's brackets: [square], or <angle> in stories saved before */
const O = "[<\\[]";
const C = "[>\\]]";
const TAG = new RegExp(`${O}\\/?[a-z-]+(?::[a-z-]+)?${C}`, "g");

function parseStory(body: string): { insignia: string | null; blocks: Block[] } {
  const insignia = new RegExp(`${O}insignia:([a-z-]+)${C}`).exec(body)?.[1] ?? null;
  const blocks = body
    .replace(new RegExp(`${O}insignia:[a-z-]+${C}`, "g"), "")
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p): Block => {
      const divider = new RegExp(`^${O}divider:([a-z-]+)${C}$`).exec(p);
      if (divider) return { type: "divider", mark: divider[1] };
      const callout = new RegExp(`^${O}callout:([a-z-]+)${C}([\\s\\S]*?)${O}\\/callout${C}$`).exec(p);
      if (callout) return { type: "callout", mark: callout[1], text: callout[2].trim() };
      return { type: "p", text: p };
    });
  return { insignia, blocks };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A paragraph's text with its icons and rulers' crest chips */
function inline(text: string, rulers: ChronicleMarks["rulers"]): ReactNode[] {
  const names = rulers.filter((r) => r.name.trim()).map((r) => escape(r.name));
  const re = new RegExp(`${O}([a-z-]+)${C}|${names.length ? `(${names.join("|")})` : "(?!)"}|${TAG.source}`, "g");
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    if (m[1]) {
      if (MARK_DRAWINGS[m[1]]) out.push(<MarkIcon key={m.index} mark={m[1]} />);
    }
    else if (m[2]) {
      const civ = rulers.find((r) => r.name === m[2])!.civ;
      const crest = CIV_CREST[civ];
      out.push(
        <span key={m.index} className="inline-flex items-center gap-1 px-1.5 rounded-full font-sans text-[0.85em] font-semibold leading-5 align-[1px] whitespace-nowrap" style={{ background: crest.bg, color: crest.ink }}>
          <crest.Icon className="w-3 h-3" aria-hidden />
          {m[2]}
        </span>
      );
    }
    // Any other tag (a stray </callout>, a mark in the wrong place) is dropped
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** The story's body: insignia, paragraphs, callouts and dividers */
export function ChronicleText({ body, rulers = [], compact = false }: { body: string; rulers?: ChronicleMarks["rulers"]; compact?: boolean }) {
  const { insignia, blocks } = parseStory(body);
  const firstP = blocks.findIndex((b) => b.type === "p");
  return (
    <div className={`${compact ? "text-sm" : "text-[15px]"} leading-relaxed text-amber-950`}>
      {blocks.map((b, i) => {
        if (b.type === "divider")
          return (
            <div key={i} className="flex items-center gap-3 my-3" aria-hidden>
              <span className="flex-1 h-px bg-amber-800/30" />
              <MarkIcon mark={b.mark} size={18} />
              <span className="flex-1 h-px bg-amber-800/30" />
            </div>
          );
        if (b.type === "callout")
          return (
            <div key={i} className="my-3 flex items-center gap-3 px-3.5 py-2.5 rounded-lg border border-amber-500/70 bg-amber-100/80 font-sans text-[0.9em] text-amber-900">
              <MarkIcon mark={b.mark} size={22} />
              <span>{inline(b.text, rulers)}</span>
            </div>
          );
        const lead = i === firstP;
        return (
          <p key={i} className={`mb-3 whitespace-pre-line font-serif ${lead && !insignia ? "first-letter:float-left first-letter:text-[2.8em] first-letter:leading-[0.9] first-letter:mr-1.5 first-letter:mt-1 first-letter:text-red-900 first-letter:font-medieval" : ""}`}>
            {lead && insignia && (
              <span className="float-left mr-3.5 mt-1 mb-1">
                <Insignia mark={insignia} size={compact ? 56 : 76} />
              </span>
            )}
            {inline(b.text, rulers)}
          </p>
        );
      })}
      <div className="clear-both" />
    </div>
  );
}

/** A whole chapter: the header with its peoples' crests, the strip of happenings, the story and who set it down */
export function ChronicleChapter({
  chapter,
  weekLabel,
  title,
  body,
  marks,
  footer
}: {
  chapter: number | null;
  weekLabel: string;
  title: string;
  body: string;
  marks: ChronicleMarks | null;
  footer?: string;
}) {
  const civs = [...new Set((marks?.rulers ?? []).map((r) => r.civ))];
  return (
    <div className="rounded-xl overflow-hidden border border-amber-800/60">
      <div className="flex items-center gap-3 px-4 py-3" style={{ background: "#412402" }}>
        <span className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center border" style={{ background: "#534AB7", borderColor: "#FAC775", color: "#FAEEDA" }}>
          <BookOpen className="w-4.5 h-4.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] uppercase tracking-[0.18em]" style={{ color: "#FAC775" }}>
            {chapter ? `Chapter ${chapter} · ` : ""}the week of {weekLabel}
          </span>
          <span className="block font-medieval text-lg leading-tight truncate" style={{ color: "#FAEEDA" }}>
            {title || "Untitled chapter"}
          </span>
        </span>
        {civs.length > 0 && (
          <span className="hidden sm:flex gap-1 shrink-0">
            {civs.map((c) => {
              const crest = CIV_CREST[c];
              return (
                <span key={c} title={crest.label} className="px-1.5 h-5 rounded-full flex items-center" style={{ background: crest.bg, color: crest.ink }}>
                  <crest.Icon className="w-3 h-3" aria-hidden />
                </span>
              );
            })}
          </span>
        )}
      </div>
      {marks && marks.happenings.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto px-4 py-3 border-b" style={{ background: "#FAEEDA", borderColor: "#EF9F27" }}>
          {marks.happenings.map((h) => (
            <span key={h.kind} className="shrink-0 w-20 flex flex-col items-center gap-1 text-center text-[10px] leading-tight" style={{ color: "#633806" }}>
              <span className="w-9 h-9 rounded-full flex items-center justify-center border text-base" style={{ borderColor: "#BA7517", background: "#FDF6E3" }}>
                {h.emblem}
              </span>
              {h.label}
            </span>
          ))}
        </div>
      )}
      <div className="px-5 sm:px-7 pt-5 pb-3" style={{ background: "#FDF6E3" }}>
        <ChronicleText body={body} rulers={marks?.rulers} />
        {footer && <p className="pt-1 pb-1 text-right text-[11px] italic text-amber-900/60">{footer}</p>}
      </div>
    </div>
  );
}
