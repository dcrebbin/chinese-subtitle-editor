import { log } from "console";
import { useRef, useState } from "react";
import { MagnifyingGlassIcon, PlusIcon } from "@heroicons/react/24/solid";

import { setSessionState, useSessionStore } from "../../store/session.store";
import { convertSrtToCaptions } from "../../utilities/transliteration/transliteration";
import { Subtitle } from "./subtitle-editor";

export default function SubtitleEditorSearchView() {
  const searchInput = useRef<HTMLInputElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const [subtitleSearchResults, setSubtitleSearchResults] = useState<Subtitle[]>([]);
  const { session } = useSessionStore();

  async function requestCustomYouTubeSubtitles(
    videoId: string,
    accessToken: string,
  ): Promise<string | null> {
    if (!videoId) {
      console.error("No videoId");
      return null;
    }

    const res = await fetch(`https://www.langpal.com.hk/api/subtitles`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-langpal-api-key": process.env.VITE_LANGPAL_API_KEY as string,
        "origin-url": origin,
      },
      body: JSON.stringify({
        youtube_id: videoId,
      }),
    });

    if (!res.ok) {
      log("Failed to retrieve subtitles");
      return null;
    }
    const data = await res.text();
    return data;
  }

  async function handleSearch() {
    if (!searchInput.current) {
      return;
    }
    setSessionState({ ...session, isLoading: true });
    const searchValue = searchInput.current?.value;

    const response = await requestCustomYouTubeSubtitles(searchValue, "");
    if (!response || response === "") {
      alert("Search failed");
      return;
    }
    const captions = convertSrtToCaptions(response);
    setSessionState({
      ...session,
      localCaptions: captions,
      originalCaptions: captions,
      localSrtContent: response,
      srtContent: response,
    });
    setSessionState({ ...session, isLoading: false });
  }

  async function handleRetrieveSubtitle(subtitle: Subtitle) {
    setSessionState({ ...session, isLoading: true });
    const response = (await requestCustomYouTubeSubtitles(subtitle.video_id, "")) ?? "";
    if (!response || response === "") {
      alert("Subtitles retrieval failed");
      return;
    }
  }

  return (
    <div className="lp-flex lp-flex-col lp-gap-1.5 lp-w-full lp-h-full lp-overflow-y-scroll px-4">
      <div className="lp-flex lp-flex-row lp-gap-1.5 lp-px-2 lp-rounded-3xl lp-border-white/20 lp-border-[1px] lp-mx-4 lp-mt-4">
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
          className="lp-w-full lp-bg-transparent lp-p-1.5 lp-rounded-md lp-border-none"
        />
        <button type="button" onClick={() => handleSearch()} ref={searchButtonRef}>
          <MagnifyingGlassIcon className="lp-w-10 lp-h-10 hover:lp-bg-white/20 lp-cursor-pointer lp-p-1.5" />
        </button>
      </div>
      <div className="lp-flex lp-flex-col lp-w-full lp-h-full lp-justify-start lp-items-start lp-gap-1.5">
        {subtitleSearchResults.map((result) => (
          <div
            key={result.video_id}
            className="lp-flex lp-flex-row lp-gap-1.5 lp-border-b lp-border-white/20 lp-pb-1.5 lp-w-full lp-px-4 lp-items-center lp-justify-between"
          >
            <div className="lp-flex lp-flex-col lp-gap-1.5 lp-w-full">
              <p className="lp-m-0 lp-p-0 lp-text-left">{result.title}</p>
              <p className="lp-m-0 lp-p-0 lp-text-left">{result.artist}</p>
            </div>
            <button
              type="button"
              onClick={() => handleRetrieveSubtitle(result)}
              className="lp-border-none lp-rounded-3xl lp-bg-black/30 hover:lp-bg-white/20 lp-flex lp-items-center lp-justify-center lp-p-1.5 lp-cursor-pointer"
            >
              <PlusIcon className="lp-w-10 lp-h-10" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
