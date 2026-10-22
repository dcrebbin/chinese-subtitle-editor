import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { ArrowsPointingOutIcon } from "@heroicons/react/20/solid";

import { setOverlayState, useOverlayStore } from "@/app/store/overlay.store";

type ElementId = "video" | "subtitles" | "background" | "image1" | "image2";
type Rect = { x: number; y: number; width: number; height: number };
const labels: Record<ElementId, string> = {
  video: "Video",
  subtitles: "Subtitles",
  background: "Background image",
  image1: "Top background image",
  image2: "Bottom background image",
};
const edges = ["left", "right", "top", "bottom"] as const;

export default function PreviewElementControls({
  canvasRef,
  backgroundRef,
  outputWidth,
  outputHeight,
  videoRect,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  backgroundRef: RefObject<HTMLDivElement | null>;
  outputWidth: number;
  outputHeight: number;
  videoRect: Rect;
}) {
  const { overlay } = useOverlayStore();
  const [selected, setSelected] = useState<ElementId | null>(null);
  const [rects, setRects] = useState<Partial<Record<ElementId, Rect>>>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    x: number;
    y: number;
    scale: number;
    width: number;
    height: number;
    edge: (typeof edges)[number];
  } | null>(null);

  useEffect(() => {
    const probe = document.createElement("canvas");
    probe.width = 192;
    probe.height = Math.round((192 * outputHeight) / outputWidth);
    const ctx = probe.getContext("2d", { willReadFrequently: true });
    function measure() {
      const frame = rootRef.current?.getBoundingClientRect();
      if (!frame?.width || !ctx) return;
      const next: Partial<Record<ElementId, Rect>> = {};
      backgroundRef.current
        ?.querySelectorAll<HTMLElement>("[data-preview-image]")
        .forEach((image) => {
          const rect = image.getBoundingClientRect();
          const id = image.dataset.previewImage as ElementId;
          next[id] = {
            x: ((rect.left - frame.left) / frame.width) * 100,
            y: ((rect.top - frame.top) / frame.height) * 100,
            width: (rect.width / frame.width) * 100,
            height: (rect.height / frame.height) * 100,
          };
        });
      if (canvasRef.current?.width) {
        ctx.clearRect(0, 0, probe.width, probe.height);
        ctx.drawImage(canvasRef.current, 0, 0, probe.width, probe.height);
        const pixels = ctx.getImageData(0, 0, probe.width, probe.height).data;
        let left = probe.width,
          top = probe.height,
          right = -1,
          bottom = -1;
        for (let y = 0; y < probe.height; y++)
          for (let x = 0; x < probe.width; x++) {
            if (pixels[(y * probe.width + x) * 4 + 3] > 20) {
              left = Math.min(left, x);
              right = Math.max(right, x);
              top = Math.min(top, y);
              bottom = Math.max(bottom, y);
            }
          }
        if (right >= left)
          next.subtitles = {
            x: (left / probe.width) * 100,
            y: (top / probe.height) * 100,
            width: ((right - left + 1) / probe.width) * 100,
            height: ((bottom - top + 1) / probe.height) * 100,
          };
      }
      setRects(next);
    }
    measure();
    const timer = window.setInterval(measure, 100);
    return () => window.clearInterval(timer);
  }, [backgroundRef, canvasRef, outputWidth, outputHeight]);

  const available: ElementId[] = [];
  if (overlay.backgroundMode === "full-image" && overlay.backgroundImage)
    available.push("background");
  if (overlay.backgroundMode === "double-image") {
    if (overlay.doubleBackgroundImage.image1) available.push("image1");
    if (overlay.doubleBackgroundImage.image2) available.push("image2");
  }
  if (overlay.previewUrl) {
    if (overlay.doubleImageLayer === "over" && overlay.backgroundMode === "double-image")
      available.unshift("video");
    else available.push("video");
  }
  if (rects.subtitles || selected === "subtitles") available.push("subtitles");
  const active = selected && available.includes(selected) ? selected : null;
  const bounds = (id: ElementId) => (id === "video" ? videoRect : rects[id]);
  const rect = active ? bounds(active) : undefined;
  const clipped = (r: Rect, id: ElementId): Rect => {
    const minY = id === "image2" ? 50 : 0;
    const maxY = id === "image1" ? 50 : 100;
    const x = Math.max(0, r.x),
      y = Math.max(minY, r.y);
    return {
      x,
      y,
      width: Math.max(0, Math.min(100, r.x + r.width) - x),
      height: Math.max(0, Math.min(maxY, r.y + r.height) - y),
    };
  };
  function values(id: ElementId) {
    if (id === "video")
      return {
        x: overlay.videoOffsetX,
        y: overlay.videoOffsetY,
        scale: overlay.videoScale || 1,
        min: 0.25,
        max: 3,
      };
    if (id === "subtitles")
      return {
        x: overlay.horizontalPosition,
        y: overlay.verticalPosition,
        scale: overlay.sizeMultiplier,
        min: 0.1,
        max: 10,
      };
    if (id === "background")
      return {
        x: overlay.backgroundImageOffsetX,
        y: overlay.backgroundImageOffsetY,
        scale: overlay.backgroundImageScale,
        min: 0.5,
        max: 4,
      };
    return {
      x: overlay.doubleBackgroundImageOffsetX[id],
      y: overlay.doubleBackgroundImageOffsetY[id],
      scale: overlay.doubleBackgroundImageScale[id],
      min: 0.5,
      max: 4,
    };
  }
  function update(id: ElementId, axis: "x" | "y" | "scale", value: number) {
    const state = useOverlayStore.getState().overlay;
    if (id === "video")
      setOverlayState({
        [axis === "x" ? "videoOffsetX" : axis === "y" ? "videoOffsetY" : "videoScale"]: value,
      });
    else if (id === "subtitles")
      setOverlayState({
        [axis === "x"
          ? "horizontalPosition"
          : axis === "y"
            ? "verticalPosition"
            : "sizeMultiplier"]: value,
      });
    else if (id === "background")
      setOverlayState({
        [axis === "x"
          ? "backgroundImageOffsetX"
          : axis === "y"
            ? "backgroundImageOffsetY"
            : "backgroundImageScale"]: value,
      });
    else {
      const key =
        axis === "x"
          ? "doubleBackgroundImageOffsetX"
          : axis === "y"
            ? "doubleBackgroundImageOffsetY"
            : "doubleBackgroundImageScale";
      setOverlayState({ [key]: { ...state[key], [id]: value } });
    }
  }
  function resize(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || !active) return;
    const horizontal = drag.edge === "left" || drag.edge === "right";
    const delta = horizontal ? event.clientX - drag.x : event.clientY - drag.y;
    const sign = drag.edge === "left" || drag.edge === "top" ? -1 : 1;
    const v = values(active);
    const size = horizontal ? drag.width : drag.height;
    update(
      active,
      "scale",
      Math.max(v.min, Math.min(v.max, drag.scale * (1 + (sign * delta * 2) / Math.max(1, size)))),
    );
  }
  const v = active ? values(active) : null;
  const selection = rect && active ? clipped(rect, active) : null;
  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-3">
      {available.map((id) => {
        const r = bounds(id);
        if (!r) return null;
        const visible = clipped(r, id);
        return (
          <button
            key={id}
            type="button"
            aria-label={`Select ${labels[id]}`}
            onClick={() => setSelected(id)}
            className="pointer-events-auto absolute cursor-pointer bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            style={{
              left: `${visible.x}%`,
              top: `${visible.y}%`,
              width: `${visible.width}%`,
              height: `${visible.height}%`,
            }}
          />
        );
      })}
      <select
        aria-label="Selected preview element"
        className="pointer-events-auto absolute top-12 left-2 max-w-[65%] rounded-md border border-white/20 bg-neutral-900/90 px-2 py-1 text-xs text-white"
        value={active || ""}
        onChange={(event) =>
          setSelected(event.target.value ? (event.target.value as ElementId) : null)
        }
      >
        <option value="">Select an element</option>
        {available.map((id) => (
          <option key={id} value={id}>
            {labels[id]}
          </option>
        ))}
      </select>
      {selection && active && (
        <div
          className="absolute border-2 border-dashed border-blue-500"
          style={{
            left: `${selection.x}%`,
            top: `${selection.y}%`,
            width: `${selection.width}%`,
            height: `${selection.height}%`,
          }}
        >
          {edges.map((edge) => (
            <button
              key={edge}
              type="button"
              aria-label={`Resize ${labels[active]} from ${edge}`}
              title="Drag outward to enlarge, inward to shrink"
              className={`group pointer-events-auto absolute flex touch-none items-center justify-center text-white outline-none ${edge === "left" || edge === "right" ? "inset-y-0 w-4 cursor-ew-resize" : "inset-x-0 h-4 cursor-ns-resize"} ${edge === "left" ? "-left-1" : edge === "right" ? "-right-1" : edge === "top" ? "-top-1" : "-bottom-1"}`}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                const frame = rootRef.current!.getBoundingClientRect();
                dragRef.current = {
                  x: event.clientX,
                  y: event.clientY,
                  scale: values(active).scale,
                  width: (rect!.width / 100) * frame.width,
                  height: (rect!.height / 100) * frame.height,
                  edge,
                };
              }}
              onPointerMove={resize}
              onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key))
                  return;
                event.preventDefault();
                const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
                const sign = edge === "left" || edge === "top" ? -1 : 1;
                const current = values(active);
                update(
                  active,
                  "scale",
                  Math.max(
                    current.min,
                    Math.min(
                      current.max,
                      current.scale + direction * sign * (event.shiftKey ? 0.1 : 0.01),
                    ),
                  ),
                );
              }}
              onPointerUp={(event) => {
                resize(event);
                dragRef.current = null;
                event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={() => {
                dragRef.current = null;
              }}
              onLostPointerCapture={() => {
                dragRef.current = null;
              }}
            >
              <ArrowsPointingOutIcon className="h-5 w-5 rounded bg-blue-600 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 group-active:opacity-100" />
            </button>
          ))}
        </div>
      )}
      {active && v && (
        <>
          <label className="pointer-events-auto absolute top-12 right-1 bottom-10 flex w-7 flex-col items-center rounded bg-black/70 py-1 text-xs text-white">
            Y
            <input
              aria-label={`${labels[active]} position Y`}
              type="range"
              className="min-h-0 w-6 flex-1 accent-blue-500"
              style={{ writingMode: "vertical-lr", direction: "ltr" }}
              min={active === "subtitles" ? 0 : -outputHeight}
              max={outputHeight - 1}
              step={1}
              value={v.y}
              onChange={(event) => update(active, "y", event.target.valueAsNumber)}
            />
            <span className="text-[9px]">{Math.round(v.y)}</span>
          </label>
          <label className="pointer-events-auto absolute right-10 bottom-1 left-3 flex items-center gap-2 rounded bg-black/70 px-2 py-1 text-xs text-white">
            X
            <input
              aria-label={`${labels[active]} position X`}
              type="range"
              className="min-w-0 flex-1 accent-blue-500"
              min={-outputWidth}
              max={outputWidth}
              step={1}
              value={v.x}
              onChange={(event) => update(active, "x", event.target.valueAsNumber)}
            />
            <span>{Math.round(v.x)}</span>
          </label>
        </>
      )}
    </div>
  );
}
