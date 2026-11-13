/**
 * npm run sim:arts
 *
 * Battle Arts balance (server/src/battleArts.ts) on the live engine (combat.stepBattleRound), ending with ⚖️ BALANCED
 * or ⚠️ UNBALANCED (exit code 1). Every number is a unit's worth over a 6-round duel in the open: a drill band of
 * DRILL_BAND plain soldiers (sparring.ts) carrying the kit against the same band carrying nothing, the same seeds with
 * and without. Its worth = extra damage dealt + damage it did not take (+ HP of soldiers healed), in rounds of the
 * band's own opening blow.
 *
 * Checks:
 *   1. Every Art lands within ±15% of POWER_BUDGET (Arts carry no rarity: one budget for all).
 *   2. The drill kits (sparring.ts, one full kit per rarity) climb a smooth curve Common < … < Mythic: every step up
 *      is worth something, and no step is more than STEP_RATIO_MAX times another.
 *   3. Mythic never beats Legendary by more than the ladder gap (the Legendary − Epic step).
 *   4. Every kit fits its rarity's sizes (KIT_SIZES): drill kits, world bosses, every mob and bandit (sized by its
 *      spawn's rarity, never a boss) and every NPC kingdom garrison (its civilization's, by stage).
 *   5. Casting is deterministic: the same battle fought twice gives the same rounds, casts and ticks.
 *   6. The client's copy of the rules (src/utils/battleArts.ts) matches the server.
 *   7. Every Art, Finale, showing Instinct and status has its look on the spell-effects kit (src/utils/spellFx.ts).
 */
import { ARTS, BOSS_KIT_SIZE, FINALES, INSTINCTS, KIT_SIZES, POWER_BUDGET, STATUS_RULES, UNIT_RARITIES, FINALE_LAST_STAND, STATUS_MAX_SOURCES, BOSS_PARALYZE_MULT, BOSS_FREEZE_CHILL, BLEED_GROWTH, UnitKit, UnitRarity, kitProblems } from "../server/src/battleArts";
import { LiveAttackerStack, LiveDefenderState, seededRandom, stepBattleRound } from "../server/src/combat";
import { BOSS_UNITS, COMBAT, NPC_KINGDOM_KITS, bossKitFor, npcKingdomKitFor, npcKitFor } from "../server/src/warConfig";
import { DYNAMIC_15M_TEMPLATES } from "../server/src/worldMapGenerator";
import { DRILL_BAND, DRILL_UNIT, drillKit, runSparring, sparringRoster } from "../server/src/sparring";
import * as CLIENT from "@/utils/battleArts";
import { AFTERMATH_LOOKS, INSTINCT_LOOKS, SPELL_LOOKS } from "@/utils/spellFx";

/** Duels averaged per number */
const SEEDS = 40;
/** Every Art within this share of POWER_BUDGET */
const BUDGET_TOLERANCE = 0.15;
/** No step of the drill-kit curve is worth more than this many times another */
const STEP_RATIO_MAX = 3;

const pad = (v: string | number, n: number) => String(v).padStart(n);
const padR = (v: string | number, n: number) => String(v).padEnd(n);
const line = (title: string) => console.log(`\n── ${title} ${"─".repeat(Math.max(0, 78 - title.length))}`);

interface Duel {
  dealt: number;
  taken: number;
  healedHp: number;
  openingBlow: number;
}

/** One 6-round duel: the kit's band attacking a plain band in the open */
function duel(kit: UnitKit | undefined, seed: string): Duel {
  const stack: LiveAttackerStack = {
    marchId: "a",
    attackerId: "a",
    attackerName: "Drill band",
    civ: "human",
    count: DRILL_BAND,
    initialCount: DRILL_BAND,
    joinedRound: 1,
    roundsFought: 0,
    carryDamageTaken: 0,
    totalDamageDealt: 0,
    totalLosses: 0,
    unit: DRILL_UNIT,
    kit
  };
  const def: LiveDefenderState = { civ: "human", count: DRILL_BAND, initialCount: DRILL_BAND, fortified: false, roundsFought: 0, carryDamageTaken: 0, totalLosses: 0, unit: DRILL_UNIT, name: "Sparring dummies" };
  const rng = seededRandom(seed);
  const out: Duel = { dealt: 0, taken: 0, healedHp: 0, openingBlow: 0 };
  for (let round = 1; round <= COMBAT.MAX_ROUNDS && stack.count > 0 && def.count > 0; round++) {
    const step = stepBattleRound(round, [stack], def, rng, null, seed);
    out.dealt += step.roundSummary.attackerDamage;
    out.taken += step.roundSummary.defenderDamage;
    out.healedHp += (step.healed.a ?? 0) * DRILL_UNIT.hp;
    if (round === 1) out.openingBlow = step.roundSummary.attackerDamage;
  }
  return out;
}

