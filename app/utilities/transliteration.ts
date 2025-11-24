import ToJyutping from "to-jyutping";
import { CONTAINS_CHINESE_CHARACTERS, KANGXI_RADICAL_LOOKUP, PINYIN_MAPPING } from "./mandarin";

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

