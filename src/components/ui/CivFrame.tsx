import { useId } from "react";
import { CivilizationType } from "@/types";

/*
 * Avatar with a frame in the ruler's civilization style: gold laurels (human), a silver leaf vine (elf),
 * a riveted iron ring (dwarf), bone tusks on red leather (orc), a glowing void ring (Nethergarde).
 * Special Overseers wear the violet ring with a gold star pip; the Archon of the Realm a crimson ring with a
 * flickering molten-gold rim and the Archon's Seal (the overseer's starburst in crimson and gold).
 * A ruler in the Hall of Renown's All time top 3 keeps their civ frame but it is crowned: a sunburst of rays behind it,
 * a laurel wreath up both sides, a crown on top and a place medallion on a ribbon below, all in gold / silver / bronze.
 * These spill past the avatar box (overflow visible) so the avatar itself stays the same size.
 */

/** Hall of Renown All time: metal (light → dark), medallion text, and how grand each place is */
const RENOWN_METAL: Record<1 | 2 | 3, { rim: [string, string, string]; text: string; ribbon: string; rays: number; leaves: number; crown: { points: number; w: number; h: number } }> = {
  1: { rim: ["#fef9c3", "#fbbf24", "#92400e"], text: "#451a03", ribbon: "#b91c1c", rays: 19.6, leaves: 7, crown: { points: 5, w: 11, h: 6 } },
  2: { rim: ["#ffffff", "#cbd5e1", "#475569"], text: "#0f172a", ribbon: "#1d4ed8", rays: 18.6, leaves: 6, crown: { points: 3, w: 9, h: 5 } },
  3: { rim: ["#fed7aa", "#fb923c", "#7c2d12"], text: "#431407", ribbon: "#15803d", rays: 17.8, leaves: 5, crown: { points: 3, w: 7.6, h: 4.2 } }
};

/** Crown path: `points` tips across `w`, rising `h` above the band at y = base */
function crownPath(points: number, w: number, h: number, base = 2.9): string {
  const x0 = C - w / 2;
  const step = w / (points - 1);
  let d = `M${x0} ${base} L${x0} ${base - h}`;
  for (let i = 1; i < points; i++) {
    d += ` L${(x0 + step * (i - 0.5)).toFixed(2)} ${(base - h * 0.42).toFixed(2)} L${(x0 + step * i).toFixed(2)} ${(base - h).toFixed(2)}`;
  }
  return `${d} L${x0 + w} ${base} Z`;
}

/** Sunburst, laurel wreath, crown and place medallion of an All time top-3 ruler (rays are drawn behind the frame) */
function RenownCrest({ place, gid, layer }: { place: 1 | 2 | 3; gid: string; layer: "back" | "front" }) {
  const m = RENOWN_METAL[place];
  const fill = `url(#${gid}metal)`;
  if (layer === "back") {
    const rays = Array.from({ length: 16 }, (_, i) => {
      const deg = i * 22.5;
      const outer = i % 2 ? m.rays - 1.6 : m.rays;
      const [x1, y1] = at(13.5, deg - 5);
      const [x2, y2] = at(outer, deg);
      const [x3, y3] = at(13.5, deg + 5);
      return `M${x1.toFixed(2)} ${y1.toFixed(2)} L${x2.toFixed(2)} ${y2.toFixed(2)} L${x3.toFixed(2)} ${y3.toFixed(2)} Z`;
    }).join(" ");
    return (
      <g opacity={0.75}>
        <path d={rays} fill={m.rim[1]}>
          {place === 1 && <animateTransform attributeName="transform" type="rotate" from={`0 ${C} ${C}`} to={`360 ${C} ${C}`} dur="40s" repeatCount="indefinite" />}
        </path>
      </g>
    );
  }
  // Laurel leaves up both sides, from the medallion to below the crown
  const leaves = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < m.leaves; i++) {
      const deg = 180 + side * (22 + (i * 118) / (m.leaves - 1));
      const [x, y] = at(16.4, deg);
      leaves.push(<ellipse key={`${side}-${i}`} cx={x} cy={y} rx={2} ry={0.9} fill={fill} stroke={m.rim[2]} strokeWidth={0.25} transform={`rotate(${deg + side * 35} ${x} ${y})`} />);
    }
  }
  const { points, w, h } = m.crown;
  return (
    <>
      <circle cx={C} cy={C} r={15.2} fill="none" stroke={fill} strokeWidth={1.1} />
      {leaves}
      {/* Crown */}
      <path d={crownPath(points, w, h)} fill={fill} stroke={m.rim[2]} strokeWidth={0.45} strokeLinejoin="round" />
      <rect x={C - w / 2} y={2.2} width={w} height={1.5} rx={0.4} fill={m.rim[2]} />
      {Array.from({ length: points }, (_, i) => (
        <circle key={i} cx={C - w / 2 + (w / (points - 1)) * i} cy={2.9 - h} r={0.65} fill={m.rim[0]} stroke={m.rim[2]} strokeWidth={0.2} />
      ))}
      <circle cx={C} cy={2.95} r={0.6} fill="#dc2626" />
      {place === 1 && (
        <path d="M6 5.5 l0.6 1.4 1.4 0.6 -1.4 0.6 -0.6 1.4 -0.6 -1.4 -1.4 -0.6 1.4 -0.6 Z" fill="#fffbeb">
          <animate attributeName="opacity" values="0;0;1;0;0" dur="3.2s" repeatCount="indefinite" />
        </path>
      )}
      {/* Place medallion on a ribbon */}
      <path d={`M${C - 3.2} 28.6 L${C - 4.6} 33.4 L${C - 2.6} 32.4 L${C - 1.6} 34 L${C} 29.4 Z`} fill={m.ribbon} />
      <path d={`M${C + 3.2} 28.6 L${C + 4.6} 33.4 L${C + 2.6} 32.4 L${C + 1.6} 34 L${C} 29.4 Z`} fill={m.ribbon} />
      <circle cx={C} cy={28.4} r={3.5} fill={fill} stroke={m.rim[2]} strokeWidth={0.5} />
      <text x={C} y={28.6} textAnchor="middle" dominantBaseline="central" fontSize={4.6} fontWeight={900} fill={m.text}>
        {place}
      </text>
    </>
  );
}

