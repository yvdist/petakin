"use client";
import { useCallback, useState } from "react";
import type { ManualProject, ManualShape } from "@/lib/manual";
import {
  getLayerTree,
  groupForLayer,
  ungroupedShapeIds,
  type LayerMoveTarget,
} from "@/lib/manual";

type Props = {
  project: ManualProject;
  selectedLayerIds: string[];
  selectedShapeIds: string[];
  onSelectLayer: (id: string, e: React.MouseEvent) => void;
  onSelectShape: (id: string, e: React.MouseEvent) => void;
  onToggleLayerVisible: (id: string) => void;
  onToggleLayerLocked: (id: string) => void;
  onToggleGroupVisible: (id: string) => void;
  onToggleGroupLocked: (id: string) => void;
  onToggleGroupCollapsed: (id: string) => void;
  onToggleLayerCollapsed: (id: string) => void;
  onRenameLayer: (id: string) => void;
  onRenameGroup: (id: string) => void;
  onNewLayer: () => void;
  onGroup: () => void;
  onDeleteNodes: () => void;
  onSetActiveLayer: (id: string | null) => void;
  /** Display-order (front→back) of root node ids → caller reverses to model. */
  onReorderRoot: (displayOrder: string[]) => void;
  onMoveLayer: (layerId: string, target: LayerMoveTarget, indexModel: number) => void;
  onMoveShape: (shapeId: string, targetLayerId: string | null, indexModel: number) => void;
  onReorderUngrouped: (displayOrder: string[]) => void;
  onCollapseAll: (collapsed: boolean) => void;
};

type DragPayload =
  | { kind: "node"; id: string }
  | { kind: "shape"; id: string; fromLayerId: string | null };

type DropHint =
  | { kind: "root"; beforeId: string | null } // null = after last (display bottom = model front)
  | { kind: "group"; groupId: string; beforeId: string | null }
  | { kind: "layerShapes"; layerId: string; beforeId: string | null }
  | { kind: "ungrouped"; beforeId: string | null }
  | { kind: "intoGroup"; groupId: string };

function EyeIcon({ on }: { on: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      {on ? (
        <>
          <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 19c-7 0-11-7-11-7a18.45 18.45 0 0 1 5.06-5.94" />
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 7 11 7a18.5 18.5 0 0 1-2.16 3.19" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </>
      )}
    </svg>
  );
}

function LockIcon({ on }: { on: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      {on ? (
        <>
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </>
      ) : (
        <>
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 9.9-1" />
        </>
      )}
    </svg>
  );
}

function GripIcon() {
  return (
    <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" className="text-neutral-400" aria-hidden>
      <circle cx="3" cy="3" r="1.2" />
      <circle cx="7" cy="3" r="1.2" />
      <circle cx="3" cy="7" r="1.2" />
      <circle cx="7" cy="7" r="1.2" />
      <circle cx="3" cy="11" r="1.2" />
      <circle cx="7" cy="11" r="1.2" />
    </svg>
  );
}

function shapeLabel(s: ManualShape): string {
  return s.name?.trim() || `${s.kind} · ${s.category}`;
}

/** Insert `id` before `beforeId` in display list (null = append). */
function insertInDisplay(list: string[], id: string, beforeId: string | null): string[] {
  const without = list.filter((x) => x !== id);
  if (beforeId == null) return [...without, id];
  const i = without.indexOf(beforeId);
  if (i < 0) return [...without, id];
  return [...without.slice(0, i), id, ...without.slice(i)];
}

/** Display index → model index (display is reverse of model). */
function displayInsertToModelIndex(displayList: string[], beforeId: string | null, movingId: string): number {
  const display = insertInDisplay(displayList, movingId, beforeId);
  const model = [...display].reverse();
  return model.indexOf(movingId);
}