/** A kit's worth: extra damage dealt and damage not taken over the plain band, in rounds of the plain band's opening blow */
function worth(kit: UnitKit, tag: string): number {
  let sum = 0;
  let blow = 0;
  for (let s = 0; s < SEEDS; s++) {
    const seed = `arts-${tag}-${s}`;
    const plain = duel(undefined, seed);
    const armed = duel(kit, seed);
    sum += armed.dealt - plain.dealt + (plain.taken - armed.taken) + armed.healedHp;
    blow += plain.openingBlow;
  }
  return sum / Math.max(1, blow);
}

const solo = (part: Partial<UnitKit>): UnitKit => ({ name: "Drill band", rarity: "mythic", instincts: [], arts: [], ...part });

interface Check {
  ok: boolean;
  text: string;
}
const checks: Check[] = [];

console.log("⚔️  Rise of Git — Battle Arts simulation");
console.log(`Duel: ${DRILL_BAND} drill soldiers (HP ${DRILL_UNIT.hp} · ATK ${DRILL_UNIT.atk} · DEF ${DRILL_UNIT.def}) with the kit vs the same band without, in the open, ${COMBAT.MAX_ROUNDS} rounds, ${SEEDS} seeds.`);
console.log(`Worth = extra damage dealt + damage not taken (+ HP healed), in rounds of the band's own opening blow. Budget ${POWER_BUDGET} ± ${BUDGET_TOLERANCE * 100}%.`);

/* ------------------------------------------------------------------------- */
/* 1. Every Art on the budget                                                */
/* ------------------------------------------------------------------------- */

line("Arts — worth over 6 rounds (target: the power budget ± 15%)");
const [lo, hi] = [POWER_BUDGET * (1 - BUDGET_TOLERANCE), POWER_BUDGET * (1 + BUDGET_TOLERANCE)];
const offBudget: string[] = [];
for (const art of Object.values(ARTS)) {
  const w = worth(solo({ arts: [art.id] }), art.id);
  const ok = w >= lo && w <= hi;
  if (!ok) offBudget.push(`${art.name} ${w.toFixed(2)}`);
  const timing = art.once ? "once" : `every ${art.cooldown + 1}`;
  console.log(`  ${padR(art.name, 16)}${pad(w.toFixed(2), 6)}  ${ok ? "✓" : "✗"}  from round ${art.castRound}, ${padR(timing, 8)} ${art.description}`);
}
checks.push({ ok: offBudget.length === 0, text: `Every Art is worth ${lo.toFixed(2)}–${hi.toFixed(2)} rounds of blow over 6 rounds${offBudget.length ? ` — off: ${offBudget.join(", ")}` : ""}` });

line("Finales and Instincts — worth on their own (info)");
for (const f of Object.values(FINALES)) console.log(`  Finale   ${padR(f.name, 16)}${pad(worth(solo({ finale: f.id }), f.id).toFixed(2), 6)}  round ${f.castRound} (or a last stand under ${FINALE_LAST_STAND * 100}%) · ${f.description}`);
for (const i of Object.values(INSTINCTS)) console.log(`  Instinct ${padR(i.name, 16)}${pad(worth(solo({ instincts: [i.id] }), i.id).toFixed(2), 6)}  ${i.description}`);

/* ------------------------------------------------------------------------- */
/* 2–3. Full kits climb the ladder                                           */
/* ------------------------------------------------------------------------- */

