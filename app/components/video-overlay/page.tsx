"use client";

import { useEffect, useRef } from "react";
import {
  ArrowDownCircleIcon,
  ArrowUpCircleIcon,
  PauseCircleIcon,
  PencilIcon,
  PlayIcon,
} from "@heroicons/react/24/solid";
import { ALL_FORMATS, BlobSource, BufferTarget, Input, Mp4OutputFormat, Output } from "mediabunny";

import { setOverlayState, useOverlayStore } from "@/app/store/overlay.store";
import { setSessionState, useSessionStore } from "@/app/store/session.store";
import { defaultCellSize } from "../../utilities/constants";
import {
  convertCanvas,
  drawCharacterCell,
  handleDrawCanvas,
  updateTransliterationRows,
} from "../../utilities/rendering";
import { getSubtitleAtTime, parseSrt, transliterateCaptions } from "../../utilities/srt";
import { retrieveChineseRomanizationMap } from "../../utilities/transliteration/transliteration";
import VideoTabs from "./video-tabs";

function formatTime(time: number) {
  const minutes = Math.floor((time % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(time % 60)
    .toString()
    .padStart(2, "0");
  const milliseconds = Math.floor((time % 1) * 100)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}.${milliseconds}`;
}

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
  const inputFileRef = useRef<HTMLInputElement>(null);
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

  useEffect(() => {
    if (currentTimeRef.current && !overlay.isPlaying) {
      const time = Number.parseFloat(currentTimeRef.current.value);
      setOverlayState({ currentTime: time + overlay.lyricOffset });
      const currentSubtitle = getSubtitleAtTime(
        session.parsedSubtitles,
        time + overlay.lyricOffset,
      );
      handleDrawCanvas(
        canvasRef.current as HTMLCanvasElement,
        currentSubtitle ?? null,
        time + overlay.lyricOffset,
      );
    }
  }, [
    overlay.currentTime,
    overlay.verticalPosition,
    overlay.sizeMultiplier,
    overlay.isPlaying,
    overlay.lyricOffset,
    session.parsedSubtitles,
  ]);

  async function handleLoadVideo() {
    if (!overlay.loadedVideoId || overlay.loadedVideoId === "") {
      alert("No video ID");
      return;
    }
    setSessionState({
      ...session,
      isLoading: true,
    });
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
      const currentSubtitle = getSubtitleAtTime(
        session.parsedSubtitles,
        previewVideoRef.current?.currentTime ?? 0,
      );
      handleDrawCanvas(
        canvasRef.current as HTMLCanvasElement,
        currentSubtitle,
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
    <div className="flex w-full flex-col gap-4">
      <div className="my-4 flex h-8 w-full gap-2">
        <input
          type="text"
          className="w-full rounded-2xl bg-white p-2 text-black"
          value={overlay.loadedVideoId || ""}
          onChange={(e) => {
            setOverlayState({ loadedVideoId: e.target.value });
          }}
        />
        <button
          type="button"
          className="w-auto cursor-pointer rounded-2xl bg-blue-600 p-2 font-semibold hover:bg-blue-700"
          onClick={handleLoadVideo}
          disabled={overlay.loadedVideoId === ""}
        >
          Load
        </button>
      </div>
      <div className="mb-4 flex w-full gap-4">
        <button
          className="cursor-pointer rounded-2xl bg-black p-2 hover:bg-gray-800"
          type="button"
          onClick={() => {
            setOverlayState({ isLandscapeMode: !overlay.isLandscapeMode });
            if (canvasRef.current && videoRef.current) {
              if (overlay.isLandscapeMode) {
                canvasRef.current.width = 1080;
                canvasRef.current.height = 1920;
                videoRef.current.style.width = "100%";
              } else {
                canvasRef.current.width = 1920;
                canvasRef.current.height = 1080;
                videoRef.current.style.width = "450px";
              }
            }
          }}
        >
          {overlay.isLandscapeMode ? "Portrait Mode" : "Landscape Mode"}
        </button>
        <select
          className="w-fit rounded-2xl bg-white p-2 text-black"
          value={overlay.backgroundMode}
          onChange={(e) => {
            setOverlayState({
              backgroundMode: e.target.value as "colour" | "full-image" | "double-image",
            });
          }}
        >
          <option value="colour">Colour</option>
          <option value="full-image">Full Image</option>
        </select>
        {overlay.backgroundMode === "full-image" && (
          <div className="flex flex-col gap-2">
            <p className="text-sm">Background Image:</p>
            <input
              type="file"
              accept="image/*"
              className="w-full rounded-2xl bg-white p-2 text-black"
              onChange={(e) => {
                const backgroundImage = URL.createObjectURL(e.target.files?.[0] as Blob);
                setOverlayState({
                  backgroundImage: backgroundImage,
                });
              }}
            />
          </div>
        )}
        {overlay.backgroundMode === "colour" && (
          <input
            type="color"
            className="h-10 w-32 cursor-pointer rounded-2xl bg-white p-1 text-black"
            value={overlay.colour || "#000000"}
            onChange={(e) => {
              setOverlayState({ colour: e.target.value });
            }}
          />
        )}
        {!overlay.isLandscapeMode && (
          <select
            className="w-fit rounded-2xl bg-white p-2 text-black"
            value={overlay.videoPosition || "center"}
            onChange={(e) => {
              setOverlayState({ videoPosition: e.target.value as "top" | "center" | "bottom" });
            }}
          >
            <option value="top">Top</option>
            <option value="center">Center</option>
          </select>
        )}
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
      <div
        className="relative mx-4 flex h-[40rem] w-[full] flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-white drop-shadow-md"
        style={{
          display: overlay.selectedTab === "editor" ? "flex" : "none",
        }}
      >
        <div
          className="relative h-full overflow-hidden rounded-2xl border-2 border-white"
          style={{ width: overlay.isLandscapeMode ? "100vw" : "450px" }}
        >
          <div
            className="absolute h-full w-full"
            style={{
              backgroundSize: "cover",
              backgroundPosition: overlay.isLandscapeMode ? "center" : "top",
              backgroundRepeat: "no-repeat",
              backgroundImage:
                overlay.backgroundMode === "full-image"
                  ? `url(${overlay.backgroundImage})`
                  : "none",
              backgroundColor:
                overlay.backgroundMode === "colour" ? overlay.colour || "#000000" : "transparent",
            }}
          >
            <video
              ref={previewVideoRef}
              style={{
                display: overlay.previewUrl ? "block" : "none",
                placeSelf: overlay.videoPosition === "center" ? "anchor-center" : "auto",
                width: overlay.isLandscapeMode ? "auto" : "500px",
              }}
              preload="auto"
              className="absolute top-0 left-0 h-auto w-auto self-center justify-self-center"
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
          </div>
          <canvas
            style={{
              placeSelf: "anchor-center",
            }}
            className="anchor-center pointer-events-none absolute top-0 left-0 h-190 w-[100h] self-center justify-self-center"
            ref={canvasRef}
          />
        </div>
        <div className="absolute bottom-0 flex w-full flex-row justify-start gap-2">
          <div className="pointer-events-none flex w-full flex-col gap-2 pt-20">
            <div className="flex flex-row justify-start gap-2">
              <p className="w-52 rounded-2xl bg-black/80 p-4 text-xl font-bold">
                Time: {formatTime(overlay.currentTime)}s{" "}
              </p>
              <button
                disabled={!overlay.previewUrl}
                className="pointer-events-auto cursor-pointer rounded-2xl bg-blue-600 p-2 font-semibold hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-600"
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
                {overlay.isPlaying ? (
                  <PauseCircleIcon className="h-6 w-10" />
                ) : (
                  <PlayIcon className="h-6 w-10" />
                )}
              </button>
            </div>
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
        </div>
        <div className="absolute top-0 left-0 flex justify-start">
          <button
            type="button"
            className="m-2 flex w-40 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-white p-2 text-white"
            onClick={() => inputFileRef.current?.click()}
          >
            <p className="text-sm">Upload Video</p>
            <ArrowUpCircleIcon className="h-6 w-6" />
          </button>
          <button
            type="button"
            className="m-2 flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-white p-2 text-white"
            onClick={() => {
              setOverlayState({
                selectedTab: overlay.selectedTab === "editor" ? "render" : "editor",
              });
            }}
          >
            <p className="text-sm">Render</p>
            <PlayIcon className="h-6 w-6" />
          </button>
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
      <div
        className="mx-4 flex h-[40rem] w-auto flex-col items-center justify-start gap-2 rounded-2xl border-2 border-white drop-shadow-md"
        style={{ display: overlay.selectedTab === "render" ? "flex" : "none" }}
      >
        <div className="absolute top-0 left-0 z-[999] flex justify-start">
          <button
            type="button"
            className="m-2 flex w-40 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-white p-2 text-white"
            onClick={handleDownload}
          >
            <p className="text-sm">Download Video</p>
            <ArrowDownCircleIcon className="h-6 w-6" />
          </button>
          <button
            type="button"
            className="m-2 flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-white p-2 text-white"
            onClick={() => {
              setOverlayState({
                selectedTab: overlay.selectedTab === "editor" ? "render" : "editor",
              });
            }}
          >
            <p className="text-sm">Editor</p>
            <PencilIcon className="h-6 w-6" />{" "}
          </button>
        </div>
        {overlay.outputUrl && (
          <video
            className="h-[40rem] w-auto rounded-2xl border-2 border-white"
            ref={videoRef}
            controls
          >
            <track kind="captions" src={undefined} />
          </video>
        )}
      </div>
      <div className="mt-6 flex flex-col items-center gap-4">
        <input
          ref={inputFileRef}
          type="file"
          accept="video/*"
          className="hidden"
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
              setSession({
                ...session,
                video: previewVideoRef.current,
              });
              console.log("File set");
              videoElement.remove();
            };
          }}
        />
        <div className="flex gap-4">
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
            className="cursor-pointer rounded-2xl bg-red-600 p-2 font-semibold hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-600"
            onClick={() => setOverlayState({ previewUrl: null, file: null, videoLength: 100 })}
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="z-20 flex h-[90vh] w-full flex-col items-center rounded-3xl border-2 border-white/50 bg-black/50 p-2 font-sans text-white backdrop-blur-xs">
      {videoOverlayContent}
    </div>
  );
}
