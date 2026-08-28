// Per-tab undo/redo for manual mapping. Snapshots are ManualProject refs
// (updates are already immutable; bg dataUrl is shared).
import type { ManualProject } from "./manual";

export type HistoryEntry = { project: ManualProject; label: string; at: number };
export type TabHistory = { past: HistoryEntry[]; future: HistoryEntry[] };

export const HISTORY_LIMIT = 50;
export const COALESCE_MS = 500;

export function emptyHistory(): TabHistory {
  return { past: [], future: [] };
}

export function pushHistory(
  h: TabHistory,
  project: ManualProject,
  label: string,
  coalesceMs = 0,
): TabHistory {
  const now = Date.now();
  const last = h.past[h.past.length - 1];
  if (coalesceMs > 0 && last && last.label === label && now - last.at < coalesceMs) {
    // Keep the original "before" snapshot; just refresh the coalesce window.
    return { past: [...h.past.slice(0, -1), { ...last, at: now }], future: [] };
  }
  const past = [...h.past, { project, label, at: now }];
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
  return { past, future: [] };
}

export function undoHistory(
  h: TabHistory,
  current: ManualProject,
): { history: TabHistory; project: ManualProject } | null {
  if (h.past.length === 0) return null;
  const past = h.past.slice();
  const entry = past.pop()!;
  const future: HistoryEntry[] = [...h.future, { project: current, label: entry.label, at: Date.now() }];
  return { history: { past, future }, project: entry.project };
}

export function redoHistory(
  h: TabHistory,
  current: ManualProject,
): { history: TabHistory; project: ManualProject } | null {
  if (h.future.length === 0) return null;
  const future = h.future.slice();
  const entry = future.pop()!;
  const past: HistoryEntry[] = [...h.past, { project: current, label: entry.label, at: Date.now() }];
  return { history: { past, future }, project: entry.project };
}

export function canUndo(h: TabHistory | undefined): boolean {
  return !!h && h.past.length > 0;
}

export function canRedo(h: TabHistory | undefined): boolean {
  return !!h && h.future.length > 0;
}

export function peekUndoLabel(h: TabHistory | undefined): string | null {
  return h?.past[h.past.length - 1]?.label ?? null;
}

export function peekRedoLabel(h: TabHistory | undefined): string | null {
  return h?.future[h.future.length - 1]?.label ?? null;
}