export default function LayersPanel({
  project,
  selectedLayerIds,
  selectedShapeIds,
  onSelectLayer,
  onSelectShape,
  onToggleLayerVisible,
  onToggleLayerLocked,
  onToggleGroupVisible,
  onToggleGroupLocked,
  onToggleGroupCollapsed,
  onToggleLayerCollapsed,
  onRenameLayer,
  onRenameGroup,
  onNewLayer,
  onGroup,
  onDeleteNodes,
  onSetActiveLayer,
  onReorderRoot,
  onMoveLayer,
  onMoveShape,
  onReorderUngrouped,
  onCollapseAll,
}: Props) {
  const tree = getLayerTree(project);
  const ungrouped = ungroupedShapeIds(project);
  const shapeMap = new Map(project.shapes.map((s) => [s.id, s]));
  const canGroup =
    selectedLayerIds.length + selectedShapeIds.filter((id) => ungrouped.includes(id)).length >= 2;

  // Display order: front → back (reverse of model)
  const rootDisplay = [...tree.rootOrder].reverse();
  const ungroupedDisplay = [...ungrouped].reverse();

  const [drag, setDrag] = useState<DragPayload | null>(null);
  const [dropHint, setDropHint] = useState<DropHint | null>(null);

  const clearDrag = useCallback(() => {
    setDrag(null);
    setDropHint(null);
  }, []);

  const commitDrop = useCallback(() => {
    if (!drag || !dropHint) {
      clearDrag();
      return;
    }

    if (drag.kind === "node") {
      const isGroup = !!tree.groups.find((g) => g.id === drag.id);
      const isLayer = !!tree.layers.find((l) => l.id === drag.id);

      if (dropHint.kind === "intoGroup" && isLayer) {
        // Append to front of group in model (= start of reversed display = end of model)
        const g = tree.groups.find((x) => x.id === dropHint.groupId);
        if (g) {
          const displayKids = g.childIds.filter((id) => id !== drag.id);
          // insert at display top = model end
          onMoveLayer(drag.id, { type: "group", groupId: dropHint.groupId }, displayKids.length);
        }
      } else if (dropHint.kind === "group" && isLayer) {
        const g = tree.groups.find((x) => x.id === dropHint.groupId);
        if (g) {
          const displayKids = [...g.childIds].reverse().filter((id) => id !== drag.id);
          const indexModel = displayInsertToModelIndex(
            [...g.childIds].reverse(),
            dropHint.beforeId,
            drag.id,
          );
          void displayKids;
          onMoveLayer(drag.id, { type: "group", groupId: dropHint.groupId }, indexModel);
        }
      } else if (dropHint.kind === "root") {
        if (isGroup || (isLayer && !groupForLayer(tree, drag.id))) {
          // Reorder among root (or pull layer out of group into root)
          if (isLayer && groupForLayer(tree, drag.id)) {
            const displayRoot = rootDisplay.filter((id) => id !== drag.id);
            const indexModel = displayInsertToModelIndex(rootDisplay, dropHint.beforeId, drag.id);
            void displayRoot;
            onMoveLayer(drag.id, { type: "root" }, indexModel);
          } else {
            const nextDisplay = insertInDisplay(rootDisplay, drag.id, dropHint.beforeId);
            onReorderRoot(nextDisplay);
          }
        } else if (isLayer) {
          const indexModel = displayInsertToModelIndex(rootDisplay, dropHint.beforeId, drag.id);
          onMoveLayer(drag.id, { type: "root" }, indexModel);
        }
      }
    } else if (drag.kind === "shape") {
      if (dropHint.kind === "layerShapes") {
        const layer = tree.layers.find((l) => l.id === dropHint.layerId);
        if (layer) {
          const displayShapes = [...layer.shapeIds].reverse();
          const indexModel = displayInsertToModelIndex(displayShapes, dropHint.beforeId, drag.id);
          onMoveShape(drag.id, dropHint.layerId, indexModel);
        }
      } else if (dropHint.kind === "ungrouped") {
        // Move to ungrouped, then reorder
        onMoveShape(drag.id, null, 0);
        const display = insertInDisplay(
          ungroupedDisplay.filter((id) => id !== drag.id),
          drag.id,
          dropHint.beforeId,
        );
        // After ungroup, reorder among ungrouped — pass display order
        onReorderUngrouped(display);
      }
    }

    clearDrag();
  }, [
    drag,
    dropHint,
    tree,
    rootDisplay,
    ungroupedDisplay,
    onMoveLayer,
    onReorderRoot,
    onMoveShape,
    onReorderUngrouped,
    clearDrag,
  ]);

  const onDragStartNode = (id: string) => (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
    setDrag({ kind: "node", id });
  };

  const onDragStartShape = (id: string, fromLayerId: string | null) => (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
    setDrag({ kind: "shape", id, fromLayerId });
  };

  const hintClass = (active: boolean) =>
    active ? "border-t-2 border-brand" : "border-t-2 border-transparent";

  const renderShapeRow = (
    sid: string,
    fromLayerId: string | null,
    dropZone: Extract<DropHint, { beforeId: string | null }>,
  ) => {
    const s = shapeMap.get(sid);
    if (!s) return null;
    const sel = selectedShapeIds.includes(sid);
    const isHint =
      dropHint &&
      dropHint.kind === dropZone.kind &&
      ("layerId" in dropHint
        ? "layerId" in dropZone && dropHint.layerId === dropZone.layerId
        : true) &&
      dropHint.beforeId === sid;
    return (
      <div
        key={sid}
        className={`${hintClass(!!isHint)}`}
        draggable
        onDragStart={onDragStartShape(sid, fromLayerId)}
        onDragEnd={clearDrag}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!drag || drag.kind !== "shape") return;
          setDropHint({ ...dropZone, beforeId: sid });
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          commitDrop();
        }}
      >
        <button
          type="button"
          className={`flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] ${
            sel ? "bg-neutral-200" : "hover:bg-neutral-50"
          }`}
          onClick={(e) => onSelectShape(sid, e)}
        >
          <span className="cursor-grab text-neutral-400 active:cursor-grabbing">
            <GripIcon />
          </span>
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.fill }} />
          <span className="truncate text-neutral-600">{shapeLabel(s)}</span>
        </button>
      </div>
    );
  };

  const renderLayerRow = (layerId: string, indent: boolean, inGroupId: string | null) => {
    const layer = tree.layers.find((l) => l.id === layerId);
    if (!layer) return null;
    const selected = selectedLayerIds.includes(layer.id);
    const active = tree.activeLayerId === layer.id;
    const shapesDisplay = [...layer.shapeIds].reverse();
    const collapsed = !!layer.collapsed;

    const isRootHint =
      dropHint?.kind === "root" && dropHint.beforeId === layer.id && !inGroupId;
    const isGroupHint =
      dropHint?.kind === "group" &&
      inGroupId &&
      dropHint.groupId === inGroupId &&
      dropHint.beforeId === layer.id;

    return (
      <div key={layer.id} className={indent ? "ml-3 border-l border-neutral-200 pl-1" : ""}>
        <div
          className={`${hintClass(!!(isRootHint || isGroupHint))}`}
          draggable
          onDragStart={onDragStartNode(layer.id)}
          onDragEnd={clearDrag}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!drag || drag.kind !== "node") return;
            if (drag.id === layer.id) return;
            if (inGroupId) {
              setDropHint({ kind: "group", groupId: inGroupId, beforeId: layer.id });
            } else {
              setDropHint({ kind: "root", beforeId: layer.id });
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            commitDrop();
          }}
        >
          <div
            className={`flex items-center gap-0.5 rounded px-1 py-0.5 text-xs ${
              selected ? "bg-brand-soft ring-1 ring-brand" : "hover:bg-neutral-100"
            } ${active ? "font-semibold" : ""}`}
            onClick={(e) => {
              onSelectLayer(layer.id, e);
              onSetActiveLayer(layer.id);
            }}
            onDoubleClick={() => onRenameLayer(layer.id)}
          >
            <span className="cursor-grab text-neutral-400 active:cursor-grabbing">
              <GripIcon />
            </span>
            {layer.shapeIds.length > 0 ? (
              <button
                type="button"
                className="w-4 shrink-0 text-neutral-500"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleLayerCollapsed(layer.id);
                }}
                title={collapsed ? "Expand" : "Collapse"}
              >
                {collapsed ? "▸" : "▾"}
              </button>
            ) : (
              <span className="w-4" />
            )}
            <button
              type="button"
              className="rounded p-0.5 text-neutral-500 hover:bg-neutral-200"
              onClick={(e) => {
                e.stopPropagation();
                onToggleLayerVisible(layer.id);
              }}
              title={layer.visible ? "Hide" : "Show"}
            >
              <EyeIcon on={layer.visible} />
            </button>
            <button
              type="button"
              className={`rounded p-0.5 hover:bg-neutral-200 ${layer.locked ? "text-ink" : "text-neutral-400"}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleLayerLocked(layer.id);
              }}
              title={layer.locked ? "Unlock position" : "Lock position"}
            >
              <LockIcon on={layer.locked} />
            </button>
            <span className="min-w-0 flex-1 truncate" title={layer.name}>
              {layer.name}
              {active ? <span className="ml-1 text-[10px] font-normal text-brand">active</span> : null}
            </span>
          </div>
        </div>

        {!collapsed && (
          <div
            className="ml-2"
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!drag || drag.kind !== "shape") return;
              // Drop at end of this layer's display list (bottom = model front)
              setDropHint({ kind: "layerShapes", layerId: layer.id, beforeId: null });
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              commitDrop();
            }}
          >
            {shapesDisplay.map((sid) =>
              renderShapeRow(sid, layer.id, {
                kind: "layerShapes",
                layerId: layer.id,
                beforeId: sid,
              }),
            )}
            {dropHint?.kind === "layerShapes" &&
              dropHint.layerId === layer.id &&
              dropHint.beforeId === null &&
              drag?.kind === "shape" && <div className="border-t-2 border-brand" />}
          </div>
        )}
      </div>
    );
  };

  const endRootHint =
    dropHint?.kind === "root" && dropHint.beforeId === null && drag?.kind === "node";

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1">
        <button
          type="button"
          onClick={onNewLayer}
          className="rounded bg-neutral-200 px-2 py-1 text-[11px] hover:bg-neutral-300"
          title="New layer"
        >
          + Layer
        </button>
        <button
          type="button"
          onClick={onGroup}
          disabled={!canGroup}
          className="rounded bg-neutral-200 px-2 py-1 text-[11px] hover:bg-neutral-300 disabled:opacity-40"
          title="Group selection"
        >
          Group
        </button>
        <button
          type="button"
          onClick={onDeleteNodes}
          disabled={selectedLayerIds.length === 0}
          className="rounded bg-neutral-200 px-2 py-1 text-[11px] hover:bg-neutral-300 disabled:opacity-40"
          title="Delete selected layers/groups (shapes kept)"
        >
          Delete
        </button>
        <button
          type="button"
          onClick={() => onCollapseAll(true)}
          className="rounded bg-neutral-200 px-2 py-1 text-[11px] hover:bg-neutral-300"
          title="Collapse all"
        >
          Collapse
        </button>
        <button
          type="button"
          onClick={() => onCollapseAll(false)}
          className="rounded bg-neutral-200 px-2 py-1 text-[11px] hover:bg-neutral-300"
          title="Expand all"
        >
          Expand
        </button>
      </div>

      <div
        className="max-h-64 space-y-0.5 overflow-y-auto rounded border border-neutral-200 bg-neutral-50 p-1"
        onDragOver={(e) => {
          e.preventDefault();
          if (!drag || drag.kind !== "node") return;
          // Empty space at bottom of list → append (display bottom = model front)
          if (e.currentTarget === e.target) {
            setDropHint({ kind: "root", beforeId: null });
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          commitDrop();
        }}
      >
        {tree.rootOrder.length === 0 && ungrouped.length === 0 && (
          <div className="px-2 py-3 text-center text-[11px] text-neutral-400">
            No layers yet. Draw freely, or create a layer to organize & lock.
          </div>
        )}

        {rootDisplay.map((id) => {
          const group = tree.groups.find((g) => g.id === id);
          if (group) {
            const selected = selectedLayerIds.includes(group.id);
            const isRootHint = dropHint?.kind === "root" && dropHint.beforeId === group.id;
            const isInto =
              dropHint?.kind === "intoGroup" && dropHint.groupId === group.id && drag?.kind === "node";
            const kidsDisplay = [...group.childIds].reverse();
            return (
              <div key={group.id}>
                <div
                  className={`${hintClass(!!isRootHint)} ${isInto ? "ring-1 ring-brand" : ""}`}
                  draggable
                  onDragStart={onDragStartNode(group.id)}
                  onDragEnd={clearDrag}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!drag || drag.kind !== "node") return;
                    if (drag.id === group.id) return;
                    const layer = tree.layers.find((l) => l.id === drag.id);
                    if (layer) {
                      // Hovering group header with a layer → nest into group
                      setDropHint({ kind: "intoGroup", groupId: group.id });
                    } else {
                      setDropHint({ kind: "root", beforeId: group.id });
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    commitDrop();
                  }}
                >
                  <div
                    className={`flex items-center gap-0.5 rounded px-1 py-0.5 text-xs ${
                      selected ? "bg-brand-soft ring-1 ring-brand" : "hover:bg-neutral-100"
                    }`}
                    onClick={(e) => onSelectLayer(group.id, e)}
                    onDoubleClick={() => onRenameGroup(group.id)}
                  >
                    <span className="cursor-grab text-neutral-400 active:cursor-grabbing">
                      <GripIcon />
                    </span>
                    <button
                      type="button"
                      className="w-4 text-neutral-500"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleGroupCollapsed(group.id);
                      }}
                    >
                      {group.collapsed ? "▸" : "▾"}
                    </button>
                    <button
                      type="button"
                      className="rounded p-0.5 text-neutral-500 hover:bg-neutral-200"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleGroupVisible(group.id);
                      }}
                    >
                      <EyeIcon on={group.visible} />
                    </button>
                    <button
                      type="button"
                      className={`rounded p-0.5 hover:bg-neutral-200 ${group.locked ? "text-ink" : "text-neutral-400"}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleGroupLocked(group.id);
                      }}
                    >
                      <LockIcon on={group.locked} />
                    </button>
                    <span className="truncate font-medium">{group.name}</span>
                  </div>
                </div>
                {!group.collapsed && (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!drag || drag.kind !== "node") return;
                      if (!tree.layers.some((l) => l.id === drag.id)) return;
                      setDropHint({ kind: "group", groupId: group.id, beforeId: null });
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      commitDrop();
                    }}
                  >
                    {kidsDisplay.map((lid) => renderLayerRow(lid, true, group.id))}
                    {dropHint?.kind === "group" &&
                      dropHint.groupId === group.id &&
                      dropHint.beforeId === null &&
                      drag?.kind === "node" && <div className="ml-3 border-t-2 border-brand" />}
                  </div>
                )}
              </div>
            );
          }
          if (groupForLayer(tree, id)) return null;
          return renderLayerRow(id, false, null);
        })}

        {endRootHint && <div className="border-t-2 border-brand" />}

        {/* Orphan layers not in rootOrder */}
        {tree.layers
          .filter((l) => !groupForLayer(tree, l.id) && !tree.rootOrder.includes(l.id))
          .map((l) => renderLayerRow(l.id, false, null))}

        {(ungrouped.length > 0 || (drag?.kind === "shape" && dropHint?.kind === "ungrouped")) && (
          <div
            className="mt-1 border-t border-neutral-200 pt-1"
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!drag || drag.kind !== "shape") return;
              setDropHint({ kind: "ungrouped", beforeId: null });
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              commitDrop();
            }}
          >
            <div className="px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
              Ungrouped
            </div>
            {ungroupedDisplay.map((sid) =>
              renderShapeRow(sid, null, { kind: "ungrouped", beforeId: sid }),
            )}
            {dropHint?.kind === "ungrouped" && dropHint.beforeId === null && drag?.kind === "shape" && (
              <div className="border-t-2 border-brand" />
            )}
          </div>
        )}
      </div>
      <p className="mt-1 text-[10px] text-neutral-400">
        Drag to reorder (top = front) · ⌘/Ctrl+click multi · lock = no drag
      </p>
    </div>
  );
}
