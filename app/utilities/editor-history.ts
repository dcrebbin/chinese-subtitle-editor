import { create } from "zustand";

import {
  defaultPersistableOverlaySettings,
  setOverlayState,
  useOverlayStore,
} from "../store/overlay.store";
import { setSessionState, useSessionStore, type SessionStore } from "../store/session.store";
import { defaultSettings, setSettingsState, useSettingsStore } from "../store/settings.store";

type Snapshot = { session: string; overlay: string; settings: string };
type Entry = { before: Snapshot; after: Snapshot; target: Element | null; time: number };
const sessionKeys = [
  "srtContent",
  "originalSrtContent",
  "hasCustomCaptions",
  "lyrics",
  "japaneseTransliterations",
  "generationLanguage",
  "translationLanguage",
  "subtitleOffset",
] as const;
const overlayKeys = [
  ...Object.keys(defaultPersistableOverlaySettings).filter(
    (key) => !["selectedTab", "loadedVideoId", "downloadVideoId"].includes(key),
  ),
  "startTime",
  "endTime",
];
const settingsKeys = Object.keys(defaultSettings).filter(
  (key) => !["accessToken", "refreshToken", "timeSinceSync"].includes(key),
);
function pick(object: object, keys: readonly string[]) {
  const values = object as Record<string, unknown>;
  return JSON.stringify(Object.fromEntries(keys.map((key) => [key, values[key]])));
}
function snapshot(): Snapshot {
  return {
    session: pick(useSessionStore.getState().session, sessionKeys),
    overlay: pick(useOverlayStore.getState().overlay, overlayKeys),
    settings: pick(useSettingsStore.getState().settings, settingsKeys),
  };
}
export const useEditorHistory = create(() => ({ canUndo: false, canRedo: false }));
const past: Entry[] = [];
const future: Entry[] = [];
let restoring = false;
let batching = false;
let recordBatch: (() => void) | undefined;

export function batchEditorChange(change: () => void) {
  const alreadyBatching = batching;
  batching = true;
  try {
    change();
  } finally {
    batching = alreadyBatching;
    if (!batching) recordBatch?.();
  }
}
let current: Snapshot;
let breakGroup = false;
function publish() {
  useEditorHistory.setState({ canUndo: past.length > 0, canRedo: future.length > 0 });
}
export function clearEditorHistory() {
  past.length = 0;
  future.length = 0;
  current = snapshot();
  publish();
}
function apply(next: Snapshot, previous: Snapshot) {
  restoring = true;
  try {
    if (next.session !== previous.session) {
      const values = JSON.parse(next.session) as Partial<SessionStore["session"]>;
      // Force SRT to rebuild caption objects even if an earlier edit mutated them in place.
      setSessionState(values);
    }
    if (next.overlay !== previous.overlay) setOverlayState(JSON.parse(next.overlay));
    if (next.settings !== previous.settings) setSettingsState(JSON.parse(next.settings));
  } finally {
    current = snapshot();
    restoring = false;
    breakGroup = true;
  }
}
export function undoEditorChange() {
  const entry = past.pop();
  if (!entry) return false;
  apply(entry.before, entry.after);
  future.push(entry);
  publish();
  return true;
}
export function redoEditorChange() {
  const entry = future.pop();
  if (!entry) return false;
  apply(entry.after, entry.before);
  past.push(entry);
  publish();
  return true;
}
export function startEditorHistory() {
  clearEditorHistory();
  let videoId = useSessionStore.getState().session.videoId;
  let file = useOverlayStore.getState().overlay.file;
  let pointerTarget: Element | null = null;
  function record() {
    if (restoring || batching) return;
    const nextId = useSessionStore.getState().session.videoId;
    const nextFile = useOverlayStore.getState().overlay.file;
    if (nextId !== videoId || nextFile !== file) {
      videoId = nextId;
      file = nextFile;
      clearEditorHistory();
      return;
    }
    const next = snapshot();
    if (
      next.session === current.session &&
      next.overlay === current.overlay &&
      next.settings === current.settings
    )
      return;
    const target = pointerTarget || document.activeElement;
    const typing =
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLInputElement &&
        !["button", "checkbox", "radio", "file"].includes(target.type));
    const last = past.at(-1);
    const now = Date.now();
    if (
      !breakGroup &&
      (typing || pointerTarget) &&
      last?.target === target &&
      (pointerTarget || now - last.time < 600) &&
      !future.length
    ) {
      last.after = next;
      last.time = now;
    } else {
      past.push({ before: current, after: next, target, time: now });
      // Bound memory for long sessions and large subtitle imports.
      while (
        past.length > 200 ||
        (past.length > 1 &&
          past.reduce(
            (size, entry) =>
              size +
              entry.before.session.length +
              entry.before.overlay.length +
              entry.before.settings.length +
              entry.after.session.length +
              entry.after.overlay.length +
              entry.after.settings.length,
            0,
          ) > 20_000_000)
      )
        past.shift();
    }
    current = next;
    breakGroup = false;
    future.length = 0;
    publish();
  }
  recordBatch = record;
  const unsubscribe = [
    useSessionStore.subscribe((next, previous) => {
      if (
        next.session.videoId !== previous.session.videoId ||
        sessionKeys.some((key) => next.session[key] !== previous.session[key])
      )
        record();
    }),
    useOverlayStore.subscribe((next, previous) => {
      if (
        next.overlay.file !== previous.overlay.file ||
        overlayKeys.some(
          (key) =>
            (next.overlay as unknown as Record<string, unknown>)[key] !==
            (previous.overlay as unknown as Record<string, unknown>)[key],
        )
      )
        record();
    }),
    useSettingsStore.subscribe((next, previous) => {
      if (
        settingsKeys.some(
          (key) =>
            (next.settings as unknown as Record<string, unknown>)[key] !==
            (previous.settings as unknown as Record<string, unknown>)[key],
        )
      )
        record();
    }),
  ];
  const boundary = () => {
    breakGroup = true;
  };
  const pointerdown = (event: PointerEvent) => {
    pointerTarget = event.target instanceof Element ? event.target : null;
    boundary();
  };
  const pointerup = () => {
    pointerTarget = null;
    boundary();
  };
  const keydown = (event: KeyboardEvent) => {
    if (event.isComposing || event.altKey || !(event.metaKey || event.ctrlKey)) return;
    const key = event.key.toLowerCase();
    const undo = key === "z" && !event.shiftKey;
    const redo = (key === "z" && event.shiftKey) || (key === "y" && event.ctrlKey);
    if (!undo && !redo) return;
    // Search and video URL fields retain their native text undo behavior.
    if (event.target instanceof Element && event.target.closest("[data-native-undo]")) return;
    if (undo ? undoEditorChange() : redoEditorChange()) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  window.addEventListener("keydown", keydown, true);
  window.addEventListener("pointerdown", pointerdown, true);
  window.addEventListener("pointerup", pointerup, true);
  window.addEventListener("pointercancel", pointerup, true);
  window.addEventListener("focusin", boundary, true);
  return () => {
    if (recordBatch === record) recordBatch = undefined;
    unsubscribe.forEach((stop) => stop());
    window.removeEventListener("keydown", keydown, true);
    window.removeEventListener("pointerdown", pointerdown, true);
    window.removeEventListener("pointerup", pointerup, true);
    window.removeEventListener("pointercancel", pointerup, true);
    window.removeEventListener("focusin", boundary, true);
  };
}
