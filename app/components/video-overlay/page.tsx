"use client";

import { useEffect, useRef } from "react";
import { ALL_FORMATS, BlobSource, BufferTarget, Input, Mp4OutputFormat, Output } from "mediabunny";

import { setOverlayState, useOverlayStore } from "@/app/store/overlay.store";
import { useSessionStore } from "@/app/store/session.store";
import { defaultCellSize } from "../../utilities/constants";
import {
  convertCanvas,
  drawCharacterCell,
  handleDrawCanvas,
  updateTransliterationRows,
} from "../../utilities/rendering";
import { parseSrt, transliterateCaptions } from "../../utilities/srt";
import { retrieveChineseRomanizationMap } from "../../utilities/transliteration/transliteration";
import VideoTabs from "./video-tabs";

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
  const currentTimeRef = useRef<HTMLInputElement>(null);
  const { session, setSession } = useSessionStore();
  const { overlay } = useOverlayStore();
  const output = new Output({
    target: target,
    format: format,
  });

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
    const blob = new Blob([overlay.file ?? ""], {
      type: overlay.file?.type ?? "",
    });
    const blobSource = new BlobSource(blob);
    const input = new Input({ source: blobSource, formats: ALL_FORMATS });

    const ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
    const conversion = await convertCanvas(
      overlay.verticalPosition,
      overlay.sizeMultiplier,
      input,
      output,
      parsedSubtitles,
      ctx,
      overlay.lyricOffset,
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
    setOverlayState({ selectedTab: "render" });
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
        sub.startTime !== null && sub.endTime !== null,
    );

    const subtitle = validSubtitles.find(
      (sub) =>
        overlay.currentTime + overlay.lyricOffset >= sub.startTime &&
        overlay.currentTime + overlay.lyricOffset <= sub.endTime,
    );

    if (subtitle) {
      const cantonese = subtitle.text.split("(yue)")[1]?.split("(en)")[0]?.trim();
      const english = subtitle.text.split("(en)")[1]?.trim();

      if (cantonese) {
        const transliteratedText = transliterateCaptions(cantonese, true, {});
        const transliterationMap = retrieveChineseRomanizationMap(transliteratedText, cantonese);
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
  }

  useEffect(() => {
    if (currentTimeRef.current && !overlay.isPlaying) {
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
    const customSubtitlesResponse = await fetch(`https://www.langpal.com.hk/api/subtitles`, {
      method: "POST",
      body: JSON.stringify({ youtube_id: videoId, retrieve_backup: true }),
    });
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

  const updatePreviewTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  function startUpdatePreview() {
    if (!previewVideoRef.current) return;
    updatePreviewTimeoutRef.current = setTimeout(() => {
      console.log("Drawing video frame with overlay");
      handleDrawCanvas(
        canvasRef.current as HTMLCanvasElement,
        previewVideoRef.current?.currentTime ?? 0,
      );
      startUpdatePreview();
    }, 100);
  }

  function stopUpdatePreview() {
    if (updatePreviewTimeoutRef.current) {
      console.log("Clearing update preview timeout");
      clearTimeout(updatePreviewTimeoutRef.current);
    }
  }

  const videoOverlayContent = (
    <div
      className="flex w-full flex-col gap-4"
      style={{ display: overlay.selectedTab === "editor" ? "flex" : "none" }}
    >
      <div className="my-4 flex h-8 w-full gap-2">
        <input
          type="text"
          className="w-full rounded-2xl bg-white p-2 text-black"
          value={overlay.loadedVideoId || ""}
          onChange={(e) => setOverlayState({ loadedVideoId: e.target.value })}
        />
        <button
          type="button"
          className="w-auto cursor-pointer rounded-2xl bg-blue-600 p-2 font-semibold hover:bg-blue-700"
          onClick={handleLoadVideo}
        >
          Load
        </button>
      </div>
      <div className="mb-4 flex w-full gap-4">
        <button
          className="cursor-pointer rounded-2xl bg-black p-2 hover:bg-gray-800"
          type="button"
          onClick={() => setOverlayState({ isLandscapeMode: !overlay.isLandscapeMode })}
        >
          {overlay.isLandscapeMode ? "Portrait Mode" : "Landscape Mode"}
        </button>
      </div>
      <div className="flex w-full flex-col gap-2">
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
      </div>
      <div className="relative flex h-200 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-white drop-shadow-md">
        <video
          ref={previewVideoRef}
          style={{
            display: overlay.previewUrl ? "block" : "none",
            placeSelf: "anchor-center",
          }}
          preload="auto"
          className="anchor-center absolute top-0 left-0 h-190 w-auto self-center justify-self-center rounded-t-2xl"
          src={overlay.previewUrl || undefined}
          crossOrigin="anonymous"
          onPause={() => {
            setOverlayState({ isPlaying: false });
            stopUpdatePreview();
          }}
          onPlay={() => {
            setOverlayState({ isPlaying: true });
            startUpdatePreview();
          }}
          onTimeUpdate={() => {
            setOverlayState({ currentTime: previewVideoRef.current?.currentTime ?? 0 });
          }}
        >
          <track kind="captions" src={undefined} />
        </video>
        <canvas
          style={{
            placeSelf: "anchor-center",
          }}
          className="anchor-center pointer-events-none absolute top-0 left-0 h-190 w-auto self-center justify-self-center rounded-2xl"
          ref={canvasRef}
        />
        <div className="pointer-events-none absolute bottom-0 flex w-full flex-col gap-2 pt-20">
          <p className="text-sm">Time Position: {overlay.currentTime}s </p>
          <input
            className="pointer-events-auto w-full cursor-pointer"
            type="range"
            min={0}
            step={0.1}
            max={overlay.videoLength}
            ref={currentTimeRef}
            value={overlay.currentTime}
            onChange={(e) => {
              const newValue = Number.parseFloat(e.target.value);
              setOverlayState({ currentTime: newValue });
              if (previewVideoRef.current) {
                previewVideoRef.current.currentTime = newValue;
              }
            }}
          />
        </div>
        <div className="absolute -right-[25%] flex w-[55%] rotate-90 flex-col gap-2">
          <p className="text-sm">Vertical Position (Y-Axis): {overlay.verticalPosition}px</p>
          <input
            className="w-full cursor-pointer"
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
      <div className="mt-6 flex flex-col items-center gap-4">
        <input
          type="file"
          accept="video/*"
          className="cursor-pointer rounded-2xl border-2 border-white p-2 text-white"
          onChange={(e) => {
            console.log("File changed");
            const selectedFile = e.target.files?.[0];

            if (overlay.previewUrl) {
              URL.revokeObjectURL(overlay.previewUrl);
            }

            if (!selectedFile) {
              setOverlayState({
                videoDimensions: { width: 1920, height: 1080 },
                file: null,
                previewUrl: null,
                videoLength: 100,
              });
              return;
            }

            const url = URL.createObjectURL(selectedFile);
            setOverlayState({ previewUrl: url, file: selectedFile });

            const videoElement = document.createElement("video");
            videoElement.src = url;

            videoElement.onloadedmetadata = () => {
              setOverlayState({
                videoLength: videoElement.duration,
                videoDimensions: {
                  width: videoElement.videoWidth,
                  height: videoElement.videoHeight,
                },
              });
              console.log("File set");
              videoElement.remove();
            };
          }}
        />
        <div className="flex gap-4">
          <button
            disabled={!overlay.previewUrl}
            className="cursor-pointer rounded-2xl bg-blue-600 p-2 font-semibold hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-600"
            type="button"
            onClick={() => {
              if (previewVideoRef.current) {
                if (overlay.isPlaying) {
                  setOverlayState({ isPlaying: false });
                  previewVideoRef.current.pause();
                } else {
                  setOverlayState({ isPlaying: true });
                  previewVideoRef.current.play();
                }
              }
            }}
          >
            {overlay.isPlaying ? "Pause Preview" : "Play Preview"}
          </button>
          <button
            className="cursor-pointer rounded-2xl bg-green-600 p-2 font-semibold hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-600"
            type="button"
            onClick={handleUpload}
            disabled={overlay.isLoading || !overlay.file}
          >
            {overlay.isLoading ? "Processing..." : "Process Full Video"}
          </button>
          <button
            type="button"
            className="cursor-pointer rounded-2xl bg-purple-600 p-2 font-semibold hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-gray-600"
            onClick={handleDownload}
            disabled={!overlay.outputUrl}
          >
            Download
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-[92vh] w-full flex-col items-center bg-red-500 font-sans text-white">
      <VideoTabs />
      {videoOverlayContent}
      <div
        className="m-6 flex h-340 w-full flex-col items-center justify-start gap-2 bg-black drop-shadow-md"
        style={{ opacity: overlay.selectedTab === "render" ? 1 : 0 }}
      >
        {overlay.outputUrl && (
          <video className="h-190 w-auto rounded-2xl" ref={videoRef} controls>
            <track kind="captions" src={undefined} />
          </video>
        )}
        <button
          type="button"
          className="cursor-pointer rounded-2xl bg-purple-600 p-2 font-semibold hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-gray-600"
          onClick={handleDownload}
          disabled={!overlay.outputUrl}
        >
          Download
        </button>
      </div>
    </div>
  );
}
