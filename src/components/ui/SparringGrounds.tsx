import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Play, RotateCcw, Sparkles, Swords } from "lucide-react";
import { API_BASE } from "@/config";
import { BattleRound, BattleStatusKind, SparringResult, SparringRosterEntry } from "@/types";
import { Combobox } from "./Combobox";
import { RARITY_STYLE } from "./CodexPreview";
import { FLOAT_STYLE, FloatEntry, FloatingText, FloatingTextStore } from "@/components/3d/FloatingText";
import { artEventText, BATTLE_ROUNDS, STATUS_RULES } from "@/utils/battleArts";
import { SpellFx, SpellFxStore, SpellSpot, spellNow } from "@/components/3d/SpellFx";
import { AFTERMATH_LOOKS, INSTINCT_LOOKS, SPELL_LOOKS, STAGE_TEXT, SpellLook, impactAt, lookOf } from "@/utils/spellFx";

/*
 * 🤺 The Sparring Grounds (Royal Codex): pick two units and watch them fight 6 rounds on the real engine. The server
 * fights it (GET /sparring/fight, the same `stepBattleRound` as every battle); this plays the rounds back one by one:
 * plain stand-ins (a block of soldiers per drill band or pack, one great shape per boss) that thin out as they fall, every
 * round's numbers, casts and status ticks rising over them on the floating-text kit, and every cast, Finale, Instinct
 * and status played on the spell-effects kit (SpellFx.tsx), stage by stage. The spell gallery under it casts any one
 * look between the stand-ins and lights each stage as it plays.
 */

/** Seconds between rounds on playback */
const ROUND_S = 3.6;
/** Stand-ins per drill band at full strength */
const BAND_FIGURES = 48;
const SIDE_X = 2.7;
const COLOR = { attacker: "#f59e0b", defender: "#a78bfa" };

interface Live {
  /** Share of each side still standing as the playback shows it */
  a: number;
  b: number;
  /** Clock (s) of the last round shown: the stand-ins lunge then */
  hitAt: number;
}

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** One side's stand-ins: a block of soldiers (one instanced mesh) or a single great shape for a boss */
function Side({ side, boss, live, spells }: { side: "attacker" | "defender"; boss: boolean; live: MutableRefObject<Live>; spells: SpellFxStore }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const dir = side === "attacker" ? 1 : -1;
  const count = boss ? 1 : BAND_FIGURES;
  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    const t = clock.elapsedTime;
    const strength = side === "attacker" ? live.current.a : live.current.b;
    // A spell's reaction: flashes white and flinches back, jolts, or glows lifted
    const react = spells.reactionOf(side);
    const lunge = Math.max(0, 1 - (t - live.current.hitAt) / 0.5) * Math.sin(Math.min(1, (t - live.current.hitAt) / 0.5) * Math.PI) * 0.6 - react.flash * 0.25 + Math.sin(t * 70) * react.jolt * 0.08;
    if (mat.current) {
      mat.current.emissive.set(react.flash > react.lift ? "#ffffff" : COLOR[side]);
      mat.current.emissiveIntensity = Math.max(react.flash * 1.4, react.lift * 0.8);
    }
    const shown = boss ? (strength > 0 ? 1 : 0) : Math.ceil(BAND_FIGURES * Math.max(0, Math.min(1, strength)));
    for (let i = 0; i < count; i++) {
      if (i >= shown) {
        m.setMatrixAt(i, ZERO);
        continue;
      }
      if (boss) {
        const k = 0.75 + 0.25 * strength;
        _p.set(-dir * SIDE_X + dir * lunge, 1.15 * k + Math.sin(t * 1.6) * 0.06, 0);
        _s.set(1.5 * k, 1.5 * k, 1.5 * k);
      } else {
        const col = i % 8;
        const row = Math.floor(i / 8);
        _p.set(-dir * (SIDE_X + row * 0.42 - 0.6) + dir * lunge, 0.3 + Math.abs(Math.sin(t * 5 + i * 1.7)) * 0.05, (col - 3.5) * 0.42);
        _s.set(1, 1, 1);
      }
      m.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false}>
      {boss ? <dodecahedronGeometry args={[1, 0]} /> : <capsuleGeometry args={[0.13, 0.32, 2, 6]} />}
      <meshStandardMaterial ref={mat} color={COLOR[side]} roughness={0.6} flatShading={boss} />
    </instancedMesh>
  );
}

