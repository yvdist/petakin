// Backend API wrappers (proxied through /api/* by next.config rewrites).
import type { Config, Geometry, Swatch } from "./types";

export async function detectPalette(
  file: File,
): Promise<{ swatches: Swatch[]; width: number; height: number }> {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch("/api/detect", { method: "POST", body: fd });
  if (!r.ok) throw new Error(`detect failed: ${r.status}`);
  return r.json();
}

export async function processImage(
  file: File,
  config: Config,
  signal?: AbortSignal,
): Promise<Geometry> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("config", JSON.stringify(config));
  const r = await fetch("/api/process", { method: "POST", body: fd, signal });
  if (!r.ok) throw new Error(`process failed: ${r.status}`);
  return r.json();
}

export async function exportSvg(
  floor: string,
  geometry: Geometry,
  config: Config,
  title = "Petakin",
): Promise<string> {
  const r = await fetch("/api/export/svg", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ floor, geometry, config, title }),
  });
  if (!r.ok) throw new Error(`export failed: ${r.status}`);
  return r.text();
}
