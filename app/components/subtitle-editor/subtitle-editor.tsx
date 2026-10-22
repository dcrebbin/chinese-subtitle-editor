"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDownTrayIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/solid";

import { getOverlayState, setOverlayState, useOverlayStore } from "../../store/overlay.store";
import {
  getSessionState,
  setSessionState,
  useSessionStore,
  type CaptionLanguage,
  type CaptionSegment,
  type SavedJapaneseTransliteration,
} from "../../store/session.store";
import type { ChineseScript } from "../../utilities/chinese-script";
import { batchEditorChange } from "../../utilities/editor-history";
import { retimeRetroKaraokeCue } from "../../utilities/retro-karaoke-timing";
import { CaptionLanguages } from "../../utilities/transliteration/transliteration";
import {
  loadJapaneseTransliterationsFromLocalStorage,
  saveJapaneseTransliterationsToLocalStorage,
} from "../../utilities/video-storage";
import Loading from "../common/loading";
import { toolbarButtonClassName } from "../video-overlay/inspector-controls";
import RetroKaraokeTimingEditor from "./retro-karaoke-timing-editor";
import SubtitleEditorGenerateView from "./subtitle-editor-generate-view";
import SubtitleEditorSearchView from "./subtitle-editor-search-view";
import SubtitleExportModal from "./subtitle-export-modal";
import SubtitleSrtImport from "./subtitle-srt-import";

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
  const contentRef = useRef<HTMLDivElement>(null);
  const japaneseImportInputRef = useRef<HTMLInputElement>(null);
  const captionElementRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [exportOpen, setExportOpen] = useState<false | "manual" | "generated">(false);
  const [convertingScript, setConvertingScript] = useState(false);
  const [scriptMessage, setScriptMessage] = useState("");
  const [chineseScript, setChineseScript] = useState<ChineseScript>(
    session.generationChineseScript === "simplified" ? "simplified" : "traditional",
  );

  async function handleConvertScript(script: ChineseScript) {
    if (convertingScript) return;
    setConvertingScript(true);
    setScriptMessage("");
    try {
      const { convertChineseCaptions, convertChineseText } = await import(
        "../../utilities/chinese-script"
      );
      const current = getSessionState().session;
      const captions = convertChineseCaptions(current.localCaptions, script);
      batchEditorChange(() =>
        setSessionState({
          localCaptions: captions,
          originalCaptions: captions,
          lyrics: convertChineseText(current.lyrics, script),
        }),
      );
      setChineseScript(script);
      setScriptMessage(
        `Converted all Chinese text to ${script === "traditional" ? "Traditional" : "Simplified"} Chinese. Undo to restore.`,
      );
    } catch {
      setScriptMessage("Could not convert text. Please try again.");
    } finally {
      setConvertingScript(false);
    }
  }

  const [japaneseLoading, setJapaneseLoading] = useState<Record<number, boolean>>({});
  const [japaneseErrors, setJapaneseErrors] = useState<Record<number, string>>({});
  const [japaneseTransferMessage, setJapaneseTransferMessage] = useState("");
  const [japaneseBatchRunning, setJapaneseBatchRunning] = useState(false);

  useEffect(() => {
    setSessionState({
      japaneseTransliterations: loadJapaneseTransliterationsFromLocalStorage(session.videoId),
    });
  }, [session.videoId]);

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

  function captionLanguages(caption: CaptionSegment) {
    return Object.keys(caption.text)
      .map((code) => CaptionLanguages.find((language) => language.code === code))
      .filter((language): language is CaptionLanguage =>
        Boolean(language && caption.text[language.code] != null),
      );
  }

  function handleChangeLanguage(index: number, oldLanguage: string, newLanguage: string) {
    const caption = session.localCaptions[index];
    if (!caption || oldLanguage === newLanguage || caption.text[newLanguage] != null) return;

    // Replace the key in place so primary and secondary retain their order and text.
    const text = Object.fromEntries(
      Object.entries(caption.text)
        .filter(([code]) => code !== newLanguage)
        .map(([code, value]) => [code === oldLanguage ? newLanguage : code, value]),
    );
    text[oldLanguage] = null;
    const updatedCaptions = session.localCaptions.map((item, itemIndex) =>
      itemIndex === index ? { ...item, text } : item,
    );
    setSessionState({ localCaptions: updatedCaptions, originalCaptions: updatedCaptions });
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
    setSessionState({
      ...session,
      srtContent: "",
      localSrtContent: "",
      localCaptions: [],
      originalCaptions: [],
      originalSrtContent: "",
    });
  }

  function updateCaptionTimes(
    updatedCaptions: CaptionSegment[],
    subtitleOffset = session.subtitleOffset,
  ) {
    const timing = retimeRetroKaraokeCue(
      session.localCaptions,
      updatedCaptions,
      getOverlayState().overlay,
      timeStringToSeconds,
    );
    batchEditorChange(() => {
      setOverlayState(timing);
      setSessionState({
        localCaptions: updatedCaptions,
        originalCaptions: updatedCaptions,
        subtitleOffset,
      });
    });
  }

  function handleOffsetChange(offsetSeconds: number) {
    if (!Number.isFinite(offsetSeconds)) return;

    const delta = offsetSeconds - session.subtitleOffset;

    const updatedCaptions = session.localCaptions.map((caption: CaptionSegment) => {
      const newStart = Math.max(0, timeStringToSeconds(caption.startTime) + delta);
      const newEnd = Math.max(0, timeStringToSeconds(caption.endTime) + delta);
      return {
        ...caption,
        startTime: formatTime(newStart),
        endTime: formatTime(newEnd),
      };
    });

    updateCaptionTimes(updatedCaptions, offsetSeconds);
  }

  function handleResetSubtitleOffset() {
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

  const languageContent = (
    language: CaptionLanguage,
    caption: CaptionSegment,
    index: number,
    rowIndex: number,
  ) => {
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
                <label className="flex min-w-0 flex-1 items-center gap-2 text-sm font-bold">
                  <select
                    aria-label={`${rowIndex === 0 ? "Primary" : "Secondary"} language for caption ${index + 1}`}
                    value={language.code}
                    onChange={(event) =>
                      handleChangeLanguage(index, language.code, event.target.value)
                    }
                    onKeyDown={(event) => event.stopPropagation()}
                    onKeyUp={(event) => event.stopPropagation()}
                    className="min-w-0 flex-1 cursor-pointer rounded bg-white p-1.5 text-black"
                  >
                    {CaptionLanguages.filter(
                      (option) =>
                        option.code === language.code || caption.text[option.code] == null,
                    ).map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.name}
                      </option>
                    ))}
                  </select>
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
                <button
                  type="button"
                  data-tooltip-id="global-tooltip"
                  aria-label={`Delete ${rowIndex === 0 ? "primary" : "secondary"} row for caption ${index + 1}`}
                  data-tooltip-content="Delete Row"
                  onClick={() => handleDeleteLanguage(index, language.code)}
                  className="flex shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-black/30 p-1.5 hover:bg-white/20"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
              <textarea
                aria-label={`${rowIndex === 0 ? "Primary" : "Secondary"} subtitle text for caption ${index + 1}`}
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
                        className="w-full min-w-10 rounded border border-blue-200 bg-blue-50 px-1 text-center text-xs text-blue-700 outline-none"
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
          </div>
        )}
      </>
    );
  };

  function handleNewCaptionLanguage(index: number, language: string) {
    const updatedCaptions = [...session.localCaptions];
    if (!updatedCaptions[index] || captionLanguages(updatedCaptions[index]).length >= 2) {
      return;
    }
    if (updatedCaptions[index].text[language] == null) {
      updatedCaptions[index].text[language] = "";
    }
    setSessionState({
      ...session,
      localCaptions: updatedCaptions,
      originalCaptions: updatedCaptions, // Update original captions to reflect the new language
    });
  }

  function decrementTime(index: number, amount: number, isStartTime: boolean) {
    const caption = session.localCaptions[index];
    if (!caption) return;
    setCaptionTime(
      index,
      timeStringToSeconds(caption[isStartTime ? "startTime" : "endTime"]) - amount,
      isStartTime,
    );
  }

  function incrementTime(index: number, amount: number, isStartTime: boolean) {
    const caption = session.localCaptions[index];
    if (!caption) return;
    setCaptionTime(
      index,
      timeStringToSeconds(caption[isStartTime ? "startTime" : "endTime"]) + amount,
      isStartTime,
    );
  }

  function setCaptionTime(index: number, time: number, isStartTime: boolean) {
    const updatedCaptions = [...session.localCaptions];
    if (!updatedCaptions[index]) return;
    updatedCaptions[index] = {
      ...updatedCaptions[index],
      [isStartTime ? "startTime" : "endTime"]: formatTime(time),
    };
    updateCaptionTimes(updatedCaptions);
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
    <div className="relative top-0 flex w-full shrink-0 flex-wrap items-center gap-2 p-3">
      <div className="flex min-w-20 flex-1 items-center gap-2">
        <input
          type="number"
          step="any"
          placeholder="Offset Subtitles"
          value={session.subtitleOffset || ""}
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
          className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/30 px-2 py-1 text-sm text-white outline-none"
        />
      </div>
      <button
        type="button"
        onClick={() => setAutoScroll(!autoScroll)}
        className={`${toolbarButtonClassName} flex-1 justify-center whitespace-nowrap`}
      >
        <span className="xl:hidden">{autoScroll ? "Auto Scroll" : "No Scroll"}</span>
        <span className="hidden xl:inline">
          {autoScroll ? "Disable Auto Scroll" : "Enable Auto Scroll"}
        </span>
      </button>
      <button
        type="button"
        onClick={() => handleDeleteAllCaptions()}
        className={`${toolbarButtonClassName} flex-1 justify-center whitespace-nowrap`}
      >
        Delete All
        <TrashIcon className="h-4 w-4" />
      </button>
      <button
        type="button"
        role="switch"
        aria-label="Simplified Chinese"
        aria-checked={chineseScript === "simplified"}
        aria-busy={convertingScript}
        className="flex shrink-0 cursor-pointer items-center gap-2 rounded-lg bg-white/10 px-2.5 py-1.5 text-sm font-medium hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={convertingScript || (!session.localCaptions.length && !session.lyrics)}
        onClick={() =>
          void handleConvertScript(chineseScript === "traditional" ? "simplified" : "traditional")
        }
        title={`Convert all Chinese subtitle text and lyrics to ${chineseScript === "traditional" ? "Simplified" : "Traditional"} Chinese`}
      >
        <span className={chineseScript === "traditional" ? "text-white" : "text-white/50"}>
          繁體
        </span>
        <span aria-hidden="true" className="relative h-5 w-9 rounded-full bg-blue-500">
          <span
            className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${chineseScript === "simplified" ? "translate-x-4" : ""}`}
          />
        </span>
        <span className={chineseScript === "simplified" ? "text-white" : "text-white/50"}>
          简体
        </span>
      </button>
      <div className="flex flex-[2] gap-2">
        <SubtitleSrtImport />
        <button
          type="button"
          onClick={() => setExportOpen("manual")}
          className={`${toolbarButtonClassName} flex-1 justify-center whitespace-nowrap`}
        >
          Export
          <ArrowDownTrayIcon className="h-4 w-4" />
        </button>
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
      </div>
      {japaneseTransferMessage && (
        <p className="text-center text-sm text-white/80 sm:col-span-2 xl:col-span-4">
          {japaneseTransferMessage}
        </p>
      )}
      {scriptMessage && (
        <p role="status" className="w-full text-xs text-white/80">
          {scriptMessage}
        </p>
      )}
    </div>
  );

  const subtitleEditorContent = (
    <div
      id="langpal-subtitle-editor-content"
      ref={contentRef}
      className="scrollbar-thin relative flex min-h-0 w-full flex-1 flex-col gap-2.5 overflow-y-auto border-none bg-transparent px-3 pt-4 pb-4 outline-none xl:px-8 xl:pb-4"
    >
      {session.localCaptions.length === 0 && createSubtitlesSection()}
      {session.localCaptions.map((caption: CaptionSegment, index: number) => (
        <div
          key={`caption-editor-${index}-${caption.startTime}-${caption.endTime}`}
          ref={(element) => {
            captionElementRefs.current[index] = element;
          }}
          className={`mt-6 flex h-full w-full flex-col items-center justify-center rounded-xl border p-1.5 transition-colors xl:mt-14 ${
            activeCaptionIndex === index
              ? "border-blue-400/80 bg-blue-500/10"
              : "border-transparent"
          }`}
        >
          <button
            hidden={index !== 0}
            type="button"
            data-tooltip-id="global-tooltip"
            data-tooltip-content="Add New Caption Above"
            onClick={() =>
              handleAdd(index, caption.startTime, captionLanguages(caption)[0]?.code || "yue")
            }
            className="flex cursor-pointer items-center justify-center rounded-3xl border-none bg-black/30 p-1 p-2 hover:bg-white/20"
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
              {captionLanguages(caption)
                .slice(0, 2)
                .map((language, rowIndex) => (
                  <div key={`${index}-${language.code}-language-content`} className="w-full">
                    {languageContent(language, caption, index, rowIndex)}
                  </div>
                ))}
            </div>

            {overlay.subtitleStyle === "retro-karaoke" && (
              <RetroKaraokeTimingEditor caption={caption} />
            )}

            {captionLanguages(caption).length < 2 && (
              <button
                type="button"
                onClick={() => {
                  const nextLanguage = CaptionLanguages.find(
                    (language) => caption.text[language.code] == null,
                  );
                  if (nextLanguage) handleNewCaptionLanguage(index, nextLanguage.code);
                }}
                className="flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-black/30 p-2 hover:bg-white/20"
              >
                <PlusIcon className="h-5 w-5" />
                Add {captionLanguages(caption).length === 0 ? "primary" : "secondary"} row
              </button>
            )}
          </div>
          <button
            type="button"
            data-tooltip-id="global-tooltip"
            data-tooltip-content="Add New Caption Below"
            onClick={() =>
              handleAdd(index + 1, caption.endTime, captionLanguages(caption)[0]?.code || "yue")
            }
            className="flex cursor-pointer items-center justify-center rounded-3xl border-none bg-black/30 p-2 hover:bg-white/20"
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
      className="relative flex h-full min-h-0 w-full flex-col rounded-2xl border border-white/15 bg-black/30"
    >
      <div className="flex shrink-0 flex-wrap border-b border-white/10 px-1" role="tablist">
        {(
          [
            ["captions", "Subtitles"],
            ["search", "Search"],
            ["generate", "Generate"],
          ] as const
        ).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={session.selectedTab === tab}
            onClick={() => setSessionState({ selectedTab: tab })}
            className={`-mb-px cursor-pointer border-b-2 px-3 py-2 text-sm font-medium ${session.selectedTab === tab ? "border-blue-500 text-white" : "border-transparent text-white/50 hover:text-white"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {session.saveError && (
        <p role="alert" className="m-2 text-sm text-red-300">
          {session.saveError}
        </p>
      )}
      <div
        className={`${session.selectedTab === "generate" ? "flex" : "hidden"} min-h-0 flex-1 flex-col overflow-hidden`}
      >
        <SubtitleEditorGenerateView onGenerated={() => setExportOpen("generated")} />
      </div>
      {exportOpen && (
        <SubtitleExportModal
          generated={exportOpen === "generated"}
          onClose={() => setExportOpen(false)}
        />
      )}
      {session.isLoading && <Loading />}
      {session.selectedTab === "captions" ? (
        <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
          {subtitleEditorHeaderControls}
          {subtitleEditorContent}
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
