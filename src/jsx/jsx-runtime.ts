// React's JSX runtime, with emoji in element text drawn as line icons (see glyphs.tsx). Wired in vite.config.ts
import * as R from "react/jsx-runtime";
import { glyphProps } from "./glyphProps";

export const Fragment = R.Fragment;
export const jsx: typeof R.jsx = (type, props, key) => R.jsx(type, glyphProps(type, props), key);
export const jsxs: typeof R.jsxs = (type, props, key) => R.jsxs(type, glyphProps(type, props), key);
