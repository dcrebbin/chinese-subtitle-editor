"use client";

import {
  convertCaptionsToSrt,
  convertSrtToCaptions,
} from "../../utilities/transliteration/transliteration";
import { useSessionStore } from "../../store/session.store";
import { ArrowDownOnSquareIcon } from "@heroicons/react/24/solid";
import { useEffect } from "react";

export default function SubtitleEditorBottomControls() {
  const { session, setSession } = useSessionStore();

  const handleSave = () => {
    try {
      const localCaptions = session.localCaptions;
      const convertedSrt = convertCaptionsToSrt(localCaptions);
      setSession({ ...session, localSrtContent: convertedSrt });
      console.log(session.videoId);
      if (session.videoId) {
        try {
          localStorage.setItem(
            `langpal-srt-content-${session.videoId}`,
            convertedSrt
          );
          console.log(
            `Saved subtitles to localStorage for video: ${session.videoId}`
          );
        } catch (error) {
          console.error(`Failed to save to localStorage: ${error}`);
          // Don't throw here, just log the error
        }
      }

      alert("Subtitles saved");
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

  useEffect(() => {
    if (session.srtContent && session.srtContent !== "") {
      const captions = convertSrtToCaptions(session.localSrtContent);
      setSession({ ...session, localCaptions: captions });
    }
  }, [session.srtContent]);

  return (
    <div className="bg-black/60 backdrop-blur-md rounded-3xl left-0 grid grid-cols-3 fixed bottom-0 gap-2.5 p-2.5 justify-center items-center w-fit m-2.5">
      <button
        data-tooltip-id="global-tooltip"
        data-tooltip-content="Save Subtitles to Local Storage"
        type="button"
        onClick={handleSave}
        className="cursor-pointer rounded-3xl hover:bg-white/20  flex flex-row items-center justify-center  bg-transparent p-1.5 border-none"
      >
        Save
      </button>
      <button
        type="button"
        onClick={handleDownload}
        data-tooltip-id="global-tooltip"
        data-tooltip-content="Download Subtitles"
        className="cursor-pointer rounded-3xl hover:bg-white/20 flex flex-row items-center justify-center  bg-transparent  text-white p-1.5 border-none"
      >
        <ArrowDownOnSquareIcon className="w-10 h-10" />
      </button>
    </div>
  );
}
