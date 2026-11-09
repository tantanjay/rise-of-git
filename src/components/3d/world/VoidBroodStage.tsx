import { useMemo } from "react";
import { NPCRarity } from "@/types";
import { TierFx, TierFxItem, fxTierOf } from "@/components/3d/TierFx";
import { BossModel } from "./BossModel";
import { BossBatch, BossShowcase } from "./BossBatch";
import { BossActionId } from "./heroRig";
import { WARDEN_KOI_TYPE } from "./voidRigs";
import { MythicAura } from "./MythicAuraHD";
import { BROOD_SIZES, BroodId, VOID_BROODS, VOID_WARDEN, VG_WARDEN_TYPE, broodLineup, packOf, packSpread, vgType } from "./voidCreatures";

/*
 * The Void Gate's creatures in the Royal Codex (coming soon): a family's every size side by side (its progression), one
 * level's creature (playing an action in HD, or its whole pack), or the Gate Warden with the Oathbound's koi circling
 * his head as his guard. Each is a rigged hero, as the mercenaries are: its Normal rig drawn by `BossModel` with its
 * rarity's sparkles from the shared kit (`TierFx`: no curtain, no beam), its HD hero by `BossBatch` (every copy in the
 * same draws, its own embers from epic up). The koi are their own rig, reused as they are, grown and swimming a wide
 * ring round the Warden's head.
 */

/** A brood id, or the Warden */
export type BroodView = BroodId | "warden";

/** The Warden's head (its centre), and how big the koi's ring round it is */
const HEAD_Y = 6.01;
const KOI_SCALE = 1.15;
/** The koi's ring sits this high over their rig's feet */
const KOI_DISC = 1.6;
/** How far over the head their ring swims (above the crown of shards) */
const KOI_LIFT = 1.45;
const KOI_AT: [number, number, number] = [0, HEAD_Y + KOI_LIFT - KOI_DISC * KOI_SCALE, 0.05];

const rarityOf = (brood: BroodId, size: number): NPCRarity => VOID_BROODS.find((b) => b.id === brood)?.sizes[size]?.rarity ?? "common";

/** Where a pack's copies stand: ranks of five, each rank a little behind and offset */
function packSites(type: string, n: number, spread: number) {
  return Array.from({ length: n }, (_, i) => {
    const rank = Math.floor(i / 5);
    const inRank = Math.min(5, n - rank * 5);
    return { id: n > 1 ? `codex-${i}` : "codex", type, x: ((i % 5) - (inRank - 1) / 2) * spread + (rank % 2) * spread * 0.25, y: 0, z: -rank * spread * 1.1 + ((i * 7) % 3) * 0.08 * spread };
  });
}

/** The camera for a view: [distance, height, target] */
export function voidBroodFrame(brood: BroodView, size?: number, pack = false): [number, number, number] {
  if (brood === "warden") return [13, 6.2, 3.7];
  const f = BROOD_SIZES[brood];
  if (size !== undefined) {
    const h = f.height[size];
    const n = pack ? packOf(brood, size) : 1;
    const wide = n > 1 ? (Math.min(5, n) - 1) * packSpread(brood, size) + f.foot[size] * 2 : f.foot[size] * 2;
    const d = Math.max(h * 2.7, wide * 1.35, 2.4);
    return [d, Math.max(h * 0.85, d * 0.32), h * 0.5];
  }
  const slots = broodLineup(brood);
  const last = slots[slots.length - 1];
  const width = last.x + last.foot - (slots[0].x - slots[0].foot);
  const tall = Math.max(...f.height);
  const d = Math.max(width * 1.05, tall * 2.5);
  return [d, tall * 0.75, tall * 0.42];
}

