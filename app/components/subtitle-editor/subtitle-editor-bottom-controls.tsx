"use client";

import { useEffect } from "react";
import { ArrowDownOnSquareIcon } from "@heroicons/react/24/solid";

import { useSessionStore, type ParsedSubtitle } from "../../store/session.store";
import { parseSrt } from "../../utilities/srt";
import {
  convertCaptionsToSrt,
  convertSrtToCaptions,
} from "../../utilities/transliteration/transliteration";
import SaveIcon from "../common/icons/save";

export default function SubtitleEditorBottomControls() {
  const { session, setSession } = useSessionStore();

  const handleSave = () => {
    try {
      const localCaptions = session.localCaptions;
      const convertedSrt = convertCaptionsToSrt(localCaptions);
      const parsedSubtitles = parseSrt(convertedSrt);
      setSession({
        ...session,
        localSrtContent: convertedSrt,
        srtContent: convertedSrt,
        originalSrtContent: convertedSrt,
        parsedSubtitles: parsedSubtitles as ParsedSubtitle[],
      });
      console.log(session.videoId);
      if (session.videoId) {
        try {
          localStorage.setItem(`langpal-srt-content-${session.videoId}`, convertedSrt);
          console.log(`Saved subtitles to localStorage for video: ${session.videoId}`);
        } catch (error) {
          console.error(`Failed to save to localStorage: ${error}`);
        }
      }
    } catch (error) {
      console.error("Error saving subtitles:", error);
      alert("Error saving subtitles. Please try again.");
    }
  };

  const handleDownload = () => {
    const blob = new Blob([session.localSrtContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${session.videoId}.srt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="absolute bottom-[calc(var(--mobile-tab-bar-height)+0.5rem+env(safe-area-inset-bottom,0px))] left-2 z-10 grid w-fit grid-cols-2 items-center justify-center gap-2.5 rounded-3xl bg-black/60 p-2.5 backdrop-blur-md xl:fixed xl:bottom-0 xl:left-0 xl:m-2.5">
      <button
        data-tooltip-id="global-tooltip"
        data-tooltip-content="Save Subtitles to Local Storage"
        type="button"
        onClick={handleSave}
        className="flex cursor-pointer flex-row items-center justify-center rounded-3xl border-none bg-transparent p-1.5 hover:bg-white/20"
      >
        <SaveIcon />
      </button>
      <button
        type="button"
        onClick={handleDownload}
        data-tooltip-id="global-tooltip"
        data-tooltip-content="Download Subtitles"
        className="flex cursor-pointer flex-row items-center justify-center rounded-3xl border-none bg-transparent p-1.5 text-white hover:bg-white/20"
      >
        <ArrowDownOnSquareIcon className="h-10 w-10" />
      </button>
    </div>
  );
}
