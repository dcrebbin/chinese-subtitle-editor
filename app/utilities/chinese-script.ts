import { Converter } from "opencc-js";

import type { CaptionSegment } from "../store/session.store";

export type ChineseScript = "traditional" | "simplified";

// Hong Kong character forms suit Cantonese subtitles without replacing vocabulary.
const toTraditional = Converter({ from: "cn", to: "hk" });
const toSimplified = Converter({ from: "hk", to: "cn" });

export function convertChineseText(text: string, script: ChineseScript): string {
  return (script === "traditional" ? toTraditional : toSimplified)(text);
}

export function convertChineseCaptions(
  captions: CaptionSegment[],
  script: ChineseScript,
): CaptionSegment[] {
  return captions.map((caption) => ({
    ...caption,
    text: Object.fromEntries(
      Object.entries(caption.text).map(([language, text]) => [
        language,
        text === null || language === "jp" || language === "ko"
          ? text
          : convertChineseText(text, script),
      ]),
    ),
  }));
}