line("Drill kits — a full kit of each rarity (sparring.ts), worth over 6 rounds");
const kitWorth = {} as Record<UnitRarity, number>;
for (const r of UNIT_RARITIES) {
  const kit = drillKit(r);
  kitWorth[r] = worth(kit, `kit-${r}`);
  const parts = [...kit.instincts.map((id) => INSTINCTS[id].name), ...kit.arts.map((id) => ARTS[id].name), ...(kit.finale ? [`${FINALES[kit.finale].name} (Finale)`] : [])];
  const size = KIT_SIZES[r];
  console.log(`  ${padR(r, 10)}${pad(kitWorth[r].toFixed(2), 6)}  ${size.instincts}/${size.arts}/${size.finale}  ${kit.name}: ${parts.join(", ")}`);
}
const steps = UNIT_RARITIES.slice(1).map((r, i) => ({ from: UNIT_RARITIES[i], to: r, gain: kitWorth[r] - kitWorth[UNIT_RARITIES[i]] }));
console.log(`  Steps: ${steps.map((s) => `${s.from}→${s.to} +${s.gain.toFixed(2)}`).join(" · ")}`);
const gains = steps.map((s) => s.gain);
const rising = gains.every((g) => g > POWER_BUDGET * 0.25);
const ratio = Math.max(...gains) / Math.max(1e-9, Math.min(...gains));
checks.push({ ok: rising, text: `Full kits rise at every step, common < uncommon < rare < epic < legendary < mythic (smallest step +${Math.min(...gains).toFixed(2)})` });
checks.push({ ok: rising && ratio <= STEP_RATIO_MAX, text: `The curve is smooth: no step is worth more than ${STEP_RATIO_MAX}× another (×${ratio.toFixed(2)})` });
const ladderGap = kitWorth.legendary - kitWorth.epic;
const mythicGap = kitWorth.mythic - kitWorth.legendary;
checks.push({ ok: mythicGap <= ladderGap, text: `Mythic beats Legendary by no more than the ladder gap (+${mythicGap.toFixed(2)} vs the Legendary − Epic step +${ladderGap.toFixed(2)})` });

/* ------------------------------------------------------------------------- */
/* 4. Kit sizes                                                              */
/* ------------------------------------------------------------------------- */

const packs = DYNAMIC_15M_TEMPLATES.filter((t) => t.category === "mob" || t.category === "bandit");
const npcKits = packs.map((t) => npcKitFor(t.type, t.rarity as UnitRarity));
// NPC kingdoms' garrisons (free realms common → epic, frontier gates rare): every civilization at every stage
const kingdomKits = (Object.keys(NPC_KINGDOM_KITS) as Array<keyof typeof NPC_KINGDOM_KITS>).flatMap((civ) => (["common", "uncommon", "rare", "epic"] as UnitRarity[]).map((r) => npcKingdomKitFor(civ, r, `${civ} ${r} garrison`)));
const kits: UnitKit[] = [...UNIT_RARITIES.map(drillKit), ...Object.keys(BOSS_UNITS).map((t) => bossKitFor(t, t)), ...npcKits.filter((k): k is UnitKit => Boolean(k)), ...kingdomKits];
const sizeProblems = [
  ...kits.flatMap(kitProblems),
  // Every world boss carries a full colossus's kit, Cleave among its Instincts (its blows reach every army)
  ...Object.keys(BOSS_UNITS).map((t) => bossKitFor(t, t)).flatMap((k) => [
    ...(k.instincts.length < BOSS_KIT_SIZE.instincts || k.arts.length < BOSS_KIT_SIZE.arts || !k.finale ? [`${k.name}: not a full colossus kit`] : []),
    ...(k.instincts.includes("cleave") ? [] : [`${k.name}: no Cleave`])
  ]),
  ...kingdomKits.filter((k) => k.instincts.length < KIT_SIZES[k.rarity].instincts || k.arts.length < KIT_SIZES[k.rarity].arts).map((k) => `${k.name}: not a full kit`),
  ...packs.flatMap((t, i) => (!npcKits[i] ? [`${t.type}: no kit`] : npcKits[i]!.boss ? [`${t.type}: a boss kit`] : npcKits[i]!.instincts.length < KIT_SIZES[npcKits[i]!.rarity].instincts || npcKits[i]!.arts.length < KIT_SIZES[npcKits[i]!.rarity].arts ? [`${t.type}: not a full ${npcKits[i]!.rarity} kit`] : []))
];
checks.push({ ok: sizeProblems.length === 0, text: `Every drill, boss, mob, bandit and NPC kingdom kit fits its rarity (a world boss a colossus's: 3 Instincts with Cleave, 2 Arts, a Finale), every pack and garrison carries a full one and no pack a boss's (${kits.length} kits)${sizeProblems.length ? ` — ${sizeProblems.join("; ")}` : ""}` });
// Every world boss fights with an ult of its own: no two share a Finale
const bossFinales = Object.keys(BOSS_UNITS).map((t) => BOSS_UNITS[t].kit.finale);
const sharedFinales = bossFinales.filter((f, i) => !f || bossFinales.indexOf(f) !== i);
checks.push({ ok: sharedFinales.length === 0, text: `Every world boss has a Finale of its own (${new Set(bossFinales).size} for ${bossFinales.length} bosses)${sharedFinales.length ? ` — shared or missing: ${sharedFinales.join(", ")}` : ""}` });

