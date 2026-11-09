import { useState } from "react";
import { CloudLightning } from "lucide-react";
import { API_BASE } from "@/config";
import { sound } from "@/hooks/useSound";
import type { DisasterKind } from "@/types";
import { DISASTERS, DISASTER_KINDS, useRealmDisaster } from "@/utils/disasters";
import { Combobox } from "./Combobox";

/**
 * Admin → World Disasters (GAME_GUIDE §10 *World Disasters*, §11): call a disaster now or in 30 minutes (its warning
 * shows first), or end the one in force. A called disaster replaces one in force and any due during its 4 hours.
 */
export function DisasterAdminCard() {
  const current = useRealmDisaster();
  const [kind, setKind] = useState<DisasterKind>("blood_moon");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const send = async (body: Record<string, unknown>) => {
    setBusy(true);
    setResult(null);
    sound.playClick();
    try {
      const res = await fetch(`${API_BASE}/admin/disasters`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setResult({ ok: true, text: data.message });
    } catch (err: unknown) {
      setResult({ ok: false, text: err instanceof Error ? err.message : "Failed" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 rounded-xl border border-slate-700/80 bg-slate-900/80 space-y-3">
      <div className="flex items-start gap-3">
        <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 shrink-0 mt-0.5">
          <CloudLightning className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-slate-100">World Disasters</h3>
          <p className="text-xs text-slate-400 mt-1">
            {current
              ? `${DISASTERS[current.kind].emblem} ${DISASTERS[current.kind].name} ${current.active ? "is upon the realm" : "is coming (warned of)"}.`
              : "The realm is calm."}{" "}
            Call one to see and test it: it lasts 4 hours, replaces one in force and any due meanwhile, and the herald announces it to everyone. The weekly schedule carries on.
          </p>
        </div>
      </div>
      {result && <p className={`text-xs ${result.ok ? "text-emerald-300" : "text-red-300"}`}>{result.text}</p>}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-end flex-wrap">
        <div className="min-w-0 sm:w-56">
          <Combobox
            size="sm"
            options={DISASTER_KINDS.map((k) => ({ value: k, label: `${DISASTERS[k].emblem} ${DISASTERS[k].name}` }))}
            value={kind}
            onChange={(v) => setKind(v as DisasterKind)}
            ariaLabel="Disaster to call"
          />
        </div>
        <button onClick={() => send({ kind, inMinutes: 30 })} disabled={busy} className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-bold border border-slate-600 cursor-pointer">
          Warn, strike in 30 min
        </button>
        <button onClick={() => send({ kind })} disabled={busy} className="px-3 py-2 rounded-xl bg-rose-800 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold border border-rose-500/50 cursor-pointer">
          Strike now
        </button>
        {current && (
          <button onClick={() => send({ end: true })} disabled={busy} className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-emerald-200 text-xs font-bold border border-emerald-500/40 cursor-pointer">
            End it now
          </button>
        )}
      </div>
    </div>
  );
}
