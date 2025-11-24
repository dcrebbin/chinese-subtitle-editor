import ToJyutping from "to-jyutping";
import {
  CONTAINS_CHINESE_CHARACTERS,
  KANGXI_RADICAL_LOOKUP,
  PINYIN_MAPPING,
} from "./mandarin";
import type {
  CaptionSegment,
  CaptionLanguage,
} from "../../store/session.store";

export const CaptionLanguages: CaptionLanguage[] = [
  { name: "Cantonese", code: "yue" },
  { name: "Mandarin", code: "zh" },
  { name: "Shanghainese", code: "wuu_SH" },
  { name: "English", code: "en" },
  { name: "Taishanese", code: "yue_TISA" },
  { name: "Teochew", code: "wuu_TE" },
  { name: "Hokkien", code: "min_NAN" },
];

function parseMultilingualText(
  fullText: string
): Record<string, string | null> {
  const result: Record<string, string | null> = {};

  for (const language of CaptionLanguages) {
    const nextLanguageCodes = CaptionLanguages.filter(
      (lang) => lang.code !== language.code
    )
      .map((lang) => `\\(${lang.code}\\)`)
      .join("|");

    const regex = new RegExp(
      `\\(${language.code}\\)(.*?)(?=${nextLanguageCodes}|$)`,
      "s"
    );

    const match = fullText.match(regex);
    const text = match?.[1]?.trim() || null;

    result[language.code] = text;
  }

  return result;
}

export function convertSrtToCaptions(srtContent: string): CaptionSegment[] {
  const captions: CaptionSegment[] = [];
  let currentCaption: CaptionSegment | null = null;
  let currentText: string[] = [];

  const lines = srtContent.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim();

    if (!line) continue;

    if (/^\d+$/.test(line)) {
      if (currentCaption && currentText.length > 0) {
        currentCaption.text = parseMultilingualText(currentText.join("\n"));
        captions.push(currentCaption);
        currentText = [];
      }

      currentCaption = {
        startTime: "",
        endTime: "",
        text: {
          [CaptionLanguages[0]?.code || ""]: null,
        } as Record<string, string | null>,
      } as CaptionSegment;
    } else if (line.includes("-->")) {
      const [start, end] = line.split("-->").map((t: string) => t.trim());
      if (currentCaption) {
        currentCaption.startTime = start || "";
        currentCaption.endTime = end || "";
      }
    } else {
      currentText.push(line);
    }
  }

  if (currentCaption && currentText.length > 0) {
    currentCaption.text = parseMultilingualText(currentText.join("\n"));
    captions.push(currentCaption);
  }

  return captions;
}

export function convertCaptionsToSrt(captions: CaptionSegment[]) {
  let srtContent = "";
  captions?.forEach((caption, index) => {
    srtContent += `${index + 1}\n`;
    srtContent += `${caption.startTime} --> ${caption.endTime}\n`;
    for (const [language, text] of Object.entries(caption.text)) {
      if (text !== null) {
        srtContent += `(${language}) ${text}\n`;
      }
    }
    srtContent += "\n";
  });
  return srtContent;
}

export function convertToCustomTransliterations(
  inputText: string,
  customTransliterationsMap: Record<string, string>
) {
  const transliterations = [];
  for (const char of inputText) {
    if (Array.isArray(customTransliterationsMap[char])) {
      transliterations.push(customTransliterationsMap[char][0]);
      continue;
    }
    const transliteration = customTransliterationsMap[char] || "?";
    if (transliteration === "?") {
      console.log(char);
    }
    transliterations.push(transliteration);
  }
  return transliterations.join(",");
}

export function convertToPinyin(captionText: string) {
  const pinyin = [];
  for (const char of captionText) {
    if (!CONTAINS_CHINESE_CHARACTERS(char)) {
      pinyin.push("EN");
      continue;
    }

    const convertedPinyin = PINYIN_MAPPING[char];
    if (!convertedPinyin) {
      pinyin.push("?");
      continue;
    }
    pinyin.push(convertedPinyin);
  }
  return pinyin.join(",");
}

export function convertToJyutping(captionText: string) {
  const jyutping = [];
  const jyutpingList = ToJyutping.getJyutpingList(captionText);
  for (const [index, char] of jyutpingList.entries()) {
    const jyutpingText = char[1] || KANGXI_RADICAL_LOOKUP[char[0]];

    if (jyutpingText) {
      jyutping.push(jyutpingText);
      continue;
    } else {
      jyutping.push("EN");
    }
  }
  return jyutping.join(",");
}

export function retrieveChineseRomanizationMap(
  transliteratedText: string,
  inputText: string
) {
  const transliterated = transliteratedText.split(",").filter((x) => x);

  const result: { jyutping: string; chinese: string }[] = [];
  let currentEnglishText = "";
  let inputIndex = 0;

  transliterated.forEach((char) => {
    if (inputText[inputIndex] === " ") {
      if (currentEnglishText) {
        result.push({
          jyutping: "EN",
          chinese: currentEnglishText?.trim(),
        });
        currentEnglishText = "";
      }
      result.push({
        jyutping: "EN",
        chinese: " ",
      });
    } else if (char === "EN") {
      currentEnglishText += inputText[inputIndex];
    } else {
      if (currentEnglishText) {
        result.push({
          jyutping: "EN",
          chinese: currentEnglishText?.trim(),
        });
        currentEnglishText = "";
      }
      result.push({
        jyutping: char,
        chinese: inputText[inputIndex] ?? "",
      });
    }
    inputIndex++;
  });

  if (currentEnglishText) {
    result.push({
      jyutping: "EN",
      chinese: currentEnglishText?.trim(),
    });
  }

  if (inputIndex < inputText.length) {
    const remainingText = inputText.slice(inputIndex);
    if (remainingText) {
      result.push({
        jyutping: "EN",
        chinese: remainingText ?? "",
      });
    }
  }

  return result;
}
