import { useState } from "react";
import { Check, Hammer, LogIn, Lock, RotateCcw, ScrollText } from "lucide-react";
import { DeveloperKingdom, UpgradeDef, SCARCE_RESOURCES, BaseResource } from "@/types";
import { Modal } from "./Modal";
import { formatCompact } from "@/utils/format";
import { useDialog } from "./Dialog";
import { RoyalProclamations, festivalLeft } from "./RoyalProclamations";

interface ImprovementsModalProps {
  open: boolean;
  onClose: () => void;
  kingdom: DeveloperKingdom;
  catalog: UpgradeDef[];
  isOwner: boolean;
  authEnabled: boolean;
  signedIn: boolean;
  onSignIn: () => void;
  onBuy: (upgradeId: string) => Promise<string | null>;
  /** 📜 Royal Proclamations: call Paid Settlers or declare a Festival */
  onProclaim?: (kind: "settlers" | "festival") => Promise<string | null>;
  /** Admin only: strip every improvement and refund 100% of the cost */
  isAdmin?: boolean;
  onAdminReset?: (kingdomId: string) => Promise<{ message?: string }>;
}

const BASE: Record<BaseResource, { icon: string; label: string }> = {
  gold: { icon: "🪙", label: "Gold" },
  iron: { icon: "⚙️", label: "Iron" },
  stone: { icon: "🪨", label: "Stone" },
  lumber: { icon: "🪵", label: "Lumber" },
  food: { icon: "🌾", label: "Food" }
};

const CATEGORY_LABEL: Record<UpgradeDef["category"], string> = {
  defense: "Defense",
  streets: "Streets",
  life: "City life",
  landmark: "Landmarks"
};