interface FrameStyle {
  ring: [string, string];
  fill: string;
  text: string;
  label: string;
}

const STYLES: Record<CivilizationType, FrameStyle> = {
  human: { ring: ["#fde68a", "#b45309"], fill: "#1e3a8a", text: "#fef3c7", label: "Human" },
  elf: { ring: ["#e2e8f0", "#64748b"], fill: "#115e59", text: "#ccfbf1", label: "Elf" },
  dwarf: { ring: ["#94a3b8", "#334155"], fill: "#44403c", text: "#fde68a", label: "Dwarf" },
  orc: { ring: ["#b91c1c", "#450a0a"], fill: "#3f2a1d", text: "#fecaca", label: "Orc" },
  arcane: { ring: ["#c4b5fd", "#5b21b6"], fill: "#2e1065", text: "#ede9fe", label: "Nethergarde" }
};

/** The Archon of the Realm's crimson frame */
const ARCHON: FrameStyle = { ring: ["#fca5a5", "#7f1d1d"], fill: "#450a0a", text: "#fde68a", label: "Archon of the Realm" };

/** Eight-point starburst round (cx, cy): the overseer's star, which the Archon's Seal wears in crimson and gold */
const starburst = (cx: number, cy: number, r: number, inner: number) =>
  Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? inner : r;
    return `${i ? "L" : "M"}${(cx + Math.cos(a) * rr).toFixed(2)} ${(cy + Math.sin(a) * rr).toFixed(2)}`;
  }).join(" ") + " Z";

/** The Archon's Seal on its own (kingdom picker, profile, castle badges) */
export function ArchonSeal({ className = "w-4 h-4", title = "Archon's Seal · Archon of the Realm" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} role="img" aria-label={title}>
      <title>{title}</title>
      <path d={starburst(10, 10, 9.4, 4.6)} fill="#b91c1c" stroke="#fbbf24" strokeWidth={0.9} strokeLinejoin="round" />
      <circle cx={10} cy={10} r={3.2} fill="#fbbf24" stroke="#7f1d1d" strokeWidth={0.6} />
    </svg>
  );
}

const C = 16;
const at = (r: number, deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [C + Math.cos(a) * r, C + Math.sin(a) * r] as const;
};

