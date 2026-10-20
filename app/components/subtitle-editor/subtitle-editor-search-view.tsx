import { useRef, useState } from "react";
import { MagnifyingGlassIcon, PlusIcon } from "@heroicons/react/24/solid";

import { setSessionState, useSessionStore } from "../../store/session.store";
import { retrieveCustomSubtitles } from "../video-overlay/overlay-page";
import type { Subtitle } from "./subtitle-editor";

export default function SubtitleEditorSearchView() {
  const searchInput = useRef<HTMLInputElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const [subtitleSearchResults, setSubtitleSearchResults] = useState<Subtitle[]>([]);
  const { session } = useSessionStore();

  async function handleSearch() {
    if (!searchInput.current) {
      return;
    }
    setSessionState({ ...session, isLoading: true });
    const searchValue = searchInput.current?.value;
    const response = await fetch(`/api/subtitles/search?query=${encodeURIComponent(searchValue)}`, {
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
      setSessionState({ isLoading: false });
      alert("Failed to load video subtitles");
      return;
    }
    setSessionState({
      ...session,
      videoId,
      srtContent: customSubtitles,
      originalSrtContent: customSubtitles,
      selectedTab: "captions",
      isLoading: false,
    });
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-1.5 overflow-y-auto px-2 xl:px-4">
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
