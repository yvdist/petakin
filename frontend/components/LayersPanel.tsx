"use client";
import type { ManualProject, ManualShape } from "@/lib/manual";
import {
  getLayerTree,
  groupForLayer,
  ungroupedShapeIds,
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
  onRenameLayer: (id: string) => void;
  onRenameGroup: (id: string) => void;
  onNewLayer: () => void;
  onGroup: () => void;
  onDeleteNodes: () => void;
  onSetActiveLayer: (id: string | null) => void;
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

function shapeLabel(s: ManualShape): string {
  return s.name?.trim() || `${s.kind} · ${s.category}`;
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
  onRenameLayer,
  onRenameGroup,
  onNewLayer,
  onGroup,
  onDeleteNodes,
  onSetActiveLayer,
}: Props) {
  const tree = getLayerTree(project);
  const ungrouped = ungroupedShapeIds(project);
  const shapeMap = new Map(project.shapes.map((s) => [s.id, s]));
  const canGroup =
    selectedLayerIds.length + selectedShapeIds.filter((id) => ungrouped.includes(id)).length >= 2;

  const renderLayerRow = (layerId: string, indent: boolean) => {
    const layer = tree.layers.find((l) => l.id === layerId);
    if (!layer) return null;
    const selected = selectedLayerIds.includes(layer.id);
    const active = tree.activeLayerId === layer.id;
    return (
      <div key={layer.id} className={indent ? "ml-3 border-l border-neutral-200 pl-1" : ""}>
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
        {layer.shapeIds.map((sid) => {
          const s = shapeMap.get(sid);
          if (!s) return null;
          const sel = selectedShapeIds.includes(sid);
          return (
            <button
              key={sid}
              type="button"
              className={`ml-6 flex w-[calc(100%-1.5rem)] items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] ${
                sel ? "bg-neutral-200" : "hover:bg-neutral-50"
              }`}
              onClick={(e) => onSelectShape(sid, e)}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.fill }} />
              <span className="truncate text-neutral-600">{shapeLabel(s)}</span>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div>
      <div className="mb-2 flex gap-1">
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
      </div>

      <div className="max-h-52 space-y-0.5 overflow-y-auto rounded border border-neutral-200 bg-neutral-50 p-1">
        {tree.rootOrder.length === 0 && ungrouped.length === 0 && (
          <div className="px-2 py-3 text-center text-[11px] text-neutral-400">
            No layers yet. Draw freely, or create a layer to organize & lock.
          </div>
        )}

        {tree.rootOrder.map((id) => {
          const group = tree.groups.find((g) => g.id === id);
          if (group) {
            const selected = selectedLayerIds.includes(group.id);
            return (
              <div key={group.id}>
                <div
                  className={`flex items-center gap-0.5 rounded px-1 py-0.5 text-xs ${
                    selected ? "bg-brand-soft ring-1 ring-brand" : "hover:bg-neutral-100"
                  }`}
                  onClick={(e) => onSelectLayer(group.id, e)}
                  onDoubleClick={() => onRenameGroup(group.id)}
                >
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
                {!group.collapsed && group.childIds.map((lid) => renderLayerRow(lid, true))}
              </div>
            );
          }
          // skip layers that live inside a group
          if (groupForLayer(tree, id)) return null;
          return renderLayerRow(id, false);
        })}

        {/* layers only in groups may appear in rootOrder as group; also show root layers */}
        {tree.layers
          .filter((l) => !groupForLayer(tree, l.id) && !tree.rootOrder.includes(l.id))
          .map((l) => renderLayerRow(l.id, false))}

        {ungrouped.length > 0 && (
          <div className="mt-1 border-t border-neutral-200 pt-1">
            <div className="px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
              Ungrouped
            </div>
            {ungrouped.map((sid) => {
              const s = shapeMap.get(sid);
              if (!s) return null;
              const sel = selectedShapeIds.includes(sid);
              return (
                <button
                  key={sid}
                  type="button"
                  className={`flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] ${
                    sel ? "bg-neutral-200" : "hover:bg-neutral-50"
                  }`}
                  onClick={(e) => onSelectShape(sid, e)}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.fill }} />
                  <span className="truncate text-neutral-600">{shapeLabel(s)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <p className="mt-1 text-[10px] text-neutral-400">
        ⌘/Ctrl+click multi-select · Shift+click range · lock = no drag
      </p>
    </div>
  );
}
