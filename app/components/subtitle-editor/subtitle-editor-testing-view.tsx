import { setSettingsState, useSettingsStore } from "@/app/store/settings.store";
import { setSessionState, useSessionStore } from "../../store/session.store";
import { convertSrtToCaptions } from "../../utilities/transliteration/transliteration";
import { useState } from "react";

export default function SubtitleEditorTestingView() {
  const { session } = useSessionStore();
  const { settings } = useSettingsStore();
  const [lyrics, setLyrics] = useState<string>("");

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
    <div className="flex flex-col mx-2 top-0 left-0 gap-1.5 items-start justify-start w-full h-full p-1.5 rounded-lg">
      <p className="text-2xl font-bold text-left">
        Alpha Testing (role required)
      </p>
      <div className="flex flex-col gap-1.5 p-1.5 w-full">
        <div>
          <p className="text-lg font-sans">Video ID</p>
          <p>{session.videoId}</p>
        </div>
        <p>Language</p>
        <select
          id="language-select"
          value={settings.language}
          onChange={(e) =>
            setSettingsState({ ...settings, language: e.target.value })
          }
          className="border-none flex p-3 font-bold bg-black/30 items-center justify-center rounded-3xl hover:bg-white/20  cursor-pointer"
        >
          <option value="yue">Cantonese</option>
          <option value="zh">Mandarin</option>
        </select>
        <div className="flex items-center gap-2.5 justify-between">
          <p className="text-lg font-sans">Upload SRT</p>
          <button
            type="button"
            className="relative inline-block disabled:cursor-not-allowed w-10 h-5 bg-transparent border-none cursor-pointer disabled:opacity-50"
            onClick={() => {
              setSettingsState({ ...settings, uploadSrt: !settings.uploadSrt });
            }}
          >
            <div
              className={`absolute cursor-pointer rounded-full left-0 right-0 bottom-0 top-0 transition-all duration-300 ${
                settings.uploadSrt ? "bg-blue-600" : "bg-gray-300"
              }`}
            />
            <div
              className={`absolute cursor-pointer  rounded-full bg-white h-4 w-4 left-0.5 bottom-0.5 transition-all duration-300 ${
                settings.uploadSrt ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
        <div className="flex items-center gap-2.5 justify-between">
          <p className="text-lg font-sans">ASR Model</p>
          <select
            id="asr-model-select"
            value={settings.asrModel}
            onChange={(e) =>
              setSettingsState({ ...settings, asrModel: e.target.value })
            }
            className="border-none flex p-3 font-bold bg-black/30 items-center justify-center rounded-3xl hover:bg-white/20  cursor-pointer"
          >
            <option value="whisper-large-v2">Whisper Large V2</option>
            <option value="whisper-large-v3">Whisper Large V3</option>
          </select>
        </div>
        <button
          type="button"
          disabled={session.isLoading}
          onClick={() => handleMergeSubtitles()}
          className="border-none flex p-3 font-bold bg-black/30 w-fit items-center justify-center rounded-3xl hover:bg-white/20  cursor-pointer"
        >
          Merge Subtitles
        </button>

        <button
          type="button"
          disabled={session.isLoading}
          onClick={() => handleTranslateSubtitles()}
          className="border-none flex p-3 font-bold bg-black/30 w-fit items-center justify-center rounded-3xl hover:bg-white/20  cursor-pointer"
        >
          Translate Subtitles
        </button>
        <textarea
          onChange={(e) => {
            setLyrics(e.target.value);
          }}
          value={lyrics}
          className="w-full h-20 p-1.5 border-2 border-white/20 rounded-lg text-white bg-black/30"
        />
        <button
          type="button"
          disabled={session.isLoading}
          onClick={() => handleGenerateSubtitles()}
          className="border-none flex p-3 font-bold bg-black/30 w-fit items-center justify-center rounded-3xl hover:bg-white/20  cursor-pointer"
        >
          Generate Subtitles
        </button>
      </div>
    </div>
  );
}
