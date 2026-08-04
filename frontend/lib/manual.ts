// Manual mapping mode: hand-drawn vector shapes over a low-opacity denah.
// Pure client-side — model, localStorage store, seed-from-auto converter, and a
// TS port of backend svg.py emit_svg() so export needs no backend.
import type { Category, Geometry, Point } from "./types";
import { AEON_CONFIG } from "./presets";

export type ShapeKind = "rect" | "poly" | "ellipse";

/** Synthetic id for the outer shell when selected in the canvas. */
export const SHELL_ID = "__shell__";

/** Vertex with optional outgoing bezier handle (absolute coords). */
export type PolyVert = { p: Point; handleOut?: Point };

export interface ManualShape {
  id: string;
  kind: ShapeKind;
  points: Point[]; // image-pixel space; rect stored as its 4 corners (always synced)
  /** Bezier source-of-truth when present; anchors + optional handleOut. */
  verts?: PolyVert[];
  category: Category;
  fill: string; // resolved hex (category default or custom override)
  name?: string;
}

/** Tenant block stroke (white separators between units). */
export interface ManualStroke {
  color: string;
  width: number; // image-pixel space
}

export interface ManualProject {
  /** 1 = legacy flat layer tree; 2 = recursive node tree. Both load (migrated). */
  version: 1 | 2;
  floor: string;
  bg: { dataUrl: string; width: number; height: number; opacity: number };
  shapes: ManualShape[];
  /** Outer floor-plate polygon — clips units (optional). Flattened points. */
  shell?: Point[] | null;
  /** Bezier verts for shell when drawn with pen curves. */
  shellVerts?: PolyVert[] | null;
  /** Stroke for tenant rect/poly (default white). */
  stroke?: ManualStroke;
  /** Outer shell outline stroke (default white). Independent of tenant stroke. */
  shellStroke?: ManualStroke;
  /** Editor-only opacity for drawn shapes/shell (0.05–1). Export stays full. */
  drawOpacity?: number;
  /** Optional layer tree (absent = no layers / all shapes ungrouped). */
  layerTree?: ManualLayerTree;
  /**
   * Export plan width (normalizedWidth). Full SVG width ≈ this + 2*pad + gutter.
   * Default: AEON_CONFIG.normalizedWidth (1500).
   */
  exportNormalizedWidth?: number;
  /**
   * How the exported SVG is sized:
   * - "width"   → legacy: plan width + 2*pad + right gutter (badge column).
   * - "contain" → fit content proportionally into exportTargetW×exportTargetH (default).
   * - "stretch" → fill exportTargetW×exportTargetH exactly (non-uniform, may distort).
   */
  exportMode?: "width" | "contain" | "stretch";
  /** Target canvas width for contain/stretch modes. Default 1865. */
  exportTargetW?: number;
  /** Target canvas height for contain/stretch modes. Default 1182. */
  exportTargetH?: number;
  /** PNG raster multiplier over SVG viewBox. Default 1. */
  pngScale?: number;
  /** Floor badge in export (normalized) coordinates. */
  badgeLayout?: ManualBadgeLayout;
  updatedAt: number;
}

/** Floor marker position/size in export SVG space. */
export interface ManualBadgeLayout {
  cx: number;
  cy: number;
  r: number;
  fontSize: number;
  strokeWidth: number;
}

// ---- Recursive layer tree (v2) ----
// Every node is either a container (holds ordered children, Figma "group/frame")
// or a leaf (references a ManualShape by id). Arbitrary nesting. Lock/visibility
// live on every node and cascade to descendants.
export type ManualNodeId = string;

interface ManualNodeCommon {
  id: ManualNodeId;
  /** Empty on leaves → panel falls back to the shape label. */
  name: string;
  locked: boolean;
  visible: boolean;
}

export interface ManualContainerNode extends ManualNodeCommon {
  kind: "container";
  collapsed?: boolean;
  /** Ordered back→front (model order); paint/emit iterate as-is, panel reverses. */
  children: ManualNode[];
}

export interface ManualLeafNode extends ManualNodeCommon {
  kind: "leaf";
  /** References ManualShape.id in project.shapes (geometry stays pure). */
  shapeId: string;
}

export type ManualNode = ManualContainerNode | ManualLeafNode;

export interface ManualLayerTree {
  /** Ordered back→front. */
  root: ManualNode[];
  /** Insertion target for newly drawn shapes; null = append at root front. */
  activeContainerId: ManualNodeId | null;
}

// ---- legacy (v1) tree shapes, kept only for migration ----
interface LegacyLayer {
  id: string;
  name: string;
  locked: boolean;
  visible: boolean;
  shapeIds: string[];
  collapsed?: boolean;
}
interface LegacyGroup {
  id: string;
  name: string;
  locked: boolean;
  visible: boolean;
  childIds: string[];
  collapsed?: boolean;
}
interface LegacyLayerTree {
  layers: LegacyLayer[];
  groups: LegacyGroup[];
  rootOrder: string[];
  activeLayerId: string | null;
}

export const DEFAULT_STROKE: ManualStroke = { color: "#FFFFFF", width: 2 };
export const DEFAULT_SHELL_STROKE: ManualStroke = { color: "#FFFFFF", width: 2 };
export const DEFAULT_DRAW_OPACITY = 1;
export const DEFAULT_PNG_SCALE = 1;
export const EXPORT_WIDTH_MIN = 400;
export const EXPORT_WIDTH_MAX = 6000;
export const PNG_SCALE_MIN = 1;
export const PNG_SCALE_MAX = 3;
export const DEFAULT_EXPORT_MODE: "width" | "contain" | "stretch" = "contain";
export const DEFAULT_EXPORT_TARGET_W = 1865;
export const DEFAULT_EXPORT_TARGET_H = 1182;
export const EXPORT_DIM_MIN = 200;
export const EXPORT_DIM_MAX = 8000;

export function emptyLayerTree(): ManualLayerTree {
  return { root: [], activeContainerId: null };
}

let nodeIdCounter = 0;
export function newNodeId(prefix = "n"): string {
  nodeIdCounter += 1;
  return `${prefix}${Date.now().toString(36)}${nodeIdCounter}`;
}

function makeLeaf(shapeId: string): ManualLeafNode {
  return { id: newNodeId("l"), kind: "leaf", name: "", locked: false, visible: true, shapeId };
}

function isLegacyTree(t: unknown): t is LegacyLayerTree {
  return (
    !!t &&
    typeof t === "object" &&
    Array.isArray((t as LegacyLayerTree).layers) &&
    Array.isArray((t as LegacyLayerTree).groups) &&
    Array.isArray((t as LegacyLayerTree).rootOrder)
  );
}

function collectLeafShapeIds(nodes: ManualNode[], out: Set<string>): void {
  for (const n of nodes) {
    if (n.kind === "leaf") out.add(n.shapeId);
    else collectLeafShapeIds(n.children, out);
  }
}

function pruneDeadLeaves(nodes: ManualNode[], shapeIds: Set<string>): ManualNode[] {
  const out: ManualNode[] = [];
  for (const n of nodes) {
    if (n.kind === "leaf") {
      if (shapeIds.has(n.shapeId)) out.push(n);
    } else {
      out.push({ ...n, children: pruneDeadLeaves(n.children, shapeIds) });
    }
  }
  return out;
}

function countContainers(nodes: ManualNode[]): number {
  let c = 0;
  for (const n of nodes) if (n.kind === "container") c += 1 + countContainers(n.children);
  return c;
}

function buildTreeFromShapes(shapes: ManualShape[]): ManualLayerTree {
  return { root: shapes.map((s) => makeLeaf(s.id)), activeContainerId: null };
}

