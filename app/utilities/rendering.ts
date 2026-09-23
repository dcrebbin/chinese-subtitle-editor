"use client";

import { Conversion, type Input, type Output } from "mediabunny";

import { getOverlayState, setOverlayState } from "../store/overlay.store";
import { getSessionState } from "../store/session.store";
import { defaultCellSize, defaultChineseFontSize, jyutpingFontSize } from "./constants";
import { getSubtitleAtTime, parseSrt, transliterateCaptions } from "./srt";
import {
  parseMultilingualText,
  retrieveChineseRomanizationMap,
  retrieveJapaneseRomanizationMap,
} from "./transliteration/transliteration";
import { getClampedVideoCrop } from "./video-crop";

const INLINE_ENGLISH_FONT_SCALE = 0.5;
const INLINE_ENGLISH_CELL_MAX_WIDTH_MULTIPLIER = 3;
const INLINE_ENGLISH_CELL_PADDING = 2;
const INLINE_ENGLISH_MIN_FONT_PX = 4;
const JAPANESE_GROUP_WIDTH_PER_CHARACTER = 0.65;
const JAPANESE_MIN_FONT_PX = 8;

export const PREFERRED_TRANSLITERATION_SEGMENTS_PER_LINE = 7;
export const MAX_TRANSLITERATION_SEGMENTS_PER_LINE = 9;

const CHINESE_LINE_ENDING_CHARACTERS = new Set([
  "了",
  "啦",
  "吧",
  "呢",
  "嗎",
  "吗",
  "啊",
  "呀",
  "嘛",
  "囉",
  "啰",
  "咯",
  "喎",
  "哦",
  "哩",
  "咧",
]);
const CLOSING_PUNCTUATION = /^[，。！？；：、,.!?;:）】》」』”’…—]+$/u;

type PreloadedBackgroundImages = {
  fullImage: HTMLImageElement | null;
  doubleImage1: HTMLImageElement | null;
  doubleImage2: HTMLImageElement | null;
};

const backgroundImageCache = new Map<string, HTMLImageElement>();

function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = backgroundImageCache.get(src);
  if (cached?.complete) {
    return Promise.resolve(cached);
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      backgroundImageCache.set(src, image);
      resolve(image);
    };
    image.onerror = () => {
      reject(new Error("Error loading background image"));
    };
    image.src = src;
  });
}

async function preloadBackgroundImages(): Promise<PreloadedBackgroundImages> {
  const overlay = getOverlayState().overlay;
  const images: PreloadedBackgroundImages = {
    fullImage: null,
    doubleImage1: null,
    doubleImage2: null,
  };

  if (overlay.backgroundMode === "full-image" && overlay.backgroundImage) {
    images.fullImage = await loadImage(overlay.backgroundImage);
  }

  if (overlay.backgroundMode === "double-image") {
    if (overlay.doubleBackgroundImage.image1) {
      images.doubleImage1 = await loadImage(overlay.doubleBackgroundImage.image1);
    }
    if (overlay.doubleBackgroundImage.image2) {
      images.doubleImage2 = await loadImage(overlay.doubleBackgroundImage.image2);
    }
  }

  return images;
}

export function getBackgroundImageDrawOffsetY(
  isLandscapeMode: boolean,
  canvasHeight: number,
  drawHeight: number,
  offsetY: number,
): number {
  const baseOffsetY = isLandscapeMode ? (canvasHeight - drawHeight) / 2 : 0;
  return baseOffsetY + offsetY;
}

function determineNonEnglishLanguage(text: string): string {
  if (text.includes("(jp)")) {
    return "jp";
  }
  if (text.includes("(yue)")) {
    return "yue";
  }
  if (text.includes("(ko)")) {
    return "ko";
  }
  return "zh";
}

export function scaleBackgroundImageOffsetY(
  offsetY: number,
  previewHeight: number,
  isLandscapeMode: boolean,
): number {
  const renderHeight = isLandscapeMode ? 1080 : 1920;
  return offsetY * (previewHeight / renderHeight);
}