export function VoidBroodStage({ brood, size, hd = false, action = "idle", pack = false }: { brood: BroodView; size?: number; hd?: boolean; action?: BossActionId; pack?: boolean }) {
  if (brood === "warden") return <WardenStage hd={hd} action={action} />;
  if (size === undefined) return <Lineup brood={brood} hd={hd} />;
  const type = vgType(brood, size);
  const n = pack ? packOf(brood, size) : 1;
  const spread = packSpread(brood, size);
  if (hd) return <BossShowcase key={`${type}:${n}`} type={type} action={action} band={n} spread={spread} />;
  return <NormalPack type={type} n={n} spread={spread} rarity={rarityOf(brood, size)} foot={BROOD_SIZES[brood].foot[size]} />;
}

/** One level's creatures in Normal: each its own rig, seeded by its id, striking and walking in turn */
function NormalPack({ type, n, spread, rarity, foot }: { type: string; n: number; spread: number; rarity: NPCRarity; foot: number }) {
  const sites = useMemo(() => packSites(type, n, spread), [type, n, spread]);
  const fx = useMemo<TierFxItem[]>(() => {
    const tier = fxTierOf(rarity);
    return tier ? sites.map((s) => ({ id: `codex-${s.id}-${type}`, x: s.x, y: 0, z: s.z, size: foot * 1.2, tier, beam: 0, shell: false })) : [];
  }, [sites, rarity, type, foot]);
  return (
    <>
      {sites.map((s) => (
        <group key={s.id} position={[s.x, 0, s.z]}>
          <BossModel type={type} showcase fx={false} seedId={s.id} />
        </group>
      ))}
      <TierFx items={fx} />
    </>
  );
}

/** A family's every size side by side, smallest first: they stand and breathe (an occasional strike) */
function Lineup({ brood, hd }: { brood: BroodId; hd: boolean }) {
  const slots = useMemo(() => broodLineup(brood), [brood]);
  const sites = useMemo(() => slots.map((s) => ({ id: `codex-lineup-${s.size}`, type: vgType(brood, s.size), x: s.x, y: 0, z: 0 })), [slots, brood]);
  const fx = useMemo<TierFxItem[]>(
    () =>
      slots.flatMap((s) => {
        const tier = fxTierOf(rarityOf(brood, s.size));
        return tier ? [{ id: `codex-lineup-${brood}-${s.size}`, x: s.x, y: 0, z: 0, size: s.foot * 1.2, tier, beam: 0, shell: false }] : [];
      }),
    [slots, brood]
  );
  if (hd) return <BossBatch key={brood} sites={sites} action="idle" />;
  return (
    <>
      {sites.map((s) => (
        <group key={s.id} position={[s.x, 0, 0]}>
          <BossModel type={s.type} fx={false} seedId={s.id} />
        </group>
      ))}
      <TierFx items={fx} />
    </>
  );
}

/** The Warden, with the Oathbound's koi each swimming a wide ring above his head */
function WardenStage({ hd, action }: { hd: boolean; action: BossActionId }) {
  const koi = useMemo(() => [{ id: "codex-warden-koi", type: WARDEN_KOI_TYPE, x: KOI_AT[0], y: KOI_AT[1], z: KOI_AT[2], scale: KOI_SCALE }], []);
  const fx = useMemo<TierFxItem[]>(() => {
    const tier = fxTierOf(VOID_WARDEN.rarity);
    return tier ? [{ id: "codex-warden", x: 0, y: 0, z: 0, size: 1.8, tier, beam: 0, shell: false }] : [];
  }, []);
  if (hd)
    return (
      <>
        <BossShowcase type={VG_WARDEN_TYPE} action={action} />
        <BossBatch sites={koi} action="idle" />
        {/* Mythic: the crimson curtain with its prismatic edge and embers round him (no beam over a boss) */}
        <MythicAura beams={[]} curtainRadius={2.9} curtainHeight={4.4} emberRadii={[1.3, 3.4]} emberHeight={8.5} embers={180} />
      </>
    );
  return (
    <>
      <BossModel type={VG_WARDEN_TYPE} showcase fx={false} />
      <TierFx items={fx} />
      <group position={KOI_AT} scale={KOI_SCALE}>
        <BossModel type={WARDEN_KOI_TYPE} fx={false} />
      </group>
    </>
  );
}
