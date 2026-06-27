import { useEffect } from "react";

import { setSettingsState, useSettingsStore } from "@/app/store/settings.store";
import { useOverlayStore } from "../../store/overlay.store";
import { setSessionState, useSessionStore } from "../../store/session.store";
import { convertSrtToCaptions } from "../../utilities/transliteration/transliteration";
import {
  loadLyricsFromLocalStorage,
  saveLyricsToLocalStorage,
} from "../../utilities/video-storage";
import { getVideoIdFromUrl } from "../video-overlay/overlay-page";

function resolveVideoId(rawId: string | null | undefined): string {
  if (!rawId?.trim()) {
    return "";
  }

  const extractedId = getVideoIdFromUrl(rawId);
  return extractedId || rawId.trim();
}

export default function SubtitleEditorTestingView() {
  const { session } = useSessionStore();
  const { settings } = useSettingsStore();
  const { overlay } = useOverlayStore();
  const videoId =
    session.videoId ||
    resolveVideoId(overlay.loadedVideoId) ||
    resolveVideoId(overlay.downloadVideoId);

  useEffect(() => {
    if (!videoId) {
      setSessionState({ lyrics: "" });
      return;
    }

    const storedLyrics = loadLyricsFromLocalStorage(videoId);
    setSessionState({ lyrics: storedLyrics ?? "" });
  }, [videoId]);

  function handleLyricsChange(value: string) {
    setSessionState({ lyrics: value });
    if (videoId) {
      saveLyricsToLocalStorage(videoId, value);
    }
  }

  function updateSubtitles(srtContent: string) {
    const subtitleResponse = srtContent;
    console.log("subtitleResponse", subtitleResponse);
    const captions = convertSrtToCaptions(subtitleResponse);
    console.log("captions", captions);
    setSessionState({
      ...session,
      hasCustomCaptions: true,
      srtContent: subtitleResponse,
      originalSrtContent: subtitleResponse,
      originalCaptions: captions,
      localSrtContent: subtitleResponse,
      selectedTab: "captions",
      localCaptions: captions,
    });
  }

  async function handleMergeSubtitles() {
    if (session.isLoading) {
      return;
    }
    // setSessionState({ ...session, isLoading: true });
    // const response = await sendMessage(Message.MERGE_SUBTITLES, {
    //   videoId: session.videoId,
    //   uploadSrt: settings.uploadSrt,
    // });
    // setSessionState({ ...session, isLoading: false });

    // if (response.success) {
    //   updateSubtitles(response.data as string);
    // } else {
    //   alert("Subtitles merge failed");
    // }
  }

  async function handleTranslateSubtitles() {
    if (session.isLoading) {
      return;
    }
    // setSessionState({ ...session, isLoading: true });
    // const response = await sendMessage(Message.TRANSLATE_SUBTITLES, {
    //   videoId: session.videoId,
    //   uploadSrt: settings.uploadSrt,
    //   language: settings.language,
    // });
    // setSessionState({ ...session, isLoading: false });

    // if (response.success) {
    //   updateSubtitles(response.data as string);
    // } else {
    //   alert("Subtitles translation failed");
    // }
  }

  async function handleGenerateSubtitles() {
    if (session.isLoading) {
      return;
    }
    // setSessionState({ ...session, isLoading: true });
    // const response = await sendMessage(Message.GENERATE_SUBTITLES, {
    //   videoId: session.videoId,
    //   lyrics: lyrics,
    //   uploadSrt: settings.uploadSrt,
    //   asrModel: settings.asrModel,
    //   language: settings.language,
    // });
    // console.log("response", response);
    // setSessionState({ ...session, isLoading: false });

    // if (response.success) {
    //   updateSubtitles(response.data as string);
    // } else {
    //   alert("Subtitles generation failed");
    // }
  }

  return (
    <div className="top-0 left-0 mx-2 flex h-full w-full flex-col items-start justify-start gap-1.5 rounded-lg p-1.5">
      <p className="text-left text-2xl font-bold">Alpha Testing (role required)</p>
      <div className="flex w-full flex-col gap-1.5 p-1.5">
        <div>
          <p className="font-sans text-lg">Video ID</p>
          <p>{session.videoId}</p>
        </div>
        <p>Language</p>
        <select
          id="language-select"
          value={settings.language}
          onChange={(e) => setSettingsState({ ...settings, language: e.target.value })}
          className="flex cursor-pointer items-center justify-center rounded-3xl border-none bg-black/30 p-3 font-bold hover:bg-white/20"
        >
          <option value="yue">Cantonese</option>
          <option value="zh">Mandarin</option>
        </select>
        <div className="flex items-center justify-between gap-2.5">
          <p className="font-sans text-lg">Upload SRT</p>
          <button
            type="button"
            className="relative inline-block h-5 w-10 cursor-pointer border-none bg-transparent disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              setSettingsState({ ...settings, uploadSrt: !settings.uploadSrt });
            }}
          >
            <div
              className={`absolute top-0 right-0 bottom-0 left-0 cursor-pointer rounded-full transition-all duration-300 ${
                settings.uploadSrt ? "bg-blue-600" : "bg-gray-300"
              }`}
            />
            <div
              className={`absolute bottom-0.5 left-0.5 h-4 w-4 cursor-pointer rounded-full bg-white transition-all duration-300 ${
                settings.uploadSrt ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
        <div className="flex items-center justify-between gap-2.5">
          <p className="font-sans text-lg">ASR Model</p>
          <select
            id="asr-model-select"
            value={settings.asrModel}
            onChange={(e) => setSettingsState({ ...settings, asrModel: e.target.value })}
            className="flex cursor-pointer items-center justify-center rounded-3xl border-none bg-black/30 p-3 font-bold hover:bg-white/20"
          >
            <option value="whisper-large-v2">Whisper Large V2</option>
            <option value="whisper-large-v3">Whisper Large V3</option>
          </select>
        </div>
        <button
          type="button"
          disabled={session.isLoading}
          onClick={() => handleMergeSubtitles()}
          className="flex w-fit cursor-pointer items-center justify-center rounded-3xl border-none bg-black/30 p-3 font-bold hover:bg-white/20"
        >
          Merge Subtitles
        </button>

        <button
          type="button"
          disabled={session.isLoading}
          onClick={() => handleTranslateSubtitles()}
          className="flex w-fit cursor-pointer items-center justify-center rounded-3xl border-none bg-black/30 p-3 font-bold hover:bg-white/20"
        >
          Translate Subtitles
        </button>
        <textarea
          onChange={(e) => {
            handleLyricsChange(e.target.value);
          }}
          value={session.lyrics}
          className="h-20 w-full rounded-lg border-2 border-white/20 bg-black/30 p-1.5 text-white"
        />
        <button
          type="button"
          disabled={session.isLoading}
          onClick={() => handleGenerateSubtitles()}
          className="flex w-fit cursor-pointer items-center justify-center rounded-3xl border-none bg-black/30 p-3 font-bold hover:bg-white/20"
        >
          Generate Subtitles
        </button>
      </div>
    </div>
  );
}