/** v1 flat tree → v2 recursive tree. Layers & groups both become containers. */
function migrateLayerTree(old: LegacyLayerTree, shapes: ManualShape[]): ManualLayerTree {
  const shapeIds = new Set(shapes.map((s) => s.id));
  const layerMap = new Map(old.layers.map((l) => [l.id, l]));
  const groupMap = new Map(old.groups.map((g) => [g.id, g]));
  const used = new Set<string>();
  const leafFor = (sid: string): ManualLeafNode | null => {
    if (!shapeIds.has(sid) || used.has(sid)) return null;
    used.add(sid);
    return makeLeaf(sid);
  };
  const layerToContainer = (l: LegacyLayer): ManualContainerNode => ({
    id: l.id,
    kind: "container",
    name: l.name,
    locked: l.locked,
    visible: l.visible,
    collapsed: l.collapsed,
    children: l.shapeIds.map(leafFor).filter((x): x is ManualLeafNode => !!x),
  });
  const root: ManualNode[] = [];
  const inGroup = new Set(old.groups.flatMap((g) => g.childIds));
  for (const id of old.rootOrder) {
    const g = groupMap.get(id);
    if (g) {
      root.push({
        id: g.id,
        kind: "container",
        name: g.name,
        locked: g.locked,
        visible: g.visible,
        collapsed: g.collapsed,
        children: g.childIds
          .map((lid) => layerMap.get(lid))
          .filter((l): l is LegacyLayer => !!l)
          .map(layerToContainer),
      });
      continue;
    }
    const l = layerMap.get(id);
    if (l && !inGroup.has(l.id)) root.push(layerToContainer(l));
  }
  // orphan layers not in rootOrder / not in a group
  for (const l of old.layers) {
    if (root.some((n) => n.id === l.id) || inGroup.has(l.id) || old.rootOrder.includes(l.id)) continue;
    root.push(layerToContainer(l));
  }
  // previously-ungrouped shapes → root front (preserve current "on top" z)
  for (const s of shapes) {
    const leaf = leafFor(s.id);
    if (leaf) root.push(leaf);
  }
  const activeContainerId =
    old.activeLayerId && layerMap.has(old.activeLayerId) ? old.activeLayerId : null;
  return { root, activeContainerId };
}

/** Keep tree ↔ project.shapes in sync. Returns SAME ref when already clean. */
function reconcileTree(tree: ManualLayerTree, shapes: ManualShape[]): ManualLayerTree {
  const shapeIds = new Set(shapes.map((s) => s.id));
  const present = new Set<string>();
  collectLeafShapeIds(tree.root, present);
  const missing = shapes.filter((s) => !present.has(s.id));
  let hasDead = false;
  for (const id of present) if (!shapeIds.has(id)) { hasDead = true; break; }
  if (missing.length === 0 && !hasDead) return tree;
  let root = hasDead ? pruneDeadLeaves(tree.root, shapeIds) : tree.root;
  for (const s of missing) root = [...root, makeLeaf(s.id)];
  return { ...tree, root };
}

export function getLayerTree(project: ManualProject | null | undefined): ManualLayerTree {
  if (!project) return emptyLayerTree();
  const raw = project.layerTree as unknown;
  if (!raw) return buildTreeFromShapes(project.shapes);
  if (isLegacyTree(raw)) return migrateLayerTree(raw, project.shapes);
  return reconcileTree(raw as ManualLayerTree, project.shapes);
}

// ---- generic recursive node helpers ----
function isContainer(n: ManualNode): n is ManualContainerNode {
  return n.kind === "container";
}

export interface NodeLocation {
  node: ManualNode;
  parent: ManualContainerNode | null;
  index: number;
  ancestors: ManualContainerNode[];
}

export function findNode(tree: ManualLayerTree, id: ManualNodeId): NodeLocation | null {
  const walk = (
    nodes: ManualNode[],
    parent: ManualContainerNode | null,
    ancestors: ManualContainerNode[],
  ): NodeLocation | null => {
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.id === id) return { node: n, parent, index: i, ancestors };
      if (isContainer(n)) {
        const r = walk(n.children, n, [...ancestors, n]);
        if (r) return r;
      }
    }
    return null;
  };
  return walk(tree.root, null, []);
}

function leafForShape(tree: ManualLayerTree, shapeId: string): ManualLeafNode | null {
  let found: ManualLeafNode | null = null;
  const walk = (nodes: ManualNode[]) => {
    for (const n of nodes) {
      if (found) return;
      if (n.kind === "leaf") {
        if (n.shapeId === shapeId) found = n;
      } else {
        walk(n.children);
      }
    }
  };
  walk(tree.root);
  return found;
}

export function collectDescendantIds(node: ManualNode): Set<string> {
  const out = new Set<string>();
  const walk = (n: ManualNode) => {
    if (n.kind === "container") for (const c of n.children) { out.add(c.id); walk(c); }
  };
  walk(node);
  return out;
}

/** Immutable map-by-id: replace matching node via fn. */
function mapNodes(nodes: ManualNode[], id: string, fn: (n: ManualNode) => ManualNode): ManualNode[] {
  return nodes.map((n) => {
    if (n.id === id) return fn(n);
    if (n.kind === "container") return { ...n, children: mapNodes(n.children, id, fn) };
    return n;
  });
}

function removeNodeFrom(nodes: ManualNode[], id: string): { nodes: ManualNode[]; removed: ManualNode | null } {
  let removed: ManualNode | null = null;
  const out: ManualNode[] = [];
  for (const n of nodes) {
    if (n.id === id) { removed = n; continue; }
    if (n.kind === "container") {
      const r = removeNodeFrom(n.children, id);
      if (r.removed) { removed = r.removed; out.push({ ...n, children: r.nodes }); continue; }
    }
    out.push(n);
  }
  return { nodes: out, removed };
}

/** Insert node into parentId (null = root) at model index. */
function insertNodeInto(
  nodes: ManualNode[],
  parentId: string | null,
  index: number,
  node: ManualNode,
): ManualNode[] {
  if (parentId == null) {
    const i = Math.max(0, Math.min(index, nodes.length));
    return [...nodes.slice(0, i), node, ...nodes.slice(i)];
  }
  return nodes.map((n) => {
    if (n.kind !== "container") return n;
    if (n.id === parentId) {
      const i = Math.max(0, Math.min(index, n.children.length));
      return { ...n, children: [...n.children.slice(0, i), node, ...n.children.slice(i)] };
    }
    return { ...n, children: insertNodeInto(n.children, parentId, index, node) };
  });
}

// ---- effective (cascaded) flags, memoized per tree ref ----
type Flags = { visible: boolean; locked: boolean };
type FlagMaps = { shapes: Map<string, Flags>; nodes: Map<string, Flags> };
const effectiveFlagsCache = new WeakMap<ManualLayerTree, FlagMaps>();

function computeEffectiveFlags(tree: ManualLayerTree): FlagMaps {
  const shapes = new Map<string, Flags>();
  const nodes = new Map<string, Flags>();
  const walk = (list: ManualNode[], pv: boolean, pl: boolean) => {
    for (const n of list) {
      const visible = pv && n.visible;
      const locked = pl || n.locked;
      nodes.set(n.id, { visible, locked });
      if (n.kind === "leaf") shapes.set(n.shapeId, { visible, locked });
      else walk(n.children, visible, locked);
    }
  };
  walk(tree.root, true, false);
  return { shapes, nodes };
}

function effectiveFlags(project: ManualProject): FlagMaps {
  const tree = getLayerTree(project);
  let c = effectiveFlagsCache.get(tree);
  if (!c) {
    c = computeEffectiveFlags(tree);
    effectiveFlagsCache.set(tree, c);
  }
  return c;
}

export function isShapeVisible(project: ManualProject, shapeId: string): boolean {
  return effectiveFlags(project).shapes.get(shapeId)?.visible ?? true;
}

export function isShapeLocked(project: ManualProject, shapeId: string): boolean {
  return effectiveFlags(project).shapes.get(shapeId)?.locked ?? false;
}

/** Effective (ancestor-cascaded) visibility of a tree node — for panel rows. */
export function isNodeVisible(project: ManualProject, nodeId: string): boolean {
  return effectiveFlags(project).nodes.get(nodeId)?.visible ?? true;
}

/** Effective (ancestor-cascaded) lock of a tree node — for panel rows. */
export function isNodeLocked(project: ManualProject, nodeId: string): boolean {
  return effectiveFlags(project).nodes.get(nodeId)?.locked ?? false;
}

/** Leaf node id owning this shape (for syncing canvas ↔ panel selection). */
export function nodeIdForShape(project: ManualProject, shapeId: string): string | null {
  return leafForShape(getLayerTree(project), shapeId)?.id ?? null;
}

/** Shape id a leaf node references, or null for containers. */
export function shapeIdForNode(project: ManualProject, nodeId: string): string | null {
  const f = findNode(getLayerTree(project), nodeId);
  return f && f.node.kind === "leaf" ? f.node.shapeId : null;
}

