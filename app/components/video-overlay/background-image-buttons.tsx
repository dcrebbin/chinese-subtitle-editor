import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PhotoIcon } from "@heroicons/react/20/solid";

import { setOverlayState, useOverlayStore } from "@/app/store/overlay.store";

function ImageRegion({
  label,
  position,
  imageKey,
}: {
  label: string;
  position: "full" | "top" | "bottom";
  imageKey?: "image1" | "image2";
}) {
  const image = useOverlayStore((state) =>
    imageKey ? state.overlay.doubleBackgroundImage[imageKey] : state.overlay.backgroundImage,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  function updateImage(url: string | null) {
    if (imageKey) {
      setOverlayState({
        doubleBackgroundImage: {
          ...useOverlayStore.getState().overlay.doubleBackgroundImage,
          [imageKey]: url,
        },
      });
    } else {
      setOverlayState({ backgroundImage: url });
    }
  }

  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector("button")?.focus();
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        setMenu(null);
      }
    }
    function close() {
      setMenu(null);
    }
    document.addEventListener("pointerdown", dismiss);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  return (
    <div
      ref={regionRef}
      role="group"
      aria-label={label}
      tabIndex={image ? 0 : undefined}
      className={`pointer-events-auto absolute left-0 w-full outline-none focus-visible:ring-1 focus-visible:ring-white/40 focus-visible:ring-inset ${position === "full" ? "inset-y-0" : position === "top" ? "top-0 h-1/2" : "bottom-0 h-1/2"}`}
      onContextMenu={(event) => {
        if (!image) return;
        event.preventDefault();
        event.stopPropagation();
        const bounds = event.currentTarget.getBoundingClientRect();
        setMenu({
          x: Math.max(
            8,
            Math.min(event.clientX || bounds.left + bounds.width / 2, window.innerWidth - 176),
          ),
          y: Math.max(
            8,
            Math.min(event.clientY || bounds.top + bounds.height / 2, window.innerHeight - 96),
          ),
        });
      }}
    >
      {!image && (
        <button
          type="button"
          aria-label={`Choose ${label}`}
          title={`Choose ${label}`}
          className={`absolute left-1/2 flex h-12 w-12 -translate-x-1/2 cursor-pointer items-center justify-center rounded-xl border border-white/20 bg-black/30 text-white/40 backdrop-blur-sm transition-colors hover:bg-black/50 hover:text-white/90 focus-visible:text-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60 ${position === "full" ? "top-[15%]" : position === "top" ? "top-[30%]" : "bottom-[30%]"}`}
          onClick={() => inputRef.current?.click()}
        >
          <PhotoIcon className="h-7 w-7" aria-hidden="true" />
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        aria-label={`Choose ${label}`}
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) updateImage(URL.createObjectURL(file));
          event.currentTarget.value = "";
        }}
      />
      {menu &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={label}
            style={{ left: menu.x, top: menu.y }}
            className="fixed z-50 min-w-40 rounded-lg border border-white/25 bg-neutral-900 p-1 text-xs text-white shadow-xl"
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape" || event.key === "Tab") {
                setMenu(null);
                regionRef.current?.focus();
                if (event.key === "Escape") event.preventDefault();
                event.stopPropagation();
              }
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const buttons = Array.from(event.currentTarget.querySelectorAll("button"));
                const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
                buttons[
                  (current + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length
                ]?.focus();
              }
            }}
          >
            <button
              type="button"
              role="menuitem"
              className="block w-full cursor-pointer rounded-md px-3 py-2 text-left hover:bg-white/10 focus:bg-white/10 focus:outline-none"
              onClick={() => {
                setMenu(null);
                regionRef.current?.focus();
                inputRef.current?.click();
              }}
            >
              Replace image
            </button>
            <button
              type="button"
              role="menuitem"
              className="block w-full cursor-pointer rounded-md px-3 py-2 text-left hover:bg-white/10 focus:bg-white/10 focus:outline-none"
              onClick={() => {
                setMenu(null);
                updateImage(null);
              }}
            >
              Remove image
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}

export default function BackgroundImageButtons() {
  const mode = useOverlayStore((state) => state.overlay.backgroundMode);
  if (mode === "colour") return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-1">
      {mode === "full-image" ? (
        <ImageRegion key="full" label="background image" position="full" />
      ) : (
        <>
          <ImageRegion key="top" label="top background image" position="top" imageKey="image1" />
          <ImageRegion
            key="bottom"
            label="bottom background image"
            position="bottom"
            imageKey="image2"
          />
        </>
      )}
    </div>
  );
}
