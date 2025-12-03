"use client";

import { Conversion, type Input, type Output } from "mediabunny";

import { getOverlayState, setOverlayState } from "../store/overlay.store";
import { getSessionState } from "../store/session.store";
import { defaultCellSize, defaultChineseFontSize, jyutpingFontSize } from "./constants";
import { getSubtitleAtTime, parseSrt, transliterateCaptions } from "./srt";
import { retrieveChineseRomanizationMap } from "./transliteration/transliteration";

export function handleDrawCanvas(canvas: HTMLCanvasElement, subtitle: any, time: number) {
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
    const cantonese = subtitle.text.split("(yue)")[1]?.split("(en)")[0]?.trim() || "";
    const transliteratedText = transliterateCaptions(cantonese, true, {});

    const transliterationMap = retrieveChineseRomanizationMap(transliteratedText, cantonese);
    setOverlayState({ jsonData: { transliterationMap } });
    const english = subtitle.text.split("(en)")[1]?.trim() || "";
    const rows = updateTransliterationRows(transliterationMap);

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
        return acc + cellSize;
      }, 0);
      const startX = (canvas.width - totalWidth) / 2;
      let currentX = startX;
      for (const caption of row) {
        if (caption.chinese === " " || caption.chinese === "") {
          currentX += cellSize / 3;
        } else {
          drawCharacterCell(ctx, caption, currentX, rowY, rendererSizeMultiplier);
          currentX += cellSize;
        }
      }
    }
  }
}

export const updateTransliterationRows = (
  transliterationMap: { jyutping: string; chinese: string }[],
) => {
  const rows: { jyutping: string; chinese: string }[][] = [];
  for (let i = 0; i < Math.ceil(transliterationMap.length / 5); i++) {
    const newRow: { jyutping: string; chinese: string }[] = [];
    for (let j = 0; j < 5; j++) {
      const item = transliterationMap[i * 5 + j];
      if (item) {
        newRow.push(item);
      } else {
        break;
      }
    }
    rows.push(newRow);
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

export const drawCharacterCell = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null,
  caption: { jyutping: string; chinese: string },
  x: number,
  y: number,
  sizeMultiplier: number,
) => {
  if (!ctx) return;
  const extractedTone = caption.jyutping.match(/[1-9]/);
  const tone = extractedTone ? extractedTone[0] : "";
  const segment = toneToSegment(Number.parseInt(tone));
  const cellSize = defaultCellSize * sizeMultiplier;

  ctx.fillStyle = "white";
  ctx.fillRect(x, y, cellSize, cellSize);

  ctx.fillStyle = "black";
  ctx.font = `${jyutpingFontSize * sizeMultiplier}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const paddingY = 15 * sizeMultiplier;

  const jyutpingText = caption.jyutping === "EN" ? "" : caption.jyutping.replace(tone, segment);
  if (jyutpingText) {
    ctx.fillText(jyutpingText, x + cellSize / 2, y + cellSize / 2 - paddingY);
  }

  ctx.font = `${defaultChineseFontSize * sizeMultiplier}px Arial`;
  ctx.fillText(caption.chinese, x + cellSize / 2, y + cellSize / 2 + paddingY);
};

function addBackground(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null,
  width: number,
  height: number,
  colour: string,
) {
  if (!ctx) return;
  const overlay = getOverlayState().overlay;
  if (overlay.backgroundMode === "colour") {
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, width, height);
  }
  if (overlay.backgroundMode === "full-image") {
    if (overlay.backgroundImage) {
      const image = new Image();
      image.src = overlay.backgroundImage;
      image.onload = () => {
        // Calculate aspect ratios
        const canvasAspect = width / height;
        const imageAspect = image.width / image.height;

        let drawWidth: number, drawHeight: number, offsetX: number, offsetY: number;

        // Cover the canvas while maintaining aspect ratio
        if (imageAspect > canvasAspect) {
          // Image is wider than canvas
          drawHeight = height;
          drawWidth = height * imageAspect;
          offsetX = (width - drawWidth) / 2;
          offsetY = 0;
        } else {
          // Image is taller than canvas
          drawWidth = width;
          drawHeight = width / imageAspect;
          offsetX = 0;
          offsetY = (height - drawHeight) / 2;
        }

        ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
      };
      image.onerror = () => {
        console.error("Error loading background image");
      };
    }
  }
  if (overlay.backgroundMode === "double-image") {
    if (overlay.doubleBackgroundImage.image1) {
      const image = new Image();
      image.src = overlay.doubleBackgroundImage.image1;
      image.onload = () => {
        ctx.drawImage(image, 0, 0, width, height);
      };
      image.onerror = () => {
        console.error("Error loading background image");
      };
    }
    if (overlay.doubleBackgroundImage.image2) {
      const image = new Image();
      image.src = overlay.doubleBackgroundImage.image2;
      image.onload = () => {
        ctx.drawImage(image, 0, 0, width, height);
      };
      image.onerror = () => {
        console.error("Error loading background image");
      };
    }
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

  return await Conversion.init({
    input,
    output,
    trim: {
      start: overlay.startTime,
      end: overlay.endTime,
    },
    video: {
      process: (sample) => {
        const width = overlay.isLandscapeMode ? 1920 : 1080;
        const height = overlay.isLandscapeMode ? 1080 : 1920;
        if (!ctx) {
          const canvas = new OffscreenCanvas(width, height);
          ctx = canvas.getContext("2d") as
            | CanvasRenderingContext2D
            | OffscreenCanvasRenderingContext2D;
        }

        addBackground(ctx, width, height, overlay.colour as string);

        const rendererSizeMultiplier = sizeMultiplier / 2;
        const cellSize = (defaultCellSize * sizeMultiplier) / 2 - 5;
        const adjustedTimestamp = sample.timestamp + overlay.startTime;
        const subtitle = getSubtitleAtTime(parsedSubtitles, adjustedTimestamp + lyricsOffset);

        let drawX = -(sample.displayWidth - width) / 2;

        let drawY = overlay.videoPosition === "center" ? -(sample.displayHeight - height) / 2 : 0;
        let drawWidth = sample.displayWidth;
        let drawHeight = sample.displayHeight;

        if (!overlay.isLandscapeMode && sample.displayWidth > width) {
          const scale = width / sample.displayWidth;
          drawWidth = width;
          drawHeight = sample.displayHeight * scale;
          drawX = 0;
          drawY = overlay.videoPosition === "center" ? (height - drawHeight) / 2 : 0;
        }

        sample.draw(ctx, drawX, drawY, drawWidth, drawHeight);

        if (subtitle) {
          const cantonese = subtitle.text.split("(yue)")[1]?.split("(en)")[0]?.trim() || "";
          const english = subtitle.text.split("(en)")[1]?.trim() || "";

          const transliteratedText = transliterateCaptions(cantonese, true, {});
          const transliterationMap = retrieveChineseRomanizationMap(transliteratedText, cantonese);
          const rows = updateTransliterationRows(transliterationMap);

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
                return acc + cellSize;
              }, 0);
              const startX = ((ctx?.canvas?.width || 0) - totalWidth) / 2;

              let currentX = startX;
              for (const caption of row) {
                if (caption.chinese === " " || caption.chinese === "") {
                  currentX += cellSize / 3;
                } else {
                  drawCharacterCell(ctx, caption, currentX, rowY, rendererSizeMultiplier);
                  currentX += cellSize;
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