/** Paint order: DFS of the tree in model order (back→front). */
export function orderedShapeIds(project: ManualProject): string[] {
  const tree = getLayerTree(project);
  const out: string[] = [];
  const walk = (nodes: ManualNode[]) => {
    for (const n of nodes) {
      if (n.kind === "leaf") out.push(n.shapeId);
      else walk(n.children);
    }
  };
  walk(tree.root);
  // safety net: any shape without a leaf (should not happen post-reconcile)
  const seen = new Set(out);
  for (const s of project.shapes) if (!seen.has(s.id)) out.push(s.id);
  return out;
}

/** Store a fully-normalized (migrated + reconciled) tree on the project. */
export function ensureLayerTree(project: ManualProject): ManualProject {
  const tree = getLayerTree(project);
  if (project.layerTree === tree) return project;
  return { ...project, layerTree: tree };
}

/** Create an empty container in parentId (null = root front) and make it active. */
export function createContainer(
  project: ManualProject,
  parentId: string | null = null,
  name?: string,
): ManualProject {
  const p = ensureLayerTree(project);
  const tree = p.layerTree!;
  const node: ManualContainerNode = {
    id: newNodeId("g"),
    kind: "container",
    name: name || `Group ${countContainers(tree.root) + 1}`,
    locked: false,
    visible: true,
    collapsed: false,
    children: [],
  };
  const parent = parentId ? findNode(tree, parentId) : null;
  const targetParentId = parent && parent.node.kind === "container" ? parentId : null;
  const siblings =
    targetParentId != null
      ? (findNode(tree, targetParentId)!.node as ManualContainerNode).children
      : tree.root;
  const root = insertNodeInto(tree.root, targetParentId, siblings.length, node);
  return { ...p, layerTree: { ...tree, root, activeContainerId: node.id } };
}

/** Add a leaf for a shape into the active container (or root front). No-op if it exists. */
export function insertLeafForShape(project: ManualProject, shapeId: string): ManualProject {
  const p = ensureLayerTree(project);
  const tree = p.layerTree!;
  if (leafForShape(tree, shapeId)) return p;
  const leaf = makeLeaf(shapeId);
  const active = tree.activeContainerId ? findNode(tree, tree.activeContainerId) : null;
  if (active && active.node.kind === "container") {
    const root = insertNodeInto(
      tree.root,
      tree.activeContainerId,
      active.node.children.length,
      leaf,
    );
    return { ...p, layerTree: { ...tree, root } };
  }
  return { ...p, layerTree: { ...tree, root: [...tree.root, leaf] } };
}

export function removeLeafForShape(project: ManualProject, shapeId: string): ManualProject {
  const p = ensureLayerTree(project);
  const tree = p.layerTree!;
  const leaf = leafForShape(tree, shapeId);
  if (!leaf) return p;
  const { nodes } = removeNodeFrom(tree.root, leaf.id);
  return { ...p, layerTree: { ...tree, root: nodes } };
}

/** Patch any node (container or leaf) — name/locked/visible/collapsed. */
export function patchNode(
  project: ManualProject,
  nodeId: string,
  patch: Partial<Pick<ManualContainerNode, "name" | "locked" | "visible" | "collapsed">>,
): ManualProject {
  const p = ensureLayerTree(project);
  const tree = p.layerTree!;
  const root = mapNodes(tree.root, nodeId, (n) => ({ ...n, ...patch }));
  return { ...p, layerTree: { ...tree, root } };
}

export function setActiveContainer(project: ManualProject, nodeId: string | null): ManualProject {
  const p = ensureLayerTree(project);
  return { ...p, layerTree: { ...p.layerTree!, activeContainerId: nodeId } };
}

/** Delete container nodes; their children are promoted into the parent (shapes kept). */
export function deleteContainers(project: ManualProject, nodeIds: string[]): ManualProject {
  let p = ensureLayerTree(project);
  for (const id of nodeIds) {
    const tree = p.layerTree!;
    const f = findNode(tree, id);
    if (!f || f.node.kind !== "container") continue;
    const kids = f.node.children;
    const parentId = f.parent ? f.parent.id : null;
    const { nodes: without } = removeNodeFrom(tree.root, id);
    let root = without;
    let idx = f.index;
    for (const k of kids) {
      root = insertNodeInto(root, parentId, idx, k);
      idx++;
    }
    const activeContainerId = tree.activeContainerId === id ? null : tree.activeContainerId;
    p = { ...p, layerTree: { ...tree, root, activeContainerId } };
  }
  return p;
}

/**
 * Move a node under newParentId (null = root) at model index.
 * Rejects dropping a container into itself/a descendant (cycle guard) and no-ops
 * if the moved node is effectively locked.
 */
export function moveNode(
  project: ManualProject,
  nodeId: string,
  newParentId: string | null,
  indexModel: number,
): ManualProject {
  const p = ensureLayerTree(project);
  const tree = p.layerTree!;
  const found = findNode(tree, nodeId);
  if (!found) return project;
  if (newParentId) {
    if (newParentId === nodeId) return project;
    if (collectDescendantIds(found.node).has(newParentId)) return project;
    const parent = findNode(tree, newParentId);
    if (!parent || parent.node.kind !== "container") return project;
  }
  const { nodes: without, removed } = removeNodeFrom(tree.root, nodeId);
  if (!removed) return project;
  const root = insertNodeInto(without, newParentId, indexModel, removed);
  return { ...p, layerTree: { ...tree, root } };
}

/**
 * Wrap the selected nodes in a new container, placed where the topmost selection
 * sat. Nested-under-selection ids are dropped (a container carries its children).
 */
export function groupNodes(project: ManualProject, selectedIds: string[]): ManualProject {
  const p0 = ensureLayerTree(project);
  const tree0 = p0.layerTree!;
  const sel = new Set(selectedIds);
  const top = selectedIds.filter((id) => {
    const f = findNode(tree0, id);
    return !!f && !f.ancestors.some((a) => sel.has(a.id));
  });
  if (top.length < 1) return project;

  const first = findNode(tree0, top[0])!;
  const parentId = first.parent ? first.parent.id : null;
  const container: ManualContainerNode = {
    id: newNodeId("g"),
    kind: "container",
    name: `Group ${countContainers(tree0.root) + 1}`,
    locked: false,
    visible: true,
    collapsed: false,
    children: [],
  };
  let p: ManualProject = {
    ...p0,
    layerTree: {
      ...tree0,
      root: insertNodeInto(tree0.root, parentId, first.index, container),
    },
  };
  let i = 0;
  for (const id of top) {
    p = moveNode(p, id, container.id, i);
    i++;
  }
  return { ...p, layerTree: { ...p.layerTree!, activeContainerId: container.id } };
}

/** Set collapsed on every container node. */
export function setAllCollapsed(project: ManualProject, collapsed: boolean): ManualProject {
  const p = ensureLayerTree(project);
  const tree = p.layerTree!;
  const walk = (nodes: ManualNode[]): ManualNode[] =>
    nodes.map((n) => (n.kind === "container" ? { ...n, collapsed, children: walk(n.children) } : n));
  return { ...p, layerTree: { ...tree, root: walk(tree.root) } };
}

/** Flat DFS of node ids in panel display order (front→back) for range selection. */
export function displayRowOrder(project: ManualProject): string[] {
  const tree = getLayerTree(project);
  const rows: string[] = [];
  const walk = (nodes: ManualNode[]) => {
    for (const n of [...nodes].reverse()) {
      rows.push(n.id);
      if (n.kind === "container" && !n.collapsed) walk(n.children);
    }
  };
  walk(tree.root);
  return rows;
}

export function getStroke(project: ManualProject | null | undefined): ManualStroke {
  const s = project?.stroke;
  if (!s) return { ...DEFAULT_STROKE };
  return {
    color: typeof s.color === "string" && s.color ? s.color : DEFAULT_STROKE.color,
    width: Math.max(1, Math.min(12, Number(s.width) || DEFAULT_STROKE.width)),
  };
}

export function getShellStroke(project: ManualProject | null | undefined): ManualStroke {
  const s = project?.shellStroke;
  if (!s) return { ...DEFAULT_SHELL_STROKE };
  return {
    color: typeof s.color === "string" && s.color ? s.color : DEFAULT_SHELL_STROKE.color,
    width: Math.max(1, Math.min(12, Number(s.width) || DEFAULT_SHELL_STROKE.width)),
  };
}

export function getDrawOpacity(project: ManualProject | null | undefined): number {
  const v = project?.drawOpacity;
  if (typeof v !== "number" || Number.isNaN(v)) return DEFAULT_DRAW_OPACITY;
  return Math.max(0.05, Math.min(1, v));
}

