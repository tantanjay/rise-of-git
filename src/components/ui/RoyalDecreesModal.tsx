import { useEffect, useMemo, useState } from "react";
import { Crown, Dice5, FileJson, Gift, ScrollText, Shield, CloudLightning, History, CheckCircle2, AlertTriangle, Search, PartyPopper, BookOpen, Copy, Check, Eye } from "lucide-react";
import { Modal } from "./Modal";
import { Combobox } from "./Combobox";
import { useDialog } from "./Dialog";
import { CivFrame } from "./CivFrame";
import { WatchtowerIcon } from "./realmIcons";
import { activePunishment, activeShield, punishmentLabel, shieldLabel } from "./DecreeChips";
import { ChronicleDraft, ChronicleMarks, CivilizationType, DecreeAuditEntry, DeveloperKingdom, GiftAmounts, SCARCE_RESOURCES } from "@/types";
import { CIV_EMBLEM } from "@/utils/war";
import { FESTIVAL } from "@/utils/civDemographics";
import { timeLeftLabel } from "@/utils/format";
import { festivalLeft } from "./RoyalProclamations";
import { API_BASE } from "@/config";
import { sound } from "@/hooks/useSound";
import { ChronicleChapter } from "./ChronicleStoryView";
import { weekLabel } from "./ChroniclesBook";

/*
 * 👑 Royal Decrees (GAME_GUIDE §15): announcements, shields, punishments, proclamations (a Festival) and the Weekly
 * Chronicle for admins and Special Overseers, gifts of resources for admins. Every decree is checked and applied on the server.
 */

type Tab = "announce" | "gift" | "shield" | "punish" | "proclaim" | "chronicle" | "audit";

const CIVS: CivilizationType[] = ["human", "elf", "dwarf", "orc", "arcane"];
const CIV_NAME: Record<CivilizationType, string> = { human: "Human", elf: "Elf", dwarf: "Dwarf", orc: "Orc", arcane: "Nethergarde" };
const BASE_KEYS = ["gold", "iron", "stone", "lumber", "food"] as const;
const BASE_EMBLEM: Record<(typeof BASE_KEYS)[number], string> = { gold: "🪙", iron: "⛓️", stone: "🪨", lumber: "🪵", food: "🌾" };
const MIN_DAYS = 1;
const MAX_DAYS = 14;
const MAX_PIN_DAYS = 30;

/** Flavour lines for a gift's message (🎲 Reroll) */
const GIFT_MESSAGES = [
  "Grace by the Gods",
  "The Treasury Overflows",
  "A Caravan from the Sun Court",
  "Tithe of the Old Kings",
  "Blessing of the Harvest Moon",
  "The Crown Remembers Its Loyal",
  "Spoils of a Forgotten War",
  "Gold from the Dragon's Hoard",
  "A Windfall from the Eastern Mines",
  "The King's Midwinter Largesse",
  "Offerings Left at the Shrine",
  "A Merchant Prince's Tribute",
  "Rain After the Long Drought",
  "The Vaults of the Ancients Open",
  "A Gift from the Mountain Clans",
  "Favour of the High Council",
  "Bounty of the Seven Rivers",
  "The Herald's Coin Purse",
  "Reward for Faithful Service",
  "A Chest Washed Ashore",
  "Alms of the Silver Abbey",
  "The Founders' Day Feast",
  "A Shipment from Distant Shores",
  "The Starfall Fortune",
  "Coin of the Royal Mint",
  "Stores from the Crown's Granary",
  "A Pact Sealed in Gold",
  "The Wandering Saint's Blessing",
  "Treasure of the Sunken Galleon",
  "The Realm Rejoices"
];

const fmt = (n: number) => n.toLocaleString("en-US");

async function post<T = { message: string }>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "The decree failed");
  return data as T;
}

/** Describes a gift as one line */
function giftLine(a: GiftAmounts): string {
  const parts: string[] = BASE_KEYS.filter((k) => a[k]).map((k) => `${BASE_EMBLEM[k]} ${fmt(a[k]!)}`);
  for (const [g, n] of Object.entries(a.gems ?? {})) parts.push(`${SCARCE_RESOURCES.find((r) => r.key === g)?.emblem ?? g} ${fmt(n)}`);
  return parts.join("  ");
}

/* ------------------------------------------------------------------------- */
/* Ruler picker: search + civ filter, single or multi                         */
/* ------------------------------------------------------------------------- */

