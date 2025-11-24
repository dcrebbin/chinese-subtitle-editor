import { setSessionState, useSessionStore } from "../../store/session.store";
import { convertSrtToCaptions } from "../../utilities/transliteration/transliteration";
import { MagnifyingGlassIcon, PlusIcon } from "@heroicons/react/24/solid";
import { useRef, useState } from "react";
import type { Subtitle } from "./subtitle-editor";

export default function SubtitleEditorSearchView() {
  const searchInput = useRef<HTMLInputElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const [subtitleSearchResults, setSubtitleSearchResults] = useState<
    Subtitle[]
  >([]);
  const { session } = useSessionStore();

  async function handleSearch() {
    if (!searchInput.current) {
      return;
    }
    // setSessionState({ ...session, isLoading: true });
    // const searchValue = searchInput.current?.value;
    // const response = await sendMessage(Message.SEARCH_SUBTITLES, {
    //   query: searchValue || "",
    // });
    // console.log("response", response);
    // if (response.success) {
    //   setSubtitleSearchResults(response.data as Subtitle[]);
    // } else {
    //   alert("Search failed");
    // }
    // setSessionState({ ...session, isLoading: false });
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
    <div className="flex flex-col gap-1.5 w-full h-full px-4 overflow-y-scroll">
      <div className="flex flex-row gap-1.5 px-2 rounded-3xl border-white/20 border-[1px] mx-4 mt-4">
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
          className="w-full bg-transparent p-1.5 rounded-md border-none"
        />
        <button
          type="button"
          onClick={() => handleSearch()}
          ref={searchButtonRef}
        >
          <MagnifyingGlassIcon className="w-10 h-10 hover:bg-white/20  cursor-pointer p-1.5" />
        </button>
      </div>
      <div className="flex flex-col w-full h-full justify-start items-start gap-1.5">
        {subtitleSearchResults.map((result) => (
          <div
            key={result.video_id}
            className="flex flex-row gap-1.5 border-b border-white/20 pb-1.5 w-full px-4 items-center justify-between"
          >
            <div className="flex flex-col gap-1.5 w-full">
              <p className="m-0 p-0 text-left">{result.title}</p>
              <p className="m-0 p-0 text-left">{result.artist}</p>
            </div>
            <button
              type="button"
              onClick={() => handleRetrieveSubtitle(result)}
              className="border-none rounded-3xl bg-black/30 hover:bg-white/20 flex items-center justify-center p-1.5 cursor-pointer"
            >
              <PlusIcon className="w-10 h-10" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
