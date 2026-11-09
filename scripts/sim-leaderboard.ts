/**
 * npm run sim:leaderboard
 *
 * Hall of Renown fairness check (GAME_GUIDE §16): prints the worked examples of each axis and exits 1 if their order
 * changes. Quality: five Lv5 repos beat one Lv25 repo, and two Lv25 repos sit between them. Activeness and repo
 * activeness are rates, so the same pace over one or three years scores the same; a two-week newcomer is pulled
 * toward the realm average.
 */
import {
  repoQuality,
  repoQualityWeight,
  repoActivity,
  shrunkActiveness,
  activenessRate,
  percentiles,
  fairnessScore,
  workdaysBetween,
  periodWindow,
  TENURE_FLOOR_YEARS
} from "../server/src/leaderboardRules";

let failed = false;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? "✓" : "✗"} ${msg}`);
  if (!ok) failed = true;
};
const f1 = (n: number) => n.toFixed(1);
const rep = (n: number, level: number) => Array<number>(n).fill(level);

console.log("\nRepo quality — worth per repo: 1 + ln(level ÷ 3), Lv3+ only");
for (const l of [1, 2, 3, 5, 10, 25]) console.log(`  Lv${String(l).padEnd(2)} → ${repoQualityWeight(l).toFixed(2)}`);

const a = repoQuality([...rep(1, 25), ...rep(10, 1)]);
const b = repoQuality([...rep(5, 5), ...rep(5, 1)]);
const c = repoQuality([...rep(2, 25), ...rep(3, 1)]);
console.log(`\n  1×Lv25 + 10×Lv1 → ${f1(a)}\n  5×Lv5  +  5×Lv1 → ${f1(b)}\n  2×Lv25 +  3×Lv1 → ${f1(c)}\n`);
check(f1(a) === "3.1" && f1(b) === "7.6" && f1(c) === "6.2", "worked examples read 3.1 / 7.6 / 6.2");
check(b > c && c > a, "5×Lv5 beats 2×Lv25, which beats 1×Lv25");

console.log("\nRepo activeness — Σ √(XP per repo)");
const spread = repoActivity([25, 25, 25, 25]);
const hammer = repoActivity([100]);
console.log(`  100 XP over 4 repos → ${f1(spread)}   100 XP in 1 repo → ${f1(hammer)}`);
check(spread > hammer, "spreading the same work over repos counts for more");
const oneYear = repoActivity([400]) / Math.max(TENURE_FLOOR_YEARS, 1);
const threeYears = repoActivity([400 * 9]) / Math.max(TENURE_FLOOR_YEARS, 3); // same √ pace per year
console.log(`  all time, same pace: 1 year → ${f1(oneYear)}   3 years → ${f1(threeYears)}`);
check(Math.abs(oneYear - threeYears) < 1e-9, "all time divides by tenure, so 1 and 3 years at the same pace tie");

console.log("\nActiveness — active days ÷ working days");
const month = workdaysBetween("2026-09-01", "2026-09-30");
console.log(`  September 2026: ${month} working days; 20 active → ${activenessRate(20, month).toFixed(2)}`);
check(month === 22, "September 2026 has 22 working days");
const realm = 0.6;
const vet1 = shrunkActiveness(0.8 * 261, 261, realm);
const vet3 = shrunkActiveness(0.8 * 783, 783, realm);
const rookie = shrunkActiveness(10, 10, realm);
console.log(`  all time at 80%: 1 year → ${vet1.toFixed(3)}   3 years → ${vet3.toFixed(3)}   2-week newcomer at 100% → ${rookie.toFixed(3)} (realm 60%)`);
check(Math.abs(vet1 - vet3) < 0.02, "1 and 3 years at the same rate score (almost) the same");
check(rookie < vet1, "a 2-week perfect newcomer doesn't outrank a steady veteran");

console.log("\nFairness — percentiles, weighted 40 / 30 / 30");
const pct = percentiles([5, 3, 3, 1]);
console.log(`  percentiles of [5, 3, 3, 1] → ${pct.map(f1).join(", ")}`);
check(pct[0] === 100 && pct[3] === 0 && pct[1] === pct[2], "top = 100, bottom = 0, ties share");
check(fairnessScore(100, 100, 100) === 100, "a developer first on every axis scores 100");

console.log("\nPeriods (today = Sunday 18 Oct 2026, fiscal year from October)");
for (const p of ["week", "month", "year", "all"] as const) {
  const w = periodWindow(p, "2026-10-18", 10)!;
  console.log(`  ${p.padEnd(5)} ${w.from} → ${w.to}  ${w.label}`);
}
const wk = periodWindow("week", "2026-10-18", 10)!;
check(wk.from === "2026-10-05" && wk.to === "2026-10-11", "weekly = last full Mon–Sun");
const mo = periodWindow("month", "2026-10-18", 10)!;
check(mo.from === "2026-09-01" && mo.to === "2026-09-30", "monthly = last full calendar month");
const yr = periodWindow("year", "2026-10-18", 10)!;
check(yr.from === "2026-10-01" && yr.to === "2026-10-17", "year = 1 Oct → yesterday");

console.log(failed ? "\n✗ Leaderboard order changed" : "\n✓ Leaderboard examples hold");
process.exit(failed ? 1 : 0);
