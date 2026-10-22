const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const { test } = require("node:test");

// Run the actual stores with a small browser shim; no DOM renderer is needed.
require.extensions[".ts"] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(outputText, filename);
};
class Element {
  closest() {
    return null;
  }
}
class Input extends Element {
  type = "text";
}
global.Element = Element;
global.HTMLInputElement = Input;
global.HTMLTextAreaElement = class extends Element {};
global.window = new EventTarget();
global.document = { activeElement: null };
const storage = new Map();
global.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
};
const {
  getSessionState,
  setSessionState,
  restoreEditorDraft,
} = require("../app/store/session.store.ts");
const { useOverlayStore, setOverlayState } = require("../app/store/overlay.store.ts");
const { useSettingsStore, setSettingsState } = require("../app/store/settings.store.ts");
const {
  startEditorHistory,
  clearEditorHistory,
  undoEditorChange,
  redoEditorChange,
  useEditorHistory,
} = require("../app/utilities/editor-history.ts");
const { beautifyLyrics } = require("../app/utilities/beautify-lyrics.ts");
const session = () => getSessionState().session;
const srt = "1\n00:00:01,000 --> 00:00:03,000\n(yue)原文\n\n";
function shortcut(key, options = {}) {
  const event = new Event("keydown", { cancelable: true });
  Object.assign(event, { key, ctrlKey: true, ...options });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

test("autosave, undo, redo, grouping, source isolation, and draft recovery", () => {
  setSessionState({ srtContent: srt, originalSrtContent: srt });
  const stop = startEditorHistory();
  const original = session().srtContent;
  // Match existing editor handlers that shallow-copy arrays then mutate nested text.
  const captions = [...session().localCaptions];
  captions[0].text.yue = "改文";
  setSessionState({ localCaptions: captions, originalCaptions: captions });
  assert.match(session().srtContent, /改文/);
  assert.equal(storage.get("langpal-srt-content-draft"), session().srtContent);
  assert.equal(session().localSrtContent, session().srtContent);
  assert.match(session().parsedSubtitles[0].text, /改文/);
  assert.equal(shortcut("z"), true);
  assert.equal(session().srtContent, original);
  assert.equal(session().localCaptions[0].text.yue, "原文");
  assert.equal(storage.get("langpal-srt-content-draft"), original);
  assert.equal(shortcut("z", { shiftKey: true }), true);
  assert.match(session().srtContent, /改文/);

  setSessionState({
    localCaptions: [],
    originalCaptions: [],
    srtContent: "",
    originalSrtContent: "",
  });
  assert.equal(storage.get("langpal-srt-content-draft"), "");
  undoEditorChange();
  assert.match(session().srtContent, /改文/);
  redoEditorChange();
  assert.equal(session().localCaptions.length, 0);
  undoEditorChange();
  setSessionState({ srtContent: srt.replace("原文", "匯入") });
  assert.equal(useEditorHistory.getState().canRedo, false);
  assert.equal(session().localCaptions[0].text.yue, "匯入");
  undoEditorChange();
  assert.equal(session().localCaptions[0].text.yue, "改文");

  clearEditorHistory();
  document.activeElement = new HTMLTextAreaElement();
  const lyricsBefore = session().lyrics;
  setSessionState({ lyrics: "好" });
  setSessionState({ lyrics: "好　多麼好的人\n第一句　第二句" });
  undoEditorChange();
  assert.equal(session().lyrics, lyricsBefore);
  redoEditorChange();
  document.activeElement = null;
  const beforeBeautify = session().lyrics;
  setSessionState({ lyrics: beautifyLyrics(beforeBeautify) });
  undoEditorChange();
  assert.equal(session().lyrics, beforeBeautify);
  assert.equal(JSON.parse(storage.get("langpal-generation-draft")).lyrics, beforeBeautify);

  clearEditorHistory();
  const colour = useOverlayStore.getState().overlay.colour;
  setOverlayState({ colour: "#123456" });
  setOverlayState({ currentTime: 15, isPlaying: true });
  undoEditorChange();
  assert.equal(useOverlayStore.getState().overlay.colour, colour);
  assert.equal(useOverlayStore.getState().overlay.currentTime, 15);
  assert.equal(useOverlayStore.getState().overlay.isPlaying, true);
  assert.equal(shortcut("y"), true);
  assert.equal(JSON.parse(storage.get("langpal-overlay-settings")).colour, "#123456");
  clearEditorHistory();
  const pointer = new Event("pointerdown");
  Object.defineProperty(pointer, "target", { value: new Element() });
  window.dispatchEvent(pointer);
  setOverlayState({ verticalPosition: 210 });
  setOverlayState({ verticalPosition: 220 });
  window.dispatchEvent(new Event("pointerup"));
  undoEditorChange();
  assert.equal(useOverlayStore.getState().overlay.verticalPosition, 200);
  assert.equal(useEditorHistory.getState().canUndo, false);
  const size = useSettingsStore.getState().settings.subtitleSize;
  setSettingsState({ subtitleSize: size + 4 });
  undoEditorChange();
  assert.equal(useSettingsStore.getState().settings.subtitleSize, size);

  clearEditorHistory();
  setSessionState({
    subtitleOffset: 2,
    localCaptions: session().localCaptions.map((caption) => ({
      ...caption,
      startTime: "00:00:03,000",
      endTime: "00:00:05,000",
    })),
  });
  undoEditorChange();
  assert.equal(session().subtitleOffset, 0);
  assert.equal(session().localCaptions[0].startTime, "00:00:01,000");
  redoEditorChange();
  assert.equal(session().subtitleOffset, 2);

  setSessionState({ videoId: "another-video" });
  assert.equal(useEditorHistory.getState().canUndo, false);
  // A saved empty document must remain empty when switching sources.
  storage.set("langpal-srt-content-empty-video", "");
  setSessionState({ videoId: "empty-video" });
  assert.equal(session().localCaptions.length, 0);
  setSessionState({ srtContent: srt });
  assert.equal(storage.get("langpal-srt-content-empty-video"), session().srtContent);
  const saved = session().srtContent;
  storage.set("langpal-srt-content-empty-video", "");
  restoreEditorDraft();
  assert.equal(session().srtContent, "");
  storage.set("langpal-srt-content-empty-video", saved);
  restoreEditorDraft();
  assert.equal(session().localCaptions[0].text.yue, "原文");
  stop();
});

test("karaoke holds and onset scale with line boundaries and undo together", () => {
  const {
    retimeRetroKaraokeCue,
    getRetroKaraokeCellProgresses,
  } = require("../app/utilities/retro-karaoke-timing.ts");
  const { batchEditorChange } = require("../app/utilities/editor-history.ts");
  const seconds = (value) => {
    const [clock, ms] = value.split(",");
    const [h, m, s] = clock.split(":").map(Number);
    return h * 3600 + m * 60 + s + Number(ms) / 1000;
  };
  setSessionState({ srtContent: srt });
  setOverlayState({
    retroKaraokeTimingOverrides: { "1.000-3.000": { 0: 3 } },
    retroKaraokeSingingStarts: { "1.000-3.000": 1.5 },
  });
  const stop = startEditorHistory();
  const previous = session().localCaptions;
  const next = previous.map((caption) => ({
    ...caption,
    startTime: "00:00:10,000",
    endTime: "00:00:18,000",
  }));
  batchEditorChange(() => {
    setOverlayState(
      retimeRetroKaraokeCue(previous, next, useOverlayStore.getState().overlay, seconds),
    );
    setSessionState({ localCaptions: next });
  });
  assert.deepEqual(useOverlayStore.getState().overlay.retroKaraokeTimingOverrides, {
    "10.000-18.000": { 0: 3 },
  });
  assert.equal(useOverlayStore.getState().overlay.retroKaraokeSingingStarts["10.000-18.000"], 12);
  assert.deepEqual(
    getRetroKaraokeCellProgresses([{ chinese: "a" }, { chinese: "b" }], 0.75, 0, { 0: 3 }),
    [1, 0],
  );
  undoEditorChange();
  assert.equal(session().localCaptions[0].startTime, "00:00:01,000");
  assert.equal(useOverlayStore.getState().overlay.retroKaraokeSingingStarts["1.000-3.000"], 1.5);
  assert.equal(useEditorHistory.getState().canUndo, false);
  redoEditorChange();
  assert.equal(useOverlayStore.getState().overlay.retroKaraokeSingingStarts["10.000-18.000"], 12);
  const shifted = retimeRetroKaraokeCue(
    [
      { startTime: "1", endTime: "3" },
      { startTime: "3", endTime: "5" },
    ],
    [
      { startTime: "3", endTime: "5" },
      { startTime: "5", endTime: "7" },
    ],
    {
      retroKaraokeTimingOverrides: { "1.000-3.000": { 0: 2 }, "3.000-5.000": { 0: 4 } },
      retroKaraokeSingingStarts: { "1.000-3.000": 1.5, "3.000-5.000": 4 },
    },
    Number,
  );
  assert.deepEqual(shifted.retroKaraokeTimingOverrides, {
    "3.000-5.000": { 0: 2 },
    "5.000-7.000": { 0: 4 },
  });
  assert.deepEqual(shifted.retroKaraokeSingingStarts, { "3.000-5.000": 3.5, "5.000-7.000": 6 });
  stop();
});
