import { useState } from "react";

import { useOverlayStore } from "../../store/overlay.store";
import { setSessionState } from "../../store/session.store";
import { beautifyLyrics } from "../../utilities/beautify-lyrics";
import { extractSubtitleAudio } from "../../utilities/extract-audio";
import { convertSrtToCaptions } from "../../utilities/transliteration/transliteration";

export default function SubtitleEditorGenerateView() {
  const { overlay } = useOverlayStore();
  const [context, setContext] = useState("");
  const [generationLanguage, setGenerationLanguage] = useState("yue");
  const [translationLanguage, setTranslationLanguage] = useState("none");
  const [generationStatus, setGenerationStatus] = useState("");
  const [generationError, setGenerationError] = useState("");
  const generating = !!generationStatus;
  async function generateSubtitles() {
    const file = overlay.file;
    if (!file || generating) return;
    setGenerationError("");
    setGenerationStatus("Extracting audio…");
    try {
      const audio = await extractSubtitleAudio(file);
      if (useOverlayStore.getState().overlay.file !== file) return;
      const form = new FormData();
      form.set("audio", audio);
      form.set("language", generationLanguage);
      form.set("context", context.trim());
      form.set("translation_language", translationLanguage);
      setGenerationStatus("Generating subtitles…");
      const response = await fetch("/api/subtitles", { method: "POST", body: form });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(
          typeof detail?.message === "string"
            ? detail.message
            : `Subtitle generation failed (${response.status}). Please try again.`,
        );
      }
      const srt = await response.text();
      const captions = convertSrtToCaptions(srt);
      if (!captions.length) throw new Error("No speech found in this video.");
      // Ignore results if the source changed while the request was running.
      if (useOverlayStore.getState().overlay.file !== file) return;
      setSessionState({
        hasCustomCaptions: true,
        srtContent: srt,
        originalSrtContent: srt,
        localSrtContent: srt,
        originalCaptions: captions,
        localCaptions: captions,
        selectedTab: "captions",
        isLoading: false,
      });
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : "Subtitle generation failed.");
    } finally {
      setGenerationStatus("");
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-4">
      <div className="mx-2 mt-4 flex flex-col gap-3 rounded-3xl border border-white/20 p-3 xl:mx-4">
        <p className="m-0 text-lg font-bold">Generate video subtitles</p>
        <p className="m-0 text-sm text-white/70">
          {overlay.file ? overlay.file.name : "Upload a video to generate subtitles."} Audio is
          extracted on your device. Audio and any context you provide are sent for transcription; subtitles are not saved to
          Azure.
        </p>
        <label className="flex items-center justify-between gap-2">
          Spoken language
          <select
            value={generationLanguage}
            disabled={generating}
            onChange={(e) => {
              setGenerationLanguage(e.target.value);
              if (translationLanguage === e.target.value) setTranslationLanguage("none");
            }}
            className="rounded-lg bg-black p-2"
          >
            <option value="en">English</option>
            <option value="zh">Mandarin</option>
            <option value="yue">Cantonese</option>
          </select>
        </label>
        <label className="flex items-center justify-between gap-2">
          Second subtitle language
          <select
            value={translationLanguage}
            disabled={generating}
            onChange={(e) => setTranslationLanguage(e.target.value)}
            className="rounded-lg bg-black p-2"
          >
            <option value="none">None</option>
            {generationLanguage !== "en" && <option value="en">English</option>}
            {generationLanguage !== "yue" && (
              <option value="yue">Cantonese — Traditional Chinese (SWC)</option>
            )}
            {generationLanguage !== "zh" && (
              <option value="zh">Mandarin — Simplified Chinese</option>
            )}
          </select>
        </label>
        <label className="flex flex-col gap-2 text-sm">
          Context (optional)
          <textarea
            value={context}
            onChange={(event) => setContext(event.target.value)}
            disabled={generating}
            rows={8}
            placeholder="Describe the video, speakers, names, terminology, or background that will help generate accurate subtitles."
            className="min-h-48 w-full resize-y rounded-xl border border-white/20 bg-black/40 p-3 text-white placeholder:text-white/40"
          />
        </label>
        <p className="m-0 text-xs text-white/60">
          Generates subtitles for the full video and replaces the current captions.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!overlay.file || generating}
            onClick={generateSubtitles}
            className="flex-1 cursor-pointer rounded-3xl bg-blue-600 p-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generationStatus || "Generate subtitles"}
          </button>
          <button
            type="button"
            disabled={!context.trim() || generating}
            onClick={() => setContext(beautifyLyrics(context))}
            className="cursor-pointer rounded-3xl bg-white/10 px-4 py-2 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Beautify
          </button>
        </div>
        {generationStatus && (
          <p role="status" className="m-0 text-sm">
            {generationStatus}
          </p>
        )}
        {generationError && (
          <p role="alert" className="m-0 text-sm text-red-300">
            {generationError}
          </p>
        )}
      </div>
    </div>
  );
}
