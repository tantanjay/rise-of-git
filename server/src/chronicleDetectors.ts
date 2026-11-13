import { db, SCARCE_RESOURCES } from "./db.js";
import { DISASTERS } from "./disasterRules.js";
import { BattleReport, ChronicleHappening, CivilizationType, DisasterKind } from "./types.js";

/*
 * The weekly story's detectors (GAME_GUIDE §15 *Weekly Chronicle*): small functions that each read one kind of
 * happening from `realm_events`, battle reports and the ledgers for one week and return it as facts told as legend.
 *
 * Adding a detector: write a `Detector` below and add it to DETECTORS. Its facts join the digest, sorted by weight.
 */

export interface ChronicleWeek {
  /** Epoch ms: Sunday 00:00 UTC → the next Sunday */
  from: number;
  to: number;
  fromIso: string;
  toIso: string;
}

export type Detector = (w: ChronicleWeek) => ChronicleHappening[];

/* ------------------------------------------------------------------------- */
/* Helpers                                                                   */
/* ------------------------------------------------------------------------- */

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

/** The people of each civilization and its land, as the legend calls them */
export const CIV_PEOPLE: Record<CivilizationType, string> = { human: "Humans of Valoria", elf: "Elves of Sylvandale", dwarf: "Dwarves of Ironforge", orc: "Orcs of Drak'mar", arcane: "Nethergarde" };

function nameOf(userId: string | null | undefined): string {
  if (!userId) return "a nameless ruler";
  const row = db.prepare(`SELECT full_name, username FROM users WHERE id = ?`).get(userId) as { full_name?: string; username?: string } | undefined;
  return row ? row.full_name || row.username || userId : userId;
}

interface ReportRow {
  id: string;
  timestamp: string;
  attacker_id: string;
  attacker_name: string;
  defender_id: string;
  defender_name: string;
  target_type: string;
  attacker_initial_soldiers: number;
  attacker_casualties: number;
  defender_initial_soldiers: number;
  defender_casualties: number;
  attacker_won: number;
  usurped_slot: number;
  details_json: string | null;
}

/** The week's battle reports, oldest first */
function reportsIn(w: ChronicleWeek, where = "1 = 1"): Array<ReportRow & { report: Partial<BattleReport> }> {
  return (db.prepare(`SELECT * FROM battle_reports WHERE timestamp >= ? AND timestamp < ? AND ${where} ORDER BY timestamp ASC`).all(w.fromIso, w.toIso) as ReportRow[]).map((r) => {
    let report: Partial<BattleReport> = {};
    try {
      report = r.details_json ? JSON.parse(r.details_json) : {};
    } catch {
      // A broken report still counts by its columns
    }
    return { ...r, report };
  });
}

/** The week's realm events of one kind, oldest first */
function eventsIn<T = any>(w: ChronicleWeek, kind: string): Array<{ id: number; at: string; actorId: string | null; targetId: string | null; payload: T }> {
  return (db.prepare(`SELECT * FROM realm_events WHERE kind = ? AND at >= ? AND at < ? ORDER BY id ASC`).all(kind, w.fromIso, w.toIso) as any[]).map((r) => ({
    id: r.id,
    at: r.at,
    actorId: r.actor_id,
    targetId: r.target_id,
    payload: r.payload_json ? JSON.parse(r.payload_json) : {}
  }));
}

/** Rulers' own castles (not NPC kingdoms or Voidrift spires) */
const RULER_TARGET = "target_type = 'dev_kingdom'";

/* ------------------------------------------------------------------------- */
/* The Voidrift                                                              */
/* ------------------------------------------------------------------------- */

