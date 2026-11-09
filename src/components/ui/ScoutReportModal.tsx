import { Modal } from "./Modal";
import { ScoutReport } from "@/types";
import { ScoutIntel } from "./ScoutIntel";
import { CIV_EMBLEM } from "@/utils/war";
import { sound } from "@/hooks/useSound";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

interface ScoutReportModalProps {
  report: ScoutReport | null;
  onClose: () => void;
  /** Shown when the report was opened from the War Room list */
  onBack?: () => void;
}

export function ScoutReportModal({ report, onClose, onBack }: ScoutReportModalProps) {
  if (!report) return null;

  return (
    <Modal
      open={Boolean(report)}
      onClose={onClose}
      size="md"
      accentBorder="border-sky-500/50"
      headerClassName="bg-linear-to-b from-sky-950 via-slate-900 to-slate-950"
      header={
        <div className="flex items-center gap-3">
          <span className="text-2xl w-11 h-11 shrink-0 rounded-xl bg-sky-950/80 border border-sky-500/50 flex items-center justify-center">
            {report.details.emblem ?? (report.details.civilization ? CIV_EMBLEM[report.details.civilization] : "👁️")}
          </span>
          <div className="min-w-0">
            <h3 className="text-lg font-bold font-medieval text-sky-100 tracking-wide truncate">
              {report.targetName}
            </h3>
            <p className="text-xs text-slate-400 font-mono">
              Scout reconnaissance · <span className="capitalize">{report.targetKind.replace("_", " ")}</span>
            </p>
          </div>
        </div>
      }
      footer={
        <div className="flex items-center justify-between w-full">
          {onBack ? (
            <button
              onClick={() => {
                sound.playClick();
                onBack();
              }}
              className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 flex items-center gap-1.5 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> War Room
            </button>
          ) : (
            <span />
          )}
          <button
            onClick={() => {
              sound.playClick();
              onClose();
            }}
            className="px-5 py-2 rounded-xl text-xs font-bold transition shadow-lg flex items-center gap-2 bg-linear-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 text-slate-950"
          >
            <CheckCircle2 className="w-4 h-4" />
            Dismiss
          </button>
        </div>
      }
    >
      <div className="p-4 space-y-3">
        <ScoutIntel report={report} />
      </div>
    </Modal>
  );
}