export async function handleDrawCanvas(canvas: HTMLCanvasElement, subtitle: any, time: number) {
  if (!canvas?.clientWidth || !canvas.clientHeight) {
    return;
  }

  const overlay = getOverlayState().overlay;
  const rendererSizeMultiplier = overlay.sizeMultiplier / 2;

  const targetWidth = overlay.isLandscapeMode ? 1920 : 1080;
  const targetHeight = overlay.isLandscapeMode ? 1080 : 1920;

  if (canvas.width !== targetWidth) {
    canvas.width = overlay.isLandscapeMode ? Math.floor(canvas.clientWidth) : targetWidth;
  }
  if (canvas.height !== targetHeight) {
    canvas.height = overlay.isLandscapeMode ? Math.floor(canvas.clientHeight) : targetHeight;
  }

  const ctx = canvas.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D;

  if (!ctx) {
    return;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (subtitle) {
    const captionText = parseMultilingualText(subtitle.text);
    const cantonese = captionText.yue || "";
    const mandarin = captionText.zh || "";
    const japanese = captionText.jp || "";
    const korean = captionText.ko || "";

    const languageCode = determineNonEnglishLanguage(subtitle.text);
    const sourceText = cantonese || mandarin || japanese || korean;
    const transliterationMap =
      languageCode === "jp"
        ? retrieveJapaneseRomanizationMap(
            sourceText,
            getSessionState().session.japaneseTransliterations[sourceText],
          )
        : retrieveChineseRomanizationMap(
            transliterateCaptions(sourceText, languageCode, {}),
            sourceText,
          );
    setOverlayState({ jsonData: { transliterationMap } });

    const english = captionText.en;
    const rows = updateTransliterationRows(
      mergeConsecutiveEnglishWords(transliterationMap, ctx, rendererSizeMultiplier),
    );

    const rowSpacing = 0;
    const topMargin = overlay.verticalPosition;
    const spacingBetweenTextAndChars = 20;

    const cellSize = (defaultCellSize * overlay.sizeMultiplier) / 2 - 5;
    let currentTopY = topMargin;

    if (english) {
      ctx.save();
      ctx.fillStyle = "black";
      ctx.font = `${24 * rendererSizeMultiplier}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const englishY = currentTopY;

      const text = english;
      const paddingX = 0;
      const paddingY = 8;
      const maxWidth = canvas.width * 0.8;
      const lineHeight = 28 * rendererSizeMultiplier;

      const words = text.split(" ");
      const lines: string[] = [];
      let currentLine = "";

      for (const word of words) {
        const testLine = currentLine.length === 0 ? word : `${currentLine} ${word}`;
        const metrics = ctx.measureText(testLine);

        if (metrics.width > maxWidth && currentLine.length > 0) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }

      if (currentLine.length > 0) {
        lines.push(currentLine);
      }

      const longestLineWidth = Math.max(...lines.map((line) => ctx.measureText(line).width));
      const totalTextHeight = lines.length * lineHeight;

      const bgWidth = longestLineWidth + paddingX * 2;
      const bgX = canvas.width / 2 - bgWidth / 2;
      const bgY = englishY;
      const bgHeight = totalTextHeight + paddingY * 2;

      ctx.fillStyle = "rgba(255, 255, 255, 1)";
      ctx.fillRect(bgX, bgY, bgWidth, bgHeight);

      ctx.fillStyle = "black";
      for (const [index, line] of lines.entries()) {
        ctx.fillText(line, canvas.width / 2, englishY + paddingY + index * lineHeight);
      }

      ctx.restore();

      currentTopY = englishY + totalTextHeight + paddingY * 2 + spacingBetweenTextAndChars;
    }

    const chineseStartY = currentTopY;
    for (const [rowIndex, row] of rows.entries()) {
      const rowY = chineseStartY + rowIndex * (cellSize + rowSpacing);

      const totalWidth = row.reduce((acc, caption) => {
        if (caption.chinese === " " || caption.chinese === "") {
          return acc + cellSize / 3;
        }
        return (
          acc +
          computeTransliterationCellWidth(
            ctx,
            caption,
            rendererSizeMultiplier,
            languageCode,
            overlay.transliterationEnabled,
          )
        );
      }, 0);
      const startX = (canvas.width - totalWidth) / 2;
      let currentX = startX;
      for (const caption of row) {
        if (caption.chinese === " " || caption.chinese === "") {
          currentX += cellSize / 3;
        } else {
          drawCharacterCell(
            ctx,
            caption,
            currentX,
            rowY,
            rendererSizeMultiplier,
            languageCode,
            overlay.transliterationEnabled,
          );
          const captionWidth = computeTransliterationCellWidth(
            ctx,
            caption,
            rendererSizeMultiplier,
            languageCode,
            overlay.transliterationEnabled,
          );
          currentX += captionWidth;
        }
      }
    }
  }
}

export const mergeConsecutiveEnglishWords = (
  map: { jyutping: string; chinese: string }[],
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  sizeMultiplier: number,
): { jyutping: string; chinese: string }[] => {
  const result: { jyutping: string; chinese: string }[] = [];
  let i = 0;
  const savedFont = ctx.font;
  const englishFontSize = defaultChineseFontSize * sizeMultiplier * INLINE_ENGLISH_FONT_SCALE;
  const maxCellWidth = defaultCellSize * sizeMultiplier * INLINE_ENGLISH_CELL_MAX_WIDTH_MULTIPLIER;
  ctx.font = `${englishFontSize}px Arial`;

  while (i < map.length) {
    const entry = map[i];

    if (entry.jyutping === "EN" && entry.chinese !== " " && entry.chinese !== "") {
      let combined = entry.chinese;
      let j = i + 1;

      while (
        j < map.length &&
        map[j].jyutping === "EN" &&
        map[j].chinese === " " &&
        j + 1 < map.length &&
        map[j + 1].jyutping === "EN" &&
        map[j + 1].chinese !== " " &&
        map[j + 1].chinese !== ""
      ) {
        const nextCombined = `${combined} ${map[j + 1].chinese}`;
        const nextCombinedWidth =
          ctx.measureText(nextCombined).width + INLINE_ENGLISH_CELL_PADDING * sizeMultiplier;
        if (nextCombinedWidth > maxCellWidth) {
          break;
        }
        combined = nextCombined;
        j += 2;
      }

      result.push({ jyutping: "EN", chinese: combined });
      i = j;
    } else {
      result.push(entry);
      i++;
    }
  }

  ctx.font = savedFont;
  return result;
};

export const updateTransliterationRows = (
  transliterationMap: { jyutping: string; chinese: string }[],
) => {
  const rows: { jyutping: string; chinese: string }[][] = [];
  let rowStart = 0;

  const isWhitespace = (index: number) =>
    /^\s+$/u.test(transliterationMap[index]?.chinese ?? "");
  const shouldStayOnPreviousLine = (index: number) => {
    const text = transliterationMap[index]?.chinese ?? "";
    return CHINESE_LINE_ENDING_CHARACTERS.has(text) || CLOSING_PUNCTUATION.test(text);
  };

  while (rowStart < transliterationMap.length) {
    const remaining = transliterationMap.length - rowStart;
    if (remaining <= MAX_TRANSLITERATION_SEGMENTS_PER_LINE) {
      rows.push(transliterationMap.slice(rowStart));
      break;
    }

    const preferredEnd = rowStart + PREFERRED_TRANSLITERATION_SEGMENTS_PER_LINE;
    const maximumEnd = rowStart + MAX_TRANSLITERATION_SEGMENTS_PER_LINE;
    let rowEnd = preferredEnd;

    // A visible space is the clearest phrase boundary. Use the closest one on
    // either side of the preferred length, without making the row too short.
    const minimumNaturalEnd = Math.max(rowStart + 1, preferredEnd - 2);
    let naturalEnd: number | undefined;
    for (let index = rowStart; index < maximumEnd; index++) {
      const candidateEnd = index + 1;
      if (
        isWhitespace(index) &&
        candidateEnd >= minimumNaturalEnd &&
        (naturalEnd === undefined ||
          Math.abs(candidateEnd - preferredEnd) < Math.abs(naturalEnd - preferredEnd))
      ) {
        naturalEnd = candidateEnd;
      }
    }
    rowEnd = naturalEnd ?? rowEnd;

    // Sentence particles and closing punctuation belong to the phrase before
    // them. Let them extend a preferred-length row instead of orphaning them.
    while (rowEnd < maximumEnd && shouldStayOnPreviousLine(rowEnd)) {
      rowEnd++;
    }

    // Do not start a row with whitespace. It remains in the previous row so the
    // original segment map stays intact and internal spacing is preserved.
    while (rowEnd < maximumEnd && isWhitespace(rowEnd)) {
      rowEnd++;
    }

    rows.push(transliterationMap.slice(rowStart, rowEnd));
    rowStart = rowEnd;
  }

  return rows;
};

const toneToSegment = (tone: number) => {
  switch (tone) {
    case 1:
      return "ˉ¹";
    case 2:
      return "ˊ²";
    case 3:
      return "˗₃";
    case 4:
      return "ˎ₄";
    case 5:
      return "ˏ₅";
    case 6:
      return "ˍ₆";
    default:
      return "";
  }
};

export const computeEnglishCellWidth = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  text: string,
  sizeMultiplier: number,
): number => {
  const savedFont = ctx.font;
  const englishFontSize = defaultChineseFontSize * sizeMultiplier * INLINE_ENGLISH_FONT_SCALE;
  const maxCellWidth = defaultCellSize * sizeMultiplier * INLINE_ENGLISH_CELL_MAX_WIDTH_MULTIPLIER;
  ctx.font = `${englishFontSize}px Arial`;
  const measured = ctx.measureText(text).width;
  ctx.font = savedFont;
  return Math.min(measured + INLINE_ENGLISH_CELL_PADDING * sizeMultiplier, maxCellWidth);
};

export function computeTransliterationCellWidth(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  caption: { jyutping: string; chinese: string },
  sizeMultiplier: number,
  languageCode = "zh",
  transliterationEnabled = true,
) {
  if (caption.jyutping === "EN") {
    return computeEnglishCellWidth(ctx, caption.chinese, sizeMultiplier);
  }
  const sourceUnits = Math.max(1, Array.from(caption.chinese).length);
  const readingUnits = transliterationEnabled
    ? Math.max(1, Math.ceil(caption.jyutping.length / 6))
    : 1;
  if (languageCode === "jp") {
    return (
      defaultCellSize *
      sizeMultiplier *
      Math.max(
        1,
        sourceUnits * JAPANESE_GROUP_WIDTH_PER_CHARACTER,
        readingUnits * JAPANESE_GROUP_WIDTH_PER_CHARACTER,
      )
    );
  }
  return defaultCellSize * sizeMultiplier * Math.max(sourceUnits, readingUnits);
}

const fitFontSizeToWidth = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  text: string,
  fontFamily: string,
  preferredFontPx: number,
  minFontPx: number,
  maxWidth: number,
) => {
  const savedFont = ctx.font;
  let fontPx = preferredFontPx;
  while (fontPx > minFontPx) {
    ctx.font = `${fontPx}px ${fontFamily}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    fontPx -= 1;
  }
  ctx.font = savedFont;
  return Math.max(fontPx, minFontPx);
};

const fitEnglishTextToWidth = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  text: string,
  preferredFontPx: number,
  maxWidth: number,
): { text: string; fontPx: number } => {
  const savedFont = ctx.font;
  let fontPx = preferredFontPx;
  let displayText = text;

  while (fontPx > INLINE_ENGLISH_MIN_FONT_PX) {
    ctx.font = `${fontPx}px Arial`;
    if (ctx.measureText(displayText).width <= maxWidth) {
      ctx.font = savedFont;
      return { text: displayText, fontPx };
    }
    fontPx -= 1;
  }

  ctx.font = `${INLINE_ENGLISH_MIN_FONT_PX}px Arial`;
  const ellipsis = "...";
  if (ctx.measureText(ellipsis).width > maxWidth) {
    ctx.font = savedFont;
    return { text: "", fontPx: INLINE_ENGLISH_MIN_FONT_PX };
  }

  while (displayText.length > 0 && ctx.measureText(`${displayText}${ellipsis}`).width > maxWidth) {
    displayText = displayText.slice(0, -1);
  }

  ctx.font = savedFont;
  return {
    text: displayText.length < text.length ? `${displayText}${ellipsis}` : displayText,
    fontPx: INLINE_ENGLISH_MIN_FONT_PX,
  };
};

export const drawCharacterCell = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null,
  caption: { jyutping: string; chinese: string },
  x: number,
  y: number,
  sizeMultiplier: number,
  languageCode = "zh",
  transliterationEnabled = true,
) => {
  if (!ctx) return;
  const cellSize = defaultCellSize * sizeMultiplier;
  const cellWidth = computeTransliterationCellWidth(
    ctx,
    caption,
    sizeMultiplier,
    languageCode,
    transliterationEnabled,
  );

  if (caption.jyutping === "EN") {
    const cellWidth = computeEnglishCellWidth(ctx, caption.chinese, sizeMultiplier);
    ctx.fillStyle = "white";
    ctx.fillRect(x, y, cellWidth, cellSize);
    ctx.fillStyle = "black";
    const preferredInlineEnglishFontSize =
      defaultChineseFontSize * sizeMultiplier * INLINE_ENGLISH_FONT_SCALE;
    const maxTextWidth = Math.max(0, cellWidth - INLINE_ENGLISH_CELL_PADDING * sizeMultiplier);
    const fitted = fitEnglishTextToWidth(
      ctx,
      caption.chinese,
      preferredInlineEnglishFontSize,
      maxTextWidth,
    );
    ctx.font = `${fitted.fontPx}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, cellWidth, cellSize);
    ctx.clip();
    ctx.fillText(fitted.text, x + cellWidth / 2, y + cellSize / 2);
    ctx.restore();
    return;
  }

  const extractedTone = caption.jyutping.match(/[1-9]/);
  const tone = extractedTone ? extractedTone[0] : "";
  const segment = toneToSegment(Number.parseInt(tone));

  ctx.fillStyle = "white";
  ctx.fillRect(x, y, cellWidth, cellSize);

  ctx.fillStyle = "black";
  const jyutpingText = caption.jyutping.replace(tone, segment);
  const horizontalPadding = 6 * sizeMultiplier;
  const maxTextWidth = Math.max(0, cellWidth - horizontalPadding * 2);
  const romajiFontSize =
    languageCode === "jp"
      ? fitFontSizeToWidth(
          ctx,
          jyutpingText,
          "Arial",
          jyutpingFontSize * sizeMultiplier,
          JAPANESE_MIN_FONT_PX * sizeMultiplier,
          maxTextWidth,
        )
      : jyutpingFontSize * sizeMultiplier;
  ctx.font = `${romajiFontSize}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const paddingY = 15 * sizeMultiplier;

  if (transliterationEnabled && jyutpingText) {
    ctx.fillText(jyutpingText, x + cellWidth / 2, y + cellSize / 2 - paddingY);
  }

  const sourceFontSize =
    languageCode === "jp"
      ? fitFontSizeToWidth(
          ctx,
          caption.chinese,
          "Times New Roman",
          defaultChineseFontSize * sizeMultiplier,
          JAPANESE_MIN_FONT_PX * sizeMultiplier,
          maxTextWidth,
        )
      : defaultChineseFontSize * sizeMultiplier;
  ctx.font = `${sourceFontSize}px Times New Roman`;
  ctx.fillText(
    caption.chinese,
    x + cellWidth / 2,
    y + cellSize / 2 + (transliterationEnabled ? paddingY : 0),
  );
};

function addBackground(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null,
  width: number,
  height: number,
  colour: string,
  preloadedImages: PreloadedBackgroundImages,
) {
  if (!ctx) return;
  const overlay = getOverlayState().overlay;
  if (overlay.backgroundMode === "colour") {
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, width, height);
  }
  if (overlay.backgroundMode === "full-image") {
    const image = preloadedImages.fullImage;
    if (image) {
      const canvasAspect = width / height;
      const imageAspect = image.width / image.height;

      let drawWidth: number, drawHeight: number;

      if (imageAspect > canvasAspect) {
        drawHeight = height;
        drawWidth = height * imageAspect;
      } else {
        drawWidth = width;
        drawHeight = width / imageAspect;
      }

      const offsetX = (width - drawWidth) / 2;
      const offsetY = getBackgroundImageDrawOffsetY(
        overlay.isLandscapeMode,
        height,
        drawHeight,
        overlay.backgroundImageOffsetY,
      );

      ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
    }
  }
  if (overlay.backgroundMode === "double-image") {
    const halfHeight = height / 2;
    const drawHalfImage = (image: HTMLImageElement | null, top: number, offsetY: number) => {
      if (!image) return;

      const canvasAspect = width / halfHeight;
      const imageAspect = image.width / image.height;
      const drawWidth = imageAspect > canvasAspect ? halfHeight * imageAspect : width;
      const drawHeight = imageAspect > canvasAspect ? halfHeight : width / imageAspect;
      const offsetX = (width - drawWidth) / 2;
      const baseOffsetY = top + (halfHeight - drawHeight) / 2;

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, top, width, halfHeight);
      ctx.clip();
      ctx.drawImage(image, offsetX, baseOffsetY + offsetY, drawWidth, drawHeight);
      ctx.restore();
    };

    drawHalfImage(preloadedImages.doubleImage1, 0, overlay.doubleBackgroundImageOffsetY.image1);
    drawHalfImage(
      preloadedImages.doubleImage2,
      halfHeight,
      overlay.doubleBackgroundImageOffsetY.image2,
    );
  }
}

