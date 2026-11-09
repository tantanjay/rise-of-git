import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, FolderGit2, Stamp } from "lucide-react";
import { DeedIcon, HeaderTile, ScriptoriumIcon } from "./realmIcons";
import { Modal } from "./Modal";
import { useDialog } from "./Dialog";
import type { Deed } from "@/types";
import { scriptorium, xpText } from "@/utils/scriptoriumApi";
import { sound } from "@/hooks/useSound";

/*
 * 📜 Deeds awaiting a seal (GAME_GUIDE §17): Admins, Special Overseers and the Archon seal or reject pending deed
 * reports, oldest first. Nobody seals their own; the server refuses it and skips them in Seal all.
 */

function ReviewRow({ deed, mine, onDone }: { deed: Deed; mine: boolean; onDone: (msg: string) => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async (fn: () => Promise<{ message: string }>) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fn();
      sound.playClick();
      onDone(r.message);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const t = deed.dayTotal;
  return (
    <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/60 space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-slate-100">{deed.userName}</span>
        <span className="font-mono text-amber-300 font-bold">+{xpText(deed.xp)}</span>
        <span className="font-mono text-slate-400 truncate">
          <FolderGit2 className="w-3 h-3 inline -mt-0.5" /> {deed.repoName}
        </span>
        {deed.projectName && <span className="text-slate-500">· {deed.projectName}</span>}
        <span className="ml-auto text-[10px] font-mono text-slate-500" title="The author's deed XP that day">
          {deed.day} · day: {t ? `${t.sealed.toFixed(1)} sealed + ${t.pending.toFixed(1)} awaiting` : "—"}
        </span>
      </div>
      <div className="font-semibold text-slate-100">{deed.title}</div>
      <div className="text-slate-300 whitespace-pre-line break-words">{deed.body}</div>
      {mine ? (
        <div className="text-[11px] text-slate-500 italic">Your own deed: another manager seals it.</div>
      ) : (
        <div className="flex flex-col sm:flex-row gap-1.5">
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Note to the author (optional)" className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-100" />
          <div className="flex gap-1.5">
            <button disabled={busy} onClick={() => act(() => scriptorium.seal(deed.id, note))} className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 border border-emerald-400/40 text-white font-bold disabled:opacity-50">
              <Stamp className="w-3.5 h-3.5 inline -mt-0.5" /> Seal
            </button>
            <button disabled={busy} onClick={() => act(() => scriptorium.reject(deed.id, note))} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 font-bold disabled:opacity-50">
              Reject
            </button>
          </div>
        </div>
      )}
      {error && (
        <div className="text-red-300 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" /> {error}
        </div>
      )}
    </div>
  );
}

export function DeedReviewModal({ open, onClose, meId, onChanged }: { open: boolean; onClose: () => void; meId: string | null; onChanged: () => void }) {
  const dialog = useDialog();
  const [deeds, setDeeds] = useState<Deed[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(() => {
    scriptorium.deeds("pending").then(setDeeds).catch(() => setDeeds([]));
  }, []);
  useEffect(() => {
    if (open) {
      setMessage(null);
      load();
    }
  }, [open, load]);

  const sealable = (deeds ?? []).filter((d) => d.userId !== meId);
  const done = (msg: string) => {
    setMessage(msg);
    load();
    onChanged();
  };
  const sealAll = async () => {
    const xp = sealable.reduce((s, d) => s + d.xp, 0);
    const yes = await dialog.confirm({
      title: `Seal all ${sealable.length} deeds?`,
      message: `${xpText(xp)} in all lands on their buildings, and every author gets a herald notice.`,
      confirmLabel: "Seal all"
    });
    if (!yes) return;
    try {
      const r = await scriptorium.sealAll(sealable.map((d) => d.id));
      done(r.message);
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      accentBorder="border-amber-700/60"
      headerClassName="bg-linear-to-b from-amber-950/70 to-slate-950"
      header={
        <div className="flex items-center gap-3">
          <HeaderTile Icon={DeedIcon} tone="amber" />
          <div>
            <h2 className="text-base font-bold text-slate-100 font-medieval">Deeds awaiting your seal</h2>
            <p className="text-xs text-slate-400">Oldest first. Past the first 3 XP of a day, a deed needs a manager&apos;s seal.</p>
          </div>
        </div>
      }
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-500">{deeds ? `${deeds.length} waiting` : ""}</span>
          <button onClick={sealAll} disabled={sealable.length === 0} className="px-4 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 border border-emerald-400/40 text-white text-xs font-bold disabled:opacity-40">
            <Stamp className="w-3.5 h-3.5 inline -mt-0.5" /> Seal all ({sealable.length})
          </button>
        </div>
      }
    >
      <div className="p-4 sm:p-5 space-y-2">
        {message && (
          <div className="p-2.5 rounded-lg border border-emerald-500/40 bg-emerald-950/40 text-emerald-200 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" /> {message}
          </div>
        )}
        {deeds === null && <div className="py-8 text-center text-sm text-slate-500">Reading the scrolls…</div>}
        {deeds?.length === 0 && <div className="py-8 text-center text-sm text-slate-400 flex flex-col items-center gap-2"><ScriptoriumIcon className="w-6 h-6 text-slate-600" />No deeds are waiting.</div>}
        {deeds?.map((d) => (
          <ReviewRow key={d.id} deed={d} mine={d.userId === meId} onDone={done} />
        ))}
      </div>
    </Modal>
  );
}