export function getExportNormalizedWidth(project: ManualProject | null | undefined): number {
  const v = project?.exportNormalizedWidth;
  const n = typeof v === "number" && !Number.isNaN(v) ? v : AEON_CONFIG.normalizedWidth;
  return Math.max(EXPORT_WIDTH_MIN, Math.min(EXPORT_WIDTH_MAX, Math.round(n)));
}

export function getPngScale(project: ManualProject | null | undefined): number {
  const v = project?.pngScale;
  const n = typeof v === "number" && !Number.isNaN(v) ? v : DEFAULT_PNG_SCALE;
  return Math.max(PNG_SCALE_MIN, Math.min(PNG_SCALE_MAX, Math.round(n)));
}

export function getExportMode(project: ManualProject | null | undefined): "width" | "contain" | "stretch" {
  const v = project?.exportMode;
  return v === "width" || v === "contain" || v === "stretch" ? v : DEFAULT_EXPORT_MODE;
}

export function getExportTargetW(project: ManualProject | null | undefined): number {
  const v = project?.exportTargetW;
  const n = typeof v === "number" && !Number.isNaN(v) ? v : DEFAULT_EXPORT_TARGET_W;
  return Math.max(EXPORT_DIM_MIN, Math.min(EXPORT_DIM_MAX, Math.round(n)));
}

export function getExportTargetH(project: ManualProject | null | undefined): number {
  const v = project?.exportTargetH;
  const n = typeof v === "number" && !Number.isNaN(v) ? v : DEFAULT_EXPORT_TARGET_H;
  return Math.max(EXPORT_DIM_MIN, Math.min(EXPORT_DIM_MAX, Math.round(n)));
}

/** Content bbox in source-image space used by export. */
export function contentBBox(project: ManualProject): {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
} {
  const targetW = getExportNormalizedWidth(project);
  const shellPts = project.shell && project.shell.length >= 3 ? project.shell : null;
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  const consider = (pts: Point[]) => {
    for (const [x, y] of pts) {
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  };
  if (shellPts) consider(shellPts);
  for (const s of project.shapes) {
    if (!isShapeVisible(project, s.id)) continue;
    const ring = s.points?.length >= 3 ? s.points : flattenPolyVerts(shapeVerts(s));
    consider(ring);
  }
  if (!isFinite(x0)) {
    x0 = 0;
    y0 = 0;
    x1 = project.bg.width || targetW;
    y1 = project.bg.height || targetW;
  }
  return { x0, y0, x1, y1 };
}

/** Legacy width-mode badge default: centered in the right gutter. */
export function defaultBadgeLayout(planWidth: number, gutter: number = AEON_CONFIG.gutter): ManualBadgeLayout {
  const b = AEON_CONFIG.badge;
  return {
    cx: planWidth + gutter / 2,
    cy: 150,
    r: b.r,
    fontSize: b.fontSize,
    strokeWidth: b.strokeWidth,
  };
}

/**
 * Canvas-aware badge default. In contain/stretch modes the badge sits in the
 * top-right corner INSIDE the target box (no gutter); in width mode it falls
 * back to the legacy gutter placement.
 */
export function defaultBadgeLayoutForCanvas(
  mode: "width" | "contain" | "stretch",
  width: number,
  planWidth: number,
  gutter: number = AEON_CONFIG.gutter,
): ManualBadgeLayout {
  if (mode === "width") return defaultBadgeLayout(planWidth, gutter);
  const b = AEON_CONFIG.badge;
  const pad = AEON_CONFIG.pad;
  return {
    cx: width - pad - b.r,
    cy: pad + b.r,
    r: b.r,
    fontSize: b.fontSize,
    strokeWidth: b.strokeWidth,
  };
}

export function getBadgeLayout(project: ManualProject): ManualBadgeLayout {
  const dims = computeCanvasDims(project);
  const fallback = defaultBadgeLayoutForCanvas(dims.mode, dims.width, dims.planWidth, dims.gutter);
  const b = project.badgeLayout;
  if (!b) return fallback;
  return {
    cx: typeof b.cx === "number" && !Number.isNaN(b.cx) ? b.cx : fallback.cx,
    cy: typeof b.cy === "number" && !Number.isNaN(b.cy) ? b.cy : fallback.cy,
    r: Math.max(8, typeof b.r === "number" && !Number.isNaN(b.r) ? b.r : fallback.r),
    fontSize: Math.max(8, typeof b.fontSize === "number" && !Number.isNaN(b.fontSize) ? b.fontSize : fallback.fontSize),
    strokeWidth: Math.max(
      1,
      typeof b.strokeWidth === "number" && !Number.isNaN(b.strokeWidth) ? b.strokeWidth : fallback.strokeWidth,
    ),
  };
}

/** Canvas metrics/transform WITHOUT the badge (badge default needs these). */
type CanvasDims = {
  mode: "width" | "contain" | "stretch";
  x0: number;
  y0: number;
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
  scale: number;
  pad: number;
  gutter: number;
  targetW: number;
  planWidth: number;
  width: number;
  height: number;
};

function computeCanvasDims(project: ManualProject): CanvasDims {
  const pad = AEON_CONFIG.pad;
  const gutter = AEON_CONFIG.gutter;
  const mode = getExportMode(project);
  const { x0, y0, x1, y1 } = contentBBox(project);
  const spanX = Math.max(1, x1 - x0);
  const spanY = Math.max(1, y1 - y0);

  if (mode === "width") {
    const targetW = getExportNormalizedWidth(project);
    const scale = targetW / spanX;
    const planWidth = targetW + 2 * pad;
    return {
      mode,
      x0,
      y0,
      scaleX: scale,
      scaleY: scale,
      offsetX: pad,
      offsetY: pad,
      scale,
      pad,
      gutter,
      targetW,
      planWidth,
      width: planWidth + gutter,
      height: Math.max(spanY * scale + 2 * pad, 330),
    };
  }

  // contain / stretch: fit into the target box, insetting by `pad` on all sides.
  const width = getExportTargetW(project);
  const height = getExportTargetH(project);
  const innerW = Math.max(1, width - 2 * pad);
  const innerH = Math.max(1, height - 2 * pad);
  let scaleX: number;
  let scaleY: number;
  let offsetX: number;
  let offsetY: number;
  if (mode === "stretch") {
    scaleX = innerW / spanX;
    scaleY = innerH / spanY;
    offsetX = pad;
    offsetY = pad;
  } else {
    // contain: uniform scale, centered
    const s = Math.min(innerW / spanX, innerH / spanY);
    scaleX = s;
    scaleY = s;
    offsetX = (width - spanX * s) / 2;
    offsetY = (height - spanY * s) / 2;
  }
  return {
    mode,
    x0,
    y0,
    scaleX,
    scaleY,
    offsetX,
    offsetY,
    scale: Math.min(scaleX, scaleY),
    pad,
    gutter,
    targetW: width,
    planWidth: width,
    width,
    height,
  };
}

export type ExportLayout = {
  mode: "width" | "contain" | "stretch";
  x0: number;
  y0: number;
  /** Per-axis scales (equal except in stretch mode). */
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
  /** Representative scale for stroke widths / badge preview sizing. */
  scale: number;
  pad: number;
  gutter: number;
  targetW: number;
  planWidth: number;
  width: number;
  height: number;
  badge: ManualBadgeLayout;
};

/** Same transform/metrics as emitManualSvg — for UI preview and badge editing. */
export function computeExportLayout(project: ManualProject): ExportLayout {
  const dims = computeCanvasDims(project);
  return { ...dims, badge: getBadgeLayout(project) };
}

/** Map export-space point → source-image space. */
export function exportToSource(layout: ExportLayout, p: Point): Point {
  return [(p[0] - layout.offsetX) / layout.scaleX + layout.x0, (p[1] - layout.offsetY) / layout.scaleY + layout.y0];
}

/** Map source-image point → export space. */
export function sourceToExport(layout: ExportLayout, p: Point): Point {
  return [(p[0] - layout.x0) * layout.scaleX + layout.offsetX, (p[1] - layout.y0) * layout.scaleY + layout.offsetY];
}

// Categories a user can actually draw with (ignore is auto-only).
export const DRAW_CATEGORIES: Category[] = [
  "fnb",
  "fashion",
  "specialty",
  "services",
  "anchor",
  "vacant",
  "zone",
];

// One flat color per category — mirrors the AEON preset `big` map so manual
// output stays visually consistent with the auto pipeline and across floors.
export const CATEGORY_COLORS: Record<Category, string> = {
  fnb: AEON_CONFIG.big.fnb,
  fashion: AEON_CONFIG.big.fashion,
  specialty: AEON_CONFIG.big.specialty,
  services: AEON_CONFIG.big.services,
  anchor: AEON_CONFIG.big.anchor,
  vacant: AEON_CONFIG.big.vacant,
  zone: AEON_CONFIG.big.zone_yellow,
  ignore: "#CCCCCC",
};

let idCounter = 0;
export function newShapeId(): string {
  idCounter += 1;
  return `s${Date.now().toString(36)}${idCounter}`;
}

export function defaultFill(cat: Category): string {
  return CATEGORY_COLORS[cat] ?? "#CCCCCC";
}

export function shapeVerts(s: Pick<ManualShape, "points" | "verts">): PolyVert[] {
  if (s.verts && s.verts.length >= 2) return s.verts;
  return s.points.map((p) => ({ p }));
}

export function shellVertsOf(project: ManualProject): PolyVert[] | null {
  if (project.shellVerts && project.shellVerts.length >= 3) return project.shellVerts;
  if (project.shell && project.shell.length >= 3) return project.shell.map((p) => ({ p }));
  return null;
}

export function syncShapeFromVerts(verts: PolyVert[]): { verts: PolyVert[]; points: Point[] } {
  return { verts, points: flattenPolyVerts(verts) };
}

// Cubic-bezier "magic number" — 4 curves approximate a circle/ellipse to <0.02%.
const KAPPA = 0.5522847498307936;

/**
 * Exact axis-aligned ellipse as 4 bezier anchors (top/right/bottom/left) with
 * symmetric tangent handles. Only 4 draggable points, so a placed ellipse stays
 * easy to reshape (vs. a 48-gon of anchors). `pathDFromVerts` mirrors each
 * anchor's `handleOut` into the incoming control point, so the curve is smooth.
 */
export function ellipseVertsFromBox(a: Point, b: Point): PolyVert[] {
  const x0 = Math.min(a[0], b[0]);
  const y0 = Math.min(a[1], b[1]);
  const x1 = Math.max(a[0], b[0]);
  const y1 = Math.max(a[1], b[1]);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const rx = (x1 - x0) / 2;
  const ry = (y1 - y0) / 2;
  if (rx < 0.5 || ry < 0.5) return [];
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  // Clockwise from top; handleOut points along the tangent toward the next anchor.
  return [
    { p: [cx, cy - ry], handleOut: [cx + kx, cy - ry] }, // top → +x
    { p: [cx + rx, cy], handleOut: [cx + rx, cy + ky] }, // right → +y
    { p: [cx, cy + ry], handleOut: [cx - kx, cy + ry] }, // bottom → -x
    { p: [cx - rx, cy], handleOut: [cx - rx, cy - ky] }, // left → -y
  ];
}

export function pathDFromVerts(verts: PolyVert[]): string {
  if (verts.length === 0) return "";
  const parts: string[] = [`M${verts[0].p[0].toFixed(1)},${verts[0].p[1].toFixed(1)}`];
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % verts.length];
    if (!a.handleOut && !b.handleOut) {
      parts.push(`L${b.p[0].toFixed(1)},${b.p[1].toFixed(1)}`);
    } else {
      const c1 = a.handleOut ?? lerpPt(a.p, b.p, 1 / 3);
      const c2 = b.handleOut
        ? ([2 * b.p[0] - b.handleOut[0], 2 * b.p[1] - b.handleOut[1]] as Point)
        : lerpPt(a.p, b.p, 2 / 3);
      parts.push(
        `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${b.p[0].toFixed(1)},${b.p[1].toFixed(1)}`,
      );
    }
  }
  parts.push("Z");
  return parts.join("");
}

