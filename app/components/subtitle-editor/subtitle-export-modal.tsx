import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowDownTrayIcon, XMarkIcon } from "@heroicons/react/24/solid";

import { useSessionStore } from "../../store/session.store";
import { availableExportLanguages, exportSubtitles } from "../../utilities/subtitle-export";
import { CaptionLanguages } from "../../utilities/transliteration/transliteration";
import { toolbarButtonClassName } from "../video-overlay/inspector-controls";

export default function SubtitleExportModal({
  onClose,
  generated = false,
}: {
  onClose: () => void;
  generated?: boolean;
}) {
  const { session } = useSessionStore();
  const dialog = useRef<HTMLDialogElement>(null);
  const languages = availableExportLanguages(session.localCaptions);
  const [mode, setMode] = useState<"langpal" | "vanilla">("langpal");
  const [language, setLanguage] = useState(languages[0] || "");
  const [format, setFormat] = useState<"srt" | "vtt" | "ass">("srt");
  const [alignFrames, setAlignFrames] = useState(false);
  const [fps, setFps] = useState("30");
  const [error, setError] = useState("");
  const selectedLanguage = languages.includes(language) ? language : languages[0] || "";
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  function download(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const result = exportSubtitles(
        session.localCaptions,
        mode === "langpal"
          ? { mode }
          : {
              mode,
              language: selectedLanguage,
              format,
              fps: alignFrames ? Number(fps) : undefined,
            },
      );
      const url = URL.createObjectURL(new Blob([result.content], { type: result.mimeType }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${session.videoId || "subtitles"}-${mode === "langpal" ? "langpal" : selectedLanguage}.${result.extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Subtitle export failed.");
    }
  }

  const fieldClassName =
    "w-full rounded-lg border border-white/15 bg-zinc-900 px-3 py-2 text-sm text-white";
  return (
    <dialog
      ref={dialog}
      data-native-undo
      aria-labelledby="subtitle-export-title"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-white/15 bg-zinc-950 p-0 text-white shadow-2xl backdrop:bg-black/70"
    >
      <form onSubmit={download} noValidate className="flex flex-col gap-5 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 id="subtitle-export-title" className="text-lg font-semibold">
            {generated ? "Save generated subtitles" : "Export subtitles"}
          </h2>
          <button
            type="button"
            aria-label="Close export"
            onClick={onClose}
            className={toolbarButtonClassName}
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
        {generated && (
          <p className="text-sm text-white/70">
            Your subtitles are ready. Download a copy to save them on your device.
          </p>
        )}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm text-white/70">Export type</legend>
          {(
            [
              [
                "langpal",
                "Langpal SRT",
                "Keeps language prefixes and all subtitle languages for use in Langpal.",
              ],
              ["vanilla", "Vanilla", "Exports one language without Langpal prefixes."],
            ] as const
          ).map(([value, title, description]) => (
            <label
              key={value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${mode === value ? "border-blue-500 bg-blue-500/10" : "border-white/15 hover:bg-white/5"}`}
            >
              <input
                type="radio"
                name="export-mode"
                value={value}
                checked={mode === value}
                onChange={() => {
                  setMode(value);
                  setError("");
                }}
                className="mt-1 accent-blue-500"
              />
              <span>
                <span className="block text-sm font-medium">{title}</span>
                <span className="mt-1 block text-xs text-white/60">{description}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {mode === "vanilla" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-2 text-sm">
                Language
                <select
                  value={selectedLanguage}
                  onChange={(event) => setLanguage(event.target.value)}
                  className={fieldClassName}
                  disabled={!languages.length}
                >
                  {!languages.length && <option value="">No languages available</option>}
                  {languages.map((code) => (
                    <option key={code} value={code}>
                      {CaptionLanguages.find((item) => item.code === code)?.name || code}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm">
                Format
                <select
                  value={format}
                  onChange={(event) => setFormat(event.target.value as typeof format)}
                  className={fieldClassName}
                >
                  <option value="srt">.srt</option>
                  <option value="vtt">.vtt</option>
                  <option value="ass">.ass</option>
                </select>
              </label>
            </div>
            <div className="flex flex-col gap-3 rounded-xl border border-white/15 p-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={alignFrames}
                  onChange={(event) => setAlignFrames(event.target.checked)}
                  className="accent-blue-500"
                />
                Align timings to video frames
              </label>
              <label
                className={`flex items-center gap-3 text-sm ${alignFrames ? "" : "opacity-40"}`}
              >
                Video FPS
                <input
                  type="number"
                  min="0.001"
                  max="1000"
                  step="any"
                  value={fps}
                  disabled={!alignFrames}
                  onChange={(event) => setFps(event.target.value)}
                  className={`${fieldClassName} max-w-32 disabled:cursor-not-allowed`}
                />
              </label>
              <p className="text-xs text-white/60">
                Use your video&apos;s frame rate (for example, 25, 29.97, or 30). Snaps cue
                boundaries to the nearest frame; keeps the existing timeline and playback speed.
              </p>
            </div>
          </>
        )}
        {!session.localCaptions.length && (
          <p role="status" className="text-sm text-white/60">
            Add or import subtitles before exporting.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={toolbarButtonClassName}>
            {generated ? "Not now" : "Cancel"}
          </button>
          <button
            type="submit"
            disabled={!session.localCaptions.length || (mode === "vanilla" && !selectedLanguage)}
            className={`${toolbarButtonClassName} bg-blue-600 hover:bg-blue-500`}
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
            Download {mode === "langpal" ? ".srt" : `.${format}`}
          </button>
        </div>
      </form>
    </dialog>
  );
}