/** 🌀 Open Voidrift slots taken this week; the first one ever taken is told as such */
export const voidriftClaims: Detector = (w) => {
  const first = db.prepare(`SELECT id FROM battle_reports WHERE target_type = 'spire' AND attacker_won = 1 ORDER BY timestamp ASC LIMIT 1`).get() as { id: string } | undefined;
  return reportsIn(w, "target_type = 'spire' AND attacker_won = 1").map((r) =>
    r.id === first?.id
      ? { kind: "voidrift_first", label: "First void seat", emblem: "🌀", weight: 100, text: `${r.attacker_name} became the first ruler ever to break an open Voidrift slot (${r.defender_name}) and ascend to Nethergarde.` }
      : { kind: "voidrift_claim", label: "Void seat taken", emblem: "🌀", weight: 70, text: `${r.attacker_name} broke the void garrison of ${r.defender_name}, took an open Voidrift slot and ascended to Nethergarde.` }
  );
};

/** Assaults it took (counting the winning one) to count as a ruler who kept at it */
export const PERSISTENCE_MIN_ATTEMPTS = 3;

/** ⚔️ A ruler who kept attacking the Voidrift (its spires or its rulers) and finally won, with the attempt count */
export const voidriftPersistence: Detector = (w) => {
  const voidTarget = "(target_type = 'spire' OR (target_type = 'dev_kingdom' AND defender_civ = 'arcane'))";
  const out: ChronicleHappening[] = [];
  for (const win of reportsIn(w, `${voidTarget} AND attacker_won = 1`)) {
    // Failed assaults on the Voidrift since this ruler's previous win there
    const prevWin = db
      .prepare(`SELECT timestamp FROM battle_reports WHERE attacker_id = ? AND ${voidTarget} AND attacker_won = 1 AND timestamp < ? ORDER BY timestamp DESC LIMIT 1`)
      .get(win.attacker_id, win.timestamp) as { timestamp: string } | undefined;
    const fails = (
      db
        .prepare(`SELECT COUNT(*) AS n FROM battle_reports WHERE attacker_id = ? AND ${voidTarget} AND attacker_won = 0 AND timestamp < ? AND timestamp > ?`)
        .get(win.attacker_id, win.timestamp, prevWin?.timestamp ?? "") as { n: number }
    ).n;
    const attempts = fails + 1;
    if (attempts < PERSISTENCE_MIN_ATTEMPTS) continue;
    out.push({
      kind: "voidrift_persistence", label: "Never yielded",
      emblem: "⚔️",
      weight: 75 + Math.min(20, attempts),
      text: `${win.attacker_name} hurled their armies at the Voidrift ${attempts} times; ${fails} assaults broke on it before the ${attempts}${ordinal(attempts)} finally won through against ${win.defender_name}.`
    });
  }
  return out;
};