/** Closest point on segment a→b to p; returns distance squared and t in [0,1]. */
export function distToSegment(p: Point, a: Point, b: Point): { dist2: number; t: number; q: Point } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  const q: Point = [a[0] + t * dx, a[1] + t * dy];
  const ddx = p[0] - q[0];
  const ddy = p[1] - q[1];
  return { dist2: ddx * ddx + ddy * ddy, t, q };
}

/** Find nearest edge of a closed vert ring within maxDist (content units). */
export function nearestEdge(
  p: Point,
  verts: PolyVert[],
  maxDist: number,
): { index: number; q: Point; dist: number } | null {
  if (verts.length < 2) return null;
  let best: { index: number; q: Point; dist: number } | null = null;
  const max2 = maxDist * maxDist;
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i].p;
    const b = verts[(i + 1) % verts.length].p;
    const { dist2, q } = distToSegment(p, a, b);
    if (dist2 <= max2 && (!best || dist2 < best.dist * best.dist)) {
      best = { index: i, q, dist: Math.sqrt(dist2) };
    }
  }
  return best;
}

export function insertVertOnEdge(verts: PolyVert[], edgeIndex: number, q: Point): PolyVert[] {
  const next: PolyVert[] = verts.map((v) => ({
    p: [v.p[0], v.p[1]] as Point,
    ...(v.handleOut ? { handleOut: [v.handleOut[0], v.handleOut[1]] as Point } : {}),
  }));
  // break curve: clear handleOut on the edge start so new corner is sharp
  next[edgeIndex] = { p: next[edgeIndex].p };
  next.splice(edgeIndex + 1, 0, { p: q });
  return next;
}

/** Set/replace outgoing handle on the start vertex of an edge (bend that segment). */
export function bendEdge(verts: PolyVert[], edgeIndex: number, handlePoint: Point): PolyVert[] {
  const next: PolyVert[] = verts.map((v) => ({
    p: [v.p[0], v.p[1]] as Point,
    ...(v.handleOut ? { handleOut: [v.handleOut[0], v.handleOut[1]] as Point } : {}),
  }));
  const i = ((edgeIndex % next.length) + next.length) % next.length;
  next[i] = { p: next[i].p, handleOut: [handlePoint[0], handlePoint[1]] as Point };
  return next;
}

/** Remove a vertex; returns null if it would leave fewer than 3 points. */
export function removeVert(verts: PolyVert[], index: number): PolyVert[] | null {
  if (verts.length <= 3) return null;
  if (index < 0 || index >= verts.length) return null;
  return verts.filter((_, i) => i !== index).map((v) => ({
    p: [v.p[0], v.p[1]] as Point,
    ...(v.handleOut ? { handleOut: [v.handleOut[0], v.handleOut[1]] as Point } : {}),
  }));
}

/** Content-space edge hit radius from zoom (screen ~28px, floor 8 content units). */
export function edgeHitRadius(viewScale: number): number {
  return Math.max(8, 28 / Math.max(0.05, viewScale));
}

/** Tighter radius for Alt-bend so far edges don't steal the hit. */
export function bendHitRadius(viewScale: number): number {
  return Math.max(6, 18 / Math.max(0.05, viewScale));
}

/**
 * Pick which edge to bend on Alt-drag.
 * Prefer outgoing edge from selected vertex when pointer is near that vertex;
 * otherwise nearest edge with mid-segment preference.
 */
export function pickBendEdge(
  p: Point,
  verts: PolyVert[],
  maxDist: number,
  preferVertIndex: number | null,
): { index: number; q: Point; dist: number } | null {
  if (verts.length < 2) return null;

  if (
    preferVertIndex != null &&
    preferVertIndex >= 0 &&
    preferVertIndex < verts.length
  ) {
    const vp = verts[preferVertIndex].p;
    const dx = p[0] - vp[0];
    const dy = p[1] - vp[1];
    if (dx * dx + dy * dy <= maxDist * maxDist * 2.25) {
      // 1.5× maxDist — still near the selected anchor
      const next = verts[(preferVertIndex + 1) % verts.length].p;
      const { q, dist2 } = distToSegment(p, vp, next);
      return { index: preferVertIndex, q, dist: Math.sqrt(dist2) };
    }
  }

  const max2 = maxDist * maxDist;
  let best: { index: number; q: Point; dist: number; score: number } | null = null;
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i].p;
    const b = verts[(i + 1) % verts.length].p;
    const { dist2, t, q } = distToSegment(p, a, b);
    if (dist2 > max2) continue;
    const endBias = t < 0.12 || t > 0.88 ? maxDist * 0.55 : 0;
    const score = Math.sqrt(dist2) + endBias;
    if (!best || score < best.score) {
      best = { index: i, q, dist: Math.sqrt(dist2), score };
    }
  }
  return best ? { index: best.index, q: best.q, dist: best.dist } : null;
}