/** The arena: ground, light, both sides, and the floating text over them */
function Arena({ bosses, live, store, spells }: { bosses: [boolean, boolean]; live: MutableRefObject<Live>; store: FloatingTextStore; spells: SpellFxStore }) {
  return (
    <>
      <color attach="background" args={["#0b1020"]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 8, 6]} intensity={1.6} />
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]}>
        <circleGeometry args={[7, 40]} />
        <meshStandardMaterial color="#3f3a2e" roughness={1} />
      </mesh>
      <Side side="attacker" boss={bosses[0]} live={live} spells={spells} />
      <Side side="defender" boss={bosses[1]} live={live} spells={spells} />
      <SpellFx store={spells} />
      <FloatingText store={store} fade={[40, 60]} />
    </>
  );
}

const compact = (n: number) => (n < 100_000 ? Math.round(n).toLocaleString("en-US") : n < 1e6 ? `${Math.round(n / 1e3)}k` : `${(n / 1e6).toFixed(1)}M`);

/** One round's numbers, casts and ticks over the two sides */
function roundEntries(r: BattleRound): FloatEntry[] {
  const at = { attacker: { x: -SIDE_X, y: 2.2, z: 0 }, defender: { x: SIDE_X, y: 2.2, z: 0 } };
  const out: FloatEntry[] = [];
  const nums = (side: "attacker" | "defender", lost: number, dealt: number) => {
    if (lost > 0) out.push({ ...at[side], ...FLOAT_STYLE.loss, text: `−${compact(lost)}` });
    if (dealt > 0) out.push({ ...at[side], ...FLOAT_STYLE.damage, text: `⚔ ${compact(dealt)}` });
  };
  nums("attacker", r.attackerLosses, r.attackerDamage);
  nums("defender", r.defenderLosses, r.defenderDamage);
  const n = { attacker: 0, defender: 0 };
  for (const e of r.arts ?? []) {
    const i = n[e.side]++;
    const lost = e.losses ? ` −${compact(e.losses)}` : "";
    if (e.kind === "tick") out.push({ ...at[e.side], ...FLOAT_STYLE.status, text: `${e.emblem}${lost || (e.damage ? ` ${compact(e.damage)}` : ` ${e.name}`)}`, delay: 0.8 + i * 0.4, dy: -70, dx: i % 2 ? 50 : -50 });
    else {
      const finale = e.kind === "finale";
      out.push({ ...at[e.side], ...FLOAT_STYLE.cast, ...(finale ? { color: "#fcd34d", size: 34, life: 3.2 } : {}), text: `${e.emblem} ${e.name}${e.kind === "instinct" ? lost : ""}`, delay: 0.3 + i * 0.5, dy: 56 + i * 8 });
    }
  }
  return out;
}

/** The two sides for the spell-effects kit (a boss is taller, its hand higher) */
const spotsFor = (bosses: [boolean, boolean]): Record<"attacker" | "defender", SpellSpot> => ({
  attacker: { x: -SIDE_X, y: 0, z: 0, r: bosses[0] ? 1.3 : 1.1, h: bosses[0] ? 1.9 : 0.9 },
  defender: { x: SIDE_X, y: 0, z: 0, r: bosses[1] ? 1.3 : 1.1, h: bosses[1] ? 1.9 : 0.9 }
});

/**
 * One round on the spell-effects kit, in step with its names: every cast from its caster at its target, and every status
 * that held as its aftermath until the next round (one laid this round starts as its cast lands)
 */