function ordinal(n: number) {
  const s = n % 100;
  if (s >= 11 && s <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}

/** 👑 Voidrift ascensions and falls: a mortal ruler cast a Nethergarde ruler out and took their throne */
export const voidriftFalls: Detector = (w) =>
  reportsIn(w, `${RULER_TARGET} AND usurped_slot = 1`).map((r) => {
    const civ = r.report.newDefenderCiv;
    return {
      kind: "voidrift_fall", label: "Throne lost",
      emblem: "👑",
      weight: 80,
      text: `${r.attacker_name} cast ${r.defender_name} down from the Voidrift and took their throne; ${r.defender_name} fell back among the ${civ ? CIV_PEOPLE[civ] : "mortal kingdoms"}.`
    };
  });

/* ------------------------------------------------------------------------- */
/* Rare finds                                                                */
/* ------------------------------------------------------------------------- */

const LEGENDARY_GEMS = SCARCE_RESOURCES.filter((r) => r.rarity === "legendary");
/** Ledger lines that are finds out in the world (the harvest and the workforce bring legendary gems every day; gifts and refunds aren't found) */
const FOUND_TYPES = ["gathering_haul", "battle_loot", "boss_bounty"];

/** 💎 Ultra-rare finds: a legendary node emptied or chest claimed, and legendary gems brought home */
export const rareFinds: Detector = (w) => {
  const out: ChronicleHappening[] = eventsIn<{ name?: string; treasure?: boolean }>(w, "rare_find").map((e) => ({
    kind: "rare_find", label: e.payload.treasure ? "Relic found" : "Legendary find",
    emblem: e.payload.treasure ? "👑" : "💎",
    weight: 65,
    text: e.payload.treasure
      ? `After a long search, ${nameOf(e.actorId)}'s gatherers found the legendary ${e.payload.name ?? "treasure"} and carried it home.`
      : `${nameOf(e.actorId)}'s gatherers worked the legendary ${e.payload.name ?? "node"} until nothing was left of it.`
  }));
  if (LEGENDARY_GEMS.length) {
    const rows = db
      .prepare(`
        SELECT user_id, scarce_key, SUM(scarce_delta) AS n FROM resource_ledger
        WHERE timestamp >= ? AND timestamp < ? AND scarce_delta > 0
          AND scarce_key IN (${LEGENDARY_GEMS.map(() => "?").join(",")}) AND type IN (${FOUND_TYPES.map(() => "?").join(",")})
        GROUP BY user_id, scarce_key ORDER BY n DESC
      `)
      .all(w.fromIso, w.toIso, ...LEGENDARY_GEMS.map((g) => g.key), ...FOUND_TYPES) as Array<{ user_id: string; scarce_key: string; n: number }>;
    for (const r of rows) {
      const gem = LEGENDARY_GEMS.find((g) => g.key === r.scarce_key)!;
      out.push({ kind: "legendary_gem", label: "Legendary gem", emblem: gem.emblem, weight: 55, text: `After a long search, ${nameOf(r.user_id)} brought home ${fmt(r.n)} ${gem.name}${r.n === 1 ? "" : "s"}, a legendary treasure.` });
    }
  }
  return out;
};

/* ------------------------------------------------------------------------- */
/* World bosses                                                              */
/* ------------------------------------------------------------------------- */

/** A ruler who dealt at least this share of a boss's damage killed it alone */
export const SOLO_KILL_SHARE = 0.6;

/** 🐉 Boss kills: a solo kill (≥60% of the damage), a stolen kill (the killer wasn't the top dealer), or a plain one */
export const bossKills: Detector = (w) =>
  eventsIn<{ bossName: string; killerName: string; rally?: boolean; dealers?: Array<{ userId: string; name: string; damage: number }>; dealerCount?: number; totalDamage?: number }>(w, "boss_slain").filter((e) => !e.targetId?.startsWith("horror-")).map((e) => {
    const p = e.payload;
    const dealers = [...(p.dealers ?? [])].sort((a, b) => b.damage - a.damage);
    const total = p.totalDamage ?? dealers.reduce((s, d) => s + d.damage, 0);
    const top = dealers[0];
    const killer = dealers.find((d) => d.userId === e.actorId);
    // The event keeps the top 10 dealers; how many wounded it in all is kept beside them (older events: the list)
    const wounded = Math.max(dealers.length, p.dealerCount ?? 0);
    if (top && top.userId !== e.actorId) {
      const diff = top.damage - (killer?.damage ?? 0);
      return {
        kind: "boss_stolen", label: "Stolen kill",
        emblem: "🗡️",
        weight: 78,
        text: `${p.killerName} struck the killing blow on ${p.bossName}, but ${top.name} had dealt ${pct(top.damage, total)}% of its wounds, ${fmt(diff)} more than the killer (${pct(killer?.damage ?? 0, total)}%). A stolen kill.`
      };
    }
    if (top && top.damage >= SOLO_KILL_SHARE * total) {
      const alone = wounded <= 1;
      return {
        kind: "boss_solo", label: "Solo kill",
        emblem: "🐉",
        weight: 72,
        text: alone
          ? `${p.killerName} slew ${p.bossName} alone; no other blade touched it.`
          : `${p.killerName} slew ${p.bossName} almost alone, dealing ${pct(top.damage, total)}% of its wounds while ${wounded - 1} ${wounded === 2 ? "other" : "others"} fought beside them.`
      };
    }
    return { kind: "boss_slain", label: "Boss slain", emblem: "🐉", weight: 45, text: `${p.bossName} fell to ${p.killerName}'s ${p.rally ? "rally" : "army"}, after ${wounded} rulers had wounded it.` };
  });

/* ------------------------------------------------------------------------- */
/* Sieges                                                                    */
/* ------------------------------------------------------------------------- */

/** ⚔️ The biggest siege of the week on a ruler's castle (by soldiers on both sides) */
export const biggestSiege: Detector = (w) => {
  const reports = reportsIn(w, RULER_TARGET);
  if (!reports.length) return [];
  const size = (r: ReportRow) => r.attacker_initial_soldiers + r.defender_initial_soldiers;
  const r = reports.reduce((a, b) => (size(b) > size(a) ? b : a));
  const rulers = new Set((r.report.armies ?? []).filter((a) => a.side === "attacker").map((a) => a.ownerId)).size;
  const host = rulers > 1 ? `a rally of ${rulers} rulers led by ${r.attacker_name}` : r.attacker_name;
  const fell = r.attacker_casualties + r.defender_casualties;
  return [
    {
      kind: "biggest_siege", label: "Great siege",
      emblem: "🏰",
      weight: 60,
      text: `The greatest siege of the week: ${host} brought ${fmt(r.attacker_initial_soldiers)} soldiers against ${r.defender_name}'s ${fmt(r.defender_initial_soldiers)}. ${r.attacker_won ? "The walls fell" : "The walls held"}, and ${fmt(fell)} soldiers fell.`
    }
  ];
};

/** 🛡️ The longest defence: the ruler who turned back the most assaults, and the most rounds they held in one */
export const longestDefence: Detector = (w) => {
  const held = new Map<string, { name: string; repelled: number; rounds: number }>();
  for (const r of reportsIn(w, `${RULER_TARGET} AND attacker_won = 0`)) {
    const h = held.get(r.defender_id) ?? { name: r.defender_name, repelled: 0, rounds: 0 };
    h.repelled += 1;
    h.rounds = Math.max(h.rounds, r.report.rounds?.length ?? 0);
    held.set(r.defender_id, h);
  }
  const best = [...held.values()].sort((a, b) => b.repelled - a.repelled || b.rounds - a.rounds)[0];
  if (!best || (best.repelled < 2 && best.rounds < 4)) return [];
  return [
    {
      kind: "longest_defence", label: "Walls held",
      emblem: "🛡️",
      weight: 55 + Math.min(15, best.repelled * 3),
      text: `${best.name}'s walls never broke: they turned back ${best.repelled} ${best.repelled === 1 ? "assault" : "assaults"}${best.rounds > 1 ? `, one of them held for ${best.rounds} rounds` : ""}.`
    }
  ];
};

/** 🔥 Castles burned: a ruler's walls left burning (≤ 25% wall HP) by an assault */
export const castlesBurned: Detector = (w) => {
  const seen = new Set<string>();
  return reportsIn(w, RULER_TARGET)
    .filter((r) => r.report.defenderBurning && !seen.has(r.defender_id) && seen.add(r.defender_id))
    .map((r) => ({ kind: "castle_burned", label: "Castle burned", emblem: "🔥", weight: 58, text: `${r.defender_name}'s castle burned after ${r.attacker_name}'s assault; no army could touch it again until its walls were mended.` }));
};

/** 🌑 Xal'Vorath: driven back by a kingdom's work, slain at the gates, or left to burn the city */
export const horrorEnds: Detector = (w) => [
  ...eventsIn<{ targetName: string; level: number }>(w, "horror_repelled").map((e) => ({
    kind: "horror_repelled", label: "Horror repelled", emblem: "🌑", weight: 92,
    text: `The Overseers loosed Xal'Vorath on ${e.payload.targetName}'s kingdom, and it crawled three days to the gates only to find a kingdom that had not once laid down its tools. It came apart on the wind, driven back by nothing but diligence.`
  })),
  ...eventsIn<{ targetName: string; level: number; killerName: string; topName: string; dealers: number }>(w, "horror_slain").map((e) => ({
    kind: "horror_slain", label: "Horror slain", emblem: "🌑", weight: 100,
    text: `Xal'Vorath stood at the gates of ${e.payload.targetName}'s kingdom and did not leave them. ${e.payload.killerName}'s host struck the last blow; ${e.payload.topName}, who had wounded it most, carried off the Heart of the Void.`
  })),
  ...eventsIn<{ targetName: string; level: number }>(w, "horror_burned").map((e) => ({
    kind: "horror_burned", label: "Horror burned a kingdom", emblem: "🌑", weight: 96,
    text: `No host could bring Xal'Vorath down within the hour. It tore down the walls of ${e.payload.targetName}'s kingdom, fed on the treasury and sank back into the rift while the city burned.`
  }))
];

/** 🔄 A comeback: a ruler beaten by another earlier in the week who later beat them */
export const comebacks: Detector = (w) => {
  const beaten = new Map<string, string>(); // "loser|winner" → when
  const out: ChronicleHappening[] = [];
  const told = new Set<string>();
  for (const r of reportsIn(w, RULER_TARGET)) {
    const winner = r.attacker_won ? { id: r.attacker_id, name: r.attacker_name } : { id: r.defender_id, name: r.defender_name };
    const loser = r.attacker_won ? { id: r.defender_id, name: r.defender_name } : { id: r.attacker_id, name: r.attacker_name };
    if (beaten.has(`${winner.id}|${loser.id}`) && !told.has(winner.id + loser.id)) {
      told.add(winner.id + loser.id);
      out.push({ kind: "comeback", label: "Comeback", emblem: "🔄", weight: 62, text: `${winner.name}, beaten by ${loser.name} earlier in the week, came back and beat them in turn.` });
    }
    beaten.set(`${loser.id}|${winner.id}`, r.timestamp);
  }
  return out;
};

/* ------------------------------------------------------------------------- */
/* Titles, civilizations, deeds                                              */
/* ------------------------------------------------------------------------- */

/** 🏅 Milestone titles earned this week (the highest tier of each category is kept, so a title shows the week it was reached) */
export const newTitles: Detector = (w) =>
  (
    db.prepare(`SELECT user_id, title_name, emblem, tier FROM user_earned_titles WHERE unlocked_at >= ? AND unlocked_at < ? ORDER BY tier DESC, unlocked_at ASC LIMIT 8`).all(w.fromIso, w.toIso) as Array<{
      user_id: string;
      title_name: string;
      emblem: string;
      tier: number;
    }>
  ).map((t) => ({ kind: "title", label: "New title", emblem: t.emblem || "🏅", weight: 30 + t.tier * 8, text: `${nameOf(t.user_id)} earned the title ${t.title_name}.` }));

/** 🤝 Civilization swaps agreed this week */
export const civSwaps: Detector = (w) =>
  (
    db.prepare(`SELECT from_id, to_id, from_civ, to_civ FROM civ_swap_proposals WHERE status = 'accepted' AND resolved_at >= ? AND resolved_at < ?`).all(w.from, w.to) as Array<{
      from_id: string;
      to_id: string;
      from_civ: CivilizationType;
      to_civ: CivilizationType;
    }>
  ).map((s) => ({
    kind: "civ_swap", label: "Peoples traded",
    emblem: "🤝",
    weight: 40,
    text: `${nameOf(s.from_id)} and ${nameOf(s.to_id)} traded their peoples: ${nameOf(s.from_id)} now rules among the ${CIV_PEOPLE[s.to_civ]}, ${nameOf(s.to_id)} among the ${CIV_PEOPLE[s.from_civ]}.`
  }));

/** 📜 Deeds sealed by the Crown this week, per ruler */
export const deedsSealed: Detector = (w) =>
  (
    db
      .prepare(`SELECT user_id, COUNT(*) AS n, SUM(xp) AS xp FROM deeds WHERE status = 'sealed' AND reviewed_at >= ? AND reviewed_at < ? GROUP BY user_id ORDER BY n DESC LIMIT 5`)
      .all(w.fromIso, w.toIso) as Array<{ user_id: string; n: number; xp: number }>
  ).map((d) => ({ kind: "deeds", label: "Deeds sealed", emblem: "📜", weight: 25 + Math.min(15, d.n * 3), text: `The Crown set its seal on ${d.n} ${d.n === 1 ? "deed" : "deeds"} of ${nameOf(d.user_id)}.` }));

/* ------------------------------------------------------------------------- */
/* World disasters                                                           */
/* ------------------------------------------------------------------------- */

/** What a disaster's tally counted, told as losses */
const TALLY_TOLD: Record<string, (n: number) => string> = {
  road: (n) => `${fmt(n)} marchers lost on the roads`,
  plague: (n) => `${fmt(n)} townsfolk taken by the plague`,
  births: (n) => `${fmt(n)} children never born`,
  void_well: (n) => `${fmt(n)} fallen the Void Well never gave back`,
  withheld: (n) => `${fmt(n)} measures of harvest the blight withheld`,
  rounds: (n) => `${fmt(n)} rounds of battle under the red moon`,
  fallen: (n) => `${fmt(n)} soldiers fallen in them`
};

/** ⛈️ Disasters survived: who coped, who suffered, and what it cost */
export const disastersSurvived: Detector = (w) =>
  eventsIn<{ kind: DisasterKind; name?: string; coped?: CivilizationType; suffered?: CivilizationType; tally?: Record<string, Record<string, number>> }>(w, "disaster_end").map((e) => {
    const p = e.payload;
    const d = DISASTERS[p.kind];
    const coped = p.coped ?? d?.copes;
    const suffered = p.suffered ?? d?.suffers;
    const costs = Object.entries(p.tally ?? {}).flatMap(([civ, t]) => {
      const parts = Object.entries(t ?? {})
        .filter(([k, n]) => n > 0 && TALLY_TOLD[k])
        .map(([k, n]) => TALLY_TOLD[k](n));
      return parts.length ? [`the ${CIV_PEOPLE[civ as CivilizationType] ?? civ}: ${parts.join(", ")}`] : [];
    });
    return {
      kind: "disaster", label: p.name ?? d?.name ?? "Disaster",
      emblem: d?.emblem ?? "⛈️",
      weight: 68,
      text: `The ${p.name ?? d?.name ?? "disaster"} swept the realm and the realm survived it. ${coped ? `The ${CIV_PEOPLE[coped]} coped best` : ""}${coped && suffered ? "; " : ""}${suffered ? `the ${CIV_PEOPLE[suffered]} suffered most` : ""}. ${costs.length ? `It cost ${costs.join("; ")}.` : "It passed without a scratch."}`
    };
  });

/* ------------------------------------------------------------------------- */
/* Mercenaries                                                               */
/* ------------------------------------------------------------------------- */

/** How much a fallen band weighs in the story, by rarity */
const MERC_DEATH_WEIGHT: Record<string, number> = { common: 18, uncommon: 24, rare: 32, epic: 44, legendary: 62 };

/** 💀 Mercenary bands wiped out this week (the rarer, the bigger) */
export const mercenaryDeaths: Detector = (w) =>
  eventsIn<{ rarity: string; name: string; emblem?: string; place: string; owner?: string }>(w, "mercenary_death")
    .sort((a, b) => (MERC_DEATH_WEIGHT[b.payload.rarity] ?? 0) - (MERC_DEATH_WEIGHT[a.payload.rarity] ?? 0))
    .slice(0, 6)
    .map((e) => ({
      kind: "mercenary_death",
      label: "Mercenaries fell",
      emblem: "💀",
      weight: MERC_DEATH_WEIGHT[e.payload.rarity] ?? 18,
      text: `${e.payload.name}, the ${e.payload.rarity} sellswords of ${nameOf(e.actorId) || e.payload.owner}, fought to the last at ${e.payload.place} and did not come home.`
    }));

/** 👑 Legendary mercenaries hired this week (a camp sees one a day at most) */
export const legendaryHires: Detector = (w) =>
  eventsIn<{ rarity: string; name: string; emblem?: string; camp: string; hirer?: string }>(w, "mercenary_hire")
    .filter((e) => e.payload.rarity === "legendary")
    .map((e) => ({
      kind: "legendary_hire",
      label: "Legend for hire",
      emblem: e.payload.emblem ?? "👑",
      weight: 50,
      text: `At ${e.payload.camp}, ${nameOf(e.actorId) || e.payload.hirer} paid a king's ransom for ${e.payload.name}, a legend who marches alone.`
    }));

/** 🦸 Champions' Finales that broke the last of an enemy army this week (the most armies broken first) */
export const championFinales: Detector = (w) =>
  eventsIn<{ name: string; finale: string; broke: string[]; place: string }>(w, "champion_finale")
    .sort((a, b) => (b.payload.broke?.length ?? 0) - (a.payload.broke?.length ?? 0))
    .slice(0, 4)
    .map((e) => ({
      kind: "champion_finale",
      label: "A champion's Finale",
      emblem: "🎺",
      weight: 30 + 6 * Math.min(4, e.payload.broke?.length ?? 1),
      text: `At ${e.payload.place}, ${e.payload.name}, champion of ${nameOf(e.actorId) || "a far kingdom"}, loosed ${e.payload.finale} and broke the last of ${(e.payload.broke ?? []).join(" and ") || "the enemy"}.`
    }));

/** 🦸 Champions who reached a great level this week (10, 20, the peak at 30) */
export const championMilestones: Detector = (w) =>
  eventsIn<{ name: string; level: number }>(w, "champion_level")
    .sort((a, b) => b.payload.level - a.payload.level)
    .slice(0, 5)
    .map((e) => ({
      kind: "champion_level",
      label: "A champion's renown",
      emblem: "🦸",
      weight: e.payload.level >= 30 ? 55 : e.payload.level >= 20 ? 35 : 20,
      text:
        e.payload.level >= 30
          ? `${e.payload.name}, champion of ${nameOf(e.actorId) || "a far kingdom"}, now stands among the greatest heroes the realm has known.`
          : `The songs of ${e.payload.name}, champion of ${nameOf(e.actorId) || "a far kingdom"}, spread further: their renown has grown to the ${e.payload.level}th rank.`
    }));

/* ------------------------------------------------------------------------- */
/* The registry                                                              */
/* ------------------------------------------------------------------------- */

/** Every detector the digest runs, in no particular order (facts are sorted by weight) */
export const DETECTORS: Array<{ id: string; detect: Detector }> = [
  { id: "voidrift_claims", detect: voidriftClaims },
  { id: "voidrift_persistence", detect: voidriftPersistence },
  { id: "voidrift_falls", detect: voidriftFalls },
  { id: "rare_finds", detect: rareFinds },
  { id: "boss_kills", detect: bossKills },
  { id: "horror", detect: horrorEnds },
  { id: "biggest_siege", detect: biggestSiege },
  { id: "longest_defence", detect: longestDefence },
  { id: "castles_burned", detect: castlesBurned },
  { id: "comebacks", detect: comebacks },
  { id: "new_titles", detect: newTitles },
  { id: "civ_swaps", detect: civSwaps },
  { id: "deeds_sealed", detect: deedsSealed },
  { id: "disasters", detect: disastersSurvived },
  { id: "mercenary_deaths", detect: mercenaryDeaths },
  { id: "legendary_hires", detect: legendaryHires },
  { id: "champion_finales", detect: championFinales },
  { id: "champion_milestones", detect: championMilestones }
];

/* ------------------------------------------------------------------------- */
/* The week's labour, translated                                             */
/* ------------------------------------------------------------------------- */

/** How each civilization's work is told: never as commits or lines */
const LABOUR_TOLD: Record<CivilizationType, (works: number, stones: number, hands: number) => string> = {
  human: (n, s, h) => `The bells of Valoria rang through ${fmt(n)} watches as ${h} ${h === 1 ? "lord" : "lords"} raised ${fmt(s)} stones of new walls.`,
  elf: (n, s, h) => `The looms of Sylvandale wove ${fmt(n)} songs into the great trees; ${h} ${h === 1 ? "elf" : "elves"} set ${fmt(s)} new leaves upon them.`,
  dwarf: (n, s, h) => `The forges of Ironforge rang through ${fmt(n)} nights; ${h} ${h === 1 ? "smith" : "smiths"} hammered out ${fmt(s)} ingots of steel.`,
  orc: (n, s, h) => `The war drums of Drak'mar beat ${n === 1 ? "once" : `${fmt(n)} times`} as ${h} ${h === 1 ? "warlord" : "warlords"} piled ${fmt(s)} stones on their strongholds.`,
  arcane: (n, s, h) => `In the Voidrift, ${h} ${h === 1 ? "sorcerer" : "sorcerers"} etched ${fmt(n)} runes and bound ${fmt(s)} motes of starlight.`
};

/** Lines of work it takes to lay one stone in the legend */
const LINES_PER_STONE = 10;

/** The week's work per civilization, and the most tireless ruler, as legend lines */
export function realmLabour(w: ChronicleWeek): string[] {
  // Each commit goes to one ruler, as the realm credits it: by login, or else (when no developer holds it by login)
  // by one of the ruler's emails, unless an admin matched that email per repo
  const users = db.prepare(`SELECT id, username, email, civilization FROM users`).all() as Array<{ id: string; username: string | null; email: string | null; civilization: CivilizationType | null }>;
  const byId = new Map(users.map((u) => [u.id, u]));
  const byUsername = new Map(users.filter((u) => u.username).map((u) => [u.username!.toLowerCase(), u]));
  const byEmail = new Map<string, (typeof users)[number]>();
  for (const u of users) if (u.email) byEmail.set(u.email.toLowerCase(), u);
  for (const e of db.prepare(`SELECT email, user_id FROM user_emails`).all() as Array<{ email: string; user_id: string }>) {
    const u = byId.get(e.user_id);
    if (u) byEmail.set(e.email.toLowerCase(), u);
  }
  const repoMatched = new Set((db.prepare(`SELECT email, repo_id FROM repo_emails`).all() as Array<{ email: string; repo_id: string }>).map((r) => `${r.email.toLowerCase()}|${r.repo_id}`));
  const commits = db
    .prepare(`SELECT repo_id, author_login, author_email, COALESCE(meaningful_lines, lines_added, 0) AS lines FROM commits WHERE datetime(committed_at) >= datetime(?) AND datetime(committed_at) < datetime(?)`)
    .all(w.fromIso, w.toIso) as Array<{ repo_id: string; author_login: string | null; author_email: string | null; lines: number }>;
  const byCiv = new Map<CivilizationType, { works: number; lines: number; hands: Set<string> }>();
  for (const c of commits) {
    let u = c.author_login ? byId.get(c.author_login) ?? byUsername.get(c.author_login.toLowerCase()) : undefined;
    if (!u && c.author_email && !repoMatched.has(`${c.author_email.toLowerCase()}|${c.repo_id}`)) u = byEmail.get(c.author_email.toLowerCase());
    if (!u?.civilization) continue;
    const t = byCiv.get(u.civilization) ?? { works: 0, lines: 0, hands: new Set<string>() };
    t.works += 1;
    t.lines += c.lines ?? 0;
    t.hands.add(u.id);
    byCiv.set(u.civilization, t);
  }
  const rows = [...byCiv].map(([civ, t]) => ({ civ, works: t.works, lines: t.lines, hands: t.hands.size })).sort((a, b) => b.works - a.works);
  const lines = rows.filter((r) => LABOUR_TOLD[r.civ]).map((r) => LABOUR_TOLD[r.civ](r.works, Math.max(1, Math.round((r.lines ?? 0) / LINES_PER_STONE)), r.hands));
  const tireless = db
    .prepare(`SELECT user_id, SUM(active) AS days FROM dev_daily_stats WHERE day >= ? AND day < ? GROUP BY user_id HAVING days >= 5 ORDER BY days DESC, SUM(xp) DESC LIMIT 1`)
    .get(w.fromIso.slice(0, 10), w.toIso.slice(0, 10)) as { user_id: string; days: number } | undefined;
  if (tireless) lines.push(`${nameOf(tireless.user_id)} laboured on ${tireless.days === 7 ? "every one of the seven days" : `${tireless.days} of the seven days`}, and never once laid down their tools.`);
  return lines;
}