export async function convertCanvas(
  verticalPosition: number,
  sizeMultiplier: number,
  input: Input,
  output: Output,
  parsedSubtitles: any[],
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null,
  lyricsOffset: number = 0,
) {
  const overlay = getOverlayState().overlay;
  const preloadedImages = await preloadBackgroundImages();

  return await Conversion.init({
    input,
    output,
    trim: {
      start: overlay.startTime,
      end: overlay.endTime,
    },
    video: {
      process: async (sample) => {
        const width = overlay.isLandscapeMode ? 1920 : 1080;
        const height = overlay.isLandscapeMode ? 1080 : 1920;
        if (!ctx) {
          const canvas = new OffscreenCanvas(width, height);
          ctx = canvas.getContext("2d") as
            | CanvasRenderingContext2D
            | OffscreenCanvasRenderingContext2D;
        }

        addBackground(ctx, width, height, overlay.colour as string, preloadedImages);

        const rendererSizeMultiplier = sizeMultiplier / 2;
        const cellSize = (defaultCellSize * sizeMultiplier) / 2 - 5;
        const adjustedTimestamp = sample.timestamp + overlay.startTime;
        const subtitle = getSubtitleAtTime(parsedSubtitles, adjustedTimestamp + lyricsOffset);

        const videoScale = Math.min(width / sample.displayWidth, height / sample.displayHeight);
        const drawWidth = sample.displayWidth * videoScale;
        const drawHeight = sample.displayHeight * videoScale;
        const videoCrop = getClampedVideoCrop(
          overlay.videoCropTop,
          overlay.videoCropBottom,
          sample.displayHeight,
        );
        const croppedSourceHeight = sample.displayHeight - videoCrop.top - videoCrop.bottom;
        const croppedDrawHeight = croppedSourceHeight * videoScale;
        let drawY = overlay.videoPosition === "center" ? (height - drawHeight) / 2 : 0;
        let drawX = (width - drawWidth) / 2;

        // Ensure drawX/drawY are rounded for subpixel rendering accuracy
        drawX = Math.round(drawX);
        drawY = Math.round(drawY);

        // Keep the video's original placement while removing the cropped source rows.
        sample.draw(
          ctx,
          0,
          videoCrop.top,
          sample.displayWidth,
          croppedSourceHeight,
          drawX,
          drawY + videoCrop.top * videoScale,
          drawWidth,
          croppedDrawHeight,
        );

        if (subtitle) {
          const captionText = parseMultilingualText(subtitle.text);
          const cantonese = captionText.yue || "";
          const mandarin = captionText.zh || "";
          const japanese = captionText.jp || "";
          const korean = captionText.ko || "";
          const english = captionText.en || "";

          const languageCode = determineNonEnglishLanguage(subtitle.text);
          const sourceText = cantonese || mandarin || japanese || korean;
          const transliterationMap =
            languageCode === "jp"
              ? retrieveJapaneseRomanizationMap(
                  sourceText,
                  getSessionState().session.japaneseTransliterations[sourceText],
                )
              : retrieveChineseRomanizationMap(
                  transliterateCaptions(sourceText, languageCode, {}),
                  sourceText,
                );
          const rows = updateTransliterationRows(
            mergeConsecutiveEnglishWords(transliterationMap, ctx!, rendererSizeMultiplier),
          );

          const rowSpacing = 0;
          const topMargin = verticalPosition;
          const spacingBetweenTextAndChars = 20;

          let currentTopY = topMargin;

          if (english) {
            ctx.save();
            ctx.font = `${24 * rendererSizeMultiplier}px Arial`;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            const englishY = currentTopY;

            const text = english;
            const paddingX = 0;
            const paddingY = 8;
            const maxWidth = width * 0.8;
            const lineHeight = 28 * rendererSizeMultiplier;

            const words = text.split(" ");
            const lines: string[] = [];
            let currentLine = "";

            for (const word of words) {
              const testLine = currentLine.length === 0 ? word : `${currentLine} ${word}`;
              const metrics = ctx?.measureText(testLine) || { width: 0 };

              if (metrics.width > maxWidth && currentLine.length > 0) {
                lines.push(currentLine);
                currentLine = word;
              } else {
                currentLine = testLine;
              }
            }

            if (currentLine.length > 0) {
              lines.push(currentLine);
            }

            const longestLineWidth = Math.max(
              ...lines.map((line) => ctx?.measureText(line).width || 0),
            );
            const totalTextHeight = lines.length * lineHeight;

            const bgWidth = longestLineWidth + paddingX * 2;
            const bgX = width / 2 - bgWidth / 2;
            const bgY = englishY;
            const bgHeight = totalTextHeight + paddingY * 2;

            ctx.fillStyle = "rgba(255, 255, 255, 1)";
            ctx.fillRect(bgX, bgY, bgWidth, bgHeight);

            ctx.fillStyle = "black";
            for (const [index, line] of lines.entries()) {
              ctx?.fillText(line, width / 2, englishY + paddingY + index * lineHeight);
            }

            ctx.restore();

            currentTopY = englishY + totalTextHeight + paddingY * 2 + spacingBetweenTextAndChars;
          }

          const chineseStartY = currentTopY;

          if (ctx?.canvas) {
            for (const [rowIndex, row] of rows.entries()) {
              const rowY = chineseStartY + rowIndex * (cellSize + rowSpacing);

              const totalWidth = row.reduce((acc, caption) => {
                if (caption.chinese === " " || caption.chinese === "") {
                  return acc + cellSize / 3;
                }
                return (
                  acc +
                  computeTransliterationCellWidth(
                    ctx!,
                    caption,
                    rendererSizeMultiplier,
                    languageCode,
                    overlay.transliterationEnabled,
                  )
                );
              }, 0);
              const startX = ((ctx?.canvas?.width || 0) - totalWidth) / 2;

              let currentX = startX;
              for (const caption of row) {
                if (caption.chinese === " " || caption.chinese === "") {
                  currentX += cellSize / 3;
                } else {
                  drawCharacterCell(
                    ctx,
                    caption,
                    currentX,
                    rowY,
                    rendererSizeMultiplier,
                    languageCode,
                    overlay.transliterationEnabled,
                  );
                  const captionWidth = computeTransliterationCellWidth(
                    ctx!,
                    caption,
                    rendererSizeMultiplier,
                    languageCode,
                    overlay.transliterationEnabled,
                  );
                  currentX += captionWidth;
                }
              }
            }
          }
        }
        return ctx.canvas;
      },
    },
  });
}