/** Draft helpers below — cubic sampling for sync/export. */

function lerpPt(a: Point, b: Point, t: number): Point {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function cubicAt(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  return [
    uu * u * p0[0] + 3 * uu * t * p1[0] + 3 * u * tt * p2[0] + tt * t * p3[0],
    uu * u * p0[1] + 3 * uu * t * p1[1] + 3 * u * tt * p2[1] + tt * t * p3[1],
  ];
}

function sampleCubic(p0: Point, p1: Point, p2: Point, p3: Point, n: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= n; i++) out.push(cubicAt(p0, p1, p2, p3, i / n));
  return out;
}

/** Densify pen verts (with optional handles) into a closed-ready polyline. */
export function flattenPolyVerts(verts: PolyVert[], samplesPerCurve = 12): Point[] {
  if (verts.length === 0) return [];
  if (verts.length === 1) return [verts[0].p];

  const appendSegment = (out: Point[], a: PolyVert, b: PolyVert) => {
    if (!a.handleOut && !b.handleOut) {
      out.push(b.p);
      return;
    }
    const c1 = a.handleOut ?? lerpPt(a.p, b.p, 1 / 3);
    const c2 = b.handleOut
      ? ([2 * b.p[0] - b.handleOut[0], 2 * b.p[1] - b.handleOut[1]] as Point)
      : lerpPt(a.p, b.p, 2 / 3);
    const pts = sampleCubic(a.p, c1, c2, b.p, samplesPerCurve);
    for (let i = 1; i < pts.length; i++) out.push(pts[i]);
  };

  const out: Point[] = [verts[0].p];
  for (let i = 0; i < verts.length - 1; i++) appendSegment(out, verts[i], verts[i + 1]);
  // closing segment last → first
  appendSegment(out, verts[verts.length - 1], verts[0]);
  // drop duplicate close point (equals first) if last ≈ first
  if (out.length > 1) {
    const last = out[out.length - 1];
    const first = out[0];
    if (Math.abs(last[0] - first[0]) < 1e-6 && Math.abs(last[1] - first[1]) < 1e-6) out.pop();
  }
  return out.filter(
    (p, i, arr) => i === 0 || p[0] !== arr[i - 1][0] || p[1] !== arr[i - 1][1],
  );
}

/** Open preview path (no close) for in-progress pen + rubber-band to cursor. */
export function flattenPolyVertsOpen(verts: PolyVert[], rubber?: Point, samplesPerCurve = 12): Point[] {
  if (verts.length === 0) return rubber ? [rubber] : [];
  const out: Point[] = [verts[0].p];
  const appendSegment = (a: PolyVert, b: PolyVert) => {
    if (!a.handleOut && !b.handleOut) {
      out.push(b.p);
      return;
    }
    const c1 = a.handleOut ?? lerpPt(a.p, b.p, 1 / 3);
    const c2 = b.handleOut
      ? ([2 * b.p[0] - b.handleOut[0], 2 * b.p[1] - b.handleOut[1]] as Point)
      : lerpPt(a.p, b.p, 2 / 3);
    const pts = sampleCubic(a.p, c1, c2, b.p, samplesPerCurve);
    for (let i = 1; i < pts.length; i++) out.push(pts[i]);
  };
  for (let i = 0; i < verts.length - 1; i++) appendSegment(verts[i], verts[i + 1]);
  if (rubber) {
    const last = verts[verts.length - 1];
    if (last.handleOut) {
      const c1 = last.handleOut;
      const c2 = lerpPt(last.p, rubber, 2 / 3);
      const pts = sampleCubic(last.p, c1, c2, rubber, samplesPerCurve);
      for (let i = 1; i < pts.length; i++) out.push(pts[i]);
    } else {
      out.push(rubber);
    }
  }
  return out;
}