function playRound(spells: SpellFxStore, r: BattleRound, bosses: [boolean, boolean], key: string) {
  const spots = spotsFor(bosses);
  const other = (s: "attacker" | "defender") => (s === "attacker" ? "defender" : "attacker");
  const laid = new Map<string, number>();
  const n = { attacker: 0, defender: 0 };
  for (const e of r.arts ?? []) {
    const i = n[e.side]++;
    const look = e.kind === "tick" ? undefined : lookOf(e.fx, e.id);
    if (!look) continue;
    const impact = spells.cast(look, spots[e.side], spots[other(e.side)], { delay: 0.3 + i * 0.5, seed: `${key}:${r.round}:${e.side}:${i}`, hit: other(e.side), caster: e.side });
    if (look.aftermath) laid.set(`${look.aim === "self" ? e.side : other(e.side)}:${look.aftermath}`, impact);
  }
  const now = spellNow();
  for (const side of ["attacker", "defender"] as const) {
    for (const kind of r.statuses?.[side] ?? []) spells.status(`${key}:${side}:${kind}`, kind, spots[side], laid.get(`${side}:${kind}`) ?? now, now + ROUND_S + 1.2);
  }
}

/** Share of a side standing after round `r` */
const leftAfter = (res: SparringResult, r: BattleRound | undefined, side: "attacker" | "defender") => {
  if (!r) return 1;
  const unit = res[side];
  if (unit.kind === "boss") {
    // One colossal unit: what its foes dealt, against its HP
    const dealt = res.rounds.filter((x) => x.round <= r.round).reduce((s, x) => s + (side === "attacker" ? x.defenderDamage : x.attackerDamage), 0);
    return Math.max(0, 1 - dealt / unit.hp);
  }
  return (side === "attacker" ? r.attackerRemaining : r.defenderRemaining) / Math.max(1, unit.count);
};

