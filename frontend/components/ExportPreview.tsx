"use client";
import { useEffect, useMemo, useState } from "react";
import { emitManualSvg, getPngScale, type ManualProject } from "@/lib/manual";

type Props = {
  project: ManualProject;
  onClose: () => void;
  onExportSvg: () => void;
  onExportPng: () => void;
};

/**
 * Figma-style export dialog: renders the exact export SVG on a transparent
 * checkerboard (so users see z-order + transparency before download), with a
 * zoom control and the real output dimensions.
 */
export default function ExportPreview({ project, onClose, onExportSvg, onExportPng }: Props) {
  const [zoom, setZoom] = useState(1);

  const { svg, width, height } = useMemo(() => emitManualSvg(project), [project]);
  const pngScale = getPngScale(project);
  const svgUrl = useMemo(
    () => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    [svg],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-2.5">
          <div className="flex items-baseline gap-3">
            <h2 className="text-sm font-semibold text-ink">Export preview</h2>
            <span className="font-mono text-[11px] text-neutral-500">
              {project.floor} · SVG {width}×{height} · PNG {Math.round(width * pngScale)}×
              {Math.round(height * pngScale)} ({pngScale}×)
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-0.5 text-2xl leading-none text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
            aria-label="Close preview"
          >
            ×
          </button>
        </div>

        <div className="checkerboard min-h-0 flex-1 overflow-auto p-4">
          <div className="mx-auto" style={{ width: width * zoom, height: height * zoom }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={svgUrl}
              alt={`Export preview of ${project.floor}`}
              style={{ width: width * zoom, height: height * zoom, display: "block" }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-neutral-200 px-4 py-2.5">
          <label className="flex items-center gap-2 text-xs text-neutral-600">
            Zoom
            <input
              type="range"
              min={0.25}
              max={2}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-40 accent-brand"
            />
            <span className="w-10 font-mono text-[11px] text-neutral-500">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-600 hover:bg-neutral-200"
            >
              Reset
            </button>
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onExportSvg}
              className="rounded bg-brand px-3 py-1.5 text-sm text-white hover:bg-brand-hover"
            >
              Download SVG
            </button>
            <button
              type="button"
              onClick={onExportPng}
              className="rounded bg-brand-hover px-3 py-1.5 text-sm text-white"
            >
              Download PNG
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
