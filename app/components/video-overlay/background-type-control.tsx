import { useEffect, useRef } from "react";
import { ChevronDownIcon, PaintBrushIcon, PhotoIcon } from "@heroicons/react/20/solid";

import { setOverlayState, useOverlayStore } from "@/app/store/overlay.store";
import BackgroundColourPicker from "./background-colour-picker";

const options = [
  ["colour", "Colour", PaintBrushIcon],
  ["full-image", "Image", PhotoIcon],
  ["double-image", "Split", SplitIcon],
] as const;

function SplitIcon({ className }: { className?: string }) {
  return (
    <span className={`flex flex-col items-center justify-center ${className}`} aria-hidden="true">
      <PhotoIcon className="h-2 w-3.5" />
      <PhotoIcon className="h-2 w-3.5" />
    </span>
  );
}

export default function BackgroundTypeControl() {
  const mode = useOverlayStore((state) => state.overlay.backgroundMode);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [, label, Icon] = options.find(([value]) => value === mode) ?? options[0];

  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !detailsRef.current?.contains(event.target)) {
        detailsRef.current?.removeAttribute("open");
      }
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);

  return (
    <>
      <details
        ref={detailsRef}
        className="relative"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            event.currentTarget.removeAttribute("open");
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.currentTarget.removeAttribute("open");
            event.currentTarget.querySelector("summary")?.focus();
            event.stopPropagation();
          }
        }}
      >
        <summary
          aria-label={`Background type: ${label}`}
          className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-white/30 bg-black/70 px-3 py-1.5 text-xs font-semibold text-white shadow-lg backdrop-blur-sm hover:bg-black/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60 [&::-webkit-details-marker]:hidden"
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          {label}
          <ChevronDownIcon className="h-3 w-3" aria-hidden="true" />
        </summary>
        <div className="absolute top-full left-0 mt-1 min-w-32 rounded-lg border border-white/30 bg-neutral-900 p-1 text-white shadow-lg">
          {options.map(([value, optionLabel, OptionIcon]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-medium hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white/60 ${mode === value ? "bg-white/10" : ""}`}
              onClick={() => {
                setOverlayState({ backgroundMode: value });
                detailsRef.current?.removeAttribute("open");
                detailsRef.current?.querySelector("summary")?.focus();
              }}
            >
              <OptionIcon className="h-4 w-4" aria-hidden="true" />
              {optionLabel}
            </button>
          ))}
        </div>
      </details>
      {mode === "colour" && (
        <BackgroundColourPicker className="h-7 w-7 shrink-0 cursor-pointer overflow-hidden rounded-md border border-white/30 bg-black/70 p-0.5 shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60 [&::-moz-color-swatch]:rounded-sm [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-sm [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0" />
      )}
    </>
  );
}
