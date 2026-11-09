import { useCallback, useEffect, useState } from "react";
import { Coins, HeartPulse, Hourglass, Lock, Swords, Tent, UserX, Users } from "lucide-react";
import { API_BASE } from "@/config";
import type { MapNPC, MercBand, MercCamp, MercCampSlot, MercRarity } from "@/types";
import { HEAL_PRICE_SHARE, MERC_RULES, costText, mercDurationText, BAND_BOSS_DAMAGE, BATTLE_PAY, battlePayFor } from "@/utils/mercenaries";
import { Modal } from "./Modal";

/**
 * 🪙 The Mercenary Camp at the viewer's own civilization's legendary landmark (GAME_GUIDE §13 *Mercenaries*): its stock by
 * rarity (first come first served), what the viewer may hire and why not, and the viewer's own bands with their
 * strength, heal and dismiss. The server decides everything; this only shows it and sends the choice.
 */

const RARITY: Record<MercRarity, { text: string; chip: string; card: string }> = {
  common: { text: "text-slate-300", chip: "bg-slate-800 text-slate-300 border-slate-600/60", card: "border-slate-600/50" },
  uncommon: { text: "text-emerald-300", chip: "bg-emerald-950 text-emerald-300 border-emerald-500/60", card: "border-emerald-500/40" },
  rare: { text: "text-sky-300", chip: "bg-sky-950 text-sky-300 border-sky-500/60", card: "border-sky-500/40" },
  epic: { text: "text-purple-300", chip: "bg-purple-950 text-purple-300 border-purple-500/60", card: "border-purple-500/40" },
  legendary: { text: "text-amber-300", chip: "bg-amber-950 text-amber-300 border-amber-500/60", card: "border-amber-500/50" }
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

interface Props {
  /** The landmark clicked (its id is the camp's) */
  landmark: MapNPC | null;
  /** Signed in: the viewer can hire, heal and dismiss */
  signedIn: boolean;
  onClose: () => void;
  /** Something changed the viewer's treasury or bands (refetch the kingdom and the marches) */
  onChanged?: () => void;
}

export function MercenaryCampModal({ landmark, signedIn, onClose, onChanged }: Props) {
  const [camp, setCamp] = useState<MercCamp | null>(null);
  const [bands, setBands] = useState<MercBand[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDismiss, setConfirmDismiss] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const campId = landmark?.id ?? null;

  const load = useCallback(async () => {
    if (!campId) return;
    const [c, b] = await Promise.all([
      fetch(`${API_BASE}/mercenaries/camps/${encodeURIComponent(campId)}`).then((r) => (r.ok ? r.json() : null)),
      signedIn ? fetch(`${API_BASE}/mercenaries/mine`).then((r) => (r.ok ? r.json() : [])) : Promise.resolve([])
    ]).catch(() => [null, []]);
    setCamp(c);
    setBands(b ?? []);
    setNow(Date.now());
  }, [campId, signedIn]);

  useEffect(() => {
    setStatus(null);
    setConfirmDismiss(null);
    setCamp(null);
    void load();
  }, [load]);

  // Restock clocks and heals tick while the camp is open
  useEffect(() => {
    if (!campId) return;
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [campId]);

  const act = async (key: string, path: string, body?: unknown, done?: string) => {
    setBusy(key);
    setStatus(null);
    try {
      const res = await fetch(`${API_BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setStatus({ ok: false, text: data.error || "That didn't work." });
      else {
        setStatus({ ok: true, text: done ?? "Done." });
        onChanged?.();
      }
    } catch (err: any) {
      setStatus({ ok: false, text: err.message || "Network error" });
    }
    setBusy(null);
    setConfirmDismiss(null);
    await load();
  };

  if (!landmark) return null;
  const v = camp?.viewer ?? null;

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      accentBorder="border-amber-500/50"
      headerClassName="bg-linear-to-r from-amber-950 via-stone-950 to-slate-950"
      header={
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-amber-900/50 border border-amber-500/50 flex items-center justify-center shrink-0">
            <Tent className="w-5 h-5 text-amber-300" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-400/80">Mercenary Camp</div>
            <h2 className="text-base sm:text-lg font-black text-amber-100 truncate">
              {landmark.emblem} {landmark.name}
            </h2>
            <div className="text-[11px] text-slate-400 truncate">{camp?.region ?? landmark.region} · your civilization's sellswords, first come first served</div>
          </div>
        </div>
      }
    >
      <div className="p-4 space-y-4 text-slate-200">
        {/* The landmark itself: its title and story, as the scout panel tells it */}
        {(landmark.subtitle || landmark.description) && (
          <div className="rounded-xl border border-amber-500/25 bg-amber-950/20 px-3 py-2.5">
            {landmark.subtitle && <div className="text-[11px] uppercase tracking-wider font-bold text-amber-300/90">{landmark.subtitle}</div>}
            {landmark.description && <p className="text-xs text-slate-300 leading-relaxed mt-1 italic">{landmark.description}</p>}
          </div>
        )}
        <p className="text-xs text-slate-400 leading-relaxed">
          A band is one whole march: it takes a march slot of its own, needs none of your soldiers, and fights as your full march × its power with its own Battle Arts. Its losses are{" "}
          <b className="text-slate-200">strength</b>: at 0% it is dead. It costs a hiring price and upkeep every harvest; unpaid twice running, it deserts. On a world boss a band keeps the Sellsword's Oath: it lands only {Math.round(BAND_BOSS_DAMAGE * 100)}% of its blows.
        </p>

        {v ? (
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-700">
              <Users className="w-3 h-3 inline -mt-0.5 mr-1 text-amber-300" />
              Bands held <b>{v.held}</b> / {v.cap}
            </span>
            <span className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-700">
              <Swords className="w-3 h-3 inline -mt-0.5 mr-1 text-rose-300" />
              {v.marchSlots} march slots · your full march: <b>{v.fullMarch.toLocaleString()}</b> soldiers
            </span>
          </div>
        ) : (
          <div className="text-[11px] text-amber-200/80 bg-amber-950/40 border border-amber-500/30 rounded-lg px-3 py-2">Sign in with Git to hire. The stock below is the same for everyone.</div>
        )}

        {status && (
          <div className={`text-xs rounded-lg px-3 py-2 border ${status.ok ? "bg-emerald-950/50 border-emerald-500/40 text-emerald-200" : "bg-rose-950/50 border-rose-500/40 text-rose-200"}`}>{status.text}</div>
        )}

        {/* Stock */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          {(camp?.slots ?? []).map((slot) => (
            <SlotCard key={slot.rarity} slot={slot} now={now} busy={busy === `hire-${slot.rarity}`} canAct={signedIn} onHire={() => act(`hire-${slot.rarity}`, "/mercenaries/hire", { campId: landmark.id, rarity: slot.rarity }, `${slot.name} signed on.`)} />
          ))}
          {!camp && <div className="text-xs text-slate-500 col-span-full">Opening the camp…</div>}
        </div>

        {/* The viewer's bands */}
        {signedIn && (
          <div className="space-y-2">
            <h3 className="text-xs uppercase tracking-wider font-bold text-slate-400">Your bands</h3>
            {bands.length === 0 && <div className="text-xs text-slate-500">You hold no band. Hire one above.</div>}
            {bands.map((b) => (
              <BandRow
                key={b.id}
                band={b}
                now={now}
                busy={busy?.endsWith(b.id) ?? false}
                confirming={confirmDismiss === b.id}
                onHeal={() => act(`heal-${b.id}`, `/mercenaries/${b.id}/heal`, undefined, `${b.name} is healing.`)}
                onStopHeal={() => act(`stop-${b.id}`, `/mercenaries/${b.id}/stop-heal`, undefined, `${b.name} stopped healing.`)}
                onDismiss={() => (confirmDismiss === b.id ? act(`dismiss-${b.id}`, `/mercenaries/${b.id}/dismiss`, undefined, `${b.name} left your service.`) : setConfirmDismiss(b.id))}
                onCancelDismiss={() => setConfirmDismiss(null)}
              />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function SlotCard({ slot, now, busy, canAct, onHire }: { slot: MercCampSlot; now: number; busy: boolean; canAct: boolean; onHire: () => void }) {
  const st = RARITY[slot.rarity];
  const locked = Boolean(slot.blocked);
  const next = slot.nextAt ? Math.max(0, slot.nextAt - now) : null;
  return (
    <div className={`rounded-xl border bg-slate-900/70 p-3 flex flex-col gap-2 ${st.card} ${locked ? "opacity-55" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-bold text-slate-100 leading-tight">
            {slot.emblem} {slot.name}
          </div>
          <span className={`inline-block mt-1 px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wider ${st.chip}`}>{slot.rarity}</span>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-lg font-black leading-none ${st.text}`}>{slot.power}×</div>
          <div className="text-[9px] text-slate-500 uppercase">a full march</div>
        </div>
      </div>
      <div className="text-[11px] text-slate-400 leading-snug space-y-0.5">
        <div>{slot.models > 1 ? `${slot.models} walk in the band` : "Walks alone"}{slot.fullCount ? ` · fights as ${slot.fullCount.toLocaleString()} soldiers` : ""}</div>
        <div>
          <b className="text-slate-200">{slot.available}</b> / {slot.maxStock} waiting{next !== null ? ` · next in ${mercDurationText(next)}` : " · camp full"}
        </div>
      </div>
      <div className="text-[11px] space-y-0.5">
        <div className="flex gap-1">
          <span className="text-slate-500 w-14 shrink-0">Hire</span>
          <span className="text-amber-200">{costText(slot.price)}</span>
        </div>
        <div className="flex gap-1">
          <span className="text-slate-500 w-14 shrink-0">Upkeep</span>
          <span className="text-slate-300">{costText(slot.upkeep)} a harvest</span>
        </div>
        <div className="flex gap-1" title="Paid on the spot each time the band fights: marching out to attack, or taking your walls when your castle is attacked. Unpaid, it stays out of the fight">
          <span className="text-slate-500 w-14 shrink-0">Per fight</span>
          <span className="text-slate-300">{costText(battlePayFor(slot.rarity))} battle pay</span>
        </div>
        <div className="flex gap-1">
          <span className="text-slate-500 w-14 shrink-0">Heals</span>
          <span className="text-slate-300">in {mercDurationText(MERC_RULES[slot.rarity].healFullMs)} from 0%</span>
        </div>
      </div>
      <ul className="text-[10px] text-slate-400 leading-snug space-y-0.5 border-t border-slate-800 pt-1.5">
        {slot.kitLines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <div className="mt-auto pt-1">
        {locked ? (
          <div className="text-[11px] text-slate-400 flex items-start gap-1">
            <Lock className="w-3 h-3 mt-0.5 shrink-0" />
            <span>{slot.blocked}</span>
          </div>
        ) : (
          <button
            disabled={busy || !canAct}
            onClick={onHire}
            className="w-full h-8 rounded-lg text-xs font-bold bg-linear-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-white disabled:opacity-50 active:scale-95 transition flex items-center justify-center gap-1.5"
          >
            <Coins className="w-3.5 h-3.5" /> {busy ? "Hiring…" : "Hire"}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * 🪙 Kingdom → Mercenaries: the bands a ruler holds (strength, healing, upkeep, desertion warnings) with heal / stop /
 * dismiss, and where to hire more. The same rows as the camp's list
 */
export function MercenaryBandsPanel({ onChanged }: { onChanged?: () => void }) {
  const [bands, setBands] = useState<MercBand[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDismiss, setConfirmDismiss] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const b = await fetch(`${API_BASE}/mercenaries/mine`)
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []);
    setBands(b ?? []);
    setNow(Date.now());
  }, []);
  useEffect(() => {
    void load();
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [load]);

  const act = async (key: string, path: string, done: string) => {
    setBusy(key);
    setStatus(null);
    try {
      const res = await fetch(`${API_BASE}${path}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setStatus({ ok: false, text: data.error || "That didn't work." });
      else {
        setStatus({ ok: true, text: done });
        onChanged?.();
      }
    } catch (err: unknown) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : "Network error" });
    }
    setBusy(null);
    setConfirmDismiss(null);
    await load();
  };

  return (
    <div className="space-y-2.5 text-slate-200">
      <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-950/20 space-y-1.5">
        <div className="font-bold text-amber-100 flex items-center gap-1.5">
          <Tent className="w-4 h-4 text-amber-300" /> Your mercenary bands
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Hire bands at your civilization's Mercenary Camp: click its legendary landmark on the map. A band is one whole march of its own (a march slot, none of your soldiers) and fights as your full march × its power with its own Battle Arts; send it from any target's march form. Its losses are{" "}
          <b className="text-slate-200">strength</b>: at 0% it is dead. It costs upkeep every harvest; unpaid twice running, it deserts. On a world boss it lands only {Math.round(BAND_BOSS_DAMAGE * 100)}% of its blows (the Sellsword's Oath).
        </p>
      </div>
      {status && (
        <div className={`text-xs rounded-lg px-3 py-2 border ${status.ok ? "bg-emerald-950/50 border-emerald-500/40 text-emerald-200" : "bg-rose-950/50 border-rose-500/40 text-rose-200"}`}>{status.text}</div>
      )}
      {bands === null && <div className="text-xs text-slate-500">Mustering the bands…</div>}
      {bands?.length === 0 && <div className="text-xs text-slate-500">You hold no band yet.</div>}
      {bands?.map((b) => (
        <BandRow
          key={b.id}
          band={b}
          now={now}
          busy={busy?.endsWith(b.id) ?? false}
          confirming={confirmDismiss === b.id}
          onHeal={() => act(`heal-${b.id}`, `/mercenaries/${b.id}/heal`, `${b.name} is healing.`)}
          onStopHeal={() => act(`stop-${b.id}`, `/mercenaries/${b.id}/stop-heal`, `${b.name} stopped healing.`)}
          onDismiss={() => (confirmDismiss === b.id ? act(`dismiss-${b.id}`, `/mercenaries/${b.id}/dismiss`, `${b.name} left your service.`) : setConfirmDismiss(b.id))}
          onCancelDismiss={() => setConfirmDismiss(null)}
        />
      ))}
    </div>
  );
}

function BandRow(props: {
  band: MercBand;
  now: number;
  busy: boolean;
  confirming: boolean;
  onHeal: () => void;
  onStopHeal: () => void;
  onDismiss: () => void;
  onCancelDismiss: () => void;
}) {
  const { band: b, now, busy, confirming } = props;
  const st = RARITY[b.rarity];
  const healing = b.status === "healing" && b.healFrom !== null && b.healStartedAt !== null && b.healUntil !== null;
  const strength = healing ? b.healFrom! + (1 - b.healFrom!) * Math.min(1, Math.max(0, (now - b.healStartedAt!) / Math.max(1, b.healUntil! - b.healStartedAt!))) : b.strength;
  const bar = strength >= 0.75 ? "bg-emerald-400" : strength >= 0.4 ? "bg-amber-400" : "bg-rose-500";
  return (
    // Laid out by its own width (a container), not the screen's: the kingdom window is narrow even on a wide screen
    <div className="@container">
    <div className={`rounded-xl border bg-slate-900/70 p-3 flex flex-col @2xl:flex-row @2xl:items-center gap-3 ${st.card}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-slate-100">
            {b.emblem} {b.name}
          </span>
          <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wider ${st.chip}`}>{b.rarity}</span>
          <span className="text-[10px] text-slate-400">
            {b.status === "marching" ? "⚔️ away on a march" : b.status === "defending" ? "🛡️ on your walls" : healing ? `🩹 healing · whole in ${mercDurationText(Math.max(0, b.healUntil! - now))}` : strength < 1 ? "wounded, at home" : "at home"}
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-2 flex-1 max-w-64 rounded-full bg-slate-800 overflow-hidden">
            <div className={`h-full ${bar} transition-all`} style={{ width: pct(strength) }} />
          </div>
          <span className="text-xs font-bold text-slate-200 tabular-nums">{pct(strength)} strength</span>
        </div>
        <div className="text-[10px] text-slate-500 mt-1">
          Upkeep {costText(b.upkeep)} a harvest · {BATTLE_PAY.name.toLowerCase()} {costText(battlePayFor(b.rarity))} a fight · fights as {Math.round(b.fullCount * strength).toLocaleString()} of {b.fullCount.toLocaleString()} soldiers
        </div>
        {b.warned && <div className="text-[11px] text-rose-300 mt-1">🪙 Last harvest's upkeep went unpaid: unpaid again, the band deserts.</div>}
      </div>
      <div className="flex flex-wrap gap-1.5 shrink-0">
        {b.heal && b.status === "home" && (
          <button
            disabled={busy}
            onClick={props.onHeal}
            title={`Share lost × ${HEAL_PRICE_SHARE * 100}% of the hire price, share lost × the full-heal time`}
            className="h-8 px-3 rounded-lg text-xs font-bold bg-emerald-800/80 border border-emerald-500/50 text-emerald-100 hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            <HeartPulse className="w-3.5 h-3.5" /> Heal · {costText(b.heal.cost)} · {mercDurationText(b.heal.ms)}
          </button>
        )}
        {healing && (
          <button disabled={busy} onClick={props.onStopHeal} title="It keeps what it healed so far; nothing is refunded" className="h-8 px-3 rounded-lg text-xs font-bold bg-slate-800 border border-slate-600 text-slate-200 hover:bg-slate-700 disabled:opacity-50 flex items-center gap-1.5">
            <Hourglass className="w-3.5 h-3.5" /> Stop healing
          </button>
        )}
        {b.status !== "marching" && b.status !== "defending" &&
          (confirming ? (
            <>
              <button disabled={busy} onClick={props.onDismiss} className="h-8 px-3 rounded-lg text-xs font-bold bg-rose-700 border border-rose-500 text-white hover:bg-rose-600 disabled:opacity-50">
                Dismiss: no refund
              </button>
              <button onClick={props.onCancelDismiss} className="h-8 px-3 rounded-lg text-xs font-bold bg-slate-800 border border-slate-600 text-slate-300 hover:bg-slate-700">
                Keep
              </button>
            </>
          ) : (
            <button disabled={busy} onClick={props.onDismiss} className="h-8 px-3 rounded-lg text-xs font-bold bg-slate-800 border border-slate-600 text-slate-300 hover:bg-slate-700 disabled:opacity-50 flex items-center gap-1.5">
              <UserX className="w-3.5 h-3.5" /> Dismiss
            </button>
          ))}
      </div>
    </div>
    </div>
  );
}
