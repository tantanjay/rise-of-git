import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";

/**
 * Draw the shadow map only when the static scene changes instead of every frame.
 * Anything that moves should not cast shadows while this is active (its shadow would freeze).
 * Restores per-frame shadows on unmount.
 */
export function useStaticShadows(deps: unknown[]) {
  const gl = useThree((s) => s.gl);
  const pending = useRef(0);
  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    return () => {
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl]);
  // Redraw for a few frames after a change so instanced/merged meshes have settled.
  // deps is caller-provided, so compare it by hand after every render instead of passing it to useEffect.
  const prevDeps = useRef<unknown[] | null>(null);
  useEffect(() => {
    const prev = prevDeps.current;
    if (prev && prev.length === deps.length && prev.every((d, i) => Object.is(d, deps[i]))) return;
    prevDeps.current = deps;
    pending.current = 3;
  });
  useFrame(() => {
    if (pending.current > 0) {
      pending.current--;
      gl.shadowMap.needsUpdate = true;
    }
  });
}
