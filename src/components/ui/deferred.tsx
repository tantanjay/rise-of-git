import { Component, ComponentType, createElement, lazy, ReactNode, Suspense, useRef } from "react";

/** A chunk that fails to load (offline, or a stale build after a deploy) must not blank the whole app */
class ChunkGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("Window failed to load", error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

type PropsOf<C> = C extends (props: infer P) => unknown ? P : never;

/**
 * A window kept out of the first download. Nothing is fetched until `isOpen(props)` is first true; after that it stays
 * mounted (as it did before), so any state it keeps while closed survives. Use it as the component itself:
 * `const AdminModal = deferred(() => import("./AdminModal"), "AdminModal", (p) => p.open);`
 */
export function deferred<M, K extends keyof M>(load: () => Promise<M>, name: K, isOpen: (props: PropsOf<M[K]>) => boolean): ComponentType<PropsOf<M[K]>> {
  type P = PropsOf<M[K]>;
  const Lazy = lazy(() => load().then((m) => ({ default: m[name] as unknown as ComponentType<P> }))) as unknown as ComponentType<P>;
  return function Deferred(props: P) {
    const seen = useRef(false);
    if (isOpen(props)) seen.current = true;
    if (!seen.current) return null;
    return (
      <ChunkGuard>
        <Suspense fallback={null}>
          {createElement(Lazy as ComponentType<object>, props as object)}
        </Suspense>
      </ChunkGuard>
    );
  };
}