export function SparringGrounds() {
  const [roster, setRoster] = useState<SparringRosterEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [a, setA] = useState("drill-legendary");
  const [b, setB] = useState("drill-mythic");
  const [result, setResult] = useState<SparringResult | null>(null);
  const [shown, setShown] = useState(0);
  const [bout, setBout] = useState(0);
  const store = useMemo(() => new FloatingTextStore(), []);
  const spells = useMemo(() => new SpellFxStore(), []);
  const live = useRef<Live>({ a: 1, b: 1, hitAt: -10 });
  const clock = useRef(0);

  useEffect(() => {
    let alive = true;
    fetch(`${API_BASE}/sparring/roster`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { roster: SparringRosterEntry[] }) => alive && setRoster(j.roster))
      .catch((e) => alive && setError(String(e.message ?? e)));
    return () => {
      alive = false;
    };
  }, []);

  const fight = () => {
    setError(null);
    fetch(`${API_BASE}/sparring/fight?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}&seed=bout-${bout + 1}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((res: SparringResult) => {
        live.current = { a: 1, b: 1, hitAt: -10 };
        setResult(res);
        setShown(0);
        setBout((n) => n + 1);
      })
      .catch((e) => setError(String(e.message ?? e)));
  };

  // Playback: one round every ROUND_S, its numbers rising and the stand-ins thinning as it lands
  useEffect(() => {
    if (!result || shown >= result.rounds.length) return;
    const id = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 600 : ROUND_S * 1000);
    return () => clearTimeout(id);
  }, [result, shown, bout]);
  useEffect(() => {
    if (!result || shown === 0) return;
    const r = result.rounds[shown - 1];
    store.add(...roundEntries(r));
    playRound(spells, r, [result.attacker.kind === "boss", result.defender.kind === "boss"], `bout${bout}`);
    live.current = { a: leftAfter(result, r, "attacker"), b: leftAfter(result, r, "defender"), hitAt: clock.current };
  }, [result, shown, store, spells, bout]);

  const options = useMemo(
    () =>
      (roster ?? []).map((u) => ({
        value: u.id,
        label: `${u.emblem} ${u.name}`,
        sublabel: `${u.rarity} · ${u.kind === "boss" ? "world boss" : u.kind === "npc" ? u.subtitle.split(" ·")[0].toLowerCase() : "drill band"}`,
        group: u.kind === "boss" ? "World bosses" : u.kind === "npc" ? "Mobs & bandits" : "Drill bands (one per rarity)",
        search: `${u.name} ${u.rarity} ${u.kind}`
      })),
    [roster]
  );
  const unitOf = (id: string) => roster?.find((u) => u.id === id);
  const done = result && shown >= result.rounds.length;
  const bosses = useMemo<[boolean, boolean]>(() => (result ? [result.attacker.kind === "boss", result.defender.kind === "boss"] : [false, false]), [result]);

  return (
    <div className="space-y-3 pb-4">
      <p className="text-xs text-slate-400">
        Pick two units and watch them fight {BATTLE_ROUNDS} rounds on the same engine as every battle in the realm. Drill bands are 1,000 plain soldiers each (20,000 against a world boss, and an even match against a mob or bandit pack); only their Battle Arts differ, one rarity to the next. A mob or bandit pack takes the field at its full size, as it roves the map.
      </p>
      {error && <div className="text-sm text-red-300">The sparring master is away: {error}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr_auto] gap-2 items-center">
        <Combobox options={options} value={a} onChange={setA} ariaLabel="Attacking unit" title="Attacking unit" searchPlaceholder="Find a unit…" />
        <Swords className="w-4 h-4 text-slate-500 justify-self-center hidden sm:block" />
        <Combobox options={options} value={b} onChange={setB} ariaLabel="Defending unit" title="Defending unit" searchPlaceholder="Find a unit…" />
        <button
          onClick={fight}
          disabled={!roster}
          className="h-9 px-4 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-sm font-semibold text-white flex items-center justify-center gap-1.5"
        >
          {result ? <RotateCcw className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {result ? "Spar again" : "Spar"}
        </button>
      </div>

      {/* Both kits */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {[a, b].map((id, i) => {
          const u = unitOf(id);
          if (!u) return <div key={i} />;
          return (
            <div key={i} className={`rounded-lg border p-2.5 text-xs ${i === 0 ? "border-amber-600/40 bg-amber-950/20" : "border-violet-600/40 bg-violet-950/20"}`}>
              <div className="flex items-center gap-1.5 font-semibold text-slate-100">
                <span>{u.emblem}</span>
                {u.name}
                <span className={`ml-auto rounded border px-1.5 py-0.5 text-[10px] capitalize ${RARITY_STYLE[u.rarity === "mythic" ? "mythical" : u.rarity].chip}`}>{u.rarity}</span>
              </div>
              <div className="text-[11px] text-slate-400 mb-1">
                {u.subtitle} · HP {u.unit.hp.toLocaleString()} · ATK {u.unit.atk} · DEF {u.unit.def}
              </div>
              <ul className="space-y-0.5 text-slate-300">
                {u.kitLines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
                {u.kitLines.length === 0 && <li className="text-slate-500">No Battle Arts</li>}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="relative h-64 sm:h-72 rounded-xl overflow-hidden border border-slate-700">
        <Canvas camera={{ position: [0, 4.2, 9.5], fov: 42 }} dpr={[1, 1.5]} onCreated={({ camera }) => camera.lookAt(0, 0.8, 0)}>
          <ClockTap clock={clock} />
          <Arena key={result ? `${result.attacker.id}-${result.defender.id}-${bout}` : "gallery"} bosses={bosses} live={live} store={store} spells={spells} />
        </Canvas>
        {result && (
          <>
            <div className="absolute top-2 left-2 text-[11px] font-semibold text-amber-200">
              {result.attacker.emblem} {result.attacker.name} ×{result.attacker.count.toLocaleString()}
            </div>
            <div className="absolute top-2 right-2 text-[11px] font-semibold text-violet-200 text-right">
              {result.defender.emblem} {result.defender.name} ×{result.defender.count.toLocaleString()}
            </div>
            <div className="absolute bottom-2 inset-x-0 text-center text-xs text-slate-200">
              {done
                ? result.winner === "draw"
                  ? "A draw: both stand as strong"
                  : `${result.winner === "attacker" ? result.attacker.name : result.defender.name} stands stronger: ${Math.round(result.attackerLeft * 100)}% vs ${Math.round(result.defenderLeft * 100)}% left`
                : `Round ${Math.max(1, shown)} / ${result.rounds.length}`}
            </div>
          </>
        )}
      </div>

      <SpellGallery spells={spells} bosses={bosses} />

      {result && (
        <>

          <div className="space-y-1">
            {result.rounds.slice(0, shown).map((r) => (
              <div key={r.round} className="rounded-lg bg-slate-900/70 border border-slate-800 px-2.5 py-1.5 text-[11px]">
                <div className="flex gap-3 text-slate-400">
                  <span className="text-slate-500">Round {r.round}</span>
                  <span className="text-amber-200/90">
                    −{r.attackerLosses.toLocaleString()} · ⚔ {r.attackerDamage.toLocaleString()}
                  </span>
                  <span className="text-violet-200/90">
                    −{r.defenderLosses.toLocaleString()} · ⚔ {r.defenderDamage.toLocaleString()}
                  </span>
                </div>
                {r.arts?.length ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.arts.map((e, i) => (
                      <span
                        key={i}
                        className={`rounded px-1.5 py-0.5 text-[10px] ${e.kind === "finale" ? "basis-full bg-amber-500/15 text-amber-200 font-semibold" : e.kind === "tick" ? "bg-slate-800 text-orange-200/90" : e.side === "attacker" ? "bg-amber-400/10 text-amber-100/90" : "bg-violet-400/10 text-violet-100/90"}`}
                      >
                        {artEventText(e)}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Keeps the canvas clock where the playback can read it (the stand-ins lunge when a round lands) */
function ClockTap({ clock }: { clock: MutableRefObject<number> }) {
  useFrame(({ clock: c }) => {
    clock.current = c.elapsedTime;
  });
  return null;
}

/** How long the gallery shows a status or an aftermath, s */
const GALLERY_STATUS_S = 5;

type Stage = "charge" | "core" | "trail" | "burst" | "reaction" | "aftermath";
const STAGES: Stage[] = ["charge", "core", "trail", "burst", "reaction", "aftermath"];

/** When each stage of a look plays, in seconds from the cast (the kit's own timing) */
function stageWindows(look: SpellLook): Record<Stage, [number, number] | null> {
  const wind = look.charge === "none" ? 0 : look.finale ? 0.9 : 0.6;
  const impact = impactAt(look);
  const self = look.aim === "self";
  return {
    charge: look.charge === "none" ? null : [0, wind],
    core: look.core === "none" ? null : [wind * 0.4, wind + (self ? 0.25 : impact - wind)],
    trail: look.trail === "none" || self ? null : [wind, impact],
    burst: [impact, impact + 0.7],
    reaction: look.reaction === "none" ? null : [impact, impact + 0.7],
    aftermath: look.aftermath ? [impact + 0.2, impact + GALLERY_STATUS_S] : null
  };
}

/**
 * The spell gallery: cast any Art, Finale, Instinct or status between the stand-ins on its own, its stages listed and
 * each lit as it plays (charge → core → trail → burst → reaction → aftermath, and the sound on cast and impact)
 */
function SpellGallery({ spells, bosses }: { spells: SpellFxStore; bosses: [boolean, boolean] }) {
  const [pick, setPick] = useState("look:fireball");
  const [castAt, setCastAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const casts = useRef(0);
  const options = useMemo(
    () => [
      ...Object.entries(SPELL_LOOKS).map(([id, l]) => ({ value: `look:${id}`, label: `${l.emblem} ${l.name}`, sublabel: STAGE_TEXT.burst[l.burst], group: l.finale ? "Finales" : "Arts" })),
      ...Object.entries(INSTINCT_LOOKS).map(([id, l]) => ({ value: `look:${id}`, label: `${l.emblem} ${l.name}`, sublabel: STAGE_TEXT.burst[l.burst], group: "Instincts that show" })),
      ...Object.entries(AFTERMATH_LOOKS).map(([kind, a]) => ({ value: `status:${kind}`, label: `${STATUS_RULES[kind as BattleStatusKind].emblem} ${a.name}`, sublabel: a.text, group: "Statuses (aftermath)" }))
    ],
    []
  );
  const [kindOf, id] = pick.split(":");
  const look = kindOf === "look" ? SPELL_LOOKS[id] ?? INSTINCT_LOOKS[id] : undefined;
  const status = kindOf === "status" ? (id as BattleStatusKind) : undefined;
  const windows = useMemo(() => (look ? stageWindows(look) : null), [look]);

  // Light the stages while a cast plays (a few times a second: UI only, the effect itself runs on the GPU)
  useEffect(() => {
    if (castAt === null) return;
    const t = setInterval(() => {
      const n = spellNow();
      setNow(n);
      if (n - castAt > GALLERY_STATUS_S + 2) clearInterval(t);
    }, 100);
    return () => clearInterval(t);
  }, [castAt]);

  const cast = () => {
    const spots = spotsFor(bosses);
    const n = ++casts.current;
    const t = spellNow();
    if (look) {
      const impact = spells.cast(look, spots.attacker, spots.defender, { seed: `gallery:${id}:${n}`, hit: "defender", caster: "attacker" });
      if (look.aftermath) spells.status(`gallery:${n}`, look.aftermath, look.aim === "self" ? spots.attacker : spots.defender, impact, impact + GALLERY_STATUS_S);
    } else if (status) {
      spells.status(`gallery:${n}`, status, spots.defender, t, t + GALLERY_STATUS_S);
    }
    setCastAt(t);
    setNow(t);
  };

  const since = castAt === null ? -1 : now - castAt;
  const lit = (w: [number, number] | null) => w !== null && since >= w[0] && since <= w[1];
  const text = (s: Stage): string | null => {
    if (!look) return null;
    if (s === "aftermath") return look.aftermath ? `${AFTERMATH_LOOKS[look.aftermath].name}: ${AFTERMATH_LOOKS[look.aftermath].text}` : null;
    return (STAGE_TEXT[s] as Record<string, string>)[look[s]];
  };

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-2.5 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
        <Sparkles className="w-3.5 h-3.5 text-amber-300" />
        Spell gallery
        <span className="font-normal text-slate-400">· cast one look between the stand-ins, stage by stage</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-center">
        <Combobox options={options} value={pick} onChange={setPick} ariaLabel="Spell to cast" title="Spell to cast" searchPlaceholder="Find an Art, Finale or status…" />
        <button onClick={cast} className="h-9 px-4 rounded-lg bg-violet-600 hover:bg-violet-500 text-sm font-semibold text-white flex items-center justify-center gap-1.5">
          <Sparkles className="w-4 h-4" />
          Cast
        </button>
      </div>
      {look && windows && (
        <ol className="grid grid-cols-2 sm:grid-cols-3 gap-1 text-[11px]">
          {STAGES.map((s) => {
            const t = text(s);
            const on = lit(windows[s]);
            return (
              <li key={s} className={`rounded px-1.5 py-1 border transition-colors ${on ? "border-amber-400 bg-amber-400/15 text-amber-100" : t && windows[s] ? "border-slate-700 text-slate-300" : "border-slate-800 text-slate-600"}`}>
                <span className="block font-semibold capitalize">{s}</span>
                {t && windows[s] ? t : "—"}
              </li>
            );
          })}
        </ol>
      )}
      {status && (
        <div className={`rounded px-1.5 py-1 border text-[11px] ${since >= 0 && since <= GALLERY_STATUS_S ? "border-amber-400 bg-amber-400/15 text-amber-100" : "border-slate-700 text-slate-300"}`}>
          <span className="font-semibold">Aftermath · {AFTERMATH_LOOKS[status].name}</span>: {AFTERMATH_LOOKS[status].text}, while {STATUS_RULES[status].name} {STATUS_RULES[status].text}
        </div>
      )}
      {look && (
        <div className="text-[10px] text-slate-500">
          Sound: a {look.voice} whoosh as it is cast{look.finale ? " under a war horn" : ""}, a boom as it lands · {look.aim === "self" ? "blooms on the caster's own side" : "flies at the enemy"}
        </div>
      )}
    </div>
  );
}
