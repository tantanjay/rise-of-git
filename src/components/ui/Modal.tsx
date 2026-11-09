import { ReactNode, useEffect, useRef } from "react";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  /** When true, the modal remains mounted to preserve scroll/state but is hidden from display and interaction */
  hidden?: boolean;
  onClose: () => void;
  /** Left side of the header (icon + title block) */
  header: ReactNode;
  /** Stays put under the header while the body scrolls (top tabs), so the scrollbar starts below it */
  subHeader?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg" | "xl";
  /** Tailwind border colour class for themed modals */
  accentBorder?: string;
  /** Tailwind gradient classes for the header background */
  headerClassName?: string;
  /** Classes for the body; defaults to a scrolling body. A tab with its own scroller passes a flex column so only that part scrolls */
  bodyClassName?: string;
}

const SIZE: Record<NonNullable<ModalProps["size"]>, string> = {
  md: "sm:max-w-lg",
  lg: "sm:max-w-3xl",
  xl: "sm:max-w-5xl"
};

/**
 * Shared modal shell: Escape / backdrop click to close, scroll-locked body,
 * full-screen sheet on phones and a centred card on larger screens.
 */
export function Modal({ open, hidden = false, onClose, header, subHeader, children, footer, size = "md", accentBorder = "border-slate-700", headerClassName = "bg-slate-950", bodyClassName = "overflow-y-auto" }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open || hidden) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, hidden]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-950/75 backdrop-blur-sm ${hidden ? "hidden" : "animate-fadeIn"}`}
      onMouseDown={(e) => {
        if (!hidden && e.target === e.currentTarget) onClose();
      }}
      role="presentation"
      aria-hidden={hidden}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal={!hidden}
        tabIndex={-1}
        className={`relative w-full ${SIZE[size]} max-h-dvh sm:max-h-[88vh] flex flex-col bg-slate-900 border ${accentBorder} sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden text-slate-200 outline-none`}
      >
        <div className={`flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-800 ${headerClassName}`}>
          <div className="min-w-0 flex-1">{header}</div>
          <button
            onClick={onClose}
            className="shrink-0 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Close (Esc)"
            aria-label="Close"
          >
            <kbd className="hidden sm:inline text-[10px] font-mono px-1.5 py-0.5 rounded border border-slate-700 bg-slate-800/80 text-slate-400">Esc</kbd>
            <X className="w-5 h-5" />
          </button>
        </div>

        {subHeader && <div className="shrink-0">{subHeader}</div>}

        <div className={`flex-1 min-h-0 ${bodyClassName}`}>{children}</div>

        {footer && <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/70">{footer}</div>}
      </div>
    </div>
  );
}
