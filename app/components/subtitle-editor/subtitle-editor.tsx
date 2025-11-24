"use client";
import {
  type CaptionLanguage,
  type CaptionSegment,
} from "../../store/session.store";
import { setSessionState, useSessionStore } from "../../store/session.store";
import {
  CaptionLanguages,
  convertCaptionsToSrt,
  convertSrtToCaptions,
} from "../../utilities/transliteration/transliteration";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/solid";
import { useEffect, useRef, useState } from "react";
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
  return (
    (hours || 0) * 3600 +
    (minutes || 0) * 60 +
    (seconds || 0) +
    Number(milliseconds) / 1000
  );
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
      setSessionState({
        ...session,
        localCaptions: captions,
        localSrtContent: session.srtContent,
      });
      // Set original captions if they haven't been set yet
      if (!originalCaptionsInitialized.current) {
        setSessionState({
          ...session,
          localCaptions: captions,
          originalCaptions: captions, // Store original captions for offset calculations
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
      session.originalCaptions.length > 0
        ? session.originalCaptions
        : session.localCaptions;

    const updatedCaptions = baseCaptions.map((caption: CaptionSegment) => {
      const newStart = Math.max(
        0,
        timeStringToSeconds(caption.startTime) + offsetSeconds
      );
      const newEnd = Math.max(
        0,
        timeStringToSeconds(caption.endTime) + offsetSeconds
      );
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

  const languageContent = (
    language: CaptionLanguage,
    caption: CaptionSegment,
    index: number
  ) => (
    <>
      {caption.text[language.code] !== null && (
        <div
          key={`${index}-${language.code}-caption-edit`}
          className="flex flex-row gap-1.5 w-full border-b border-white/20 pb-1.5"
        >
          <div className="flex flex-col gap-1.5 w-full">
            <label
              htmlFor={`${index}-${language.code}`}
              className="text-2xl font-bold text-left"
            >
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
              className="h-16 rounded-md m-0 p-2 border text-black border-white/20 text-3xl text-left w-full"
            />
          </div>
          <button
            type="button"
            data-tooltip-id="global-tooltip"
            data-tooltip-content="Delete Language Section"
            onClick={() => handleDeleteLanguage(index, language.code)}
            className="border-none flex p-3 bg-black/30 items-center justify-center rounded-3xl hover:bg-white/20  cursor-pointer"
          >
            <TrashIcon className="w-10 h-10" />
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
        timeStringToSeconds(updatedCaptions[index].startTime) - amount
      );
    } else {
      updatedCaptions[index].endTime = formatTime(
        timeStringToSeconds(updatedCaptions[index].endTime) - amount
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
        timeStringToSeconds(updatedCaptions[index].startTime) + amount
      );
    } else {
      updatedCaptions[index].endTime = formatTime(
        timeStringToSeconds(updatedCaptions[index].endTime) + amount
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
      <div className="flex my-2 items-center relative justify-center h-[100vh] flex-col gap-2.5">
        <button
          type="button"
          onClick={() => handleAdd(0, "00:00:00,000", "yue")}
          className="border-none flex items-center justify-center bg-black/30 rounded-3xl hover:bg-white/20  cursor-pointer p-1.5"
        >
          Create Subtitles
        </button>
      </div>
    );
  }

  const subtitleEditorHeaderControls = (
    <div className="grid text-2xl grid-cols-4 relative top-0 gap-2.5 p-2.5 justify-center items-center w-full">
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
        className="w-42 p-1.5 text-white border-solid bg-transparent rounded-3xl border-white/20 border-[1px]"
      />
      <button
        type="button"
        onClick={() => setAutoScroll(!autoScroll)}
        className="cursor-pointer bg-black/30 hover:bg-white/20  p-1.5 rounded-2xl border-none"
      >
        {autoScroll ? "Disable Auto Scroll" : "Enable Auto Scroll"}
      </button>
      <button
        type="button"
        onClick={() => handleDeleteAllCaptions()}
        className="cursor-pointer  rounded-3xl bg-black/30 hover:bg-white/20  flex flex-row items-center justify-center p-1.5 border-none"
      >
        Delete All
        <TrashIcon className="w-8 h-8" />
      </button>
    </div>
  );

  const subtitleEditorContent = (
    <div
      id="langpal-subtitle-editor-content"
      ref={contentRef}
      className="pt-4 border-none relative w-full overflow-y-scroll px-8 pb-24 scrollbar-thin outline-none bg-transparent flex flex-col gap-2.5"
    >
      {session.localCaptions.length === 0 && createSubtitlesSection()}
      {session.localCaptions.map((caption: CaptionSegment, index: number) => (
        <div
          key={`caption-editor-${index}-${caption.startTime}-${caption.endTime}`}
          className="flex flex-col mt-14 gap-1.5 justify-center items-center w-full h-full"
        >
          <button
            type="button"
            data-tooltip-id="global-tooltip"
            data-tooltip-content="Add New Caption Above"
            onClick={() =>
              handleAdd(
                index,
                caption.startTime,
                selectedLanguage[index] || "yue"
              )
            }
            className="border-none flex p-3 bg-black/30 items-center justify-center rounded-3xl hover:bg-white/20  cursor-pointer"
          >
            <PlusIcon className="w-10 h-10" />
          </button>
          <div className="border border-white/20 text-2xl m-1.5 p-1.5 rounded-lg w-full h-full flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-4">
              <p className="m-0 p-0 text-2xl font-bold text-left">
                {index + 1}
              </p>
              <div className="flex items-center justify-center gap-1.5 bg-black/30 p-1.5 rounded-3xl">
                <button
                  type="button"
                  className="border-none flex items-center justify-center rounded-3xl hover:bg-white/20  cursor-pointer p-1.5"
                  onClick={() => decrementTime(index, 1, true)}
                >
                  {"-1"}
                </button>
                <button
                  type="button"
                  className="border-none flex items-center justify-center rounded-3xl hover:bg-white/20  cursor-pointer p-1.5"
                  onClick={() => decrementTime(index, 0.5, true)}
                >
                  {"-0.5"}
                </button>
                <button
                  type="button"
                  className="border-none flex items-center justify-center rounded-3xl hover:bg-white/20  cursor-pointer p-1.5"
                  onClick={() => incrementTime(index, 0.5, true)}
                >
                  {"+0.5"}
                </button>
                <button
                  type="button"
                  className="border-none flex items-center justify-center rounded-3xl hover:bg-white/20  cursor-pointer p-1.5"
                  onClick={() => incrementTime(index, 1, true)}
                >
                  {"+1"}
                </button>
              </div>
              <div className="flex text-xl items-center justify-center gap-1.5 bg-black/30 p-1.5 rounded-3xl">
                <button
                  type="button"
                  className="border-none flex items-center justify-center rounded-3xl hover:bg-white/20  cursor-pointer p-1.5"
                  onClick={() => decrementTime(index, 0.5, false)}
                >
                  {"-1"}
                </button>
                <button
                  type="button"
                  className="border-none flex items-center justify-center rounded-3xl hover:bg-white/20  cursor-pointer p-1.5"
                  onClick={() => decrementTime(index, 0.5, false)}
                >
                  {"-0.5"}
                </button>

                <button
                  type="button"
                  className="border-none flex items-center justify-center rounded-3xl hover:bg-white/20  cursor-pointer p-1.5"
                  onClick={() => incrementTime(index, 0.5, false)}
                >
                  {"+0.5"}
                </button>
                <button
                  type="button"
                  className="border-none flex items-center justify-center rounded-3xl hover:bg-white/20  cursor-pointer p-1.5"
                  onClick={() => incrementTime(index, 1, false)}
                >
                  {"+1"}
                </button>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(index)}
                className="border-none flex p-3 bg-black/30 items-center justify-center rounded-3xl hover:bg-white/20  cursor-pointer"
              >
                <TrashIcon className="w-10 h-10" />
              </button>
            </div>

            <div className="flex items-center text-2xl justify-center gap-4">
              <p className="m-0 p-0 text-3xl font-bold text-left">
                {caption.startTime}
              </p>
              <button
                type="button"
                data-tooltip-id="global-tooltip"
                data-tooltip-content="Set Start Time"
                onClick={() => {
                  const video = document.querySelector("video");
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
                className="border-none text-2xl flex p-3 bg-black/30 items-center justify-center rounded-3xl hover:bg-white/20  cursor-pointer"
              >
                Set
              </button>

              <p className="m-0 p-0 text-3xl font-bold text-left">
                {caption.endTime}
              </p>
              <button
                type="button"
                data-tooltip-id="global-tooltip"
                data-tooltip-content="Set End Time"
                onClick={() => {
                  const video = document.querySelector("video");
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
                className="border-none text-2xl p-3 flex bg-black/30 items-center justify-center rounded-3xl hover:bg-white/20  cursor-pointer"
              >
                Set
              </button>
            </div>

            <div className="flex flex-col items-start justify-center gap-1.5 w-full">
              {CaptionLanguages.map((language: CaptionLanguage) => (
                <div
                  key={`${index}-${language.code}-language-content`}
                  className="w-full"
                >
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
                className="border-none bg-white text-black  text-center rounded flex p-1.5 cursor-pointer w-full"
              >
                {CaptionLanguages.map((language: CaptionLanguage) => (
                  <option
                    key={`${index}-${language.code}-caption-select`}
                    value={language.code}
                  >
                    {language.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                data-tooltip-id="global-tooltip"
                data-tooltip-content="Add New Language Section"
                disabled={caption?.text[selectedLanguage[index] || ""] !== null}
                className="border-none flex p-3 bg-black/30 items-center justify-center rounded-3xl hover:bg-white/20  cursor-pointer"
                onClick={() => {
                  handleNewCaptionLanguage(
                    index,
                    selectedLanguage[index] || "yue"
                  );
                }}
              >
                <PlusIcon className="w-10 h-10" />
              </button>
            </div>
          </div>
          <button
            type="button"
            data-tooltip-id="global-tooltip"
            data-tooltip-content="Add New Caption Below"
            onClick={() =>
              handleAdd(
                index + 1,
                caption.endTime,
                selectedLanguage[index] || "yue"
              )
            }
            className="border-none flex p-3 bg-black/30 items-center justify-center rounded-3xl hover:bg-white/20  cursor-pointer"
          >
            <PlusIcon className="w-10 h-10" />
          </button>
        </div>
      ))}
    </div>
  );

  return (
    <div
      ref={editorRef}
      id="langpal-subtitle-editor"
      className="flex w-full h-[92vh] flex-col bg-green-500"
    >
      <Loading />
      {session.selectedTab === "captions" ? (
        <div className="flex relative flex-col h-full w-full overflow-auto">
          {subtitleEditorHeaderControls}
          {subtitleEditorContent}
          <SubtitleEditorBottomControls />
        </div>
      ) : null}
    </div>
  );
}