line("World bosses — colossus kits: 3 Instincts (Cleave on each), 2 Arts and a Finale (sim:balance checks the boss targets)");
for (const t of Object.keys(BOSS_UNITS)) {
  const k = bossKitFor(t, t);
  console.log(`  ${padR(t.replace("boss-", ""), 12)}Instincts: ${padR(k.instincts.map((i) => INSTINCTS[i].name).join(", ") || "—", 18)} Arts: ${padR(k.arts.map((a) => ARTS[a].name).join(", ") || "—", 28)} Finale: ${k.finale ? FINALES[k.finale].name : "—"}`);
}

line("Mobs & bandits — kits by spawn rarity (sim:balance checks no pack got harder to beat)");
for (const [i, t] of packs.entries()) {
  const k = npcKits[i];
  if (!k) continue;
  console.log(`  ${padR(t.type.replace(/^(mob|bandit)-/, ""), 12)}${padR(k.rarity, 10)}Instincts: ${padR(k.instincts.map((id) => INSTINCTS[id]?.name ?? id).join(", "), 26)} Arts: ${k.arts.map((id) => ARTS[id]?.name ?? id).join(", ") || "—"}`);
}

/* ------------------------------------------------------------------------- */
/* 5. Deterministic                                                          */
/* ------------------------------------------------------------------------- */

const ids = sparringRoster().map((u) => u.id);
const replayOff: string[] = [];
for (const a of ids) {
  for (const b of ids.slice(0, 7)) {
    const one = JSON.stringify(runSparring(a, b, "replay"));
    const two = JSON.stringify(runSparring(a, b, "replay"));
    if (one !== two) replayOff.push(`${a} vs ${b}`);
  }
}
checks.push({ ok: replayOff.length === 0, text: `A battle fought twice from the same seed casts the same Arts and ticks the same statuses${replayOff.length ? ` — off: ${replayOff.slice(0, 4).join(", ")}` : ""}` });

line("Sparring Grounds — a sample fight (drill legendary attacks drill mythic)");
const sample = runSparring("drill-legendary", "drill-mythic", "sample")!;
for (const r of sample.rounds) {
  const arts = (r.arts ?? []).map((e) => `${e.kind === "tick" ? "" : e.unit + ": "}${e.name}${e.losses ? ` −${e.losses}` : ""}`).join(" · ");
  console.log(`  R${r.round}  −${pad(r.attackerLosses, 4)} / −${pad(r.defenderLosses, 4)}   ${arts}`);
}

/* ------------------------------------------------------------------------- */
/* 6. Client mirror                                                          */
/* ------------------------------------------------------------------------- */

