import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { CheckIcon, ViewfinderCircleIcon } from "@heroicons/react/20/solid";

import { setOverlayState } from "@/app/store/overlay.store";
import { adjustVideoCrop, type CropHandle, type VideoCrop } from "../../utilities/video-crop";
import BackgroundTypeControl from "./background-type-control";

const handles = [
  ["top-left", "0%", "0%", "nwse-resize"],
  ["top", "50%", "0%", "ns-resize"],
  ["top-right", "100%", "0%", "nesw-resize"],
  ["right", "100%", "50%", "ew-resize"],
  ["bottom-right", "100%", "100%", "nwse-resize"],
  ["bottom", "50%", "100%", "ns-resize"],
  ["bottom-left", "0%", "100%", "nesw-resize"],
  ["left", "0%", "50%", "ew-resize"],
] as const;

export default function VideoCropControls({
  active,
  onActiveChange,
  crop,
  sourceWidth,
  sourceHeight,
  left,
  top,
  width,
  height,
}: {
  active: boolean;
  onActiveChange: (active: boolean) => void;
  crop: VideoCrop;
  sourceWidth: number;
  sourceHeight: number;
  left: number;
  top: number;
  width: number;
  height: number;
}) {
  const boundsRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    handle: CropHandle;
    crop: VideoCrop;
    x: number;
    y: number;
    pixelsPerX: number;
    pixelsPerY: number;
  } | null>(null);

  function updateCrop(next: VideoCrop) {
    setOverlayState({
      videoCropLeft: next.left,
      videoCropRight: next.right,
      videoCropTop: next.top,
      videoCropBottom: next.bottom,
    });
  }

  function startDrag(event: PointerEvent<HTMLElement>, handle: CropHandle) {
    if (event.button !== 0) return;
    const bounds = boundsRef.current?.getBoundingClientRect();
    if (!bounds?.width || !bounds.height) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      handle,
      crop,
      x: event.clientX,
      y: event.clientY,
      pixelsPerX: sourceWidth / bounds.width,
      pixelsPerY: sourceHeight / bounds.height,
    };
  }

  function drag(event: PointerEvent<HTMLElement>) {
    const initial = dragRef.current;
    if (!initial) return;
    updateCrop(
      adjustVideoCrop(
        initial.crop,
        initial.handle,
        (event.clientX - initial.x) * initial.pixelsPerX,
        (event.clientY - initial.y) * initial.pixelsPerY,
        sourceWidth,
        sourceHeight,
      ),
    );
  }

  function stopDrag() {
    dragRef.current = null;
  }

  function handleKey(event: KeyboardEvent<HTMLElement>, handle: CropHandle) {
    if (event.key === "Escape") {
      onActiveChange(false);
      return;
    }
    const step = event.shiftKey ? 10 : 1;
    const delta = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }[event.key];
    if (!delta) return;
    event.preventDefault();
    event.stopPropagation();
    updateCrop(adjustVideoCrop(crop, handle, delta[0], delta[1], sourceWidth, sourceHeight));
  }

  return (
    <>
      <div className="absolute top-3 left-3 z-30 flex items-center gap-2">
        <button
          type="button"
          aria-label={active ? "Done cropping" : "Crop video"}
          aria-pressed={active}
          className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold shadow-lg backdrop-blur-sm ${active ? "border-blue-400 bg-blue-600 text-white" : "border-white/30 bg-black/70 text-white hover:bg-black/90"}`}
          onClick={() => onActiveChange(!active)}
        >
          {active ? (
            <CheckIcon className="h-4 w-4" />
          ) : (
            <ViewfinderCircleIcon className="h-4 w-4" />
          )}
          {active ? "Done" : "Crop"}
        </button>
        <BackgroundTypeControl />
        {active && (
          <button
            type="button"
            className="cursor-pointer rounded-lg border border-white/30 bg-black/70 px-3 py-1.5 text-xs font-medium text-white shadow-lg hover:bg-black/90"
            onClick={() => updateCrop({ top: 0, bottom: 0, left: 0, right: 0 })}
          >
            Reset crop
          </button>
        )}
      </div>
      {active && (
        <div
          className="pointer-events-none absolute inset-0 z-20"
          onKeyDown={(event) => {
            if (event.key === "Escape") onActiveChange(false);
          }}
        >
          <div
            ref={boundsRef}
            className="absolute"
            style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
          >
            <div
              className="absolute border-2 border-dashed border-white focus-within:border-blue-400"
              style={{
                left: `${(crop.left / sourceWidth) * 100}%`,
                top: `${(crop.top / sourceHeight) * 100}%`,
                width: `${((sourceWidth - crop.left - crop.right) / sourceWidth) * 100}%`,
                height: `${((sourceHeight - crop.top - crop.bottom) / sourceHeight) * 100}%`,
                boxShadow: "0 0 0 9999px rgb(0 0 0 / 55%)",
              }}
            >
              <button
                type="button"
                aria-label="Move crop selection"
                className="pointer-events-auto absolute inset-0 cursor-move touch-none outline-none"
                onPointerDown={(event) => startDrag(event, "move")}
                onPointerMove={drag}
                onPointerUp={stopDrag}
                onPointerCancel={stopDrag}
                onLostPointerCapture={stopDrag}
                onKeyDown={(event) => handleKey(event, "move")}
              />
              <div
                className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-35"
                aria-hidden="true"
              >
                {Array.from({ length: 9 }, (_, index) => (
                  <div key={index} className="border border-white/40" />
                ))}
              </div>
              {handles.map(([handle, x, y, cursor]) => (
                <button
                  key={handle}
                  type="button"
                  aria-label={`Resize crop ${handle}`}
                  className="pointer-events-auto absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-sm outline-none focus-visible:bg-blue-500/70"
                  style={{ left: x, top: y, cursor }}
                  onPointerDown={(event) => startDrag(event, handle)}
                  onPointerMove={drag}
                  onPointerUp={stopDrag}
                  onPointerCancel={stopDrag}
                  onLostPointerCapture={stopDrag}
                  onKeyDown={(event) => handleKey(event, handle)}
                >
                  <span className="h-3 w-3 rounded-sm border border-black/40 bg-white shadow-md" />
                </button>
              ))}
            </div>
          </div>
          <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-lg bg-black/75 px-3 py-1.5 text-center text-xs whitespace-nowrap text-white">
            Drag edges to crop · Drag inside to move
          </span>
        </div>
      )}
    </>
  );
}
