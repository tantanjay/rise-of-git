// React's dev JSX runtime, with emoji in element text drawn as line icons (see glyphs.tsx). Wired in vite.config.ts
import * as R from "react/jsx-dev-runtime";
import { glyphProps } from "./glyphProps";

export const Fragment = R.Fragment;
export const jsxDEV: typeof R.jsxDEV = (type, props, key, isStatic, source, self) => R.jsxDEV(type, glyphProps(type, props), key, isStatic, source, self);
