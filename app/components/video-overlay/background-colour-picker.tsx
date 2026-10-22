import { useEffect, useRef } from "react";

import { setOverlayState, useOverlayStore } from "@/app/store/overlay.store";

export default function BackgroundColourPicker({ className }: { className: string }) {
  const colour = useOverlayStore((state) => state.overlay.colour);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function commit() {
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending !== null && pending !== useOverlayStore.getState().overlay.colour) {
      setOverlayState({ colour: pending });
    }
  }

  useEffect(() => {
    if (inputRef.current) inputRef.current.value = colour || "#000000";
  }, [colour]);

  useEffect(() => () => commit(), []);

  return (
    <input
      ref={inputRef}
      type="color"
      aria-label="Background colour"
      title="Background colour"
      defaultValue={colour || "#000000"}
      className={className}
      onChange={(event) => {
        // Keep native dragging immediate; avoid rerendering and saving the entire
        // editor for every intermediate colour emitted by the system picker.
        pendingRef.current = event.currentTarget.value;
        if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(commit, 120);
      }}
      onBlur={commit}
    />
  );
}
