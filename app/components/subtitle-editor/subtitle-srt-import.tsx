import { useRef, useState, type ChangeEvent } from "react";
import { ArrowUpTrayIcon } from "@heroicons/react/24/solid";

import { useOverlayStore } from "../../store/overlay.store";
import { setSessionState, useSessionStore, type CaptionSegment } from "../../store/session.store";
import {
  convertCaptionsToSrt,
  convertSrtToCaptions,
} from "../../utilities/transliteration/transliteration";

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

export default function SubtitleSrtImport() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadAtCurrentTime, setUploadAtCurrentTime] = useState(false);
  const { session } = useSessionStore();
  const { overlay } = useOverlayStore();
  function loadSrtContent(srtContent: string) {
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
      loadSrtContent(srtContent);
    } catch {
      alert("Failed to read SRT file");
    } finally {
      event.target.value = "";
    }
  }

  return (
    <div className="ml-auto flex flex-wrap items-center gap-3 text-sm">
      <label
        className="flex cursor-pointer items-center gap-2"
        title="Uncheck to align the imported subtitles with the current video time"
      >
        <input
          type="checkbox"
          checked={!uploadAtCurrentTime}
          onChange={(event) => setUploadAtCurrentTime(!event.target.checked)}
        />
        SRT timings
      </label>
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
        className="flex cursor-pointer items-center gap-2 rounded-lg bg-white/10 px-3 py-2 hover:bg-white/20"
      >
        <ArrowUpTrayIcon className="h-4 w-4" />
        Import SRT
      </button>
    </div>
  );
}
