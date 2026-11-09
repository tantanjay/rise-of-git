import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoginFlyover, FlyoverParts, FrameInfo, FT, loadFlyover } from "./LoginFlyover";
import { graphics } from "@/utils/graphics";
import { PixelBurn } from "./pixelBurn";

/* ------------------------------------------------------------------------- */
/* Login screen: the HD flyover over the realm (LoginFlyover), a pixel-fire   */
/* reveal from black at the start of each loop, and the sign-in card (always */
/* visible). Black until the flyover has loaded (its realm and chunks).      */
/* ------------------------------------------------------------------------- */

export function LoginScreen({
  onSignIn,
  onGuest,
  notice
}: {
  /** Starts Git sign-in (absent when the server has no OAuth set up) */
  onSignIn?: () => void;
  /** "Look around without signing in": only when the server allows guests (GUEST_BROWSING) */
  onGuest?: () => void;
  /** A line under the button (sign-in failed, not configured, server unreachable) */
  notice?: string | null;
}) {
  const maskRef = useRef<HTMLCanvasElement>(null);
  const burner = useRef<PixelBurn | null>(null);
  burner.current ??= new PixelBurn();
  const lastT = useRef(0);
  const cleared = useRef(false);
  // The flyover has drawn its first frame (until then the mask stays black over the realm being built)
  const started = useRef(false);
  const [signingIn, setSigningIn] = useState(false);
  const reducedMotion = useMemo(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, []);
  // The flyover's realm and chunks, once loaded
  const [parts, setParts] = useState<FlyoverParts | null>(null);

  useEffect(() => {
    let alive = true;
    loadFlyover().then(
      (p) => {
        if (!alive) return;
        // HD from its first frame (the flyover keeps it while it plays, and hands back the player's own quality after)
        graphics.preview("hd");
        setParts(p);
      },
      () => {}
    );
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const resize = () => {
      const c = maskRef.current;
      if (!c) return;
      c.width = window.innerWidth;
      c.height = window.innerHeight;
      burner.current?.resize(c.width, c.height);
      cleared.current = false;
      const ctx = c.getContext("2d");
      if (ctx && !started.current) {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, c.width, c.height);
      }
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // Called by the flyover every frame with the loop time: the reveal from black at the start of each loop (the void
  // swallowing the screen at its end is the flyover's own). Paints without React state; once clear, left alone
  const onFrame = useCallback(
    ({ t }: FrameInfo) => {
      const ctx = maskRef.current?.getContext("2d");
      if (!ctx) return;
      started.current = true;
      // A new loop: fresh veins for the next reveal
      if (t < lastT.current) burner.current?.reseed();
      lastT.current = t;
      const burn = reducedMotion || t >= FT.reveal ? 1 : (t / (FT.reveal * 0.9)) ** 1.38 * 0.92;
      if (burn >= 1 && burner.current?.idle) {
        if (!cleared.current) ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        cleared.current = true;
        return;
      }
      cleared.current = false;
      burner.current?.draw(ctx, burn, 0, t);
    },
    [reducedMotion]
  );

  return (
    <div className="fixed inset-0 bg-black text-slate-100 select-none overflow-hidden">
      <div className="absolute inset-0">{parts && <LoginFlyover parts={parts} still={reducedMotion} onFrame={onFrame} />}</div>
      <canvas ref={maskRef} className="absolute inset-0 w-full h-full pointer-events-none" />

      {/* Sign-in card: always on top, even while the screen is black */}
      <div className="absolute inset-x-0 bottom-10 flex justify-center px-4">
        <div className="relative flex flex-col items-center gap-4 bg-slate-950/85 border border-amber-500/60 px-8 py-6 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.95)]">
          <span className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-amber-400 border border-slate-950" />
          <span className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-amber-400 border border-slate-950" />
          <span className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-purple-500 border border-slate-950" />
          <span className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-purple-500 border border-slate-950" />
          <h1 className="font-medieval text-2xl md:text-3xl font-black tracking-wider text-transparent bg-clip-text bg-linear-to-r from-amber-200 via-amber-400 to-purple-300 text-center">
            Rise of Git
          </h1>
          <button
            onClick={() => {
              if (!onSignIn) return;
              setSigningIn(true);
              onSignIn();
            }}
            disabled={signingIn || !onSignIn}
            className="login-glow group flex items-center gap-3 px-8 py-3.5 rounded-xl font-medieval font-extrabold text-sm md:text-base tracking-widest uppercase text-slate-950 bg-linear-to-r from-amber-300 via-amber-400 to-amber-500 hover:from-white hover:via-amber-200 hover:to-amber-400 active:scale-95 transition-all border-2 border-amber-100 disabled:opacity-70 cursor-pointer"
          >
            <svg className="w-5 h-5 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M4 4h13v7a6.5 6.5 0 0 1-13 0V4zm15 2h1a3 3 0 0 1 0 6h-1V6zM3 19h16v2H3v-2z" />
            </svg>
            {signingIn ? "Opening Git…" : "Sign in with Git"}
          </button>
          {notice && <p className="max-w-xs text-center text-xs text-rose-300">{notice}</p>}
          {onGuest && (
            <button onClick={onGuest} className="text-xs text-slate-400 hover:text-amber-200 underline-offset-4 hover:underline transition cursor-pointer">
              Look around without signing in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
