"use client";
import { useRef } from "react";

const FLOORS = ["B", "GF", "1F", "2F", "RF"];

export default function Uploader({
  floor,
  onFloor,
  onFile,
  fileName,
}: {
  floor: string;
  onFloor: (f: string) => void;
  onFile: (f: File) => void;
  fileName?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-3">
      <div
        onClick={() => ref.current?.click()}
        className="cursor-pointer rounded-lg border-2 border-dashed border-neutral-300 bg-neutral-50 p-4 text-center hover:border-pink-500"
      >
        <div className="text-sm font-medium text-neutral-700">
          {fileName ? "Change image" : "Upload floor plan (PNG/JPG)"}
        </div>
        {fileName && <div className="mt-1 truncate text-xs text-neutral-500">{fileName}</div>}
        <input
          ref={ref}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
      </div>
      <div>
        <div className="mb-1 text-xs text-neutral-600">Floor label</div>
        <div className="flex gap-1">
          {FLOORS.map((f) => (
            <button
              key={f}
              onClick={() => onFloor(f)}
              className={`flex-1 rounded px-2 py-1 text-sm ${
                floor === f ? "bg-pink-600 text-white" : "bg-neutral-200 text-neutral-700"
              }`}
            >
              {f}
            </button>
          ))}
          <input
            value={floor}
            onChange={(e) => onFloor(e.target.value)}
            className="w-16 rounded border border-neutral-300 px-2 py-1 text-sm"
            placeholder="custom"
          />
        </div>
      </div>
    </div>
  );
}