function shoelaceArea(ring: Point[]): number {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

// ---- export: normalize + emit grouped SVG ----

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function d(points: Point[]): string {
  return "M" + points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ") + "Z";
}

/** Ensure fill is a usable SVG hex (color input / overrides). */
function exportFill(fill: string | undefined, category: Category): string {
  const raw = (fill ?? "").trim();
  if (/^#[0-9A-Fa-f]{3,8}$/.test(raw)) return raw;
  if (/^[0-9A-Fa-f]{6}$/.test(raw)) return `#${raw}`;
  return defaultFill(category);
}

function normVert(v: PolyVert, norm: (p: Point) => Point): PolyVert {
  return {
    p: norm(v.p),
    handleOut: v.handleOut ? norm(v.handleOut) : undefined,
  };
}

export function emitManualSvg(
  project: ManualProject,
  title = "Petakin",
): { svg: string; width: number; height: number } {
  const cfg = AEON_CONFIG;
  const layout = computeExportLayout(project);
  const { scale, scaleX, scaleY, offsetX, offsetY, x0, y0, width: W, height: H, badge } = layout;
  const stroke = getStroke(project);
  const shellPts = project.shell && project.shell.length >= 3 ? project.shell : null;
  const badgeStroke = cfg.badge.stroke;
  const textY = badge.cy + badge.fontSize * 0.36;

  const norm = (p: Point): Point => [(p[0] - x0) * scaleX + offsetX, (p[1] - y0) * scaleY + offsetY];

  const shapeById = new Map(project.shapes.map((s) => [s.id, s]));
  const tree = getLayerTree(project);

  const strokeHex = stroke.color;
  const strokeW = stroke.width * scale;
  const shellStroke = getShellStroke(project);
  const shellStrokeHex = shellStroke.color;
  const shellStrokeW = shellStroke.width * scale;
  const shellNorm = shellPts ? shellPts.map(norm) : null;

  const o: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W.toFixed(0)}" height="${H.toFixed(0)}" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}">`,
    `  <title>${esc(title)} - ${esc(project.floor)}</title>`,
  ];

  if (shellNorm) {
    o.push(`  <defs>`);
    o.push(`    <clipPath id="shell">`);
    o.push(`      <path d="${d(shellNorm)}"/>`);
    o.push(`    </clipPath>`);
    o.push(`  </defs>`);
    o.push(`  <g id="shell">`);
    o.push(
      `    <path fill="${cfg.shellFill}" stroke="${shellStrokeHex}" stroke-width="${shellStrokeW.toFixed(2)}" ` +
        `stroke-linejoin="round" stroke-linecap="round" d="${d(shellNorm)}"/>`,
    );
    o.push(`  </g>`);
  }

  // Emit shapes mirroring the layer tree in true paint order (back→front), so the
  // export z-order matches the canvas exactly. Per-category counter keeps stable,
  // Figma-selectable ids + data-family; hidden nodes/leaves are skipped.
  const catCount: Partial<Record<Category, number>> = {};
  const emitLeaf = (shapeId: string, indent: string) => {
    const s = shapeById.get(shapeId);
    if (!s || !isShapeVisible(project, shapeId)) return;
    const cat = s.category;
    catCount[cat] = (catCount[cat] ?? 0) + 1;
    const id = `${cat}-${String(catCount[cat]).padStart(2, "0")}`;
    const verts = shapeVerts(s).map((v) => normVert(v, norm));
    const flat = flattenPolyVerts(verts);
    const area = Math.round(shoelaceArea(flat.length >= 3 ? flat : verts.map((v) => v.p)));
    // Prefer bezier path (matches canvas); fallback to densified polyline
    const dd = verts.length >= 2 ? pathDFromVerts(verts) : d(flat);
    const fill = exportFill(s.fill, s.category);
    o.push(
      `${indent}<path id="${id}" data-area="${area}" data-family="${cat}" ` +
        `fill="${fill}" stroke="none" d="${dd}"/>`,
    );
    o.push(
      `${indent}<path data-stroke-for="${id}" fill="none" stroke="${strokeHex}" ` +
        `stroke-width="${strokeW.toFixed(2)}" stroke-linejoin="round" ` +
        `stroke-linecap="round" d="${dd}"/>`,
    );
  };
  const emitNodes = (nodes: ManualNode[], indent: string) => {
    for (const n of nodes) {
      if (n.kind === "leaf") {
        emitLeaf(n.shapeId, indent);
        continue;
      }
      if (!isNodeVisible(project, n.id)) continue; // skip hidden subtree
      const nm = n.name ? ` data-name="${esc(n.name)}"` : "";
      o.push(`${indent}<g id="node-${n.id}"${nm}>`);
      emitNodes(n.children, indent + "  ");
      o.push(`${indent}</g>`);
    }
  };

  const clipAttr = shellNorm ? ` clip-path="url(#shell)"` : "";
  o.push(`  <g id="units"${clipAttr}>`);
  emitNodes(tree.root, "    ");
  o.push(`  </g>`);

  o.push(`  <g id="badge">`);
  o.push(
    `    <circle cx="${badge.cx.toFixed(1)}" cy="${badge.cy.toFixed(1)}" r="${badge.r.toFixed(1)}" fill="none" ` +
      `stroke="${badgeStroke}" stroke-width="${badge.strokeWidth}"/>`,
  );
  o.push(
    `    <text x="${badge.cx.toFixed(1)}" y="${textY.toFixed(1)}" text-anchor="middle" ` +
      `font-family="Arial, Helvetica, sans-serif" font-weight="700" ` +
      `font-size="${badge.fontSize}" fill="${badgeStroke}">${esc(project.floor)}</text>`,
  );
  o.push(`  </g>`);
  o.push(`</svg>`);

  return { svg: o.join("\n"), width: W, height: H };
}

// ---- import: parse a Petakin-exported SVG back into an editable project ----
// Inverse of emitManualSvg. Recovers shape outlines, categories, fills, group
// nesting/names, floor, shell, strokes and badge. NOT recoverable (not emitted):
// the denah image, real shape/leaf ids+names, shape kind (rect/ellipse), node
// lock/visible flags, and the original image-space transform — coords come back
// in the SVG's export space, which we adopt verbatim as the new working space.

/** ~coordinate equality; export coords are rounded to .1 so .15 is a safe slop. */
function approxPt(a: Point, b: Point, eps = 0.15): boolean {
  return Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps;
}

/**
 * Inverse of pathDFromVerts()/d(): parse an absolute closed path ("M …" with
 * L/C segments or implicit-lineto polyline, ending "Z") back into PolyVert[].
 * Detects and strips the 1/3 & 2/3 lerp fallbacks pathDFromVerts emits for
 * missing handles, so a plain polygon round-trips with no spurious handles and
 * a curved shape re-emits an identical `d`.
 */
export function parsePathD(dStr: string): PolyVert[] {
  const tokens = dStr.match(/[a-zA-Z]|-?\d*\.?\d+(?:[eE][-+]?\d+)?/g);
  if (!tokens) return [];
  const verts: PolyVert[] = [];
  let cmd = "";
  let i = 0;
  const num = (): number => parseFloat(tokens[i++]);
  while (i < tokens.length) {
    const t = tokens[i];
    if (/[a-zA-Z]/.test(t)) {
      cmd = t.toUpperCase();
      i++;
      if (cmd === "Z") break;
      continue;
    }
    if (cmd === "M") {
      verts.push({ p: [num(), num()] });
      cmd = "L"; // subsequent coord pairs are implicit linetos (SVG spec, d())
    } else if (cmd === "L") {
      verts.push({ p: [num(), num()] });
    } else if (cmd === "C" && verts.length) {
      const a = verts[verts.length - 1].p;
      const c1: Point = [num(), num()];
      const c2: Point = [num(), num()];
      const p: Point = [num(), num()];
      const lerp1: Point = [a[0] + (p[0] - a[0]) / 3, a[1] + (p[1] - a[1]) / 3];
      const lerp2: Point = [a[0] + (2 * (p[0] - a[0])) / 3, a[1] + (2 * (p[1] - a[1])) / 3];
      if (!approxPt(c1, lerp1)) verts[verts.length - 1].handleOut = c1;
      const v: PolyVert = { p };
      if (!approxPt(c2, lerp2)) v.handleOut = [2 * p[0] - c2[0], 2 * p[1] - c2[1]];
      verts.push(v);
    } else {
      i++; // unexpected (relative/other) — skip defensively
    }
  }
  // pathDFromVerts closes with a segment back to verts[0]; that yields a trailing
  // vert coincident with the first. Drop it (carry its handle onto the first if
  // the first didn't already get one).
  if (verts.length >= 2) {
    const first = verts[0];
    const last = verts[verts.length - 1];
    if (approxPt(first.p, last.p)) {
      if (!first.handleOut && last.handleOut) first.handleOut = last.handleOut;
      verts.pop();
    }
  }
  return verts;
}

function svgHexFill(fill: string | null, category: Category): string {
  const raw = (fill ?? "").trim();
  if (/^#[0-9A-Fa-f]{3,8}$/.test(raw)) return raw;
  if (/^[0-9A-Fa-f]{6}$/.test(raw)) return `#${raw}`;
  return defaultFill(category);
}

function svgCategory(fam: string | null): Category {
  return (DRAW_CATEGORIES as string[]).includes(fam ?? "") ? (fam as Category) : "specialty";
}

/** Parse an exported Petakin manual-mode SVG into an editable ManualProject. */
export function parseManualSvg(svgText: string): ManualProject {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  if (doc.getElementsByTagName("parsererror").length || !doc.querySelector("svg")) {
    throw new Error("not a valid SVG");
  }

  // floor: "<title>Petakin - {floor}</title>", fallback to badge text
  const titleTxt = doc.querySelector("title")?.textContent?.trim() ?? "";
  const dash = titleTxt.indexOf(" - ");
  const badgeText = doc.querySelector("#badge text")?.textContent?.trim() ?? "";
  const floor = (dash >= 0 ? titleTxt.slice(dash + 3).trim() : "") || badgeText || "?F";

  // shapes + layer tree: walk <g id="units"> recursively, mirroring emitNodes()
  const shapes: ManualShape[] = [];
  const walk = (parent: Element): ManualNode[] => {
    const out: ManualNode[] = [];
    for (const el of Array.from(parent.children)) {
      if (el.tagName === "g" && (el.getAttribute("id") ?? "").startsWith("node-")) {
        out.push({
          id: newNodeId(),
          kind: "container",
          name: el.getAttribute("data-name") ?? "",
          locked: false,
          visible: true,
          children: walk(el),
        });
      } else if (el.tagName === "g") {
        // Non-node <g> wrapper (auto/backend export groups units by category,
        // e.g. <g id="cat-fnb">). Recurse and inline its shapes into the parent
        // so those units aren't dropped; no container node (keeps Layers flat).
        out.push(...walk(el));
      } else if (el.tagName === "path" && el.hasAttribute("data-family")) {
        // the fill path (stroke sibling carries data-stroke-for instead — skipped)
        const cat = svgCategory(el.getAttribute("data-family"));
        const verts = parsePathD(el.getAttribute("d") ?? "");
        if (verts.length < 2) continue;
        const id = newShapeId();
        shapes.push({
          id,
          kind: "poly",
          points: verts.map((v) => v.p),
          verts,
          category: cat,
          fill: svgHexFill(el.getAttribute("fill"), cat),
          name: el.getAttribute("id") ?? undefined,
        });
        out.push({
          id: newNodeId("l"),
          kind: "leaf",
          name: el.getAttribute("id") ?? "",
          locked: false,
          visible: true,
          shapeId: id,
        });
      }
    }
    return out;
  };
  const unitsG = doc.querySelector("#units");
  const root = unitsG ? walk(unitsG) : [];

  // shell + shell stroke. NB: the id "shell" is on both <clipPath> and <g>; scope
  // to the <g> so we read the styled fill path, not the stroke-less clip path.
  const shellPath =
    (doc.querySelector("g#shell path") as SVGPathElement | null) ??
    (doc.querySelector("#shell path") as SVGPathElement | null);
  const shellVerts = shellPath ? parsePathD(shellPath.getAttribute("d") ?? "") : [];
  const shell = shellVerts.length >= 3 ? shellVerts.map((v) => v.p) : null;
  const shellStroke: ManualStroke = shellPath
    ? {
        color: shellPath.getAttribute("stroke") || DEFAULT_SHELL_STROKE.color,
        width: parseFloat(shellPath.getAttribute("stroke-width") || "") || DEFAULT_SHELL_STROKE.width,
      }
    : { ...DEFAULT_SHELL_STROKE };

  // tenant stroke: first <path data-stroke-for>
  const strokePath = doc.querySelector("path[data-stroke-for]");
  const stroke: ManualStroke = strokePath
    ? {
        color: strokePath.getAttribute("stroke") || DEFAULT_STROKE.color,
        width: parseFloat(strokePath.getAttribute("stroke-width") || "") || DEFAULT_STROKE.width,
      }
    : { ...DEFAULT_STROKE };

  // badge
  const circle = doc.querySelector("#badge circle");
  const text = doc.querySelector("#badge text");
  const numAttr = (el: Element | null, a: string): number => parseFloat(el?.getAttribute(a) || "");
  let badgeLayout: ManualBadgeLayout | undefined;
  if (circle) {
    const cx = numAttr(circle, "cx");
    const cy = numAttr(circle, "cy");
    const r = numAttr(circle, "r");
    const strokeWidth = numAttr(circle, "stroke-width");
    const fontSize = numAttr(text, "font-size");
    if (!Number.isNaN(cx) && !Number.isNaN(cy) && !Number.isNaN(r)) {
      badgeLayout = {
        cx,
        cy,
        r,
        fontSize: !Number.isNaN(fontSize) ? fontSize : AEON_CONFIG.badge.fontSize,
        strokeWidth: !Number.isNaN(strokeWidth) ? strokeWidth : AEON_CONFIG.badge.strokeWidth,
      };
    }
  }

  return {
    version: 2,
    floor,
    bg: { dataUrl: "", width: 0, height: 0, opacity: 0.4 },
    shapes,
    shell,
    shellVerts: shellVerts.length >= 3 ? shellVerts : null,
    stroke,
    shellStroke,
    layerTree: { root, activeContainerId: null },
    exportNormalizedWidth: AEON_CONFIG.normalizedWidth,
    badgeLayout,
    updatedAt: Date.now(),
  };
}

// ---- seed from the auto pipeline: geometry.units -> editable shapes ----
export function seedFromGeometry(geo: Geometry): ManualShape[] {
  const t = geo.transform;
  const toSrc = (p: Point): Point => [(p[0] - t.pad) / t.scale + t.x0, (p[1] - t.pad) / t.scale + t.y0];
  return geo.units.map((u) => {
    const cat = (DRAW_CATEGORIES as string[]).includes(u.category)
      ? (u.category as Category)
      : "specialty";
    return {
      id: newShapeId(),
      kind: "poly" as ShapeKind,
      points: u.points.map(toSrc),
      category: cat,
      fill: u.fill,
      name: u.id,
    };
  });
}

/** Optional: invert auto shell into manual shell points (source image space). */
export function shellFromGeometry(geo: Geometry): Point[] | null {
  const ring = geo.shell?.[0]?.points;
  if (!ring || ring.length < 3) return null;
  const t = geo.transform;
  return ring.map(([x, y]) => [(x - t.pad) / t.scale + t.x0, (y - t.pad) / t.scale + t.y0] as Point);
}

// ---- localStorage store (multi-tab workspace) ----

const KEY_V1 = "petakin.manual.v1";
const KEY_WS = "petakin.manual.workspace.v2";

export interface ManualTab {
  id: string;
  title: string;
  project: ManualProject;
}

export interface ManualWorkspace {
  version: 2;
  tabs: ManualTab[];
  activeTabId: string;
  updatedAt: number;
}

let tabIdCounter = 0;
export function newTabId(): string {
  tabIdCounter += 1;
  return `t${Date.now().toString(36)}${tabIdCounter}`;
}

export function newProject(floor: string): ManualProject {
  return {
    version: 2,
    floor,
    bg: { dataUrl: "", width: 0, height: 0, opacity: 0.4 },
    shapes: [],
    shell: null,
    shellVerts: null,
    stroke: { ...DEFAULT_STROKE },
    shellStroke: { ...DEFAULT_SHELL_STROKE },
    drawOpacity: DEFAULT_DRAW_OPACITY,
    exportNormalizedWidth: AEON_CONFIG.normalizedWidth,
    pngScale: DEFAULT_PNG_SCALE,
    layerTree: emptyLayerTree(),
    updatedAt: Date.now(),
  };
}

export function makeTab(project: ManualProject, title?: string): ManualTab {
  return {
    id: newTabId(),
    title: title || project.floor || "1F",
    // Deep-clone so tabs never share layerTree / shapes refs
    project: structuredClone({ ...project, updatedAt: Date.now() }),
  };
}

export function newWorkspace(floor = "1F"): ManualWorkspace {
  const tab = makeTab(newProject(floor));
  return {
    version: 2,
    tabs: [tab],
    activeTabId: tab.id,
    updatedAt: Date.now(),
  };
}

export function workspaceFromProject(project: ManualProject): ManualWorkspace {
  const tab = makeTab(project);
  return {
    version: 2,
    tabs: [tab],
    activeTabId: tab.id,
    updatedAt: Date.now(),
  };
}

export function activeProject(ws: ManualWorkspace | null): ManualProject | null {
  if (!ws?.tabs.length) return null;
  return ws.tabs.find((t) => t.id === ws.activeTabId)?.project ?? ws.tabs[0].project;
}

export function suggestNextFloor(ws: ManualWorkspace): string {
  const used = new Set(ws.tabs.map((t) => t.project.floor));
  for (let i = 1; i <= 20; i++) {
    const f = `${i}F`;
    if (!used.has(f)) return f;
  }
  return `F${ws.tabs.length + 1}`;
}

function dropBgData(project: ManualProject): ManualProject {
  return { ...project, bg: { ...project.bg, dataUrl: "" } };
}

function workspaceWithLiteBgs(ws: ManualWorkspace): ManualWorkspace {
  return {
    ...ws,
    tabs: ws.tabs.map((t) => ({ ...t, project: dropBgData(t.project) })),
  };
}

/** Normalize every tab's layer tree (migrate v1→v2 / reconcile) + stamp version 2. */
function normalizeWorkspace(ws: ManualWorkspace): ManualWorkspace {
  return {
    ...ws,
    tabs: ws.tabs.map((t) => {
      const project = ensureLayerTree(t.project);
      return project === t.project
        ? t
        : { ...t, project: { ...project, version: 2 } };
    }),
  };
}

export function loadWorkspace(): ManualWorkspace | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY_WS);
    if (raw) {
      const ws = JSON.parse(raw) as ManualWorkspace;
      if (ws.version === 2 && Array.isArray(ws.tabs) && ws.tabs.length > 0) {
        if (!ws.tabs.some((t) => t.id === ws.activeTabId)) {
          ws.activeTabId = ws.tabs[0].id;
        }
        return normalizeWorkspace(ws);
      }
    }
  } catch {
    /* fall through to v1 migrate */
  }
  try {
    const raw = localStorage.getItem(KEY_V1);
    if (!raw) return null;
    const p = JSON.parse(raw) as ManualProject;
    if (p.version !== 1 || !Array.isArray(p.shapes)) return null;
    const ws = workspaceFromProject(p);
    // Persist migration; keep v1 as backup until next successful ws save
    try {
      localStorage.setItem(KEY_WS, JSON.stringify(ws));
    } catch {
      /* ignore */
    }
    return ws;
  } catch {
    return null;
  }
}

