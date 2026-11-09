import { Fragment } from "react";
import { SKIP_TYPES, glyphText, hasGlyph } from "@/components/ui/glyphs";

/**
 * The props a DOM element (or fragment) is created with, its text's emoji turned into line icons (glyphs.tsx).
 * Returns the same object when nothing changes, so ordinary elements cost one type check.
 */
export function glyphProps(type: unknown, props: any): any {
  if (!props || props.children == null) return props;
  if (!(typeof type === "string" ? !SKIP_TYPES.has(type) : type === Fragment)) return props;
  const c = props.children;
  if (typeof c === "string") return hasGlyph(c) ? { ...props, children: glyphText(c) } : props;
  if (!Array.isArray(c) || !c.some((x) => typeof x === "string" && hasGlyph(x))) return props;
  return { ...props, children: c.map((x) => (typeof x === "string" ? glyphText(x) : x)) };
}
