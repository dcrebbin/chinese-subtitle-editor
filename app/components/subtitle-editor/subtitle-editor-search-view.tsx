import { useRef, useState } from "react";
import { MagnifyingGlassIcon, PlusIcon } from "@heroicons/react/24/solid";

import { setSessionState, useSessionStore } from "../../store/session.store";
import { convertSrtToCaptions } from "../../utilities/transliteration/transliteration";
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
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_LANGPAL_API_URL}/api/subtitles?query=${encodeURIComponent(searchValue)}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-langpal-api-key": process.env.NEXT_PUBLIC_LANGPAL_API_KEY as string,
        },
      },
    ).catch((error) => {
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

  async function handleRetrieveSubtitle(subtitle: Subtitle) {
    // setSessionState({ ...session, isLoading: true });
    // const response =
    //   (await requestCustomYouTubeSubtitles(subtitle.video_id, "")) ?? "";
    // if (!response || response === "") {
    //   alert("Subtitles retrieval failed");
    //   return;
    // }
    // const captions = convertSrtToCaptions(response);
    // setSessionState({
    //   ...session,
    //   selectedTab: "captions",
    //   localSrtContent: response,
    //   hasCustomCaptions: true,
    //   srtContent: response,
    //   isLoading: false,
    //   localCaptions: captions,
    //   originalCaptions: captions, // Store original captions for offset calculations
    //   originalSrtContent: response,
    // });
    // updateSubtitleEvent(response);
  }

  return (
    <div className="flex h-full w-full flex-col gap-1.5 overflow-y-scroll px-4">
      <div className="mx-4 mt-4 flex flex-row gap-1.5 rounded-3xl border border-white/20 px-2">
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
          <MagnifyingGlassIcon className="h-10 w-10 cursor-pointer p-1.5 hover:bg-white/20" />
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
              onClick={() => handleRetrieveSubtitle(result)}
              className="flex cursor-pointer items-center justify-center rounded-3xl border-none bg-black/30 p-1.5 hover:bg-white/20"
            >
              <PlusIcon className="h-10 w-10" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