/** Decorations drawn on the ring, per civilization */
function Ornaments({ civ, gid }: { civ: CivilizationType; gid: string }) {
  if (civ === "human") {
    // Laurel leaves up both sides, open at the top
    const leaves = [];
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const deg = 180 + side * (30 + i * 26);
        const [x, y] = at(13.6, deg);
        leaves.push(<ellipse key={`${side}${i}`} cx={x} cy={y} rx={1.1} ry={2.2} fill="#fbbf24" stroke="#92400e" strokeWidth={0.3} transform={`rotate(${deg + side * 35} ${x} ${y})`} />);
      }
    }
    return <>{leaves}</>;
  }
  if (civ === "elf") {
    // A vine of small leaves winding round the ring
    return (
      <>
        {Array.from({ length: 8 }, (_, i) => {
          const deg = i * 45 + 20;
          const [x, y] = at(13.8, deg);
          return <path key={i} d={`M${x} ${y} q 1.6 -1.6 3 0 q -1.6 1.6 -3 0 Z`} fill="#5eead4" stroke="#0f766e" strokeWidth={0.25} transform={`rotate(${deg} ${x} ${y})`} />;
        })}
      </>
    );
  }
  if (civ === "dwarf") {
    // Rivets and rune notches
    return (
      <>
        {Array.from({ length: 8 }, (_, i) => {
          const [x, y] = at(13.6, i * 45);
          return <circle key={i} cx={x} cy={y} r={1.05} fill="#e2e8f0" stroke="#1e293b" strokeWidth={0.35} />;
        })}
        {Array.from({ length: 8 }, (_, i) => {
          const [x1, y1] = at(12.4, i * 45 + 22.5);
          const [x2, y2] = at(14.8, i * 45 + 22.5);
          return <line key={`n${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fbbf24" strokeWidth={0.6} />;
        })}
      </>
    );
  }
  if (civ === "orc") {
    // Two bone tusks curling up from the bottom
    return (
      <>
        <path d="M9.5 27.5 Q 5 26 4.5 19.5 Q 7 24 11 25.5 Z" fill="#f5f5f4" stroke="#57534e" strokeWidth={0.4} />
        <path d="M22.5 27.5 Q 27 26 27.5 19.5 Q 25 24 21 25.5 Z" fill="#f5f5f4" stroke="#57534e" strokeWidth={0.4} />
        {Array.from({ length: 6 }, (_, i) => {
          const [x, y] = at(13.6, i * 30 - 75);
          return <circle key={i} cx={x} cy={y} r={0.55} fill="#fca5a5" />;
        })}
      </>
    );
  }
  // Nethergarde: soft void glow and drifting motes
  return (
    <>
      <circle cx={C} cy={C} r={15.2} fill="none" stroke={`url(#${gid}glow)`} strokeWidth={1.4} opacity={0.8} />
      {[30, 140, 250, 320].map((deg, i) => {
        const [x, y] = at(14.6, deg);
        return <circle key={i} cx={x} cy={y} r={i % 2 ? 0.8 : 1.1} fill="#e9d5ff" />;
      })}
    </>
  );
}

export function CivFrame({
  civ,
  initial,
  overseer = false,
  archon = false,
  renown = null,
  className = "w-7 h-7"
}: {
  civ?: CivilizationType | null;
  initial: string;
  /** Special Overseer: violet ring with a gold star pip */
  overseer?: boolean;
  /** Archon of the Realm: crimson ring, molten-gold flicker and the Archon's Seal */
  archon?: boolean;
  /** Hall of Renown All time place (1–3): the crowned frame (rays, laurels, crown, medallion) */
  renown?: 1 | 2 | 3 | null;
  className?: string;
}) {
  const gid = useId().replace(/:/g, "");
  const key: CivilizationType = overseer || archon ? "arcane" : civ ?? "human";
  const s = archon ? ARCHON : STYLES[key];
  if (!civ && !overseer && !archon) {
    // No kingdom yet: plain badge
    return <span className={`${className} rounded-full bg-emerald-600 text-[10px] font-bold text-white flex items-center justify-center uppercase`}>{initial}</span>;
  }
  const metal = renown ? RENOWN_METAL[renown] : null;
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      style={metal ? { overflow: "visible", filter: `drop-shadow(0 0 ${renown === 1 ? 3 : 2}px ${metal.rim[1]}99)` } : undefined}
      role="img"
      aria-label={`${archon ? s.label : overseer ? "Special Overseer" : s.label} frame${metal ? ` · Hall of Renown #${renown} of all time` : ""}`}
    >
      <defs>
        <linearGradient id={`${gid}ring`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={s.ring[0]} />
          <stop offset="1" stopColor={s.ring[1]} />
        </linearGradient>
        <radialGradient id={`${gid}glow`}>
          <stop offset="0.7" stopColor="#a78bfa" stopOpacity="0" />
          <stop offset="1" stopColor="#a78bfa" stopOpacity="0.9" />
        </radialGradient>
        {metal && (
          <linearGradient id={`${gid}metal`} x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0" stopColor={metal.rim[0]} />
            <stop offset="0.45" stopColor={metal.rim[1]} />
            <stop offset="1" stopColor={metal.rim[2]} />
          </linearGradient>
        )}
      </defs>
      {renown && <RenownCrest place={renown} gid={gid} layer="back" />}
      <circle cx={C} cy={C} r={13.6} fill={s.fill} stroke={`url(#${gid}ring)`} strokeWidth={2.6} />
      {archon ? (
        // Molten gold running round the rim, flickering
        <circle cx={C} cy={C} r={15.1} fill="none" stroke="#fbbf24" strokeWidth={1.1} strokeDasharray="5 2.2 1.4 2.2">
          <animate attributeName="opacity" values="0.95;0.55;1;0.7;0.95" dur="1.7s" repeatCount="indefinite" />
          <animateTransform attributeName="transform" type="rotate" from={`0 ${C} ${C}`} to={`360 ${C} ${C}`} dur="14s" repeatCount="indefinite" />
        </circle>
      ) : (
        <Ornaments civ={key} gid={gid} />
      )}
      <text x={C} y={C + 0.5} textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={700} fill={s.text} style={{ textTransform: "uppercase" }}>
        {initial.toUpperCase()}
      </text>
      {archon && <path d={starburst(16, 3.6, 3.5, 1.7)} fill="#b91c1c" stroke="#fbbf24" strokeWidth={0.45} strokeLinejoin="round" />}
      {overseer && !archon && <path d="M16 0.6 l1.2 2.5 2.7 0.3 -2 1.9 0.5 2.7 -2.4 -1.3 -2.4 1.3 0.5 -2.7 -2 -1.9 2.7 -0.3 Z" fill="#fbbf24" stroke="#78350f" strokeWidth={0.3} />}
      {renown && <RenownCrest place={renown} gid={gid} layer="front" />}
    </svg>
  );
}
