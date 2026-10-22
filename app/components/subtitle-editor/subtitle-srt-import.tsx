import { useRef, type ChangeEvent } from "react";
import { ArrowUpTrayIcon } from "@heroicons/react/24/solid";

import { setSessionState, useSessionStore } from "../../store/session.store";
import {
  convertCaptionsToSrt,
  convertSrtToCaptions,
} from "../../utilities/transliteration/transliteration";
import { toolbarButtonClassName } from "../video-overlay/inspector-controls";

function timeStringToSeconds(timeString: string): number {
  const [time, milliseconds] = timeString.split(",");
  const [hours, minutes, seconds] = time?.split(":").map(Number) || [];
  return (hours || 0) * 3600 + (minutes || 0) * 60 + (seconds || 0) + Number(milliseconds) / 1000;
}

export default function SubtitleSrtImport() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { session } = useSessionStore();
  function loadSrtContent(srtContent: string) {
    const captions = convertSrtToCaptions(srtContent);
    if (captions.length === 0) {
      alert("No captions found in the SRT file");
      return;
    }

    const mergedCaptions = [...session.localCaptions, ...captions].sort(
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
    <>
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
        className={`${toolbarButtonClassName} flex-1 justify-center whitespace-nowrap`}
      >
        Import SRT
        <ArrowUpTrayIcon className="h-4 w-4" />
      </button>
    </>
  );
}
