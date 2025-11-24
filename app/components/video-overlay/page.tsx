"use client";

import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Input,
  Mp4OutputFormat,
  Output,
} from "mediabunny";
import { useEffect, useRef } from "react";
import { parseSrt, transliterateCaptions } from "../../utilities/srt";
import { retrieveChineseRomanizationMap } from "../../utilities/transliteration/transliteration";
import {
  convertCanvas,
  drawCharacterCell,
  handleDrawCanvas,
  updateTransliterationRows,
} from "../../utilities/rendering";
import { useSessionStore } from "@/app/store/session.store";
import { setOverlayState, useOverlayStore } from "@/app/store/overlay.store";

export const defaultCellSize = 70;
export const defaultEnglishFontSize = 24;
export const defaultChineseFontSize = 32;
export const jyutpingFontSize = 16;
export const defaultTextHeight = 28;

function getVideoIdFromUrl(videoUrl: string) {
  let newVideoId = "";
  if (videoUrl?.includes("watch")) {
    newVideoId = videoUrl.split("watch?v=")[1] || "";
    newVideoId = newVideoId.split("&")[0];
  } else if (videoUrl?.includes("youtu.be")) {
    const splitUrl = videoUrl.split("/");
    if (splitUrl[3]) {
      const videoId = splitUrl[3].split("?")[0];
      newVideoId = videoId || "";
    }
  } else if (videoUrl?.includes("music.youtube.com")) {
    if (videoUrl.includes("watch")) {
      newVideoId = videoUrl.split("watch?v=")[1] || "";
      newVideoId = newVideoId.split("&")[0];
    }
  }
  return newVideoId;
}

