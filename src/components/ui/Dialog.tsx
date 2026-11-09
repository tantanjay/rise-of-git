import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Info, ShieldAlert } from "lucide-react";

type Tone = "danger" | "warning" | "info";

interface DialogOptions {
  title: string;
  message: ReactNode;
  /** Visual weight of the dialog and its confirm button (default "info") */
  tone?: Tone;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface DialogApi {
  /** Resolves true when the user confirms, false on cancel / Escape / backdrop click */
  confirm: (options: DialogOptions) => Promise<boolean>;
  /** Resolves once the user dismisses the message */
  alert: (options: Omit<DialogOptions, "cancelLabel">) => Promise<void>;
}

interface Pending extends DialogOptions {
  kind: "confirm" | "alert";
  resolve: (ok: boolean) => void;
}

const TONE: Record<Tone, { icon: ReactNode; ring: string; iconBox: string; button: string }> = {
  danger: {
    icon: <ShieldAlert className="w-5 h-5 text-red-300" />,
    ring: "border-red-600/50",
    iconBox: "bg-red-950/70 border-red-600/50",
    button: "bg-red-600 hover:bg-red-500 text-white"
  },
  warning: {
    icon: <AlertTriangle className="w-5 h-5 text-amber-300" />,
    ring: "border-amber-600/50",
    iconBox: "bg-amber-950/70 border-amber-600/50",
    button: "bg-amber-500 hover:bg-amber-400 text-slate-950"
  },
  info: {
    icon: <Info className="w-5 h-5 text-sky-300" />,
    ring: "border-slate-700",
    iconBox: "bg-sky-950/70 border-sky-600/50",
    button: "bg-sky-600 hover:bg-sky-500 text-white"
  }
};

const DialogContext = createContext<DialogApi | null>(null);

/** In-app replacement for window.confirm / window.alert. Wrap the app once in <DialogProvider>. */
export function useDialog(): DialogApi {
  const api = useContext(DialogContext);
  if (!api) throw new Error("useDialog must be used inside <DialogProvider>");
  return api;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);

  const open = useCallback(
    (kind: Pending["kind"], options: DialogOptions) =>
      new Promise<boolean>((resolve) => {
        setPending({ ...options, kind, resolve });
      }),
    []
  );

  const api = useMemo<DialogApi>(
    () => ({
      confirm: (options) => open("confirm", options),
      alert: (options) => open("alert", options).then(() => undefined)
    }),
    [open]
  );

  const close = useCallback(
    (ok: boolean) => {
      pending?.resolve(ok);
      setPending(null);
    },
    [pending]
  );

  return (
    <DialogContext.Provider value={api}>
      {children}
      {pending && <DialogView dialog={pending} onClose={close} />}
    </DialogContext.Provider>
  );
}

function DialogView({ dialog, onClose }: { dialog: Pending; onClose: (ok: boolean) => void }) {
  const tone = TONE[dialog.tone ?? "info"];
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    // Destructive confirms focus Cancel so a stray Enter doesn't fire them
    (dialog.kind === "confirm" && dialog.tone === "danger" ? cancelRef : confirmRef).current?.focus();
    // Capture phase + stopImmediatePropagation: Escape closes only this dialog, not a modal underneath
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      e.preventDefault();
      onCloseRef.current(dialog.kind === "alert");
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [dialog]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose(dialog.kind === "alert");
      }}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        aria-describedby="app-dialog-message"
        className={`w-full max-w-md rounded-2xl border ${tone.ring} bg-slate-900 shadow-2xl text-slate-200`}
      >
        <div className="flex gap-3 px-5 pt-5">
          <div className={`shrink-0 w-10 h-10 rounded-xl border flex items-center justify-center ${tone.iconBox}`}>{tone.icon}</div>
          <div className="min-w-0">
            <h2 id="app-dialog-title" className="font-medieval text-base font-bold text-amber-100 leading-snug">
              {dialog.title}
            </h2>
            <div id="app-dialog-message" className="mt-1.5 text-sm text-slate-300 leading-relaxed">
              {dialog.message}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 mt-2">
          {dialog.kind === "confirm" && (
            <button
              ref={cancelRef}
              onClick={() => onClose(false)}
              className="h-9 px-4 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-sm font-semibold text-slate-200 transition"
            >
              {dialog.cancelLabel ?? "Cancel"}
            </button>
          )}
          <button ref={confirmRef} onClick={() => onClose(true)} className={`h-9 px-4 rounded-lg text-sm font-semibold transition ${tone.button}`}>
            {dialog.confirmLabel ?? (dialog.kind === "alert" ? "OK" : "Confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