export function saveWorkspace(workspace: ManualWorkspace): { ok: boolean; bgDropped: boolean } {
  if (typeof window === "undefined") return { ok: false, bgDropped: false };
  const withTs: ManualWorkspace = { ...workspace, version: 2, updatedAt: Date.now() };
  try {
    localStorage.setItem(KEY_WS, JSON.stringify(withTs));
    localStorage.removeItem(KEY_V1);
    return { ok: true, bgDropped: false };
  } catch {
    try {
      const lite = workspaceWithLiteBgs(withTs);
      localStorage.setItem(KEY_WS, JSON.stringify(lite));
      localStorage.removeItem(KEY_V1);
      return { ok: true, bgDropped: true };
    } catch {
      return { ok: false, bgDropped: false };
    }
  }
}

/** @deprecated use loadWorkspace — kept for any external callers */
export function loadProject(): ManualProject | null {
  return activeProject(loadWorkspace());
}

/** @deprecated use saveWorkspace */
export function saveProject(project: ManualProject): { ok: boolean; bgDropped: boolean } {
  return saveWorkspace(workspaceFromProject(project));
}

export function clearProject(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY_V1);
  localStorage.removeItem(KEY_WS);
}

export function isManualWorkspace(data: unknown): data is ManualWorkspace {
  if (!data || typeof data !== "object") return false;
  const w = data as ManualWorkspace;
  return w.version === 2 && Array.isArray(w.tabs) && w.tabs.length > 0 && typeof w.activeTabId === "string";
}

export function isManualProject(data: unknown): data is ManualProject {
  if (!data || typeof data !== "object") return false;
  const p = data as ManualProject;
  return (p.version === 1 || p.version === 2) && Array.isArray(p.shapes);
}
