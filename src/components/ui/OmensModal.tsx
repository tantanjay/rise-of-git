import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, MoonStar, Send } from "lucide-react";
import { HeaderTile, OMEN_ICON, OmenIcon } from "./realmIcons";
import { Modal } from "./Modal";
import { useDialog } from "./Dialog";
import { API_BASE } from "@/config";
import type { Omen, OmenKind } from "@/types";
import { sound } from "@/hooks/useSound";

/*
 * 🌠 Omens (GAME_GUIDE §11): the developers are the gods of this realm, so their feedback comes down as omens.
 * `SendOmenModal` (everyone signed in, ☰ menu) and `OmensModal` (admins: read them, mark them heeded).
 */

interface OmenData {
  kinds: Record<OmenKind, { emblem: string; label: string }>;
  rules: { perDay: number; maxTitle: number; maxBody: number; noticeMaxTitle: number; noticeMaxBody: number };
  defaultTitle: string;
  left: number;
  mine: Omen[];
  all?: Omen[];
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}/omens${path}`, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "The omen fizzled");
  return data as T;
}

/** An omen kind's line icon */
function KindIcon({ kind }: { kind: OmenKind }) {
  const Icon = OMEN_ICON[kind] ?? OmenIcon;
  return <Icon className="w-3.5 h-3.5 inline shrink-0 -mt-0.5" />;
}

const input = "w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-slate-100";
const label = "block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1";
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

const starHeader = (title: string, sub: string) => (
  <div className="flex items-center gap-3">
    <HeaderTile Icon={OmenIcon} tone="indigo" />
    <div>
      <h2 className="text-base font-bold text-slate-100 font-medieval">{title}</h2>
      <p className="text-xs text-slate-400">{sub}</p>
    </div>
  </div>
);

function Outcome({ ok, error }: { ok: string | null; error: string | null }) {
  if (ok)
    return (
      <div className="p-2.5 rounded-lg border border-emerald-500/40 bg-emerald-950/40 text-emerald-200 text-xs flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> {ok}
      </div>
    );
  if (error)
    return (
      <div className="p-2.5 rounded-lg border border-red-500/40 bg-red-950/40 text-red-200 text-xs flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" /> {error}
      </div>
    );
  return null;
}

/* ------------------------------------------------------------------------- */
/* Send an Omen                                                                */
/* ------------------------------------------------------------------------- */

export function SendOmenModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [data, setData] = useState<OmenData | null>(null);
  const [kind, setKind] = useState<OmenKind>("idea");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    call<OmenData>("GET", "").then(setData).catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (open) {
      setOk(null);
      setError(null);
      load();
    }
  }, [open, load]);

  const send = async () => {
    setBusy(true);
    setOk(null);
    setError(null);
    try {
      const r = await call<{ message: string }>("POST", "", { kind, title, body });
      sound.playClick();
      setOk(r.message);
      setTitle("");
      setBody("");
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="md" accentBorder="border-sky-600/50" headerClassName="bg-linear-to-b from-indigo-950/80 via-slate-900 to-slate-950" header={starHeader("Send an Omen", "You are the gods of this realm: tell its stewards what you see.")}>
      <div className="p-4 sm:p-5 space-y-3">
        {!data ? (
          <div className="py-8 text-center text-sm text-slate-500">{error ?? "Reading the stars…"}</div>
        ) : (
          <>
            <div>
              <span className={label}>Kind</span>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(data.kinds) as OmenKind[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => setKind(k)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs border transition ${kind === k ? "bg-sky-500/20 border-sky-400/70 text-sky-100" : "bg-slate-900 border-slate-700 text-slate-300 hover:text-white"}`}
                  >
                    <KindIcon kind={k} /> {data.kinds[k].label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className={label}>Title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={data.rules.maxTitle} className={input} placeholder="In a few words" />
            </div>
            <div>
              <span className={label}>
                Message <span className="normal-case font-normal text-slate-500">({body.length} / {data.rules.maxBody})</span>
              </span>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={data.rules.maxBody} rows={5} className={input} placeholder="What happened, what you'd like, what felt off…" />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={send}
                disabled={busy || !title.trim() || !body.trim() || data.left <= 0}
                className="px-4 py-2 rounded-xl bg-linear-to-b from-sky-500 to-indigo-700 hover:from-sky-400 hover:to-indigo-600 border border-sky-300/40 text-white text-xs font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-3.5 h-3.5 inline -mt-0.5" /> Send the omen
              </button>
              <span className="text-[11px] text-slate-400">
                {data.left > 0 ? `${data.left} of ${data.rules.perDay} left today` : `No omens left today (${data.rules.perDay} a day)`}
              </span>
            </div>
            <Outcome ok={ok} error={error} />
            {data.mine.length > 0 && (
              <div className="pt-2 border-t border-slate-800">
                <div className={label}>Your omens</div>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {data.mine.map((o) => (
                    <div key={o.id} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg bg-slate-950/60 border border-slate-800">
                      <KindIcon kind={o.kind} />
                      <span className="flex-1 truncate text-slate-200">{o.title}</span>
                      <span className={`text-[10px] ${o.status === "read" ? "text-sky-300" : "text-slate-500"}`}>{o.status === "read" ? "heeded" : "unread"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------------- */
/* Admins: the omens                                                           */
/* ------------------------------------------------------------------------- */

function OmenRow({ omen, data, onDone }: { omen: Omen; data: OmenData; onDone: (msg: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(data.defaultTitle);
  const [body, setBody] = useState(`The stewards of the realm have read your omen: “${omen.title}”.`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const k = data.kinds[omen.kind];
  const heed = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await call<{ message: string }>("POST", `/${omen.id}/read`, editing ? { title, body } : {});
      sound.playClick();
      onDone(r.message);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`p-3 rounded-xl border text-xs space-y-1.5 ${omen.status === "unread" ? "border-sky-700/50 bg-indigo-950/20" : "border-slate-800 bg-slate-950/50"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="px-1.5 py-0.5 rounded border border-slate-700 bg-slate-900 text-[10px]">
          <KindIcon kind={omen.kind} /> {k?.label}
        </span>
        <span className="font-semibold text-slate-100">{omen.title}</span>
        <span className="ml-auto text-[10px] text-slate-500">
          {omen.userName} · {when(omen.createdAt)}
        </span>
      </div>
      <div className="text-slate-300 whitespace-pre-line break-words">{omen.body}</div>
      {omen.status === "read" ? (
        <div className="text-[10px] text-sky-300/80">
          Heeded by {omen.readByName ?? "an admin"}
          {omen.readAt ? ` · ${when(omen.readAt)}` : ""}
        </div>
      ) : (
        <div className="space-y-1.5">
          {editing && (
            <div className="space-y-1.5 p-2 rounded-lg border border-slate-700 bg-slate-950/70">
              <div className={label}>Notice to {omen.userName}</div>
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={data.rules.noticeMaxTitle} className={input} />
              <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={data.rules.noticeMaxBody} rows={2} className={input} />
            </div>
          )}
          <div className="flex gap-1.5">
            <button onClick={heed} disabled={busy} className="px-3 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-600 border border-sky-400/40 text-white font-bold disabled:opacity-50">
              Mark as read
            </button>
            <button onClick={() => setEditing((e) => !e)} className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300">
              {editing ? "Default notice" : "Edit the notice"}
            </button>
          </div>
        </div>
      )}
      {error && <div className="text-red-300">{error}</div>}
    </div>
  );
}

export function OmensModal({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const dialog = useDialog();
  const [data, setData] = useState<OmenData | null>(null);
  const [filter, setFilter] = useState<"unread" | "all">("unread");
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => {
    call<OmenData>("GET", `?filter=${filter}`).then(setData).catch((e) => setMsg(e.message));
  }, [filter]);
  useEffect(() => {
    if (open) load();
  }, [open, load]);
  const done = (m: string) => {
    setMsg(m);
    load();
    onChanged();
  };
  const unread = (data?.all ?? []).filter((o) => o.status === "unread").length;
  const readAll = async () => {
    const yes = await dialog.confirm({ title: `Mark all ${unread} omens read?`, message: `Each sender gets the notice “${data?.defaultTitle}”.`, confirmLabel: "Mark all read" });
    if (!yes) return;
    try {
      done((await call<{ message: string }>("POST", "/read-all")).message);
    } catch (e: any) {
      setMsg(e.message);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      accentBorder="border-sky-600/50"
      headerClassName="bg-linear-to-b from-indigo-950/80 via-slate-900 to-slate-950"
      header={starHeader("Omens", "Feedback sent down by the realm's developers. Marking one read tells its sender.")}
      footer={
        <div className="flex items-center justify-between gap-2">
          <div className="flex rounded-lg border border-slate-700 overflow-hidden text-xs">
            {(["unread", "all"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 ${filter === f ? "bg-sky-900/60 text-sky-100" : "bg-slate-900 text-slate-400"}`}>
                {f === "unread" ? "Unread" : "All"}
              </button>
            ))}
          </div>
          <button onClick={readAll} disabled={unread === 0} className="px-4 py-1.5 rounded-xl bg-sky-700 hover:bg-sky-600 border border-sky-400/40 text-white text-xs font-bold disabled:opacity-40">
            Mark all read ({unread})
          </button>
        </div>
      }
    >
      <div className="p-4 sm:p-5 space-y-2">
        {msg && <Outcome ok={msg} error={null} />}
        {!data && <div className="py-8 text-center text-sm text-slate-500">Reading the stars…</div>}
        {data?.all?.length === 0 && <div className="py-8 text-center text-sm text-slate-400 flex flex-col items-center gap-2"><MoonStar className="w-6 h-6 text-slate-600" />{filter === "unread" ? "No new omens. The sky is quiet." : "No omens yet."}</div>}
        {data?.all?.map((o) => (
          <OmenRow key={o.id} omen={o} data={data} onDone={done} />
        ))}
      </div>
    </Modal>
  );
}
