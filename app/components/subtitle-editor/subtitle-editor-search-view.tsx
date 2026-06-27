import { useRef, useState, type ChangeEvent } from "react";
import { ArrowUpTrayIcon, MagnifyingGlassIcon, PlusIcon } from "@heroicons/react/24/solid";

import { useOverlayStore } from "../../store/overlay.store";
import { setSessionState, useSessionStore, type CaptionSegment } from "../../store/session.store";
import {
  convertCaptionsToSrt,
  convertSrtToCaptions,
} from "../../utilities/transliteration/transliteration";
import { retrieveCustomSubtitles } from "../video-overlay/overlay-page";
import type { Subtitle } from "./subtitle-editor";

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

function timeStringToSeconds(timeString: string): number {
  const [time, milliseconds] = timeString.split(",");
  const [hours, minutes, seconds] = time?.split(":").map(Number) || [];
  return (hours || 0) * 3600 + (minutes || 0) * 60 + (seconds || 0) + Number(milliseconds) / 1000;
}

export default function SubtitleEditorSearchView() {
  const searchInput = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const [uploadAtCurrentTime, setUploadAtCurrentTime] = useState<boolean>(true);
  const [uploadedFileName, setUploadedFileName] = useState<string>("");
  const [subtitleSearchResults, setSubtitleSearchResults] = useState<Subtitle[]>([]);
  const { session } = useSessionStore();
  const { overlay } = useOverlayStore();

  function loadSrtContent(srtContent: string, fileName?: string) {
    const captions = convertSrtToCaptions(srtContent);
    if (captions.length === 0) {
      alert("No captions found in the SRT file");
      return;
    }

    const firstCaptionStartTime = timeStringToSeconds(captions[0]?.startTime || "00:00:00,000");
    const offsetSeconds = uploadAtCurrentTime ? overlay.currentTime - firstCaptionStartTime : 0;
    if (!Number.isFinite(offsetSeconds)) {
      alert("Current video time is not available");
      return;
    }

    const shiftedCaptions = captions.map((caption: CaptionSegment) => ({
      ...caption,
      startTime: formatTime(Math.max(0, timeStringToSeconds(caption.startTime) + offsetSeconds)),
      endTime: formatTime(Math.max(0, timeStringToSeconds(caption.endTime) + offsetSeconds)),
    }));
    const mergedCaptions = [...session.localCaptions, ...shiftedCaptions].sort(
      (a, b) => timeStringToSeconds(a.startTime) - timeStringToSeconds(b.startTime),
    );
    const mergedSrtContent = convertCaptionsToSrt(mergedCaptions);

    setUploadedFileName(fileName || "");
    setSessionState({
      ...session,
      hasCustomCaptions: true,
      srtContent: mergedSrtContent,
      originalSrtContent: mergedSrtContent,
      originalCaptions: mergedCaptions,
      localSrtContent: mergedSrtContent,
      selectedTab: "captions",
      localCaptions: mergedCaptions,
      isLoading: false,
    });
  }

  async function handleSrtUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith(".srt")) {
      alert("Please upload an .srt file");
      event.target.value = "";
      return;
    }

    try {
      const srtContent = await file.text();
      loadSrtContent(srtContent, file.name);
    } catch {
      alert("Failed to read SRT file");
    } finally {
      event.target.value = "";
    }
  }

  async function handleSearch() {
    if (!searchInput.current) {
      return;
    }
    setSessionState({ ...session, isLoading: true });
    const searchValue = searchInput.current?.value;
    const response = await fetch(`/api/subtitles?query=${encodeURIComponent(searchValue)}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    }).catch(() => {
      alert("Failed to search for subtitles");
      setSessionState({ ...session, isLoading: false });
      return;
    });

    if (!response) {
      return;
    }
    if (!response.ok) {
      alert("Search failed");
      setSessionState({ ...session, isLoading: false });
      return;
    }
    const data = await response.json();
    setSubtitleSearchResults(data as Subtitle[]);
    setSessionState({ ...session, isLoading: false });
  }

  async function handleRetrieveSubtitle(videoId: string) {
    setSessionState({ ...session, isLoading: true });
    const customSubtitles = await retrieveCustomSubtitles(videoId);
    if (!customSubtitles) {
      alert("Failed to load video subtitles");
      return;
    }
    setSessionState({
      ...session,
      srtContent: customSubtitles,
      originalSrtContent: customSubtitles,
      selectedTab: "captions",
      isLoading: false,
    });
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-1.5 overflow-y-auto px-2 xl:px-4">
      <div className="mx-2 mt-4 flex flex-col gap-2 rounded-3xl border border-white/20 p-3 xl:mx-4">
        <p className="m-0 p-0 text-left text-lg font-bold">Upload SRT</p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="m-0 min-w-0 truncate p-0 text-left text-sm text-white/70">
            {uploadedFileName ||
              (uploadAtCurrentTime
                ? `Upload at current time ${formatTime(overlay.currentTime)}`
                : "Use SRT timings")}
          </p>
          <button
            type="button"
            className="relative inline-block h-5 w-10 shrink-0 cursor-pointer border-none bg-transparent disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => setUploadAtCurrentTime(!uploadAtCurrentTime)}
          >
            <div
              className={`absolute top-0 right-0 bottom-0 left-0 cursor-pointer rounded-full transition-all duration-300 ${
                uploadAtCurrentTime ? "bg-blue-600" : "bg-gray-300"
              }`}
            />
            <div
              className={`absolute bottom-0.5 left-0.5 h-4 w-4 cursor-pointer rounded-full bg-white transition-all duration-300 ${
                uploadAtCurrentTime ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".srt,text/plain,application/x-subrip"
            onChange={handleSrtUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-3xl border-none bg-black/30 p-2 hover:bg-white/20"
          >
            <ArrowUpTrayIcon className="h-6 w-6 xl:h-8 xl:w-8" />
            Upload
          </button>
        </div>
      </div>
      <div className="mx-2 mt-4 flex flex-row gap-1.5 rounded-3xl border border-white/20 px-2 xl:mx-4">
        <input
          type="text"
          placeholder="Search"
          id="search-input"
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              handleSearch();
            }
          }}
          onChange={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          ref={searchInput}
          onKeyUp={(e) => {
            e.stopPropagation();
          }}
          className="w-full rounded-md border-none bg-transparent p-1.5"
        />
        <button type="button" onClick={() => handleSearch()} ref={searchButtonRef}>
          <MagnifyingGlassIcon className="h-6 w-6 cursor-pointer p-1.5 hover:bg-white/20 xl:h-10 xl:w-10" />
        </button>
      </div>
      <div className="flex h-full w-full flex-col items-start justify-start gap-1.5">
        {subtitleSearchResults.map((result) => (
          <div
            key={result.video_id}
            className="flex w-full flex-row items-center justify-between gap-1.5 border-b border-white/20 px-4 pb-1.5"
          >
            <div className="flex w-full flex-col gap-1.5">
              <p className="m-0 p-0 text-left">{result.title}</p>
              <p className="m-0 p-0 text-left">{result.artist}</p>
            </div>
            <button
              type="button"
              onClick={() => handleRetrieveSubtitle(result.video_id)}
              className="flex cursor-pointer items-center justify-center rounded-3xl border-none bg-black/30 p-1.5 hover:bg-white/20"
            >
              <PlusIcon className="h-6 w-6 xl:h-10 xl:w-10" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