const strip = (rules: typeof STATUS_RULES) => Object.fromEntries(Object.entries(rules).map(([k, r]) => [k, { name: r.name, emblem: r.emblem, rounds: r.rounds, harmful: r.harmful, text: r.text }]));
const mirrorOk =
  JSON.stringify(CLIENT.KIT_SIZES) === JSON.stringify(KIT_SIZES) &&
  JSON.stringify(CLIENT.BOSS_KIT_SIZE) === JSON.stringify(BOSS_KIT_SIZE) &&
  JSON.stringify(CLIENT.STATUS_RULES) === JSON.stringify(strip(STATUS_RULES)) &&
  CLIENT.FINALE_LAST_STAND === FINALE_LAST_STAND &&
  CLIENT.STATUS_MAX_SOURCES === STATUS_MAX_SOURCES &&
  CLIENT.BOSS_PARALYZE_MULT === BOSS_PARALYZE_MULT &&
  CLIENT.BOSS_FREEZE_CHILL === BOSS_FREEZE_CHILL &&
  CLIENT.BLEED_GROWTH === BLEED_GROWTH &&
  CLIENT.BATTLE_ROUNDS === COMBAT.MAX_ROUNDS &&
  CLIENT.RALLY_BATTLE_ROUNDS === COMBAT.RALLY_MAX_ROUNDS;
checks.push({ ok: mirrorOk, text: `Client copy of the Battle Arts rules (src/utils/battleArts.ts) matches the server${mirrorOk ? "" : " — copy battleArts.ts / COMBAT over"}` });

/* ------------------------------------------------------------------------- */
/* 7. Spell looks                                                            */
/* ------------------------------------------------------------------------- */

// Every Art and Finale has its look on the spell-effects kit, named as the server names it, leaving the status it lays;
// every Instinct that shows (cull, enrage) has one; every status has its aftermath look
const lookProblems: string[] = [];
for (const art of [...Object.values(ARTS), ...Object.values(FINALES)]) {
  const look = SPELL_LOOKS[art.fx];
  if (!look) {
    lookProblems.push(`${art.id}: no look "${art.fx}"`);
    continue;
  }
  if (look.name !== art.name || look.emblem !== art.emblem) lookProblems.push(`${art.id}: named ${look.emblem} ${look.name}, not ${art.emblem} ${art.name}`);
  const lays = art.effect.find((e) => e.kind === "status");
  const status = lays?.kind === "status" ? lays.status : undefined;
  if (look.aftermath !== status) lookProblems.push(`${art.id}: aftermath ${look.aftermath ?? "none"}, but it lays ${status ?? "none"}`);
  if ((look.aim === "self") !== (art.target === "self" || art.target === "allies")) lookProblems.push(`${art.id}: aimed ${look.aim}, but it targets ${art.target}`);
  if (Boolean(look.finale) !== art.id in FINALES) lookProblems.push(`${art.id}: finale flag wrong`);
}
for (const id of Object.keys(SPELL_LOOKS)) if (!ARTS[id] && !FINALES[id]) lookProblems.push(`look "${id}" has no Art or Finale`);
for (const inst of Object.values(INSTINCTS)) {
  if (inst.effect.kind !== "stat" && !INSTINCT_LOOKS[inst.id]) lookProblems.push(`Instinct ${inst.id}: no look`);
  const look = INSTINCT_LOOKS[inst.id];
  if (look && (look.name !== inst.name || look.emblem !== inst.emblem)) lookProblems.push(`Instinct ${inst.id}: misnamed`);
}
for (const kind of Object.keys(STATUS_RULES)) if (!AFTERMATH_LOOKS[kind as keyof typeof AFTERMATH_LOOKS]) lookProblems.push(`status ${kind}: no aftermath look`);
checks.push({ ok: lookProblems.length === 0, text: `Every Art, Finale, showing Instinct and status has its look (src/utils/spellFx.ts)${lookProblems.length ? ` — ${lookProblems.join("; ")}` : ""}` });

line("Checks");
for (const c of checks) console.log(`${c.ok ? "  ✅ PASS" : "  ❌ FAIL"}  ${c.text}`);
const balanced = checks.every((c) => c.ok);
console.log(`\n${"═".repeat(80)}`);
console.log(balanced ? "  ⚖️   BALANCED" : `  ⚠️   UNBALANCED — ${checks.filter((c) => !c.ok).length} check(s) failed`);
console.log("═".repeat(80));
process.exit(balanced ? 0 : 1);
