"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Category } from "@/lib/types";
import { CATEGORY_LABEL } from "@/lib/types";
import { DRAW_CATEGORIES, defaultFill } from "@/lib/manual";

export type MenuItem =
  | { type: "separator" }
  | {
      type: "item";
      label: string;
      onClick?: () => void;
      disabled?: boolean;
      danger?: boolean;
      shortcut?: string;
      submenu?: MenuItem[];
    }
  | { type: "swatches"; onPick: (cat: Category) => void };

type Props = {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
};

/** One-click category color grid, used as a Fill / Recolor submenu. */
export function colorSwatchItems(onPick: (cat: Category) => void): MenuItem[] {
  return [{ type: "swatches", onPick }];
}

function SwatchGrid({ onPick, onDone }: { onPick: (cat: Category) => void; onDone: () => void }) {
  return (
    <div className="grid grid-cols-4 gap-1 p-1.5">
      {DRAW_CATEGORIES.map((c) => (
        <button
          key={c}
          type="button"
          title={CATEGORY_LABEL[c]}
          className="h-6 w-6 rounded-sm ring-1 ring-black/15 hover:ring-2 hover:ring-brand"
          style={{ background: defaultFill(c) }}
          onClick={() => {
            onPick(c);
            onDone();
          }}
        />
      ))}
    </div>
  );
}

function MenuPanel({
  items,
  onClose,
  className,
}: {
  items: MenuItem[];
  onClose: () => void;
  className?: string;
}) {
  const [openSub, setOpenSub] = useState<number | null>(null);
  const [subSide, setSubSide] = useState<"right" | "left">("right");
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const openSubAt = (i: number) => {
    const el = rowRefs.current.get(i);
    if (el) {
      const r = el.getBoundingClientRect();
      setSubSide(r.right + 180 > window.innerWidth ? "left" : "right");
    }
    setOpenSub(i);
  };

  return (
    <div
      role="menu"
      className={`min-w-45 rounded-md bg-white py-1 text-xs text-neutral-800 shadow-xl ring-1 ring-black/10 ${className ?? ""}`}
    >
      {items.map((item, i) => {
        if (item.type === "separator") {
          return <div key={`sep-${i}`} className="my-1 border-t border-neutral-200" />;
        }
        if (item.type === "swatches") {
          return <SwatchGrid key={`sw-${i}`} onPick={item.onPick} onDone={onClose} />;
        }
        const hasSub = !!item.submenu?.length;
        return (
          <div
            key={`it-${i}`}
            className="relative"
            ref={(el) => {
              if (el) rowRefs.current.set(i, el);
              else rowRefs.current.delete(i);
            }}
            onMouseEnter={() => (hasSub && !item.disabled ? openSubAt(i) : setOpenSub(null))}
          >
            <button
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={`flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left ${
                item.disabled
                  ? "cursor-default text-neutral-400"
                  : item.danger
                    ? "text-red-600 hover:bg-red-50"
                    : "hover:bg-neutral-100"
              } ${openSub === i ? "bg-neutral-100" : ""}`}
              onClick={() => {
                if (item.disabled) return;
                if (hasSub) {
                  openSubAt(i);
                  return;
                }
                item.onClick?.();
                onClose();
              }}
            >
              <span>{item.label}</span>
              {hasSub ? (
                <span className="text-[10px] text-neutral-400">▸</span>
              ) : item.shortcut ? (
                <span className="text-[10px] text-neutral-400">{item.shortcut}</span>
              ) : null}
            </button>
            {hasSub && openSub === i && (
              <div
                className={`absolute top-0 z-10 ${subSide === "right" ? "left-full pl-1" : "right-full pr-1"}`}
              >
                <MenuPanel items={item.submenu!} onClose={onClose} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let nx = x;
    let ny = y;
    if (nx + r.width > window.innerWidth - 8) nx = Math.max(8, window.innerWidth - r.width - 8);
    if (ny + r.height > window.innerHeight - 8) ny = Math.max(8, window.innerHeight - r.height - 8);
    el.style.left = `${nx}px`;
    el.style.top = `${ny}px`;
  }, [x, y, items]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    const t = window.setTimeout(() => {
      document.addEventListener("pointerdown", onDown, true);
      document.addEventListener("keydown", onKey);
      window.addEventListener("scroll", onClose, true);
      window.addEventListener("resize", onClose);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div ref={ref} style={{ position: "fixed", left: x, top: y, zIndex: 80 }}>
      <MenuPanel items={items} onClose={onClose} />
    </div>,
    document.body,
  );
}