/** City improvements shop — the resource sink. Every tier shows in the city view and adds a kingdom bonus. */
export function ImprovementsModal({ open, onClose, kingdom, catalog, isOwner, authEnabled, signedIn, onSignIn, onBuy, onProclaim, isAdmin, onAdminReset }: ImprovementsModalProps) {
  const [tab, setTab] = useState<"improvements" | "proclamations">("improvements");
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [resetNote, setResetNote] = useState<{ ok: boolean; text: string } | null>(null);
  const dialog = useDialog();

  const res = kingdom.resources;
  const owned = kingdom.upgrades || {};
  const builtCount = catalog.reduce((n, u) => n + (owned[u.id] ?? 0), 0);
  const totalTiers = catalog.reduce((n, u) => n + u.tiers.length, 0);

  const buy = async (id: string) => {
    setBusy(id);
    const error = await onBuy(id);
    setBusy(null);
    setErrors((e) => {
      const next = { ...e };
      if (error) next[id] = error;
      else delete next[id];
      return next;
    });
  };

  const categories = (["defense", "streets", "life", "landmark"] as const).filter((c) => catalog.some((u) => u.category === c));

  const adminReset = async () => {
    if (!onAdminReset) return;
    const ok = await dialog.confirm({
      tone: "danger",
      title: `Reset all improvements for ${kingdom.name}?`,
      message: `All ${builtCount} improvement tiers will be stripped and 100% of the resources and gems spent on them will be deposited back into ${kingdom.name}'s treasury.`,
      confirmLabel: "Reset & refund"
    });
    if (!ok) return;
    setBusy("__reset");
    try {
      const res = await onAdminReset(kingdom.id);
      setResetNote({ ok: true, text: res.message || "Improvements reset and refunded." });
    } catch (err: any) {
      setResetNote({ ok: false, text: err.message || "Failed to reset improvements" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      header={
        <div className="flex items-center gap-3">
          <span className="text-2xl w-11 h-11 shrink-0 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center">🏗️</span>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-100 font-medieval tracking-wide truncate">City Improvements</h2>
            <p className="text-xs text-slate-400 truncate">
              {kingdom.name} · {builtCount}/{totalTiers} built · every tier adds a kingdom bonus
            </p>
          </div>
          {isAdmin && onAdminReset && !kingdom.isSpecial && builtCount > 0 && (
            <button
              onClick={adminReset}
              disabled={busy !== null}
              title="Admin: strip every improvement and refund 100% of the resources and gems spent"
              className="ml-auto shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-950/60 hover:bg-red-900/70 border border-red-700/50 text-red-200 text-[11px] font-bold transition disabled:opacity-50"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${busy === "__reset" ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Admin: Reset & Refund All</span>
              <span className="sm:hidden">Reset</span>
            </button>
          )}
        </div>
      }
      footer={
        !isOwner ? (
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-slate-400">
              <Lock className="w-3.5 h-3.5" />
              {!authEnabled
                ? "Git sign-in isn't configured on this server, so nothing can be bought yet."
                : signedIn
                  ? "You're viewing someone else's kingdom — only its owner can build here."
                  : "Sign in with Git to spend your own kingdom's resources."}
            </span>
            {authEnabled && !signedIn && (
              <button onClick={onSignIn} className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition">
                <LogIn className="w-3.5 h-3.5" /> Sign in with Git
              </button>
            )}
          </div>
        ) : undefined
      }
    >
      {/* Tabs and treasury */}
      <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-800">
        <div className="flex gap-1 px-5 pt-2" role="tablist">
          {(
            [
              ["improvements", "City Improvements", Hammer],
              ["proclamations", "Royal Proclamations", ScrollText]
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg border-b-2 text-xs font-bold transition ${
                tab === id ? "border-amber-400 text-amber-200 bg-slate-800/70" : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              {id === "proclamations" && festivalLeft(kingdom) > 0 && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="A Festival is under way" />}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2 text-xs font-mono">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-sans font-semibold">Treasury</span>
          {(Object.keys(BASE) as BaseResource[]).map((k) => (
            <span key={k} title={`${BASE[k].label}: ${(res[k] || 0).toLocaleString()}`}>
              {BASE[k].icon} <span className="text-slate-200 font-bold">{formatCompact(res[k] || 0)}</span>
            </span>
          ))}
        </div>
      </div>

      {tab === "proclamations" ? (
        <RoyalProclamations kingdom={kingdom} isOwner={isOwner} onProclaim={onProclaim} />
      ) : (
        <div className="p-5 space-y-5">
          {resetNote && (
            <p className={`text-xs rounded-lg border px-3 py-2 ${resetNote.ok ? "border-emerald-700/50 bg-emerald-950/40 text-emerald-200" : "border-red-800/50 bg-red-950/40 text-red-300"}`}>
              {resetNote.text}
            </p>
          )}
          {categories.map((cat) => (
            <section key={cat}>
              <h3 className="text-[10px] uppercase tracking-widest font-semibold text-slate-500 mb-2">{CATEGORY_LABEL[cat]}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {catalog
                  .filter((u) => u.category === cat)
                  .map((u) => {
                    const tierOwned = owned[u.id] ?? 0;
                    const maxed = tierOwned >= u.tiers.length;
                    const next = maxed ? null : u.tiers[tierOwned];
                    const current = tierOwned > 0 ? u.tiers[tierOwned - 1] : null;

                    const costs = next
                      ? [
                          ...(Object.entries(next.cost) as Array<[BaseResource, number]>).map(([k, need]) => ({
                            key: k,
                            icon: BASE[k].icon,
                            label: BASE[k].label,
                            need,
                            have: res[k] || 0
                          })),
                          ...Object.entries(next.gems || {}).map(([gem, need]) => {
                            const def = SCARCE_RESOURCES.find((g) => g.key === gem);
                            return { key: gem, icon: def?.emblem ?? "💎", label: def?.name ?? gem, need, have: res.scarce?.[gem] || 0 };
                          })
                        ]
                      : [];
                    const affordable = costs.every((c) => c.have >= c.need);

                    return (
                      <article
                        key={u.id}
                        className={`rounded-xl border p-3.5 flex flex-col gap-2.5 ${
                          maxed ? "border-emerald-700/40 bg-emerald-950/15" : "border-slate-800 bg-slate-950/50"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span className="text-2xl w-10 h-10 shrink-0 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center">{u.emblem}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <h4 className="font-semibold text-sm text-slate-100 truncate">{u.name}</h4>
                              <span className="flex gap-1 shrink-0" title={`Tier ${tierOwned} of ${u.tiers.length}`}>
                                {u.tiers.map((_, i) => (
                                  <span key={i} className={`w-2 h-2 rounded-full ${i < tierOwned ? "bg-emerald-400" : "bg-slate-700"}`} />
                                ))}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 truncate">{current ? `Built: ${current.name}` : "Not built yet"}</p>
                          </div>
                        </div>

                        {next ? (
                          <>
                            <p className="text-xs text-slate-300">
                              <span className="font-semibold text-amber-200">{next.name}</span> — {next.description}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {costs.map((c) => (
                                <span
                                  key={c.key}
                                  title={`${c.label}: have ${c.have.toLocaleString()}, need ${c.need.toLocaleString()}`}
                                  className={`px-1.5 py-0.5 rounded-md border text-[11px] font-mono font-bold ${
                                    c.have >= c.need ? "border-emerald-700/50 bg-emerald-950/40 text-emerald-200" : "border-red-800/50 bg-red-950/40 text-red-300"
                                  }`}
                                >
                                  {c.icon} {formatCompact(c.need)}
                                </span>
                              ))}
                            </div>
                            {errors[u.id] && <p className="text-[11px] text-red-400">{errors[u.id]}</p>}
                            <button
                              onClick={() => buy(u.id)}
                              disabled={!isOwner || !affordable || busy !== null}
                              className={`mt-auto flex items-center justify-center gap-1.5 h-8 rounded-lg text-xs font-bold transition ${
                                isOwner && affordable
                                  ? "bg-amber-500 hover:bg-amber-400 text-slate-950"
                                  : "bg-slate-800 text-slate-500 cursor-not-allowed"
                              }`}
                            >
                              <Hammer className={`w-3.5 h-3.5 ${busy === u.id ? "animate-bounce" : ""}`} />
                              {busy === u.id ? "Building…" : !isOwner ? "Owner only" : affordable ? `Build ${next.name}` : "Not enough resources"}
                            </button>
                          </>
                        ) : (
                          <p className="mt-auto flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                            <Check className="w-4 h-4" /> Fully built
                          </p>
                        )}
                      </article>
                    );
                  })}
              </div>
            </section>
          ))}
        </div>
      )}
    </Modal>
  );
}