function RulerPicker({
  kingdoms,
  selected,
  onChange,
  multi,
  height = "h-48"
}: {
  kingdoms: DeveloperKingdom[];
  selected: string[];
  onChange: (ids: string[]) => void;
  multi: boolean;
  height?: string;
}) {
  const [query, setQuery] = useState("");
  const [civ, setCiv] = useState<CivilizationType | "all">("all");
  const q = query.trim().toLowerCase();
  const shown = kingdoms
    .filter((k) => (civ === "all" || k.civilization === civ) && (!q || k.name.toLowerCase().includes(q) || k.username.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const allShownPicked = shown.length > 0 && shown.every((k) => selected.includes(k.id));
  const toggle = (id: string) => {
    if (!multi) return onChange([id]);
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/60">
      <div className="p-2 flex flex-wrap items-center gap-1.5 border-b border-slate-800">
        <div className="relative flex-1 min-w-36">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search rulers…"
            className="w-full pl-7 pr-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200"
          />
        </div>
        {(["all", ...CIVS] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCiv(c)}
            className={`px-2 py-1 rounded-lg text-[11px] border transition ${civ === c ? "bg-amber-500/20 border-amber-400/60 text-amber-200" : "bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200"}`}
            title={c === "all" ? "Every civilization" : CIV_NAME[c]}
          >
            {c === "all" ? "All" : CIV_EMBLEM[c]}
          </button>
        ))}
        {multi && (
          <button
            onClick={() => onChange(allShownPicked ? selected.filter((id) => !shown.some((k) => k.id === id)) : [...new Set([...selected, ...shown.map((k) => k.id)])])}
            className="px-2 py-1 rounded-lg text-[11px] border bg-slate-900 border-slate-700 text-slate-300 hover:text-white"
          >
            {allShownPicked ? "Clear shown" : "Select all"}
          </button>
        )}
      </div>
      <div className={`${height} overflow-y-auto p-1`}>
        {shown.length === 0 && <div className="p-3 text-xs text-slate-500 text-center">No ruler matches.</div>}
        {shown.map((k) => {
          const on = selected.includes(k.id);
          return (
            <button
              key={k.id}
              onClick={() => toggle(k.id)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs transition ${on ? "bg-amber-500/15 text-amber-100" : "text-slate-300 hover:bg-slate-800/70"}`}
            >
              <input type={multi ? "checkbox" : "radio"} readOnly checked={on} className="accent-amber-400 pointer-events-none" tabIndex={-1} />
              <CivFrame civ={k.civilization} overseer={Boolean(k.isSpecial)} archon={Boolean(k.isArchon)} initial={k.name.charAt(0)} className="w-5 h-5" />
              <span className="truncate flex-1">{k.name}</span>
              <span className="text-[10px] text-slate-500 font-mono truncate">@{k.username}</span>
              {activeShield(k) && <span title={shieldLabel(activeShield(k)!)}>🛡️</span>}
              {activePunishment(k) && <span title={punishmentLabel(activePunishment(k)!)}>⛈️</span>}
            </button>
          );
        })}
      </div>
      {multi && <div className="px-3 py-1.5 border-t border-slate-800 text-[10px] text-slate-500">{selected.length} selected</div>}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Small form pieces                                                          */
/* ------------------------------------------------------------------------- */

const label = "block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1";
const input = "w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-slate-100";

function Result({ ok, error }: { ok: string | null; error: string | null }) {
  if (ok)
    return (
      <div className="p-3 rounded-lg border border-emerald-500/40 bg-emerald-950/40 text-emerald-200 text-xs flex items-start gap-2 animate-fadeIn">
        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <span className="font-semibold">{ok}</span>
      </div>
    );
  if (error)
    return (
      <div className="p-3 rounded-lg border border-red-500/40 bg-red-950/40 text-red-200 text-xs flex items-start gap-2 whitespace-pre-line">
        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
        <span>{error}</span>
      </div>
    );
  return null;
}

function DaysField({ days, setDays }: { days: number; setDays: (d: number) => void }) {
  return (
    <div>
      <span className={label}>Days</span>
      <div className="flex items-center gap-3">
        <input type="range" min={MIN_DAYS} max={MAX_DAYS} value={days} onChange={(e) => setDays(Number(e.target.value))} className="flex-1 accent-amber-400" />
        <span className="w-16 text-right font-mono text-sm text-amber-200">
          {days} {days === 1 ? "day" : "days"}
        </span>
      </div>
    </div>
  );
}

function ActionButton({ busy, disabled, onClick, children, tone = "amber" }: { busy: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode; tone?: "amber" | "sky" | "slate" | "emerald" }) {
  const tones = {
    amber: "from-amber-500 to-amber-700 hover:from-amber-400 hover:to-amber-600 border-amber-300/40 shadow-amber-950/50",
    sky: "from-sky-500 to-sky-700 hover:from-sky-400 hover:to-sky-600 border-sky-300/40 shadow-sky-950/50",
    slate: "from-slate-500 to-slate-700 hover:from-slate-400 hover:to-slate-600 border-slate-300/40 shadow-slate-950/50",
    emerald: "from-emerald-500 to-emerald-700 hover:from-emerald-400 hover:to-emerald-600 border-emerald-300/40 shadow-emerald-950/50"
  };
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      className={`flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-linear-to-b ${tones[tone]} disabled:opacity-50 text-white text-xs font-bold shadow-lg border transition active:scale-95 cursor-pointer disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------------- */
/* 🎉 Proclamations                                                           */
/* ------------------------------------------------------------------------- */

/** Royal Proclamations a decree can give; one for now */
const PROCLAMATIONS = [{ id: "festival", label: "Festival", icon: "🎉" }] as const;

function ProclaimTab({ kingdoms, onDone }: { kingdoms: DeveloperKingdom[]; onDone: () => void }) {
  const dialog = useDialog();
  const [kind, setKind] = useState<(typeof PROCLAMATIONS)[number]["id"]>("festival");
  const [target, setTarget] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Nethergarde doesn't breed and Special Overseers' people return in full: proclamations are for mortal kingdoms
  const mortals = useMemo(() => kingdoms.filter((x) => x.civilization !== "arcane" && !x.isSpecial), [kingdoms]);
  const k = mortals.find((x) => x.id === target[0]);
  const festive = mortals.filter((x) => festivalLeft(x) > 0);
  const hours = Math.round(FESTIVAL.DURATION_MS / 3_600_000);

  const give = async () => {
    if (!k) return;
    const yes = await dialog.confirm({
      tone: "warning",
      title: `Give ${k.name} a Festival?`,
      message: `For ${hours} hours its births are ×${FESTIVAL.BIRTH_MULT} and its workforce brings in +${Math.round((FESTIVAL.YIELD_MULT - 1) * 100)}%. It's free, doesn't use up the ruler's own weekly Festival, and goes ahead even while they are Called to Arms. Their civilization hears of it.`,
      confirmLabel: "Proclaim the Festival"
    });
    if (!yes) return;
    setBusy(true);
    setOk(null);
    setError(null);
    try {
      setOk((await post("/decrees/festival", { targetId: k.id })).message);
      onDone();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-3">
        <span className={label}>Proclamation</span>
        <div className="flex flex-wrap gap-1.5">
          {PROCLAMATIONS.map((p) => (
            <button
              key={p.id}
              onClick={() => setKind(p.id)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${kind === p.id ? "bg-amber-900/60 border-amber-500/60 text-amber-200" : "bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200"}`}
            >
              {p.icon} {p.label}
            </button>
          ))}
        </div>
        <span className={label}>Kingdom</span>
        <RulerPicker kingdoms={mortals} selected={target} onChange={setTarget} multi={false} height="h-60" />
      </div>
      <div className="space-y-3">
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/30 p-3 text-xs text-amber-100">
          {k ? (
            festivalLeft(k) > 0 ? (
              <>
                🎉 <span className="font-semibold">{k.name}</span> is holding a Festival already ({timeLeftLabel(festivalLeft(k))} left).
              </>
            ) : (
              <>
                🎉 Lanterns over <span className="font-semibold">{k.name}</span>'s plaza, dancing round the fountain and fireworks over the castle for {hours} hours: births ×
                {FESTIVAL.BIRTH_MULT}, workforce +{Math.round((FESTIVAL.YIELD_MULT - 1) * 100)}%. Free, and apart from the ruler's own weekly Festival.
              </>
            )
          ) : (
            "Pick a kingdom to give a Festival. Nethergarde and Special Overseers can't hold one."
          )}
        </div>
        <Result ok={ok} error={error} />
        <div className="flex justify-end">
          <ActionButton busy={busy} disabled={!k || festivalLeft(k) > 0} onClick={give}>
            <PartyPopper className="w-4 h-4" /> Proclaim the Festival
          </ActionButton>
        </div>
        {festive.length > 0 && (
          <div>
            <span className={label}>Festivals now</span>
            <div className="space-y-1">
              {festive.map((x) => (
                <div key={x.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                  <span className="flex-1 truncate text-slate-200">{x.name}</span>
                  <span className="text-amber-300 text-[11px]">{timeLeftLabel(festivalLeft(x))} left</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* 📜 Announcement                                                            */
/* ------------------------------------------------------------------------- */

function AnnounceTab({ kingdoms, onDone }: { kingdoms: DeveloperKingdom[]; onDone: () => void }) {
  const dialog = useDialog();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<"all" | "civ" | "users">("all");
  const [civ, setCiv] = useState<CivilizationType>("human");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [pinDays, setPinDays] = useState(0);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const heard = audience === "all" ? "the whole realm" : audience === "civ" ? `every ${CIV_NAME[civ]} ruler` : `${recipients.length} picked ${recipients.length === 1 ? "ruler" : "rulers"}`;
  const ready = title.trim() && body.trim() && (audience !== "users" || recipients.length > 0);

  const proclaim = async () => {
    const yes = await dialog.confirm({
      tone: "warning",
      title: "Proclaim this announcement?",
      message: `"${title.trim()}" goes to ${heard}${pinDays ? ` and stays pinned in the War Room for ${pinDays} days` : ""}. It can't be taken back.`,
      confirmLabel: "Proclaim"
    });
    if (!yes) return;
    setBusy(true);
    setOk(null);
    setError(null);
    try {
      const r = await post("/decrees/announce", { title, body, audience: audience === "civ" ? `civ:${civ}` : audience, recipients, pinDays });
      setOk(r.message);
      sound.playHerald();
      setTitle("");
      setBody("");
      onDone();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-3">
        <label className="block">
          <span className={label}>Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Hear ye, hear ye!" className={input} />
        </label>
        <label className="block">
          <span className={label}>Text (plain text and emoji)</span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={6} placeholder="By order of the Crown…" className={`${input} resize-y`} />
        </label>
        <div>
          <span className={label}>Who hears it</span>
          <div className="flex gap-1.5">
            {(
              [
                ["all", "Everyone"],
                ["civ", "A civilization"],
                ["users", "Picked rulers"]
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                onClick={() => setAudience(v)}
                className={`flex-1 px-2 py-1.5 rounded-lg text-xs border ${audience === v ? "bg-amber-500/20 border-amber-400/60 text-amber-100" : "bg-slate-950 border-slate-700 text-slate-400 hover:text-slate-200"}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        {audience === "civ" && (
          <Combobox options={CIVS.map((c) => ({ value: c, label: `${CIV_EMBLEM[c]} ${CIV_NAME[c]}` }))} value={civ} onChange={(v) => setCiv(v as CivilizationType)} ariaLabel="Civilization" />
        )}
        {audience === "users" && <RulerPicker kingdoms={kingdoms} selected={recipients} onChange={setRecipients} multi height="h-40" />}
        <label className="block">
          <span className={label}>Pin in the War Room</span>
          <div className="flex items-center gap-3">
            <input type="range" min={0} max={MAX_PIN_DAYS} value={pinDays} onChange={(e) => setPinDays(Number(e.target.value))} className="flex-1 accent-amber-400" />
            <span className="w-20 text-right font-mono text-sm text-amber-200">{pinDays ? `${pinDays} days` : "not pinned"}</span>
          </div>
        </label>
      </div>

      <div className="space-y-3">
        <span className={label}>Preview</span>
        <div className="relative rounded-xl p-5 bg-linear-to-b from-amber-100 to-amber-200 text-amber-950 shadow-inner border border-amber-300 min-h-48">
          <div className="absolute -top-3 right-4 w-9 h-9 rounded-full bg-red-800 border-2 border-red-950 shadow flex items-center justify-center text-sm">📜</div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-amber-800/80">Royal announcement · to {heard}</div>
          <div className="font-medieval text-lg font-bold mt-1 break-words">{title.trim() || "Your title"}</div>
          <div className="text-sm mt-2 whitespace-pre-line break-words">{body.trim() || "Your proclamation…"}</div>
          {pinDays > 0 && <div className="mt-3 text-[11px] text-amber-800">📌 Pinned in the War Room for {pinDays} days</div>}
        </div>
        <Result ok={ok} error={error} />
        <div className="flex justify-end">
          <ActionButton busy={busy} disabled={!ready} onClick={proclaim}>
            <ScrollText className="w-4 h-4" /> {busy ? "Proclaiming…" : "Proclaim"}
          </ActionButton>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* 🎁 Give resources (admin)                                                  */
/* ------------------------------------------------------------------------- */

interface GiftPreview {
  message: string;
  grants: Array<{ userId: string; name: string; amounts: GiftAmounts }>;
  errors: string[];
}

const GIFT_EXAMPLE = `{
  "message": "Grace by the Gods",
  "gifts": [
    { "users": ["jane.doe", "john.roe"], "gold": 5000, "iron": 20000, "gems": { "mana": 10, "diamond": 2 } },
    { "users": ["*"], "food": 50000 }
  ]
}`;

function GiftTab({ kingdoms, onDone }: { kingdoms: DeveloperKingdom[]; onDone: () => void }) {
  const dialog = useDialog();
  const mortals = useMemo(() => kingdoms.filter((k) => !k.isSpecial), [kingdoms]);
  const [mode, setMode] = useState<"form" | "json">("form");
  const [message, setMessage] = useState(() => GIFT_MESSAGES[Math.floor(Math.random() * GIFT_MESSAGES.length)]);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [json, setJson] = useState("");
  const [preview, setPreview] = useState<GiftPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reroll = () => {
    let next = message;
    while (next === message) next = GIFT_MESSAGES[Math.floor(Math.random() * GIFT_MESSAGES.length)];
    setMessage(next);
    sound.playClick();
  };

  /** The plan as the server takes it (also what an import looks like) */
  const formPlan = () => {
    const row: Record<string, unknown> = { users: recipients };
    const gems: Record<string, number> = {};
    for (const k of BASE_KEYS) if (Number(amounts[k]) > 0) row[k] = Math.floor(Number(amounts[k]));
    for (const g of SCARCE_RESOURCES) if (Number(amounts[g.key]) > 0) gems[g.key] = Math.floor(Number(amounts[g.key]));
    if (Object.keys(gems).length) row.gems = gems;
    return { message, gifts: [row] };
  };

  const plan = (): unknown => {
    if (mode === "form") return formPlan();
    try {
      return JSON.parse(json);
    } catch (e: any) {
      throw new Error(`The JSON doesn't parse: ${e.message}`, { cause: e });
    }
  };

  // Any edit invalidates the checked preview
  useEffect(() => setPreview(null), [mode, message, recipients, amounts, json]);

  const check = async () => {
    setOk(null);
    setError(null);
    try {
      setBusy(true);
      setPreview(await post<GiftPreview>("/decrees/gift/preview", plan()));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const grant = async () => {
    if (!preview || preview.errors.length) return;
    const yes = await dialog.confirm({
      tone: "warning",
      title: `Grant "${preview.message}"?`,
      message: `${preview.grants.length} ${preview.grants.length === 1 ? "ruler receives" : "rulers receive"} the gift, with ledger lines and a 🎁 notice. This can't be undone.`,
      confirmLabel: "Grant"
    });
    if (!yes) return;
    setBusy(true);
    try {
      const r = await post("/decrees/gift", plan());
      setOk(r.message);
      sound.playLevelUp();
      setPreview(null);
      onDone();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const loadFile = (file: File) => {
    file
      .text()
      .then((t) => {
        setJson(t);
        setMode("json");
      })
      .catch(() => setError("Couldn't read that file."));
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        <button onClick={() => setMode("form")} className={`px-3 py-1.5 rounded-lg text-xs border ${mode === "form" ? "bg-amber-500/20 border-amber-400/60 text-amber-100" : "bg-slate-950 border-slate-700 text-slate-400"}`}>
          <Gift className="w-3.5 h-3.5 inline mr-1" /> Form
        </button>
        <button onClick={() => setMode("json")} className={`px-3 py-1.5 rounded-lg text-xs border ${mode === "json" ? "bg-amber-500/20 border-amber-400/60 text-amber-100" : "bg-slate-950 border-slate-700 text-slate-400"}`}>
          <FileJson className="w-3.5 h-3.5 inline mr-1" /> Import JSON
        </button>
      </div>

      {mode === "form" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <div>
              <span className={label}>Message</span>
              <div className="flex gap-2">
                <input value={message} onChange={(e) => setMessage(e.target.value)} maxLength={120} className={input} />
                <button onClick={reroll} className="shrink-0 px-3 rounded-xl bg-slate-800 border border-slate-600 text-slate-200 hover:bg-slate-700" title="Reroll the message">
                  <Dice5 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div>
              <span className={label}>Recipients</span>
              <RulerPicker kingdoms={mortals} selected={recipients} onChange={setRecipients} multi height="h-56" />
            </div>
          </div>
          <div className="space-y-3">
            <span className={label}>Resources</span>
            <div className="grid grid-cols-2 gap-2">
              {BASE_KEYS.map((k) => (
                <label key={k} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800">
                  <span title={k}>{BASE_EMBLEM[k]}</span>
                  <span className="text-[11px] text-slate-400 flex-1 min-w-0 truncate capitalize">{k}</span>
                  <input type="number" min={0} value={amounts[k] ?? ""} onChange={(e) => setAmounts({ ...amounts, [k]: e.target.value })} className="w-20 shrink-0 bg-transparent text-right text-sm font-mono text-slate-100 outline-none" placeholder="0" />
                </label>
              ))}
            </div>
            <span className={label}>Scarce gems</span>
            <div className="grid grid-cols-2 gap-2">
              {SCARCE_RESOURCES.map((g) => (
                <label key={g.key} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800" title={g.name}>
                  <span>{g.emblem}</span>
                  <span className="text-[11px] text-slate-400 flex-1 min-w-0 truncate">{g.name}</span>
                  <input type="number" min={0} value={amounts[g.key] ?? ""} onChange={(e) => setAmounts({ ...amounts, [g.key]: e.target.value })} className="w-14 shrink-0 bg-transparent text-right text-sm font-mono text-slate-100 outline-none" placeholder="0" />
                </label>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) loadFile(f);
            }}
            className="rounded-xl border-2 border-dashed border-slate-700 p-3 text-xs text-slate-400"
          >
            Drop a <span className="font-mono">.json</span> file here, pick one{" "}
            <label className="text-amber-300 underline cursor-pointer">
              from disk
              <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])} />
            </label>
            , or paste it below. <span className="font-mono">"*"</span> means every ruler who isn't a Special Overseer. Gem keys: <span className="font-mono">{SCARCE_RESOURCES.map((g) => g.key).join(", ")}</span>.
          </div>
          <textarea value={json} onChange={(e) => setJson(e.target.value)} rows={10} placeholder={GIFT_EXAMPLE} className={`${input} font-mono text-xs resize-y`} spellCheck={false} />
        </div>
      )}

      {preview && (
        <div className="rounded-xl border border-slate-700 bg-slate-950/60">
          <div className="px-3 py-2 border-b border-slate-800 text-xs text-slate-300">
            🎁 <span className="font-semibold text-amber-200">{preview.message || "(no message)"}</span> · {preview.grants.length} {preview.grants.length === 1 ? "ruler" : "rulers"}
          </div>
          {preview.errors.length > 0 && (
            <ul className="px-4 py-2 text-xs text-red-300 list-disc list-inside space-y-0.5 border-b border-slate-800">
              {preview.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
          <div className="max-h-56 overflow-y-auto">
            <table className="w-full text-xs">
              <tbody>
                {preview.grants.map((g) => (
                  <tr key={g.userId} className="border-b border-slate-800/60 last:border-0">
                    <td className="px-3 py-1.5 text-slate-200 whitespace-nowrap">{g.name}</td>
                    <td className="px-3 py-1.5 text-slate-400 font-mono">{giftLine(g.amounts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Result ok={ok} error={error} />
      <div className="flex justify-end gap-2">
        <ActionButton busy={busy} tone="slate" onClick={check} disabled={mode === "form" ? recipients.length === 0 : !json.trim()}>
          <CheckCircle2 className="w-4 h-4" /> Check
        </ActionButton>
        <ActionButton busy={busy} tone="emerald" onClick={grant} disabled={!preview || preview.errors.length > 0}>
          <Gift className="w-4 h-4" /> {busy ? "Working…" : "Grant"}
        </ActionButton>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* 🛡️ Shield / ⛈️ Punish                                                     */
/* ------------------------------------------------------------------------- */

function ShieldTab({ kingdoms, onDone }: { kingdoms: DeveloperKingdom[]; onDone: () => void }) {
  const dialog = useDialog();
  const [target, setTarget] = useState<string[]>([]);
  const [days, setDays] = useState(3);
  const [breaks, setBreaks] = useState(true);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const k = kingdoms.find((x) => x.id === target[0]);
  const shielded = kingdoms.filter((x) => activeShield(x));

  const run = async (fn: () => Promise<{ message: string }>) => {
    setBusy(true);
    setOk(null);
    setError(null);
    try {
      setOk((await fn()).message);
      onDone();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const shield = async () => {
    if (!k) return;
    const yes = await dialog.confirm({
      tone: "warning",
      title: `Shield ${k.name}'s kingdom?`,
      message: `For ${days} ${days === 1 ? "day" : "days"} no army, rally or scout can touch it; marches already on the road turn back.${breaks ? " The shield breaks if they attack a ruler." : ""}${activeShield(k) ? " This replaces the shield it has now." : ""}`,
      confirmLabel: "Raise shield"
    });
    if (yes) run(() => post("/decrees/shield", { targetId: k.id, days, breaksOnAttack: breaks }));
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-3">
        <span className={label}>Kingdom</span>
        <RulerPicker kingdoms={kingdoms} selected={target} onChange={setTarget} multi={false} height="h-60" />
      </div>
      <div className="space-y-3">
        <DaysField days={days} setDays={setDays} />
        <label className="flex items-start gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={breaks} onChange={(e) => setBreaks(e.target.checked)} className="accent-sky-400 mt-0.5" />
          <span>
            <span className="font-semibold">Breaks if the holder attacks a ruler</span>
            <span className="block text-slate-500">So a shield can't be a safe base for raids. Gathering, bosses, mobs and NPC kingdoms don't break it.</span>
          </span>
        </label>
        <div className="rounded-xl border border-sky-500/30 bg-sky-950/30 p-3 text-xs text-sky-100">
          {k ? (
            <>
              🛡️ A translucent dome covers <span className="font-semibold">{k.name}</span>'s castle on the map, and a curtain of energy rises round its city walls, for {days} {days === 1 ? "day" : "days"}.
            </>
          ) : (
            "Pick a kingdom to shield."
          )}
        </div>
        <Result ok={ok} error={error} />
        <div className="flex justify-end">
          <ActionButton busy={busy} tone="sky" disabled={!k} onClick={shield}>
            <Shield className="w-4 h-4" /> Raise shield
          </ActionButton>
        </div>
        {shielded.length > 0 && (
          <div>
            <span className={label}>Shielded now</span>
            <div className="space-y-1">
              {shielded.map((x) => (
                <div key={x.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                  <span className="flex-1 truncate text-slate-200">{x.name}</span>
                  <span className="text-sky-300 text-[11px]">{shieldLabel(activeShield(x)!).replace("🛡️ Royal Shield — ", "")}</span>
                  <button disabled={busy} onClick={() => run(() => post(`/decrees/shield/${encodeURIComponent(x.id)}/lift`))} className="px-2 py-0.5 rounded bg-slate-800 border border-slate-600 text-slate-200 hover:bg-slate-700">
                    Lift
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PunishTab({ kingdoms, onDone }: { kingdoms: DeveloperKingdom[]; onDone: () => void }) {
  const dialog = useDialog();
  const mortals = useMemo(() => kingdoms.filter((k) => !k.isSpecial), [kingdoms]);
  const [target, setTarget] = useState<string[]>([]);
  const [days, setDays] = useState(1);
  const [lowBirth, setLowBirth] = useState(false);
  const [highDeath, setHighDeath] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const k = mortals.find((x) => x.id === target[0]);
  const punished = mortals.filter((x) => activePunishment(x));

  const run = async (fn: () => Promise<{ message: string }>) => {
    setBusy(true);
    setOk(null);
    setError(null);
    try {
      setOk((await fn()).message);
      onDone();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const punish = async () => {
    if (!k) return;
    const effects = ["no harvest", lowBirth && "births ×0.25", highDeath && "civilian deaths ×3"].filter(Boolean).join(", ");
    const yes = await dialog.confirm({
      tone: "danger",
      title: `Punish ${k.name}'s kingdom?`,
      message: `For ${days} ${days === 1 ? "day" : "days"}: ${effects}. The realm hears of it.${activePunishment(k) ? " This replaces the punishment it has now." : ""}`,
      confirmLabel: "Punish"
    });
    if (yes) run(() => post("/decrees/punish", { targetId: k.id, days, lowBirth, highDeath }));
  };

  const box = (checked: boolean, set: ((v: boolean) => void) | null, title: string, desc: string, disabled = false) => (
    <label className={`flex items-start gap-2 text-xs ${disabled ? "text-slate-500" : "text-slate-300"}`}>
      <input type="checkbox" checked={checked} disabled={disabled || !set} onChange={(e) => set?.(e.target.checked)} className="accent-amber-400 mt-0.5" />
      <span>
        <span className="font-semibold">{title}</span>
        <span className="block text-slate-500">{desc}</span>
      </span>
    </label>
  );

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-3">
        <span className={label}>Kingdom</span>
        <RulerPicker kingdoms={mortals} selected={target} onChange={setTarget} multi={false} height="h-60" />
      </div>
      <div className="space-y-3">
        <DaysField days={days} setDays={setDays} />
        {box(true, null, "🌧️ No harvest (always)", "Nothing from the harvest pool, building harvest or workforce. A storm cloud sits over the castle.")}
        {box(lowBirth, setLowBirth, "🥀 Low birth rate", "Births ×0.25: flowers wilt grey, no children in the streets, empty cradles by the houses.")}
        {box(highDeath, setHighDeath, "🪦 High death rate", "Civilian deaths ×3: crows circle, fresh graves at the edge of town, grey-green miasma.")}
        {box(false, null, "🌑 Wrath", "Sends the mythical horror at this kingdom. Not in the game yet.", true)}
        <Result ok={ok} error={error} />
        <div className="flex justify-end">
          <ActionButton busy={busy} tone="slate" disabled={!k} onClick={punish}>
            <CloudLightning className="w-4 h-4" /> Punish
          </ActionButton>
        </div>
        {punished.length > 0 && (
          <div>
            <span className={label}>Punished now</span>
            <div className="space-y-1">
              {punished.map((x) => (
                <div key={x.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                  <span className="flex-1 truncate text-slate-200">{x.name}</span>
                  <span className="text-slate-400 text-[11px]">{punishmentLabel(activePunishment(x)!).replace("⛈️ Punished · ", "")}</span>
                  <button disabled={busy} onClick={() => run(() => post(`/decrees/punish/${encodeURIComponent(x.id)}/lift`))} className="px-2 py-0.5 rounded bg-slate-800 border border-slate-600 text-slate-200 hover:bg-slate-700">
                    Lift
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* 📖 Weekly Chronicle                                                        */
/* ------------------------------------------------------------------------- */

const CHRONICLE_MAX_TITLE = 100;
const CHRONICLE_MAX_BODY = 6000;

/** A pasted reply: its first short line is the title when a blank line follows it (the prompt asks for that) */
function splitStory(text: string): { title: string; body: string } | null {
  const lines = text.replace(/\r\n/g, "\n").trim().split("\n");
  if (lines.length < 3 || lines[1].trim() !== "") return null;
  const title = lines[0]
    .replace(/^#+\s*/, "")
    .replace(/^\*\*(.*)\*\*$/, "$1")
    .replace(/^title:\s*/i, "")
    .replace(/^["“](.*)["”]$/, "$1")
    .trim();
  if (!title || title.length > CHRONICLE_MAX_TITLE) return null;
  return { title, body: lines.slice(2).join("\n").trim() };
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API refused (no focus, insecure origin): the old way
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    el.remove();
    return ok;
  }
}

function ChronicleTab({ onDone }: { onDone: () => void }) {
  const dialog = useDialog();
  const [week, setWeek] = useState<string | null>(null);
  const [draft, setDraft] = useState<ChronicleDraft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [title, setTitle] = useState("");
  const [story, setStory] = useState("");
  const [copied, setCopied] = useState(false);
  /** Edit the text, or see it drawn with its marks as the realm will */
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [preview, setPreview] = useState<{ errors: string[]; marks: ChronicleMarks } | null>(null);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setLoadError(null);
    fetch(`${API_BASE}/decrees/chronicle${week ? `?week=${encodeURIComponent(week)}` : ""}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || "Couldn't read the week");
        if (!live) return;
        setDraft(data);
        if (!week) setWeek(data.digest.weekKey);
      })
      .catch((e) => live && setLoadError(e.message));
    return () => {
      live = false;
    };
  }, [week, reload]);

  if (loadError) return <Result ok={null} error={loadError} />;
  if (!draft) return <div className="text-xs text-slate-500 p-4 text-center">Reading the week's happenings…</div>;

  const { digest, published } = draft;
  const finished = draft.weeks.find((w) => w.weekKey === digest.weekKey)?.finished ?? true;
  const ready = finished && !published && title.trim() && story.trim();

  const copy = async () => {
    sound.playClick();
    if (await copyText(draft.prompt)) {
      setError(null);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } else setError("Couldn't copy; select the prompt and copy it by hand.");
  };

  const showPreview = async () => {
    sound.playClick();
    setView("preview");
    setPreview(null);
    try {
      const checked = await post<{ body: string; errors: string[]; marks: ChronicleMarks }>("/decrees/chronicle/check", { weekKey: digest.weekKey, body: story });
      // The marks in their one written form (a copy from a chat window can strip their brackets): editing goes on from it
      setStory(checked.body);
      setPreview(checked);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const pasteStory = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (title.trim() || story.trim()) return;
    const split = splitStory(e.clipboardData.getData("text"));
    if (!split) return;
    e.preventDefault();
    setTitle(split.title);
    setStory(split.body);
  };

  const publish = async () => {
    const yes = await dialog.confirm({
      tone: "warning",
      title: "Publish this week's story?",
      message: `"${title.trim()}" goes to the whole realm as a herald notice and a banner, and is kept in the Royal Codex under Chronicles. One story per week; it can't be taken back.`,
      confirmLabel: "Publish"
    });
    if (!yes) return;
    setBusy(true);
    setOk(null);
    setError(null);
    try {
      const r = await post("/decrees/chronicle", { weekKey: digest.weekKey, title, body: story });
      setOk(r.message);
      sound.playHerald();
      setTitle("");
      setStory("");
      setView("edit");
      setPreview(null);
      setReload((n) => n + 1);
      onDone();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-3 min-w-0">
        <div>
          <span className={label}>Week</span>
          <Combobox
            options={draft.weeks.map((w) => ({ value: w.weekKey, label: w.label, hint: w.published ? "published" : w.finished ? undefined : "preview" }))}
            value={digest.weekKey}
            onChange={(v) => {
              setOk(null);
              setError(null);
              setWeek(v);
            }}
            ariaLabel="Week"
          />
        </div>
        <div>
          <span className={label}>Happenings</span>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 divide-y divide-slate-800/70 max-h-64 overflow-y-auto">
            {digest.quiet && <div className="px-3 py-2 text-xs italic text-slate-400">A quiet week: no great deeds; the realm rests and its heroes sharpen their blades.</div>}
            {digest.happenings.map((h, i) => (
              <div key={i} className="px-3 py-2 text-xs text-slate-200 flex gap-2">
                <span className="shrink-0">{h.emblem}</span>
                <span>{h.text}</span>
              </div>
            ))}
            {digest.labour.map((l, i) => (
              <div key={`l${i}`} className="px-3 py-2 text-xs text-amber-100/80 flex gap-2">
                <span className="shrink-0">⚒️</span>
                <span>{l}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className={`${label} mb-0`}>Prompt for any LLM</span>
            <button onClick={copy} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border bg-violet-900/50 border-violet-500/60 text-violet-100 hover:bg-violet-800/60 transition">
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? "Copied" : "Copy prompt"}
            </button>
          </div>
          <textarea readOnly value={draft.prompt} rows={8} className={`${input} font-mono text-[11px] leading-snug resize-y`} onFocus={(e) => e.currentTarget.select()} />
          <p className="mt-1 text-[11px] text-slate-500">The digest, the style rules, the marks the game can draw and the last stories, so the saga goes on. Paste the reply on the right.</p>
        </div>
      </div>

      <div className="space-y-3 min-w-0">
        {published ? (
          <ChronicleChapter
            chapter={null}
            weekLabel={weekLabel(published.weekKey)}
            title={published.title}
            body={published.body}
            marks={published.marks}
            footer={`Published by ${published.publishedByName}, ${new Date(published.publishedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`}
          />
        ) : view === "preview" ? (
          <>
            <div className="flex justify-end">
              <button onClick={() => setView("edit")} className="px-2.5 py-1 rounded-lg text-[11px] font-bold border bg-slate-900 border-slate-700 text-slate-300 hover:text-white">
                Back to editing
              </button>
            </div>
            {preview ? (
              <>
                {preview.errors.length > 0 && <Result ok={null} error={`The game can't draw every mark:\n${preview.errors.join("\n")}`} />}
                <ChronicleChapter chapter={null} weekLabel={weekLabel(digest.weekKey)} title={title.trim()} body={story} marks={preview.marks} />
              </>
            ) : (
              <div className="text-xs text-slate-500 p-4 text-center">Drawing the chapter…</div>
            )}
          </>
        ) : (
          <>
            <label className="block">
              <span className={label}>Title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={CHRONICLE_MAX_TITLE} placeholder="The Siege of the Seven Bells" className={input} />
            </label>
            <label className="block">
              <span className="flex items-center justify-between">
                <span className={label}>Story (paste the reply here, then edit)</span>
                <button
                  type="button"
                  onClick={showPreview}
                  disabled={!story.trim()}
                  className="mb-1 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border bg-amber-900/40 border-amber-600/60 text-amber-100 hover:bg-amber-800/50 disabled:opacity-40 transition"
                >
                  <Eye className="w-3.5 h-3.5" /> Preview
                </button>
              </span>
              <textarea
                value={story}
                onChange={(e) => setStory(e.target.value)}
                onPaste={pasteStory}
                maxLength={CHRONICLE_MAX_BODY}
                rows={14}
                placeholder="In the week the bells of Valoria tolled…"
                className={`${input} resize-y leading-relaxed`}
              />
              <span className="block mt-1 text-right text-[10px] text-slate-500 tabular-nums">
                {story.length.toLocaleString()} / {CHRONICLE_MAX_BODY.toLocaleString()}
              </span>
            </label>
            {!finished && <div className="text-[11px] text-amber-300/80">This week isn't over yet: its story can be published once it ends (Sunday 00:00 UTC).</div>}
          </>
        )}
        <Result ok={ok} error={error} />
        {!published && (
          <div className="flex justify-end">
            <ActionButton busy={busy} disabled={!ready} onClick={publish} tone="emerald">
              <BookOpen className="w-4 h-4" /> {busy ? "Publishing…" : "Publish"}
            </ActionButton>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Audit                                                                      */
/* ------------------------------------------------------------------------- */

function AuditTab({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<DecreeAuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`${API_BASE}/decrees/audit?limit=100`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || "Couldn't load the audit");
        if (live) setRows(data);
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [refreshKey]);

  if (error) return <Result ok={null} error={error} />;
  if (!rows) return <div className="text-xs text-slate-500 p-4 text-center">Loading…</div>;
  if (rows.length === 0) return <div className="text-xs text-slate-500 p-4 text-center">No decrees yet.</div>;
  return (
    <div className="rounded-xl border border-slate-800 divide-y divide-slate-800/70">
      {rows.map((r) => (
        <div key={r.id} className="px-3 py-2 text-xs flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
          <span className="text-slate-500 font-mono text-[11px] shrink-0 w-36">{new Date(r.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
          <span className="text-amber-200 shrink-0 w-32 truncate">{r.actorName ?? "the realm"}</span>
          <span className="text-slate-300 flex-1">{r.summary}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Panel                                                                      */
/* ------------------------------------------------------------------------- */

const ChevronRightIcon = () => <span className="text-sky-300 text-lg">›</span>;

export function RoyalDecreesModal({
  open,
  onClose,
  kingdoms,
  isAdmin,
  onChanged,
  onOpenWatchtower
}: {
  open: boolean;
  onClose: () => void;
  kingdoms: DeveloperKingdom[];
  /** Gifts are for admins only */
  isAdmin: boolean;
  /** A decree went through: reload kingdoms, status and notices */
  onChanged: () => void;
  /** 🔭 Opens the Watchtower (work analytics) */
  onOpenWatchtower?: () => void;
}) {
  const [tab, setTab] = useState<Tab>("announce");
  const [auditKey, setAuditKey] = useState(0);
  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode; show: boolean }> = [
    { id: "announce", label: "Announce", icon: <ScrollText className="w-3.5 h-3.5" />, show: true },
    { id: "gift", label: "Give resources", icon: <Gift className="w-3.5 h-3.5" />, show: isAdmin },
    { id: "shield", label: "Shield", icon: <Shield className="w-3.5 h-3.5" />, show: true },
    { id: "punish", label: "Punish", icon: <CloudLightning className="w-3.5 h-3.5" />, show: true },
    { id: "proclaim", label: "Proclamations", icon: <PartyPopper className="w-3.5 h-3.5" />, show: true },
    { id: "chronicle", label: "Weekly Chronicle", icon: <BookOpen className="w-3.5 h-3.5" />, show: true },
    { id: "audit", label: "Audit", icon: <History className="w-3.5 h-3.5" />, show: true }
  ];
  const done = () => {
    setAuditKey((k) => k + 1);
    onChanged();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      accentBorder="border-amber-500/60"
      headerClassName="bg-linear-to-b from-amber-950/80 via-slate-900 to-slate-950"
      header={
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-950 border border-amber-500/60 flex items-center justify-center shadow-lg shadow-amber-950/50">
            <Crown className="w-5 h-5 text-amber-300" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100 font-medieval">Royal Decrees</h2>
            <p className="text-xs text-slate-400">Proclaim, gift, shield, punish and tell the week's story. Every decree is written in the audit.</p>
          </div>
        </div>
      }
    >
      <div className="px-4 sm:px-6 pt-3 flex gap-1.5 overflow-x-auto border-b border-slate-800">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.id}
              onClick={() => {
                sound.playClick();
                setTab(t.id);
              }}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-xs font-semibold border-b-2 transition ${
                tab === t.id ? "border-amber-400 text-amber-200 bg-amber-500/10" : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
      </div>
      <div className="p-4 sm:p-6">
        {onOpenWatchtower && (
          <button
            onClick={() => {
              sound.playClick();
              onOpenWatchtower();
            }}
            className="w-full mb-4 flex items-center gap-3 p-3 rounded-xl border border-sky-700/50 bg-linear-to-r from-sky-950/60 to-slate-900 text-left hover:border-sky-500 transition"
          >
            <span className="w-9 h-9 rounded-lg bg-sky-950 border border-sky-600/60 flex items-center justify-center text-sky-300 shrink-0">
              <WatchtowerIcon className="w-4.5 h-4.5" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold text-sky-100 font-medieval">The Watchtower</span>
              <span className="block text-[11px] text-slate-400">Work analytics: who is quiet, commits vs deeds, the project tree rolled up, each developer, and whether the game changed how we commit.</span>
            </span>
            <ChevronRightIcon />
          </button>
        )}
        {tab === "announce" && <AnnounceTab kingdoms={kingdoms} onDone={done} />}
        {tab === "gift" && isAdmin && <GiftTab kingdoms={kingdoms} onDone={done} />}
        {tab === "shield" && <ShieldTab kingdoms={kingdoms} onDone={done} />}
        {tab === "punish" && <PunishTab kingdoms={kingdoms} onDone={done} />}
        {tab === "proclaim" && <ProclaimTab kingdoms={kingdoms} onDone={done} />}
        {tab === "chronicle" && <ChronicleTab onDone={done} />}
        {tab === "audit" && <AuditTab refreshKey={auditKey} />}
      </div>
    </Modal>
  );
}
