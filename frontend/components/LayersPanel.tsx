"use client";
import { useCallback, useState } from "react";
import type { Category } from "@/lib/types";
import type { ManualNode, ManualProject, ManualShape } from "@/lib/manual";
import {
  collectDescendantIds,
  findNode,
  getLayerTree,
  isBorderGroup,
  isNodeLocked,
  isNodeVisible,
} from "@/lib/manual";
import ContextMenu, { colorSwatchItems, type MenuItem } from "@/components/ContextMenu";

type DropPos = "before" | "after" | "into";

type Props = {
  project: ManualProject;
  /** Selected tree-node ids (containers + leaves). */
  selectedIds: string[];
  activeContainerId: string | null;
  canGroup: boolean;
  onSelectNode: (id: string, e: React.MouseEvent) => void;
  onToggleVisible: (id: string) => void;
  onToggleLocked: (id: string) => void;
  onToggleCollapsed: (id: string) => void;
  onRenameNode: (id: string) => void;
  onNewContainer: () => void;
  onGroup: () => void;
  onDeleteNodes: () => void;
  onDeleteSelected?: () => void;
  onSetActiveContainer: (id: string | null) => void;
  /** Move node under parentId (null = root) at model index. */
  onMoveNode: (id: string, parentId: string | null, index: number) => void;
  onCollapseAll: (collapsed: boolean) => void;
  onDuplicateNode?: (id: string) => void;
  onRecolorNode?: (id: string, category: Category) => void;
  onReorderNode?: (id: string, dir: "front" | "back") => void;
  onFillBorderGroup?: (id: string, category: Category) => void;
  onSelectBorderGroupMembers?: (id: string) => void;
  onDeleteNode?: (id: string) => void;
  onUngroupNode?: (id: string) => void;
};

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
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </>
      ) : (
        <>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 9.9-1" />
        </>
      )}
    </svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <span
      className={`inline-block text-[10px] text-neutral-400 transition-transform ${open ? "rotate-90" : ""}`}
      aria-hidden
    >
      ▶
    </span>
  );
}

function shapeLabel(s: ManualShape): string {
  return s.name?.trim() || `${s.kind} · ${s.category}`;
}

function nodeLabel(node: ManualNode, shapeMap: Map<string, ManualShape>): string {
  if (node.kind === "container") {
    if (node.borderId) return node.name?.trim() || "Border";
    if (node.borderGroup) return node.name?.trim() || "Border group";
    return node.name || "Group";
  }
  if (node.name?.trim()) return node.name.trim();
  const s = shapeMap.get(node.shapeId);
  return s ? shapeLabel(s) : "shape";
}

