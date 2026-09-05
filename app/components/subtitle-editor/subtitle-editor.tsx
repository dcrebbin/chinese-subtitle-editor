"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowUpTrayIcon,
  LanguageIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/solid";

import { useOverlayStore } from "../../store/overlay.store";
import {
  getSessionState,
  ParsedSubtitle,
  setSessionState,
  useSessionStore,
  type CaptionLanguage,
  type CaptionSegment,
  type SavedJapaneseTransliteration,
} from "../../store/session.store";
import { parseSrt } from "../../utilities/srt";
import {
  CaptionLanguages,
  convertCaptionsToSrt,
  convertSrtToCaptions,
} from "../../utilities/transliteration/transliteration";
import {
  loadJapaneseTransliterationsFromLocalStorage,
  saveJapaneseTransliterationsToLocalStorage,
} from "../../utilities/video-storage";
import Loading from "../common/loading";
import SubtitleEditorBottomControls from "./subtitle-editor-bottom-controls";
import SubtitleEditorSearchView from "./subtitle-editor-search-view";

export interface Subtitle {
  title: string;
  artist: string;
  video_id: string;
}

function formatTime(time: number) {
  const hours = Math.floor(time / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((time % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(time % 60)
    .toString()
    .padStart(2, "0");
  const milliseconds = Math.floor((time % 1) * 1000)
    .toString()
    .padStart(3, "0");
  return `${hours}:${minutes}:${seconds},${milliseconds}`;
}

export const timeStringToSeconds = (timeString: string): number => {
  const [time, milliseconds] = timeString.split(",");
  const [hours, minutes, seconds] = time?.split(":").map(Number) || [];
  return (hours || 0) * 3600 + (minutes || 0) * 60 + (seconds || 0) + Number(milliseconds) / 1000;
};

export default function SubtitleEditor() {
  const { session } = useSessionStore();
  const { overlay } = useOverlayStore();

  const editorRef = useRef<HTMLDivElement>(null);
  const offsetInput = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const japaneseImportInputRef = useRef<HTMLInputElement>(null);
  const captionElementRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const originalCaptionsInitialized = useRef<boolean>(false);
  const lastCommittedSubtitleOffsetRef = useRef(0);

  const [autoScroll, setAutoScroll] = useState<boolean>(true);

  const [selectedLanguage, setSelectedLanguage] = useState<string[]>([]);
  const [japaneseLoading, setJapaneseLoading] = useState<Record<number, boolean>>({});
  const [japaneseErrors, setJapaneseErrors] = useState<Record<number, string>>({});
  const [japaneseTransferMessage, setJapaneseTransferMessage] = useState("");
  const [japaneseBatchRunning, setJapaneseBatchRunning] = useState(false);

  useEffect(() => {
    setSessionState({
      japaneseTransliterations: loadJapaneseTransliterationsFromLocalStorage(session.videoId),
    });
  }, [session.videoId]);

  function loadCaptions() {
    if (session.srtContent) {
      const captions = convertSrtToCaptions(session.srtContent);
      const parsedSubtitles = parseSrt(session.srtContent);

      setSessionState({
        localCaptions: captions,
        isLoading: false,
        parsedSubtitles: parsedSubtitles as ParsedSubtitle[],
        originalCaptions: captions,
        localSrtContent: convertCaptionsToSrt(captions),
        srtContent: session.srtContent,
        // Keep import baseline; only code paths that replace the file should update originalSrtContent
        originalSrtContent: session.originalSrtContent,
      });
      originalCaptionsInitialized.current = true;
    }
  }

  useEffect(() => {
    loadCaptions();
  }, [session.srtContent]);

  useEffect(() => {
    lastCommittedSubtitleOffsetRef.current = 0;
    if (offsetInput.current) {
      offsetInput.current.value = "";
    }
  }, [session.originalSrtContent]);

  const activeCaptionIndex = session.localCaptions.findIndex((caption: CaptionSegment) => {
    const captionStartTime = timeStringToSeconds(caption.startTime);
    const captionEndTime = timeStringToSeconds(caption.endTime);
    return overlay.currentTime >= captionStartTime && overlay.currentTime <= captionEndTime;
  });

  useEffect(() => {
    if (!autoScroll || activeCaptionIndex < 0 || session.selectedTab !== "captions") {
      return;
    }
    const activeCaptionElement = captionElementRefs.current[activeCaptionIndex];
    if (!activeCaptionElement) {
      return;
    }
    activeCaptionElement.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }, [activeCaptionIndex, autoScroll, session.selectedTab]);

  function handleAdd(index: number, endTime: string, newLanguage: string) {
    const newCaption: CaptionSegment = {
      startTime: endTime,
      endTime: endTime,
      text: {
        [newLanguage]: "",
      },
    };
    for (const language of CaptionLanguages) {
      if (newLanguage !== language.code) {
        newCaption.text[language.code] = null;
      }
    }
    const updatedCaptions = [...session.localCaptions];
    updatedCaptions.splice(index, 0, newCaption);
    setSessionState({
      ...session,
      localCaptions: updatedCaptions,
      originalCaptions: updatedCaptions, // Update original captions to reflect the addition
    });
  }

  function handleDeleteLanguage(index: number, language: string) {
    const updatedCaptions = [...session.localCaptions];
    if (!updatedCaptions[index]) {
      return;
    }
    updatedCaptions[index].text[language] = null;
    setSessionState({
      ...session,
      localCaptions: updatedCaptions,
      originalCaptions: updatedCaptions, // Update original captions to reflect the language deletion
    });
  }

  function handleDelete(index: number) {
    const updatedCaptions = [...session.localCaptions];
    updatedCaptions.splice(index, 1);
    setSessionState({
      ...session,
      localCaptions: updatedCaptions,
      originalCaptions: updatedCaptions,
    });
  }
  function handleDeleteAllCaptions() {
    lastCommittedSubtitleOffsetRef.current = 0;
    if (offsetInput.current) {
      offsetInput.current.value = "";
    }
    setSessionState({
      ...session,
      srtContent: "",
      localSrtContent: "",
      localCaptions: [],
      originalCaptions: [],
      originalSrtContent: "",
    });
  }

  function handleOffsetChange(offsetSeconds: number) {
    if (!Number.isFinite(offsetSeconds)) return;

    const delta = offsetSeconds - lastCommittedSubtitleOffsetRef.current;
    lastCommittedSubtitleOffsetRef.current = offsetSeconds;

    const updatedCaptions = session.localCaptions.map((caption: CaptionSegment) => {
      const newStart = Math.max(0, timeStringToSeconds(caption.startTime) + delta);
      const newEnd = Math.max(0, timeStringToSeconds(caption.endTime) + delta);
      return {
        ...caption,
        startTime: formatTime(newStart),
        endTime: formatTime(newEnd),
      };
    });

    setSessionState({
      ...session,
      localCaptions: updatedCaptions,
      originalCaptions: updatedCaptions,
      srtContent: convertCaptionsToSrt(updatedCaptions),
      localSrtContent: convertCaptionsToSrt(updatedCaptions),
    });
  }

  function handleResetSubtitleOffset() {
    if (offsetInput.current) {
      offsetInput.current.value = "";
    }
    handleOffsetChange(0);
  }

  async function handleJapaneseTransliteration(index: number, content: string) {
    const sourceText = content.trim();
    if (!sourceText || japaneseLoading[index]) return;

    setJapaneseLoading((current) => ({ ...current, [index]: true }));
    setJapaneseErrors((current) => ({ ...current, [index]: "" }));
    try {
      const response = await fetch("/api/japanese-transliteration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: sourceText }),
      });
      const result = (await response.json()) as SavedJapaneseTransliteration & { error?: string };
      if (!response.ok) throw new Error(result.error || "Japanese transliteration failed");

      const updated = {
        ...getSessionState().session.japaneseTransliterations,
        [sourceText]: result,
      };
      setSessionState({ japaneseTransliterations: updated });
      saveJapaneseTransliterationsToLocalStorage(session.videoId, updated);
    } catch (error) {
      setJapaneseErrors((current) => ({
        ...current,
        [index]: error instanceof Error ? error.message : "Japanese transliteration failed",
      }));
    } finally {
      setJapaneseLoading((current) => ({ ...current, [index]: false }));
    }
  }

  // Collects every (jp) line that has no romaji yet and converts them together,
  // which j-talk serves in far fewer requests than one call per subtitle line.
  function pendingJapaneseLines() {
    const existing = getSessionState().session.japaneseTransliterations;
    const pending = new Set<string>();

    for (const caption of getSessionState().session.localCaptions) {
      const sourceText = caption.text.jp?.trim() || "";
      if (!sourceText) continue;
      const saved = existing[sourceText];
      if (saved?.groups.some((group) => group.romaji)) continue;
      pending.add(sourceText);
    }

    return [...pending];
  }

  async function handleGenerateAllJapaneseRomanizations() {
    if (japaneseBatchRunning) return;

    const lines = pendingJapaneseLines();
    if (lines.length === 0) {
      setJapaneseTransferMessage("Every Japanese line already has romaji.");
      return;
    }

    setJapaneseBatchRunning(true);
    setJapaneseTransferMessage(`Romanizing ${lines.length} Japanese line(s)…`);
    try {
      const response = await fetch("/api/japanese-transliteration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines }),
      });
      const result = (await response.json()) as {
        transliterations?: Record<string, SavedJapaneseTransliteration>;
        convertedCount?: number;
        requestCount?: number;
        failures?: string[];
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || "Japanese transliteration failed");

      const updated = {
        ...getSessionState().session.japaneseTransliterations,
        ...(result.transliterations ?? {}),
      };
      setSessionState({ japaneseTransliterations: updated });
      saveJapaneseTransliterationsToLocalStorage(session.videoId, updated);

      const converted = result.convertedCount ?? 0;
      const missed = lines.length - converted;
      setJapaneseTransferMessage(
        `Romanized ${converted} of ${lines.length} line(s) in ${result.requestCount ?? 1} request(s).` +
          (missed > 0 ? ` ${missed} line(s) failed — try again to retry them.` : ""),
      );
    } catch (error) {
      setJapaneseTransferMessage(
        error instanceof Error ? `Generate all failed: ${error.message}` : "Generate all failed.",
      );
    } finally {
      setJapaneseBatchRunning(false);
    }
  }

  function saveJapaneseTransliterations(
    transliterations: Record<string, SavedJapaneseTransliteration>,
  ) {
    setSessionState({ japaneseTransliterations: transliterations });
    saveJapaneseTransliterationsToLocalStorage(session.videoId, transliterations);
  }

  function handleJapaneseRomajiChange(sourceText: string, groupIndex: number, romaji: string) {
    const saved = getSessionState().session.japaneseTransliterations[sourceText];
    if (!saved?.groups[groupIndex]) return;

    const groups = saved.groups.map((group, index) =>
      index === groupIndex ? { ...group, romaji } : group,
    );
    saveJapaneseTransliterations({
      ...getSessionState().session.japaneseTransliterations,
      [sourceText]: { ...saved, groups, convertedAt: new Date().toISOString() },
    });
  }

  function handleExportJapaneseRomanizations() {
    const transliterations = getSessionState().session.japaneseTransliterations;
    if (Object.keys(transliterations).length === 0) {
      setJapaneseTransferMessage("There are no Japanese romanizations to export.");
      return;
    }

    const blob = new Blob(
      [JSON.stringify({ version: 1, videoId: session.videoId, transliterations }, null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${session.videoId || "draft"}-japanese-romanization.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setJapaneseTransferMessage(
      `Exported ${Object.keys(transliterations).length} romanized Japanese line(s).`,
    );
  }

  async function handleImportJapaneseRomanizations(file: File) {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const candidate =
        typeof parsed === "object" && parsed !== null && "transliterations" in parsed
          ? (parsed as { transliterations: unknown }).transliterations
          : parsed;
      if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
        throw new Error("The file does not contain a romanization collection.");
      }

      const imported: Record<string, SavedJapaneseTransliteration> = {};
      for (const [key, value] of Object.entries(candidate)) {
        if (typeof value !== "object" || value === null) continue;
        const entry = value as Partial<SavedJapaneseTransliteration>;
        if (typeof entry.sourceText !== "string" || !Array.isArray(entry.groups)) continue;
        const groups = entry.groups.filter(
          (group) =>
            typeof group === "object" &&
            group !== null &&
            typeof group.surface === "string" &&
            typeof group.romaji === "string",
        );
        if (groups.length !== entry.groups.length) continue;
        imported[key] = entry as SavedJapaneseTransliteration;
      }

      const importedCount = Object.keys(imported).length;
      if (importedCount === 0) {
        throw new Error("No valid Japanese romanizations were found in the file.");
      }
      saveJapaneseTransliterations({
        ...getSessionState().session.japaneseTransliterations,
        ...imported,
      });
      setJapaneseTransferMessage(`Imported ${importedCount} romanized Japanese line(s).`);
    } catch (error) {
      setJapaneseTransferMessage(
        error instanceof Error ? `Import failed: ${error.message}` : "Import failed.",
      );
    } finally {
      if (japaneseImportInputRef.current) japaneseImportInputRef.current.value = "";
    }
  }

  const languageContent = (language: CaptionLanguage, caption: CaptionSegment, index: number) => {
    const sourceText = caption.text[language.code]?.trim() || "";
    const savedJapanese =
      language.code === "jp" ? session.japaneseTransliterations[sourceText] : undefined;

    return (
      <>
        {caption.text[language.code] !== null && (
          <div
            key={`${index}-${language.code}-caption-edit`}
            className="flex w-full flex-row gap-1.5 border-b border-white/20 pb-1.5 xl:gap-1.5 xl:pb-1.5"
          >
            <div className="flex w-full flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor={`${index}-${language.code}`}
                  className="text-left text-xl font-bold xl:text-2xl"
                >
                  {language.name}
                </label>
                {language.code === "jp" && (
                  <button
                    type="button"
                    disabled={!sourceText || japaneseLoading[index]}
                    onClick={() => void handleJapaneseTransliteration(index, sourceText)}
                    className="cursor-pointer rounded-2xl bg-blue-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 xl:text-base"
                  >
                    {japaneseLoading[index]
                      ? "Converting…"
                      : savedJapanese
                        ? "Regenerate Romaji"
                        : "Generate Romaji"}
                  </button>
                )}
              </div>
              <textarea
                id={`${index}-${language.code}`}
                value={caption.text[language.code] || ""}
                onChange={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  const updatedCaptions = [...session.localCaptions];
                  if (!updatedCaptions[index]) {
                    return;
                  }
                  updatedCaptions[index].text[language.code] = e.target.value;
                  setSessionState({
                    ...session,
                    localCaptions: updatedCaptions,
                    originalCaptions: updatedCaptions, // Update original captions to reflect the text change
                  });
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                }}
                onKeyUp={(e) => {
                  e.stopPropagation();
                }}
                className="m-0 h-12 w-full rounded-md border border-white/20 bg-white p-2 text-left text-lg text-black xl:h-16 xl:text-3xl"
              />
              {language.code === "jp" && savedJapanese && (
                <div className="flex flex-wrap gap-1.5 rounded-lg bg-black/30 p-2">
                  {savedJapanese.groups.map((group, groupIndex) => (
                    <label
                      key={`${groupIndex}-${group.surface}`}
                      title={[group.gloss, group.lemma, group.partOfSpeech]
                        .filter(Boolean)
                        .join(" · ")}
                      className="flex min-w-10 flex-col items-center rounded bg-white px-2 py-1 text-black"
                    >
                      <input
                        aria-label={`Romanization for ${group.surface}`}
                        value={group.romaji}
                        onChange={(event) =>
                          handleJapaneseRomajiChange(sourceText, groupIndex, event.target.value)
                        }
                        onKeyDown={(event) => event.stopPropagation()}
                        onKeyUp={(event) => event.stopPropagation()}
                        className="w-full min-w-10 rounded border border-blue-200 bg-blue-50 px-1 text-center text-xs text-blue-700 outline-none focus:border-blue-500"
                      />
                      <span className="text-lg">{group.surface}</span>
                    </label>
                  ))}
                </div>
              )}
              {language.code === "jp" && japaneseErrors[index] && (
                <p className="text-sm text-red-300">{japaneseErrors[index]}</p>
              )}
            </div>
            <button
              type="button"
              data-tooltip-id="global-tooltip"
              data-tooltip-content="Delete Language Section"
              onClick={() => handleDeleteLanguage(index, language.code)}
              className="flex cursor-pointer items-center justify-center rounded-3xl border-none bg-black/30 p-2 hover:bg-white/20 xl:p-3"
            >
              <TrashIcon className="h-6 w-6 xl:h-10 xl:w-10" />
            </button>
          </div>
        )}
      </>
    );
  };

  function handleNewCaptionLanguage(index: number, language: string) {
    const updatedSelectedLanguage = [...selectedLanguage];
    updatedSelectedLanguage[index] = language;
    setSelectedLanguage(updatedSelectedLanguage);
    const updatedCaptions = [...session.localCaptions];
    if (!updatedCaptions[index]) {
      return;
    }
    if (!updatedCaptions[index].text[language]) {
      updatedCaptions[index].text[language] = "";
    }
    setSessionState({
      ...session,
      localCaptions: updatedCaptions,
      originalCaptions: updatedCaptions, // Update original captions to reflect the new language
    });
  }

  function decrementTime(index: number, amount: number, isStartTime: boolean) {
    const updatedCaptions = [...session.localCaptions];
    if (!updatedCaptions[index]) {
      return;
    }
    if (isStartTime) {
      updatedCaptions[index].startTime = formatTime(
        timeStringToSeconds(updatedCaptions[index].startTime) - amount,
      );
    } else {
      updatedCaptions[index].endTime = formatTime(
        timeStringToSeconds(updatedCaptions[index].endTime) - amount,
      );
    }
    setSessionState({
      ...session,
      localCaptions: updatedCaptions,
      originalCaptions: updatedCaptions, // Update original captions to reflect the time change
    });
  }

  function incrementTime(index: number, amount: number, isStartTime: boolean) {
    const updatedCaptions = [...session.localCaptions];
    if (!updatedCaptions[index]) {
      return;
    }
    if (isStartTime) {
      updatedCaptions[index].startTime = formatTime(
        timeStringToSeconds(updatedCaptions[index].startTime) + amount,
      );
    } else {
      updatedCaptions[index].endTime = formatTime(
        timeStringToSeconds(updatedCaptions[index].endTime) + amount,
      );
    }
    setSessionState({
      ...session,
      localCaptions: updatedCaptions,
      originalCaptions: updatedCaptions, // Update original captions to reflect the time change
    });
  }

  function setCaptionTime(index: number, time: number, isStartTime: boolean) {
    const updatedCaptions = [...session.localCaptions];
    if (!updatedCaptions[index]) {
      return;
    }

    const formattedTime = formatTime(time);
    updatedCaptions[index] = {
      ...updatedCaptions[index],
      [isStartTime ? "startTime" : "endTime"]: formattedTime,
    };
    setSessionState({
      ...session,
      localCaptions: updatedCaptions,
      originalCaptions: updatedCaptions, // Update original captions to reflect the time change
    });
  }

  function createSubtitlesSection() {
    return (
      <div className="relative my-2 flex min-h-48 flex-col items-center justify-center gap-2.5 py-16">
        <button
          type="button"
          onClick={() => handleAdd(0, "00:00:00,000", "yue")}
          className="flex cursor-pointer items-center justify-center rounded-3xl border-none bg-black/30 p-1.5 hover:bg-white/20"
        >
          Create Subtitles
        </button>
      </div>
    );
  }

  const subtitleEditorHeaderControls = (
    <div className="relative top-0 grid w-full shrink-0 grid-cols-1 items-center justify-center gap-2.5 p-2.5 text-base sm:grid-cols-2 xl:grid-cols-4 xl:text-2xl">
      <div className="flex min-w-0 items-center gap-2">
        <input
          type="number"
          step="any"
          placeholder="Offset"
          ref={offsetInput}
          onKeyDown={(e) => {
            e.stopPropagation();
          }}
          onKeyUp={(e) => {
            e.stopPropagation();
          }}
          onChange={(e) => {
            e.stopPropagation();
            e.preventDefault();
            const offsetValue = Number(e.target.value);
            if (!Number.isNaN(offsetValue)) {
              handleOffsetChange(offsetValue);
            }
          }}
          className="min-w-0 flex-1 rounded-3xl border border-solid border-white/20 bg-transparent p-1.5 text-white"
        />
        <button
          type="button"
          data-tooltip-id="global-tooltip"
          data-tooltip-content="Reset offset to 0s"
          onClick={handleResetSubtitleOffset}
          className="flex shrink-0 cursor-pointer items-center justify-center rounded-2xl border-none bg-black/30 p-1.5 hover:bg-white/20"
        >
          <ArrowPathIcon className="h-6 w-6 xl:h-8 xl:w-8" />
        </button>
      </div>
      <button
        type="button"
        onClick={() => setAutoScroll(!autoScroll)}
        className="w-full cursor-pointer rounded-2xl border-none bg-black/30 p-1.5 hover:bg-white/20"
      >
        <span className="xl:hidden">{autoScroll ? "Auto Scroll" : "No Scroll"}</span>
        <span className="hidden xl:inline">
          {autoScroll ? "Disable Auto Scroll" : "Enable Auto Scroll"}
        </span>
      </button>
      <button
        type="button"
        onClick={() => handleDeleteAllCaptions()}
        className="flex cursor-pointer flex-row items-center justify-center rounded-2xl border-none bg-black/30 p-1.5 hover:bg-white/20 sm:col-span-2 xl:col-span-1 xl:ml-10"
      >
        Delete All
        <TrashIcon className="h-6 w-6 xl:h-8 xl:w-8" />
      </button>
      <div className="flex gap-2 sm:col-span-2 xl:col-span-1">
        <input
          ref={japaneseImportInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleImportJapaneseRomanizations(file);
          }}
        />
        <button
          type="button"
          aria-label="Generate romaji for all Japanese lines"
          data-tooltip-id="global-tooltip"
          data-tooltip-content="Romanize every (jp) line that has no romaji yet"
          disabled={japaneseBatchRunning}
          onClick={() => void handleGenerateAllJapaneseRomanizations()}
          className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-2xl border-none bg-black/30 p-1.5 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <LanguageIcon className="h-5 w-5 xl:h-7 xl:w-7" />
          {japaneseBatchRunning ? "Generating…" : "Generate All"}
        </button>
        <button
          type="button"
          aria-label="Import Japanese romanizations"
          data-tooltip-id="global-tooltip"
          data-tooltip-content="Import Japanese romanizations from JSON"
          onClick={() => japaneseImportInputRef.current?.click()}
          className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-2xl border-none bg-black/30 p-1.5 hover:bg-white/20"
        >
          <ArrowUpTrayIcon className="h-5 w-5 xl:h-7 xl:w-7" />
          Import
        </button>
        <button
          type="button"
          aria-label="Export Japanese romanizations"
          data-tooltip-id="global-tooltip"
          data-tooltip-content="Export Japanese romanizations as JSON"
          onClick={handleExportJapaneseRomanizations}
          className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-2xl border-none bg-black/30 p-1.5 hover:bg-white/20"
        >
          <ArrowDownTrayIcon className="h-5 w-5 xl:h-7 xl:w-7" />
          Export
        </button>
      </div>
      {japaneseTransferMessage && (
        <p className="text-center text-sm text-white/80 sm:col-span-2 xl:col-span-4">
          {japaneseTransferMessage}
        </p>
      )}
    </div>
  );

  const subtitleEditorContent = (
    <div
      id="langpal-subtitle-editor-content"
      ref={contentRef}
      className="scrollbar-thin relative flex min-h-0 w-full flex-1 flex-col gap-2.5 overflow-y-auto border-none bg-transparent px-3 pt-4 pb-20 outline-none xl:px-8 xl:pb-24"
    >
      {session.localCaptions.length === 0 && createSubtitlesSection()}
      {session.localCaptions.map((caption: CaptionSegment, index: number) => (
        <div
          key={`caption-editor-${index}-${caption.startTime}-${caption.endTime}`}
          ref={(element) => {
            captionElementRefs.current[index] = element;
          }}
          className={`mt-6 flex h-full w-full flex-col items-center justify-center gap-1.5 rounded-xl border p-1.5 transition-colors xl:mt-14 ${
            activeCaptionIndex === index
              ? "border-blue-400/80 bg-blue-500/10"
              : "border-transparent"
          }`}
        >
          <button
            type="button"
            data-tooltip-id="global-tooltip"
            data-tooltip-content="Add New Caption Above"
            onClick={() => handleAdd(index, caption.startTime, selectedLanguage[index] || "yue")}
            className="flex cursor-pointer items-center justify-center rounded-3xl border-none bg-black/30 p-2 hover:bg-white/20 xl:p-3"
          >
            <PlusIcon className="h-6 w-6 xl:h-10 xl:w-10" />
          </button>
          <div className="text-md flex h-full w-full flex-col gap-1.5 rounded-lg border border-white/20 xl:m-1.5 xl:p-1.5 xl:text-2xl">
            <div className="flex flex-col items-stretch justify-between gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
              <p className="m-0 p-0 text-left text-lg font-bold xl:text-2xl">{index + 1}</p>
              <div className="flex items-center justify-center gap-1.5 rounded-3xl bg-black/30 p-1.5">
                <button
                  type="button"
                  className="flex cursor-pointer items-center justify-center rounded-3xl border-none p-1.5 hover:bg-white/20"
                  onClick={() => decrementTime(index, 1, true)}
                >
                  {"-1"}
                </button>
                <button
                  type="button"
                  className="flex cursor-pointer items-center justify-center rounded-3xl border-none p-1.5 hover:bg-white/20"
                  onClick={() => decrementTime(index, 0.5, true)}
                >
                  {"-0.5"}
                </button>
                <button
                  type="button"
                  className="flex cursor-pointer items-center justify-center rounded-3xl border-none p-1.5 hover:bg-white/20"
                  onClick={() => incrementTime(index, 0.5, true)}
                >
                  {"+0.5"}
                </button>
                <button
                  type="button"
                  className="flex cursor-pointer items-center justify-center rounded-3xl border-none p-1.5 hover:bg-white/20"
                  onClick={() => incrementTime(index, 1, true)}
                >
                  {"+1"}
                </button>
              </div>
              <div className="flex items-center justify-center gap-1.5 rounded-3xl bg-black/30 p-1.5 text-sm xl:text-xl">
                <button
                  type="button"
                  className="flex cursor-pointer items-center justify-center rounded-3xl border-none p-1.5 hover:bg-white/20"
                  onClick={() => decrementTime(index, 0.5, false)}
                >
                  {"-1"}
                </button>
                <button
                  type="button"
                  className="flex cursor-pointer items-center justify-center rounded-3xl border-none p-1.5 hover:bg-white/20"
                  onClick={() => decrementTime(index, 0.5, false)}
                >
                  {"-0.5"}
                </button>

                <button
                  type="button"
                  className="flex cursor-pointer items-center justify-center rounded-3xl border-none p-1.5 hover:bg-white/20"
                  onClick={() => incrementTime(index, 0.5, false)}
                >
                  {"+0.5"}
                </button>
                <button
                  type="button"
                  className="flex cursor-pointer items-center justify-center rounded-3xl border-none p-1.5 hover:bg-white/20"
                  onClick={() => incrementTime(index, 1, false)}
                >
                  {"+1"}
                </button>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(index)}
                className="flex cursor-pointer items-center justify-center rounded-3xl border-none bg-black/30 p-2 hover:bg-white/20 xl:p-3"
              >
                <TrashIcon className="h-6 w-6 xl:h-10 xl:w-10" />
              </button>
            </div>

            <div className="flex flex-col items-center justify-center gap-2 text-base sm:flex-row sm:gap-4 sm:text-2xl">
              <p className="m-0 p-0 text-left text-lg font-bold sm:text-2xl xl:text-3xl">
                {caption.startTime}
              </p>
              <button
                type="button"
                data-tooltip-id="global-tooltip"
                data-tooltip-content="Set Start Time"
                onClick={() => {
                  setCaptionTime(index, overlay.currentTime, true);
                }}
                className="flex cursor-pointer items-center justify-center rounded-3xl border-none bg-black/30 p-2 text-base hover:bg-white/20 xl:p-3 xl:text-2xl"
              >
                Set
              </button>

              <p className="m-0 p-0 text-left text-lg font-bold sm:text-2xl xl:text-3xl">
                {caption.endTime}
              </p>
              <button
                type="button"
                data-tooltip-id="global-tooltip"
                data-tooltip-content="Set End Time"
                onClick={() => {
                  setCaptionTime(index, overlay.currentTime, false);
                }}
                className="flex cursor-pointer items-center justify-center rounded-3xl border-none bg-black/30 p-2 text-base hover:bg-white/20 xl:p-3 xl:text-2xl"
              >
                Set
              </button>
            </div>

            <div className="flex w-full flex-col items-start justify-center gap-1.5">
              {CaptionLanguages.map((language: CaptionLanguage) => (
                <div key={`${index}-${language.code}-language-content`} className="w-full">
                  {languageContent(language, caption, index)}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between gap-1.5">
              <select
                id={`${index}-${selectedLanguage[index]}`}
                value={selectedLanguage[index] || "yue"}
                onChange={(e) => {
                  const updatedSelectedLanguage = [...selectedLanguage];
                  updatedSelectedLanguage[index] = e.target.value;
                  setSelectedLanguage(updatedSelectedLanguage);
                }}
                className="flex w-full cursor-pointer rounded border-none bg-white p-1.5 text-center text-black"
              >
                {CaptionLanguages.map((language: CaptionLanguage) => (
                  <option key={`${index}-${language.code}-caption-select`} value={language.code}>
                    {language.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                data-tooltip-id="global-tooltip"
                data-tooltip-content="Add New Language Section"
                disabled={caption?.text[selectedLanguage[index] || ""] !== null}
                className="flex cursor-pointer items-center justify-center rounded-3xl border-none bg-black/30 p-2 hover:bg-white/20 xl:p-3"
                onClick={() => {
                  handleNewCaptionLanguage(index, selectedLanguage[index] || "yue");
                }}
              >
                <PlusIcon className="h-6 w-6 xl:h-10 xl:w-10" />
              </button>
            </div>
          </div>
          <button
            type="button"
            data-tooltip-id="global-tooltip"
            data-tooltip-content="Add New Caption Below"
            onClick={() => handleAdd(index + 1, caption.endTime, selectedLanguage[index] || "yue")}
            className="flex cursor-pointer items-center justify-center rounded-3xl border-none bg-black/30 p-2 hover:bg-white/20 xl:p-3"
          >
            <PlusIcon className="h-6 w-6 xl:h-10 xl:w-10" />
          </button>
        </div>
      ))}
    </div>
  );

  return (
    <div
      ref={editorRef}
      id="langpal-subtitle-editor"
      className="relative flex h-full min-h-0 w-full flex-col rounded-3xl border-2 border-white/50 bg-black/50 backdrop-blur-xs"
    >
      <div className="mx-4 flex shrink-0 items-center gap-2 p-3">
        <button
          type="button"
          onClick={() => setSessionState({ ...session, selectedTab: "captions" })}
          className={`flex cursor-pointer items-center justify-center p-2 ${
            session.selectedTab === "captions" ? "border-b-2 border-white/20" : ""
          }`}
        >
          Subtitles
        </button>
        <button
          type="button"
          onClick={() => setSessionState({ ...session, selectedTab: "search" })}
          className={`flex cursor-pointer items-center justify-center p-2 ${
            session.selectedTab === "search" ? "border-b-2 border-white/20" : ""
          }`}
        >
          Search
        </button>
      </div>
      {session.isLoading && <Loading />}
      {session.selectedTab === "captions" ? (
        <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
          {subtitleEditorHeaderControls}
          {subtitleEditorContent}
          <SubtitleEditorBottomControls />
        </div>
      ) : null}

      {session.selectedTab === "search" ? (
        <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
          <SubtitleEditorSearchView />
        </div>
      ) : null}
    </div>
  );
}
