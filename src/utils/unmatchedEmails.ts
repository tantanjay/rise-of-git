import { API_BASE } from "@/config";
import type { UnmatchedCommitEmail } from "@/types";

/** Commit emails nobody owns yet (the Admin card's badge reads it without loading the emails window) */
export const fetchUnmatchedEmails = async (): Promise<UnmatchedCommitEmail[]> => {
  const res = await fetch(`${API_BASE}/admin/emails/unmatched`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data.emails;
};