export default function OverlayPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const target = new BufferTarget();
  const format = new Mp4OutputFormat();
  const videoRef = useRef<HTMLVideoElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const currentTimeRef = useRef<HTMLInputElement>(null);

  const { session, setSession } = useSessionStore();
  const { overlay } = useOverlayStore();
  const output = new Output({
    target: target,
    format: format,
  });

  useEffect(() => {
    if (previewVideoRef.current) {
      previewVideoRef.current.addEventListener("play", () =>
        setOverlayState({ isPlaying: true })
      );
      previewVideoRef.current.addEventListener("pause", () =>
        setOverlayState({ isPlaying: false })
      );
    }
  }, [previewVideoRef]);

  async function handleUpload() {
    if (!overlay.file) {
      alert("No file selected");
      return;
    }
    if (overlay.isLoading) {
      alert("Already loading");
      return;
    }
    const parsedSubtitles = parseSrt(session.srtContent);
    console.log("Starting conversion");
    setOverlayState({ isLoading: true });
    const watermark = new Image();
    watermark.src = "/watermark.png";
    await new Promise((resolve) => {
      watermark.onload = resolve;
    });

    const blob = new Blob([overlay.file ?? ""], {
      type: overlay.file?.type ?? "",
    });
    const blobSource = new BlobSource(blob);
    const input = new Input({ source: blobSource, formats: ALL_FORMATS });

    const ctx:
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null = null;
    const conversion = await convertCanvas(
      overlay.verticalPosition,
      overlay.sizeMultiplier,
      input,
      output,
      parsedSubtitles,
      ctx,
      overlay.lyricOffset
    );

    await conversion?.execute().catch((error) => {
      alert("Error converting file");
      console.error(error);
      setOverlayState({ isLoading: false });
    });
    console.log("Conversion complete");

    const buffer = target.buffer as ArrayBuffer;
    const outputMimeType = overlay.file?.type?.startsWith("video/")
      ? overlay.file.type
      : "video/mp4";
    const outputBlob = new Blob([buffer], { type: outputMimeType });
    console.log("outputBlob", outputBlob);
    const url = URL.createObjectURL(outputBlob);
    setOverlayState({ isLoading: false });

    // Save output url in state for react video element
    setOverlayState({ outputUrl: url });

    // Also, if ref available, force reload and play
    if (videoRef.current) {
      console.log("Setting video source");
      videoRef.current.src = url;
      // Wait until metadata is loaded, then play to fix load timing issues
      videoRef.current.onloadedmetadata = () => {
        console.log("Metadata loaded");
        videoRef.current?.play();
      };
      videoRef.current.load(); // triggers metadata load
    }
    console.log("Output URL set");
  }

  function handleDownload() {
    if (!overlay.outputUrl) {
      alert("No output URL");
      return;
    }
    const a = document.createElement("a");
    a.href = overlay.outputUrl;
    a.download = "output.mp4";
    a.click();
  }

  function handleQuickPreview() {
    if (!overlay.file) {
      alert("Please select a video file first");
      return;
    }

    const url = URL.createObjectURL(overlay.file);
    setOverlayState({ previewUrl: url });

    setTimeout(() => {
      if (previewVideoRef.current) {
        previewVideoRef.current.currentTime = overlay.currentTime;
        previewVideoRef.current.onloadeddata = () => {
          drawVideoFrameWithOverlay();
        };
      }
    }, 100);
  }

  function drawVideoFrameWithOverlay() {
    if (!canvasRef.current || !previewVideoRef.current) return;

    const canvas = canvasRef.current;
    const video = previewVideoRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const parsedSubtitles = parseSrt(session.srtContent);
    const validSubtitles = parsedSubtitles.filter(
      (sub): sub is typeof sub & { startTime: number; endTime: number } =>
        sub.startTime !== null && sub.endTime !== null
    );

    const subtitle = validSubtitles.find(
      (sub) =>
        overlay.currentTime + overlay.lyricOffset >= sub.startTime &&
        overlay.currentTime + overlay.lyricOffset <= sub.endTime
    );

    if (subtitle) {
      const cantonese = subtitle.text
        .split("(yue)")[1]
        ?.split("(en)")[0]
        ?.trim();
      const english = subtitle.text.split("(en)")[1]?.trim();

      if (cantonese) {
        const transliteratedText = transliterateCaptions(cantonese, true, {});
        const transliterationMap = retrieveChineseRomanizationMap(
          transliteratedText,
          cantonese
        );
        const rows = updateTransliterationRows(transliterationMap);

        const rendererSizeMultiplier = overlay.sizeMultiplier / 2;
        const cellSize = (defaultCellSize * overlay.sizeMultiplier) / 2 - 5;
        const rowSpacing = 0;
        const topMargin = overlay.verticalPosition;
        const spacingBetweenTextAndChars = 20;

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
            const testLine =
              currentLine.length === 0 ? word : `${currentLine} ${word}`;
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

          const longestLineWidth = Math.max(
            ...lines.map((line) => ctx.measureText(line).width)
          );
          const totalTextHeight = lines.length * lineHeight;

          const bgWidth = longestLineWidth + paddingX * 2;
          const bgX = canvas.width / 2 - bgWidth / 2;
          const bgY = englishY;
          const bgHeight = totalTextHeight + paddingY * 2;

          ctx.fillStyle = "rgba(255, 255, 255, 1)";
          ctx.fillRect(bgX, bgY, bgWidth, bgHeight);

          ctx.fillStyle = "black";
          for (const [index, line] of lines.entries()) {
            ctx.fillText(
              line,
              canvas.width / 2,
              englishY + paddingY + index * lineHeight
            );
          }

          ctx.restore();

          currentTopY =
            englishY +
            totalTextHeight +
            paddingY * 2 +
            spacingBetweenTextAndChars;
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
              drawCharacterCell(
                ctx,
                caption,
                currentX,
                rowY,
                rendererSizeMultiplier,
                false
              );
              currentX += cellSize;
            }
          }
        }
      }
    }
  }

  useEffect(() => {
    if (currentTimeRef.current && !overlay.isPlaying) {
      console.log(
        `current time ${overlay.currentTime} | vertical position ${overlay.verticalPosition} | default cell size ${defaultCellSize} | size multiplier ${overlay.sizeMultiplier}`
      );
      const time = Number.parseFloat(currentTimeRef.current.value);
      setOverlayState({ currentTime: time + overlay.lyricOffset });
      handleDrawCanvas(canvasRef.current as HTMLCanvasElement, time);
    }
  }, [
    overlay.currentTime,
    overlay.verticalPosition,
    overlay.sizeMultiplier,
    overlay.isPlaying,
    overlay.lyricOffset,
  ]);

  async function handleLoadVideo() {
    if (!overlay.loadedVideoId) {
      alert("No video ID");
      return;
    }
    const videoId = getVideoIdFromUrl(overlay.loadedVideoId);
    const customSubtitlesResponse = await fetch(
      `https://www.langpal.com.hk/api/subtitles`,
      {
        method: "POST",
        body: JSON.stringify({ youtube_id: videoId, retrieve_backup: true }),
      }
    );
    if (!customSubtitlesResponse.ok) {
      alert("Failed to load video subtitles");
      return;
    }
    const customSubtitles = await customSubtitlesResponse.text();
    setSession({
      ...session,
      srtContent: customSubtitles,
    });
  }

  return (
    <div className="w-full h-[92vh] flex-col font-sans flex items-center text-white bg-red-500">
      <h1>Overlay Test</h1>
      <div className="flex gap-2 w-120 h-8 my-4">
        <input
          type="text"
          className="w-full rounded-2xl p-2 text-black"
          value={overlay.loadedVideoId || ""}
          onChange={(e) => setOverlayState({ loadedVideoId: e.target.value })}
        />
        <button
          type="button"
          className="bg-blue-600 cursor-pointer w-auto hover:bg-blue-700 rounded-2xl p-2 font-semibold"
          onClick={handleLoadVideo}
        >
          Load
        </button>
      </div>

      <div className="flex gap-4 mb-4">
        <button
          className="bg-blue-600 cursor-pointer hover:bg-blue-700 rounded-2xl p-2 font-semibold"
          type="button"
          onClick={handleQuickPreview}
        >
          Quick Preview
        </button>
        <button
          className="bg-black cursor-pointer rounded-2xl p-2 hover:bg-gray-800"
          type="button"
          onClick={() =>
            handleDrawCanvas(
              canvasRef.current as HTMLCanvasElement,
              overlay.currentTime
            )
          }
        >
          Draw Canvas (With Video)
        </button>
      </div>

      <div className="flex flex-col gap-2 w-160">
        <p className="text-sm">Size Multiplier: {overlay.sizeMultiplier}x</p>
        <input
          className="w-full"
          type="range"
          min={0.1}
          max={10}
          step={0.1}
          value={overlay.sizeMultiplier}
          onChange={(e) => {
            setOverlayState({
              sizeMultiplier: Number.parseFloat(e.target.value),
            });
          }}
        />
        <p className="text-sm">Lyric Offset: {overlay.lyricOffset}s </p>
        <input
          className="w-full"
          type="range"
          step={0.5}
          min={-100}
          max={100}
          value={overlay.lyricOffset}
          onChange={(e) => {
            const newValue = Number.parseFloat(e.target.value);
            setOverlayState({ lyricOffset: newValue });
          }}
        />
      </div>

      <div className="flex gap-4 flex-row justify-center items-center relative">
        <div className="flex flex-col gap-2 relative justify-center items-center w-200 h-120 rounded-2xl drop-shadow-md border-2 border-white">
          <video
            ref={previewVideoRef}
            style={{
              display: overlay.previewUrl ? "block" : "none",
            }}
            className="absolute top-0 left-0 w-auto h-120 self-center justify-self-center anchor-center"
            src={overlay.previewUrl || undefined}
            crossOrigin="anonymous"
            controls
          >
            <track kind="captions" src={undefined} />
          </video>
          <canvas
            className="absolute top-0 left-0 w-auto h-120 self-center justify-self-center anchor-center"
            ref={canvasRef}
          />
          <div className="flex flex-col gap-2 w-full absolute bottom-0">
            <p className="text-sm">Time Position: {overlay.currentTime}s </p>
            <input
              className="w-full"
              type="range"
              min={0}
              max={174}
              ref={currentTimeRef}
              value={overlay.currentTime}
              onChange={(e) => {
                const newValue = Number.parseInt(e.target.value);
                setOverlayState({ currentTime: newValue });
              }}
            />
          </div>
        </div>
        <div className="flex flex-col gap-2 rotate-90 absolute right-[-35%] w-[60%]">
          <p className="text-sm">
            Vertical Position (Y-Axis): {overlay.verticalPosition}px
          </p>
          <input
            className="w-full"
            type="range"
            min={0}
            max={3000}
            value={overlay.verticalPosition}
            onChange={(e) => {
              setOverlayState({
                verticalPosition: Number.parseInt(e.target.value),
              });
            }}
          />
        </div>
      </div>
      <div className="flex flex-col gap-4 items-center mt-6">
        <input
          type="file"
          accept="video/*"
          className="text-white"
          onChange={(e) => {
            console.log("File changed");
            const selectedFile = e.target.files?.[0];

            if (overlay.previewUrl) {
              URL.revokeObjectURL(overlay.previewUrl);
            }

            if (!selectedFile) {
              setOverlayState({ file: null });
              setOverlayState({ previewUrl: null });
              setOverlayState({
                videoDimensions: { width: 1920, height: 1080 },
              });
              return;
            }

            setOverlayState({ file: selectedFile });
            const url = URL.createObjectURL(selectedFile);
            setOverlayState({ previewUrl: url });

            const videoElement = document.createElement("video");
            videoElement.src = url;
            videoElement.onloadedmetadata = () => {
              setOverlayState({
                videoDimensions: {
                  width: videoElement.videoWidth,
                  height: videoElement.videoHeight,
                },
              });
              URL.revokeObjectURL(videoElement.src);
              console.log("File set");
            };
            videoElement.load();
          }}
        />
        <div className="flex gap-4">
          <button
            disabled={!overlay.previewUrl}
            className="bg-blue-600 cursor-pointer hover:bg-blue-700 rounded-2xl p-2 font-semibold disabled:bg-gray-600 disabled:cursor-not-allowed"
            type="button"
            onClick={() => {
              if (previewVideoRef.current) {
                if (overlay.isPlaying) {
                  previewVideoRef.current.pause();
                } else {
                  previewVideoRef.current.play();
                }
              }
            }}
          >
            {overlay.isPlaying ? "Pause Preview" : "Play Preview"}
          </button>
          <button
            className="bg-green-600 cursor-pointer hover:bg-green-700 rounded-2xl p-2 font-semibold disabled:bg-gray-600 disabled:cursor-not-allowed"
            type="button"
            onClick={handleUpload}
            disabled={overlay.isLoading || !overlay.file}
          >
            {overlay.isLoading ? "Processing..." : "Process Full Video"}
          </button>
          <button
            type="button"
            className="bg-purple-600 cursor-pointer hover:bg-purple-700 rounded-2xl p-2 font-semibold disabled:bg-gray-600 disabled:cursor-not-allowed"
            onClick={handleDownload}
            disabled={!overlay.outputUrl}
          >
            Download
          </button>
        </div>
      </div>

      <div className="h-160 m-6 w-auto rounded-2xl drop-shadow-md">
        {overlay.outputUrl && (
          <video className="w-full h-full rounded-2xl" ref={videoRef} controls>
            <track kind="captions" src={undefined} />
          </video>
        )}
      </div>
    </div>
  );
}
