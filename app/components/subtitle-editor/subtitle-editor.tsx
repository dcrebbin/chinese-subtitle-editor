"use client";

import { useEffect, useRef, useState } from "react";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/solid";

import {
  ParsedSubtitle,
  setSessionState,
  useSessionStore,
  type CaptionLanguage,
  type CaptionSegment,
} from "../../store/session.store";
import { parseSrt } from "../../utilities/srt";
import {
  CaptionLanguages,
  convertCaptionsToSrt,
  convertSrtToCaptions,
} from "../../utilities/transliteration/transliteration";
import Loading from "../common/loading";
import SubtitleEditorBottomControls from "./subtitle-editor-bottom-controls";

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

  const editorRef = useRef<HTMLDivElement>(null);
  const offsetInput = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const originalCaptionsInitialized = useRef<boolean>(false);

  const [autoScroll, setAutoScroll] = useState<boolean>(true);

  const [selectedLanguage, setSelectedLanguage] = useState<string[]>([]);

  useEffect(() => {
    if (session.srtContent) {
      setSessionState({ ...session, isLoading: true });
      const captions = convertSrtToCaptions(session.srtContent);
      const parsedSubtitles = parseSrt(session.srtContent);

      if (!originalCaptionsInitialized.current) {
        setSessionState({
          ...session,
          localCaptions: captions,
          parsedSubtitles: parsedSubtitles as ParsedSubtitle[],
          originalCaptions: captions,
          localSrtContent: convertCaptionsToSrt(captions),
          originalSrtContent: session.srtContent,
          isLoading: false,
        });
        originalCaptionsInitialized.current = true;
      }
    }
  }, []);

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
    setSessionState({
      ...session,
      srtContent: "",
      localSrtContent: "",
      localCaptions: [],
      originalCaptions: [], // Update original captions to reflect the deletion
    });
  }

  function handleOffsetChange(offsetSeconds: number) {
    if (!Number.isFinite(offsetSeconds)) return;

    // Use originalCaptions if available, otherwise use current localCaptions as base
    const baseCaptions =
      session.originalCaptions.length > 0 ? session.originalCaptions : session.localCaptions;

    const updatedCaptions = baseCaptions.map((caption: CaptionSegment) => {
      const newStart = Math.max(0, timeStringToSeconds(caption.startTime) + offsetSeconds);
      const newEnd = Math.max(0, timeStringToSeconds(caption.endTime) + offsetSeconds);
      return {
        ...caption,
        startTime: formatTime(newStart),
        endTime: formatTime(newEnd),
      };
    });

    setSessionState({
      ...session,
      localCaptions: updatedCaptions,
      srtContent: convertCaptionsToSrt(updatedCaptions),
      localSrtContent: convertCaptionsToSrt(updatedCaptions),
    });
  }

  const languageContent = (language: CaptionLanguage, caption: CaptionSegment, index: number) => (
    <>
      {caption.text[language.code] !== null && (
        <div
          key={`${index}-${language.code}-caption-edit`}
          className="flex w-full flex-row gap-1.5 border-b border-white/20 pb-1.5"
        >
          <div className="flex w-full flex-col gap-1.5">
            <label htmlFor={`${index}-${language.code}`} className="text-left text-2xl font-bold">
              {language.name}
            </label>
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
              className="m-0 h-16 w-full rounded-md border border-white/20 p-2 text-left text-3xl text-black"
            />
          </div>
          <button
            type="button"
            data-tooltip-id="global-tooltip"
            data-tooltip-content="Delete Language Section"
            onClick={() => handleDeleteLanguage(index, language.code)}
            className="flex cursor-pointer items-center justify-center rounded-3xl border-none bg-black/30 p-3 hover:bg-white/20"
          >
            <TrashIcon className="h-10 w-10" />
          </button>
        </div>
      )}
    </>
  );

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

  function createSubtitlesSection() {
    return (
      <div className="relative my-2 flex h-[100vh] flex-col items-center justify-center gap-2.5">
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
    <div className="relative top-0 grid w-full grid-cols-4 items-center justify-center gap-2.5 p-2.5 text-2xl">
      <input
        type="number"
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
        className="w-42 rounded-3xl border border-solid border-white/20 bg-transparent p-1.5 text-white"
      />
      <button
        type="button"
        onClick={() => setAutoScroll(!autoScroll)}
        className="cursor-pointer rounded-2xl border-none bg-black/30 p-1.5 hover:bg-white/20"
      >
        {autoScroll ? "Disable Auto Scroll" : "Enable Auto Scroll"}
      </button>
      <button
        type="button"
        onClick={() => handleDeleteAllCaptions()}
        className="flex cursor-pointer flex-row items-center justify-center rounded-3xl border-none bg-black/30 p-1.5 hover:bg-white/20"
      >
        Delete All
        <TrashIcon className="h-8 w-8" />
      </button>
    </div>
  );

  const subtitleEditorContent = (
    <div
      id="langpal-subtitle-editor-content"
      ref={contentRef}
      className="scrollbar-thin relative flex w-full flex-col gap-2.5 overflow-y-scroll border-none bg-transparent px-8 pt-4 pb-24 outline-none"
    >
      {session.localCaptions.length === 0 && createSubtitlesSection()}
      {session.localCaptions.map((caption: CaptionSegment, index: number) => (
        <div
          key={`caption-editor-${index}-${caption.startTime}-${caption.endTime}`}
          className="mt-14 flex h-full w-full flex-col items-center justify-center gap-1.5"
        >
          <button
            type="button"
            data-tooltip-id="global-tooltip"
            data-tooltip-content="Add New Caption Above"
            onClick={() => handleAdd(index, caption.startTime, selectedLanguage[index] || "yue")}
            className="flex cursor-pointer items-center justify-center rounded-3xl border-none bg-black/30 p-3 hover:bg-white/20"
          >
            <PlusIcon className="h-10 w-10" />
          </button>
          <div className="m-1.5 flex h-full w-full flex-col gap-1.5 rounded-lg border border-white/20 p-1.5 text-2xl">
            <div className="flex items-center justify-between gap-4">
              <p className="m-0 p-0 text-left text-2xl font-bold">{index + 1}</p>
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
              <div className="flex items-center justify-center gap-1.5 rounded-3xl bg-black/30 p-1.5 text-xl">
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
                className="flex cursor-pointer items-center justify-center rounded-3xl border-none bg-black/30 p-3 hover:bg-white/20"
              >
                <TrashIcon className="h-10 w-10" />
              </button>
            </div>

            <div className="flex items-center justify-center gap-4 text-2xl">
              <p className="m-0 p-0 text-left text-3xl font-bold">{caption.startTime}</p>
              <button
                type="button"
                data-tooltip-id="global-tooltip"
                data-tooltip-content="Set Start Time"
                onClick={() => {
                  const video = session.video;
                  if (video) {
                    const time = video.currentTime;
                    const formattedTime = formatTime(time);
                    const updatedCaptions = [...session.localCaptions];
                    if (!updatedCaptions[index]) {
                      return;
                    }
                    updatedCaptions[index].startTime = formattedTime;
                    setSessionState({
                      ...session,
                      localCaptions: updatedCaptions,
                      originalCaptions: updatedCaptions, // Update original captions to reflect the time change
                    });
                  }
                }}
                className="flex cursor-pointer items-center justify-center rounded-3xl border-none bg-black/30 p-3 text-2xl hover:bg-white/20"
              >
                Set
              </button>

              <p className="m-0 p-0 text-left text-3xl font-bold">{caption.endTime}</p>
              <button
                type="button"
                data-tooltip-id="global-tooltip"
                data-tooltip-content="Set End Time"
                onClick={() => {
                  const video = session.video;
                  if (video) {
                    const time = video.currentTime;
                    const formattedTime = formatTime(time);
                    const updatedCaptions = [...session.localCaptions];
                    if (!updatedCaptions[index]) {
                      return;
                    }
                    updatedCaptions[index].endTime = formattedTime;
                    setSessionState({
                      ...session,
                      localCaptions: updatedCaptions,
                      originalCaptions: updatedCaptions, // Update original captions to reflect the time change
                    });
                  }
                }}
                className="flex cursor-pointer items-center justify-center rounded-3xl border-none bg-black/30 p-3 text-2xl hover:bg-white/20"
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
                className="flex cursor-pointer items-center justify-center rounded-3xl border-none bg-black/30 p-3 hover:bg-white/20"
                onClick={() => {
                  handleNewCaptionLanguage(index, selectedLanguage[index] || "yue");
                }}
              >
                <PlusIcon className="h-10 w-10" />
              </button>
            </div>
          </div>
          <button
            type="button"
            data-tooltip-id="global-tooltip"
            data-tooltip-content="Add New Caption Below"
            onClick={() => handleAdd(index + 1, caption.endTime, selectedLanguage[index] || "yue")}
            className="flex cursor-pointer items-center justify-center rounded-3xl border-none bg-black/30 p-3 hover:bg-white/20"
          >
            <PlusIcon className="h-10 w-10" />
          </button>
        </div>
      ))}
    </div>
  );

  return (
    <div
      ref={editorRef}
      id="langpal-subtitle-editor"
      className="relative flex h-[92vh] w-full flex-col bg-green-500"
    >
      <Loading />
      {session.selectedTab === "captions" ? (
        <div className="relative flex h-full w-full flex-col overflow-auto">
          {subtitleEditorHeaderControls}
          {subtitleEditorContent}
          <SubtitleEditorBottomControls />
        </div>
      ) : null}
    </div>
  );
}