export default function LayersPanel({
  project,
  selectedIds,
  activeContainerId,
  canGroup,
  onSelectNode,
  onToggleVisible,
  onToggleLocked,
  onToggleCollapsed,
  onRenameNode,
  onNewContainer,
  onGroup,
  onDeleteNodes,
  onDeleteSelected,
  onSetActiveContainer,
  onMoveNode,
  onCollapseAll,
  onDuplicateNode,
  onRecolorNode,
  onReorderNode,
  onFillBorderGroup,
  onSelectBorderGroupMembers,
  onDeleteNode,
  onUngroupNode,
}: Props) {
  const tree = getLayerTree(project);
  const shapeMap = new Map(project.shapes.map((s) => [s.id, s]));

  const [dragId, setDragId] = useState<string | null>(null);
  const [hint, setHint] = useState<{ targetId: string; pos: DropPos } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);

  const clearDrag = useCallback(() => {
    setDragId(null);
    setHint(null);
  }, []);

  /** Reject dropping a container into itself / a descendant, or under a locked node. */
  const dropAllowed = useCallback(
    (movedId: string, targetId: string, pos: DropPos): boolean => {
      if (movedId === targetId) return false;
      const moved = findNode(tree, movedId);
      if (!moved) return false;
      if (moved.node.kind === "container" && collectDescendantIds(moved.node).has(targetId)) {
        return false;
      }
      const target = findNode(tree, targetId);
      if (!target) return false;
      if (pos === "into") {
        if (target.node.kind !== "container") return false;
        if (isNodeLocked(project, targetId)) return false;
      } else {
        // dropping as a sibling of target → parent must not be locked
        const parentId = target.parent ? target.parent.id : null;
        if (parentId && isNodeLocked(project, parentId)) return false;
      }
      return true;
    },
    [tree, project],
  );

  const commitDrop = useCallback(() => {
    if (!dragId || !hint) {
      clearDrag();
      return;
    }
    const { targetId, pos } = hint;
    if (!dropAllowed(dragId, targetId, pos)) {
      clearDrag();
      return;
    }
    if (pos === "into") {
      const container = findNode(tree, targetId);
      if (container && container.node.kind === "container") {
        const siblings = container.node.children.filter((c) => c.id !== dragId);
        onMoveNode(dragId, targetId, siblings.length); // front / top of container
      }
    } else {
      const tf = findNode(tree, targetId);
      if (tf) {
        const parentId = tf.parent ? tf.parent.id : null;
        const siblingsModel = (tf.parent ? tf.parent.children : tree.root).filter(
          (c) => c.id !== dragId,
        );
        const displaySibs = [...siblingsModel].reverse();
        const tIdx = displaySibs.findIndex((c) => c.id === targetId);
        if (tIdx >= 0) {
          const displayInsertPos = pos === "before" ? tIdx : tIdx + 1;
          const index = siblingsModel.length - displayInsertPos;
          onMoveNode(dragId, parentId, index);
        }
      }
    }
    clearDrag();
  }, [dragId, hint, dropAllowed, tree, onMoveNode, clearDrag]);

  /** Choose drop position from pointer offset within the row. */
  const posFromEvent = (e: React.DragEvent, isContainer: boolean): DropPos => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - rect.top) / Math.max(1, rect.height);
    if (isContainer) {
      if (y < 0.3) return "before";
      if (y > 0.7) return "after";
      return "into";
    }
    return y < 0.5 ? "before" : "after";
  };

  const renderNode = (node: ManualNode, depth: number): React.ReactNode => {
    const isContainer = node.kind === "container";
    const selected = selectedIds.includes(node.id);
    const active = isContainer && activeContainerId === node.id;
    const vis = isNodeVisible(project, node.id);
    const locked = isNodeLocked(project, node.id);
    const collapsed = isContainer && !!node.collapsed;
    const showTop = hint?.targetId === node.id && hint.pos === "before";
    const showBottom = hint?.targetId === node.id && hint.pos === "after";
    const showInto = hint?.targetId === node.id && hint.pos === "into";
    const label = nodeLabel(node, shapeMap);
    const leafShape = node.kind === "leaf" ? shapeMap.get(node.shapeId) : undefined;

    return (
      <div key={node.id}>
        <div className={showTop ? "border-t-2 border-brand" : "border-t-2 border-transparent"} />
        <div
          draggable={!locked}
          onDragStart={(e) => {
            if (locked) return;
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", node.id);
            setDragId(node.id);
          }}
          onDragEnd={clearDrag}
          onDragOver={(e) => {
            if (!dragId) return;
            e.preventDefault();
            const pos = posFromEvent(e, isContainer);
            if (dropAllowed(dragId, node.id, pos)) {
              setHint({ targetId: node.id, pos });
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            commitDrop();
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenu({ x: e.clientX, y: e.clientY, nodeId: node.id });
          }}
          onClick={(e) => onSelectNode(node.id, e)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (isContainer) onSetActiveContainer(active ? null : node.id);
            else onRenameNode(node.id);
          }}
          className={`group flex select-none items-center gap-1 rounded px-1.5 py-1 text-xs transition-colors ${
            selected
              ? "bg-brand text-white"
              : active
                ? "bg-brand/10 text-brand font-medium"
                : "text-neutral-700 hover:bg-neutral-100"
          } ${showInto ? "ring-2 ring-brand" : ""}`}
          style={{ paddingLeft: `${depth * 12 + 6}px` }}
        >
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            {isContainer ? (
              <button
                type="button"
                className="p-0.5 text-neutral-400 hover:text-neutral-700"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleCollapsed(node.id);
                }}
                title={collapsed ? "Expand" : "Collapse"}
              >
                <Chevron open={!collapsed} />
              </button>
            ) : (
              <span className="w-3" />
            )}
            <button
              type="button"
              className="rounded p-0.5 text-neutral-500 hover:bg-neutral-200"
              onClick={(e) => {
                e.stopPropagation();
                onToggleVisible(node.id);
              }}
              title={node.visible ? "Hide" : "Show"}
            >
              <EyeIcon on={node.visible} />
            </button>
            <button
              type="button"
              className={`rounded p-0.5 hover:bg-neutral-200 ${node.locked ? "text-ink" : "text-neutral-400"}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleLocked(node.id);
              }}
              title={node.locked ? "Unlock" : "Lock"}
            >
              <LockIcon on={node.locked} />
            </button>
            {leafShape ? (
              <span
                className="ml-0.5 h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-black/10"
                style={{ background: leafShape.fill }}
              />
            ) : node.kind === "container" && node.borderGroup ? (
              <span className="ml-0.5 shrink-0 text-neutral-400" title="Border group">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <rect x="2" y="5" width="12" height="12" rx="1" strokeDasharray="3 2" />
                  <rect x="10" y="7" width="12" height="12" rx="1" strokeDasharray="3 2" />
                </svg>
              </span>
            ) : node.kind === "container" && node.borderId ? (
              <span className="ml-0.5 shrink-0 text-neutral-400" title="Border">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <rect x="3" y="3" width="18" height="18" rx="1" />
                  <rect x="7" y="7" width="10" height="10" rx="1" strokeDasharray="3 2" />
                </svg>
              </span>
            ) : (
              <span className="ml-0.5 shrink-0 text-neutral-400" title="Group">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                </svg>
              </span>
            )}
            <span className={`min-w-0 flex-1 truncate ${vis ? "" : "text-neutral-400 line-through"}`} title={label}>
              {label}
              {active ? <span className="ml-1 text-[10px] font-normal text-brand">active</span> : null}
            </span>
          </div>
        </div>
        {isContainer && !collapsed && (
          <div>{[...node.children].reverse().map((c) => renderNode(c, depth + 1))}</div>
        )}
        {showBottom && <div className="border-t-2 border-brand" />}
      </div>
    );
  };

  const rootDisplay = [...tree.root].reverse();

  const menuItemsFor = (nodeId: string): MenuItem[] => {
    const f = findNode(tree, nodeId);
    if (!f) return [];
    const n = f.node;
    const vis = isNodeVisible(project, n.id);
    const locked = isNodeLocked(project, n.id);
    const items: MenuItem[] = [];
    if (n.kind === "leaf") {
      items.push({ type: "item", label: "Rename", onClick: () => onRenameNode(n.id) });
      items.push({ type: "item", label: "Duplicate", onClick: () => onDuplicateNode?.(n.id) });
      items.push({
        type: "item",
        label: "Recolor",
        submenu: colorSwatchItems((cat) => onRecolorNode?.(n.id, cat)),
      });
      items.push({ type: "item", label: "Bring to front", onClick: () => onReorderNode?.(n.id, "front") });
      items.push({ type: "item", label: "Send to back", onClick: () => onReorderNode?.(n.id, "back") });
      if (canGroup && selectedIds.length >= 2) {
        items.push({ type: "item", label: "Group selection", onClick: onGroup });
      }
      items.push({ type: "separator" });
      items.push({
        type: "item",
        label: vis ? "Hide" : "Show",
        onClick: () => onToggleVisible(n.id),
      });
      items.push({
        type: "item",
        label: locked ? "Unlock" : "Lock",
        onClick: () => onToggleLocked(n.id),
      });
      items.push({ type: "separator" });
      items.push({ type: "item", label: "Delete", danger: true, onClick: () => onDeleteNode?.(n.id) });
      return items;
    }
    if (isBorderGroup(n)) {
      items.push({
        type: "item",
        label: "Fill",
        submenu: colorSwatchItems((cat) => onFillBorderGroup?.(n.id, cat)),
      });
      items.push({
        type: "item",
        label: "Select all borders",
        onClick: () => onSelectBorderGroupMembers?.(n.id),
      });
      items.push({ type: "item", label: "Rename", onClick: () => onRenameNode(n.id) });
      items.push({ type: "item", label: "Ungroup", onClick: () => onUngroupNode?.(n.id) });
      items.push({ type: "separator" });
      items.push({
        type: "item",
        label: vis ? "Hide" : "Show",
        onClick: () => onToggleVisible(n.id),
      });
      items.push({
        type: "item",
        label: locked ? "Unlock" : "Lock",
        onClick: () => onToggleLocked(n.id),
      });
      items.push({ type: "separator" });
      items.push({ type: "item", label: "Delete", danger: true, onClick: () => onDeleteNode?.(n.id) });
      return items;
    }
    // Border or plain group
    items.push({ type: "item", label: "Rename", onClick: () => onRenameNode(n.id) });
    items.push({ type: "item", label: "New group", onClick: onNewContainer });
    if (canGroup) items.push({ type: "item", label: "Group selection", onClick: onGroup });
    items.push({ type: "item", label: "Ungroup", onClick: () => onUngroupNode?.(n.id) });
    items.push({
      type: "item",
      label: "Set as active",
      onClick: () => onSetActiveContainer(n.id),
    });
    items.push({ type: "item", label: "Bring to front", onClick: () => onReorderNode?.(n.id, "front") });
    items.push({ type: "item", label: "Send to back", onClick: () => onReorderNode?.(n.id, "back") });
    items.push({ type: "separator" });
    items.push({
      type: "item",
      label: vis ? "Hide" : "Show",
      onClick: () => onToggleVisible(n.id),
    });
    items.push({
      type: "item",
      label: locked ? "Unlock" : "Lock",
      onClick: () => onToggleLocked(n.id),
    });
    items.push({ type: "separator" });
    items.push({ type: "item", label: "Delete", danger: true, onClick: () => onDeleteNode?.(n.id) });
    return items;
  };

  const isBordersSel =
    selectedIds.length >= 2 &&
    selectedIds.every((id) => {
      const f = findNode(tree, id);
      return !!f && f.node.kind === "container" && !!f.node.borderId;
    });

  return (
    <div onContextMenu={(e) => e.preventDefault()}>
      <div className="mb-2 flex flex-wrap gap-1">
        <button
          type="button"
          onClick={onNewContainer}
          className="rounded bg-neutral-200 px-2 py-1 text-[11px] hover:bg-neutral-300"
          title="New empty group"
        >
          + Group
        </button>
        <button
          type="button"
          onClick={onGroup}
          disabled={!canGroup}
          className="rounded bg-neutral-200 px-2 py-1 text-[11px] hover:bg-neutral-300 disabled:opacity-40"
          title={
            isBordersSel
              ? "Group borders into a clip set (⌘G)"
              : "Group selection (⌘G)"
          }
        >
          {isBordersSel
            ? "+ Border Group"
            : selectedIds.length >= 1
              ? "+ Group Sel"
              : "+ Border Group"}
        </button>
        <button
          type="button"
          onClick={onDeleteNodes}
          disabled={selectedIds.length === 0}
          className="rounded bg-neutral-200 px-2 py-1 text-[11px] hover:bg-neutral-300 disabled:opacity-40"
          title="Ungroup selected groups (shapes kept)"
        >
          Ungroup
        </button>
        <button
          type="button"
          onClick={onDeleteSelected}
          disabled={selectedIds.length === 0}
          className="rounded bg-neutral-200 px-2 py-1 text-[11px] hover:bg-red-100 hover:text-red-700 disabled:opacity-40 disabled:hover:bg-neutral-200 disabled:hover:text-inherit"
          title="Delete selected layer(s) (Delete / Backspace)"
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
        className="max-h-72 space-y-0.5 overflow-y-auto rounded border border-neutral-200 bg-neutral-50 p-1"
        onDragOver={(e) => {
          // Empty space at bottom → drop at root back (model index 0)
          if (!dragId) return;
          if (e.currentTarget === e.target) {
            e.preventDefault();
          }
        }}
        onDrop={(e) => {
          if (dragId && e.currentTarget === e.target) {
            e.preventDefault();
            onMoveNode(dragId, null, 0);
            clearDrag();
          }
        }}
      >
        {tree.root.length === 0 && (
          <div className="px-2 py-3 text-center text-[11px] text-neutral-400">
            No shapes yet. Draw freely, or create a group to organize & lock.
          </div>
        )}
        {rootDisplay.map((n) => renderNode(n, 0))}
      </div>
      <p className="mt-1 text-[10px] text-neutral-400">
        Drag to reorder (top = front) · drop onto a group to nest · ⌘/Ctrl+click multi · lock = no drag · right-click for actions
      </p>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItemsFor(menu.nodeId)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
