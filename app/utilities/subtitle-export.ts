import type { CaptionSegment } from "../store/session.store";

export type SubtitleExportOptions =
  | { mode: "langpal" }
  | { mode: "vanilla"; language: string; format: "srt" | "vtt" | "ass"; fps?: number };

function seconds(timestamp: string) {
  const match = /^(\d+):(\d{2}):(\d{2})[,.](\d{3})$/.exec(timestamp);
  if (!match || Number(match[2]) > 59 || Number(match[3]) > 59) {
    throw new Error(`Invalid subtitle time: ${timestamp}`);
  }
  return (
    Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000
  );
}

function timestamp(time: number, format: "srt" | "vtt" | "ass") {
  const scale = format === "ass" ? 100 : 1000;
  const ticks = Math.round(time * scale);
  const hours = Math.floor(ticks / (3600 * scale));
  const minutes = Math.floor(ticks / (60 * scale)) % 60;
  const secs = Math.floor(ticks / scale) % 60;
  const fraction = ticks % scale;
  return `${format === "ass" ? hours : String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}${format === "srt" ? "," : "."}${String(fraction).padStart(format === "ass" ? 2 : 3, "0")}`;
}

export function availableExportLanguages(captions: CaptionSegment[]) {
  return [
    ...new Set(
      captions.flatMap((caption) =>
        Object.entries(caption.text)
          .filter(([, text]) => text?.trim())
          .map(([language]) => language),
      ),
    ),
  ];
}

export function exportSubtitles(captions: CaptionSegment[], options: SubtitleExportOptions) {
  if (options.mode === "langpal") {
    if (!captions.length) throw new Error("There are no subtitles to export.");
    return {
      extension: "srt",
      mimeType: "application/x-subrip;charset=utf-8",
      content:
        captions
          .map(
            (caption, index) =>
              `${index + 1}\n${caption.startTime} --> ${caption.endTime}\n${Object.entries(
                caption.text,
              )
                .filter(([, text]) => text !== null)
                .map(([language, text]) => `(${language}) ${text}`)
                .join("\n")}\n`,
          )
          .join("\n") + "\n",
    };
  }
  const { language, format, fps } = options;
  if (fps !== undefined && (!Number.isFinite(fps) || fps <= 0 || fps > 1000)) {
    throw new Error("Enter a video frame rate greater than 0 and no more than 1000 FPS.");
  }
  const cues = captions
    .filter((caption) => caption.text[language]?.trim())
    .map((caption) => {
      let start = seconds(caption.startTime);
      let end = seconds(caption.endTime);
      if (end < start)
        throw new Error("A subtitle ends before it starts. Correct its timing before exporting.");
      if (fps !== undefined) {
        const startFrame = Math.round(start * fps);
        const endFrame = Math.max(startFrame + 1, Math.round(end * fps));
        start = startFrame / fps;
        end = endFrame / fps;
      }
      // ASS has centisecond precision; keep every cue visible after rounding.
      const precision = format === "ass" ? 100 : 1000;
      end = Math.max(Math.round(end * precision), Math.round(start * precision) + 1) / precision;
      return {
        start,
        end,
        text: caption.text[language]!.trim()
          .replace(/\r\n?/g, "\n")
          .replace(/\n[\t ]*\n+/g, "\n"),
      };
    })
    .sort((a, b) => a.start - b.start);
  if (!cues.length) throw new Error("There are no subtitles in the selected language.");
  let content: string;
  if (format === "ass") {
    const header = `[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,0,2,60,60,60,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
    content =
      header +
      cues
        .map((cue) => {
          const text = cue.text
            .replace(/\\/g, "\\\\")
            .replace(/\{/g, "\\{")
            .replace(/\}/g, "\\}")
            .replace(/\n/g, "\\N");
          return `Dialogue: 0,${timestamp(cue.start, format)},${timestamp(cue.end, format)},Default,,0,0,0,,${text}`;
        })
        .join("\n") +
      "\n";
  } else {
    content =
      (format === "vtt" ? "WEBVTT\n\n" : "") +
      cues
        .map((cue, index) => {
          const text =
            format === "vtt"
              ? cue.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
              : cue.text;
          return `${index + 1}\n${timestamp(cue.start, format)} --> ${timestamp(cue.end, format)}\n${text}\n`;
        })
        .join("\n");
  }
  return {
    extension: format,
    mimeType: format === "vtt" ? "text/vtt;charset=utf-8" : "text/plain;charset=utf-8",
    content,
  };
}
