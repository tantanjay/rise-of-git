import { ReactNode, useEffect, useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { hdSceneTarget } from "./HdPost";
import { setLoadStage } from "@/utils/loadingScreen";

/** Frames drawn after the view shows before it counts as ready (meshes uploaded, the static shadows redrawn) */
const READY_FRAMES = 3;
/** The longest the view waits for programs still linking before it shows anyway */
const LINK_WAIT_MS = 10_000;

/** three's program as `renderer.info.programs` holds it (`isReady` polls KHR_parallel_shader_compile without blocking) */
type LinkingProgram = { isReady?: () => boolean };

/**
 * Mounts a view hidden and compiles its shaders before it is drawn (docs/RENDERING.md *Heavy setup work*). Linking a
 * program blocks the page until the GPU driver is done with it: drawn straight away, the HD map's first two frames
 * took 2–3 s each, mostly waiting on links one after another. `compileAsync` starts them all at once and lets them
 * finish in parallel (KHR_parallel_shader_compile) while the loader turns; then the view shows, the static shadow map
 * is drawn again with it standing (it was drawn while it was hidden), and `onReady` fires once its first frames are on
 * screen. What is drawn is the same: only when it starts. A new `token` (a rebuilt world) counts its first frames again
 * for `onReady`, with the view kept on screen, as before.
 */
export function CompileGate({ children, token, onReady }: { children: ReactNode; token?: unknown; onReady?: () => void }) {
  const ref = useRef<THREE.Group>(null);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  // -1 while compiling, then the frames left before ready (0: done)
  const frames = useRef(-1);
  const readyRef = useRef(onReady);
  useLayoutEffect(() => {
    readyRef.current = onReady;
  });

  // Hidden before its first frame
  useLayoutEffect(() => {
    if (ref.current) ref.current.visible = false;
  }, []);

  // A new token after the first: the view stays on screen, its first frames are counted again
  const firstToken = useRef(token);
  useEffect(() => {
    if (token !== firstToken.current && frames.current === 0) frames.current = READY_FRAMES;
  }, [token]);

  useEffect(() => {
    const group = ref.current;
    if (!group) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // A frame after mount, so the view's environment, fog and lights are in place and the programs match what the
    // first real render asks for (drawn into bloom's buffer in HD)
    const raf = requestAnimationFrame(() => {
      setLoadStage("forge");
      const prev = gl.getRenderTarget();
      gl.setRenderTarget(hdSceneTarget());
      const compiled = gl.compileAsync(group, camera, scene);
      gl.setRenderTarget(prev);
      // compileAsync waits only for each material's last program: a material drawn two ways (instanced and not, a
      // second batch) has more, and any still linking would stall the first frame. Wait until every program is linked
      const started = performance.now();
      // How many programs are linked: the loading screen's bar moves with it
      const linked = () => {
        const programs = gl.info.programs ?? [];
        const ready = programs.filter((p) => (p as LinkingProgram).isReady?.() !== false).length;
        setLoadStage("forge", programs.length ? ready / programs.length : 1);
        return ready === programs.length;
      };
      const show = () => {
        if (!alive) return;
        if (!linked() && performance.now() - started < LINK_WAIT_MS) {
          timer = setTimeout(show, 10);
          return;
        }
        group.visible = true;
        frames.current = READY_FRAMES;
        setLoadStage("torches");
      };
      compiled.then(show);
    });
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [gl, scene, camera]);

  useFrame(() => {
    if (frames.current <= 0) return;
    // The shadow map is static: draw it again with the view standing, for as many frames as a change asks for
    gl.shadowMap.needsUpdate = true;
    if (--frames.current === 0) readyRef.current?.();
  });

  return <group ref={ref}>{children}</group>;
}
