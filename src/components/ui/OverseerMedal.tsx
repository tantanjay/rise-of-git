import { useId } from "react";

/*
 * Special Overseer's medal: a gold starburst behind a violet enamel cross pattée, a gold-rimmed
 * amethyst centre with a star, hung from a violet ribbon with a gold stripe.
 */

const CX = 12;
const CY = 19;
const pt = (r: number, deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return `${(CX + Math.cos(a) * r).toFixed(2)},${(CY + Math.sin(a) * r).toFixed(2)}`;
};

/** 16-point starburst, alternating long and short rays */
const BURST = Array.from({ length: 32 }, (_, i) => pt(i % 2 ? 7.2 : 10.2, i * 11.25)).join(" ");
/** Four flared arms: narrow at the centre, wide at the tips */
const CROSS_ARMS = [45, 135, 225, 315].map((a) => `M${pt(1.8, a - 32)} L${pt(8.6, a - 22)} Q${pt(7.7, a)} ${pt(8.6, a + 22)} L${pt(1.8, a + 32)} Z`);
/** Five-point star in the centre */
const STAR = Array.from({ length: 10 }, (_, i) => pt(i % 2 ? 0.75 : 1.8, i * 36)).join(" ");

export function OverseerMedal({ className = "w-5 h-6" }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 24 30" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}rib`} x1="0" x2="1">
          <stop offset="0" stopColor="#4c1d95" />
          <stop offset="0.5" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#4c1d95" />
        </linearGradient>
        <linearGradient id={`${id}gold`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fef3c7" />
          <stop offset="0.5" stopColor="#f59e0b" />
          <stop offset="1" stopColor="#b45309" />
        </linearGradient>
        <linearGradient id={`${id}enamel`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c4b5fd" />
          <stop offset="0.45" stopColor="#7c3aed" />
          <stop offset="1" stopColor="#3b0764" />
        </linearGradient>
        <radialGradient id={`${id}core`} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#f5d0fe" />
          <stop offset="0.5" stopColor="#a21caf" />
          <stop offset="1" stopColor="#3b0764" />
        </radialGradient>
      </defs>
      {/* Ribbon: two violet tails with a gold stripe */}
      <path d="M5 0h6l2.2 10.5h-5z" fill={`url(#${id}rib)`} />
      <path d="M13 0h6l-3.2 10.5h-5z" fill={`url(#${id}rib)`} />
      <path d="M11 0h2l.4 9h-2.8z" fill="#fbbf24" />
      {/* Starburst */}
      <polygon points={BURST} fill={`url(#${id}gold)`} />
      {/* Enamel cross with gold edging */}
      {CROSS_ARMS.map((d) => (
        <path key={d} d={d} fill={`url(#${id}enamel)`} stroke="#fde68a" strokeWidth="0.55" strokeLinejoin="round" />
      ))}
      {/* Centre medallion */}
      <circle cx={CX} cy={CY} r="3.5" fill={`url(#${id}gold)`} />
      <circle cx={CX} cy={CY} r="2.7" fill={`url(#${id}core)`} />
      <polygon points={STAR} fill="#fef3c7" />
    </svg>
  );
}

/** The Archon of the Realm's fixed title (shown with the Archon's Seal) */
export const ARCHON_TITLE = {
  name: "Archon Eternal",
  description: "Archon of the Realm, above the overseers. Untouchable: never attacked, rallied on or scouted. Empyrean castle Lv30 and 50 Celestial buildings."
};

/** The one title every Special Overseer holds instead of the milestone titles */
export const OVERSEER_TITLE = {
  name: "Eternal Overseer of the Voidrift",
  description: "Warden of Nethergarde. Improvements fixed at maximum; fights with the Overseer's Resolve instead of title buffs."
};
