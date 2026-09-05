"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  scaleBackgroundImageOffsetY,
  updateTransliterationRows,
} from "../../utilities/rendering";
import { getSubtitleAtTime, parseSrt, transliterateCaptions } from "../../utilities/srt";
import { retrieveChineseRomanizationMap } from "../../utilities/transliteration/transliteration";
import { getClampedVideoCrop } from "../../utilities/video-crop";
import { loadSrtFromLocalStorage } from "../../utilities/video-storage";
import Loading from "../common/loading";
import VideoTabs from "./video-tabs";

const youtubeDownloadsEnabled = import.meta.env.VITE_DOWNLOAD_ENABLED === "true";

export async function retrieveCustomSubtitles(videoId: string) {
  const savedSubtitles = loadSrtFromLocalStorage(videoId);
  if (savedSubtitles !== null) {
    return savedSubtitles;
  }

  const customSubtitlesResponse = await fetch("/api/subtitles", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ youtube_id: videoId, retrieve_backup: true }),
  });
  if (!customSubtitlesResponse.ok) {
    alert("Failed to load video subtitles");
    return;
  }
  const customSubtitles = await customSubtitlesResponse.text();
  if (!customSubtitles) {
    alert("Failed to load video subtitles");
    return;
  }
  return customSubtitles;
}

declare global {
  interface Window {
    electron?: {
      downloadVideo?: (videoId: string) => Promise<ArrayBuffer>;
    };
  }
}

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

export function getVideoIdFromUrl(videoUrl: string) {
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
  const backgroundPreviewRef = useRef<HTMLDivElement>(null);
  const hasAttemptedAutoDownload = useRef(false);
  const { overlay } = useOverlayStore();
  const [previewHeight, setPreviewHeight] = useState(0);
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
    setOverlayState({ selectedTab: "render", outputUrl: url, isLoading: false });
  }

  useEffect(() => {
    if (videoRef.current) {
      console.log("Setting video source");
      videoRef.current.src = overlay.outputUrl || "";
      videoRef.current.onloadedmetadata = () => {
        console.log("Metadata loaded");
        videoRef.current?.play();
      };
      videoRef.current.load();
    }
  }, [overlay.outputUrl]);

  useEffect(() => {
    const element = backgroundPreviewRef.current;
    if (!element) {
      return;
    }

    const updatePreviewHeight = () => {
      setPreviewHeight(element.clientHeight);
    };

    updatePreviewHeight();

    const resizeObserver = new ResizeObserver(updatePreviewHeight);
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, [overlay.selectedTab, overlay.isLandscapeMode]);

  const handleDownloadVideo = useCallback(async () => {
    if (!overlay.downloadVideoId) {
      alert("No video ID");
      return;
    }
    setOverlayState({ videoIsDownloading: true });
    const videoId = overlay.downloadVideoId.includes("https://www.youtube.com/watch?v=")
      ? getVideoIdFromUrl(overlay.downloadVideoId)
      : overlay.downloadVideoId;

    try {
      const electronVideo = await window.electron?.downloadVideo?.(videoId);
      let blob: Blob;
      if (electronVideo) {
        blob = new Blob([electronVideo], { type: "video/mp4" });
      } else {
        const response = await fetch("/api/download", {
          method: "POST",
          body: JSON.stringify({ videoId: videoId }),
        });

        if (!response.ok) {
          alert("Failed to download video");
          return;
        }

        blob = await response.blob();
      }
      const url = URL.createObjectURL(blob);
      setOverlayState({
        previewUrl: url,
        file: new File([blob], "downloaded.mp4", { type: "video/mp4" }),
      });
      setSessionState({ videoId });

      if (previewVideoRef.current) {
        previewVideoRef.current.src = url;
        // Wait until metadata is loaded, then play to fix potential load timing issues
        previewVideoRef.current.onloadedmetadata = () => {
          previewVideoRef.current?.play();
          const videoHeight = previewVideoRef.current?.videoHeight || 1;
          const videoCrop = getClampedVideoCrop(
            overlay.videoCropTop,
            overlay.videoCropBottom,
            videoHeight,
          );
          setOverlayState({
            videoLength: previewVideoRef.current?.duration || 0,
            startTime: 0,
            endTime: previewVideoRef.current?.duration || 0,
            videoDimensions: {
              width: previewVideoRef.current?.videoWidth || 1,
              height: videoHeight,
            },
            videoCropTop: videoCrop.top,
            videoCropBottom: videoCrop.bottom,
          });
        };
        previewVideoRef.current.load();
      }
    } catch (error) {
      console.error("Error processing downloaded video:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      alert(`An error occurred while processing the downloaded video.\n\n${message}`);
    } finally {
      setOverlayState({ videoIsDownloading: false });
    }
  }, [overlay.downloadVideoId, overlay.videoCropBottom, overlay.videoCropTop]);

  useEffect(() => {
    if (!youtubeDownloadsEnabled) {
      return;
    }
    if (hasAttemptedAutoDownload.current) {
      return;
    }
    if (!overlay.downloadVideoId?.trim() || overlay.previewUrl) {
      return;
    }

    hasAttemptedAutoDownload.current = true;
    void handleDownloadVideo();
  }, [overlay.downloadVideoId, overlay.previewUrl, handleDownloadVideo]);

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
      void handleDrawCanvas(
        canvasRef.current as HTMLCanvasElement,
        currentSubtitle ?? null,
        time + overlay.lyricOffset,
      );
    }
  }, [
    overlay.currentTime,
    overlay.verticalPosition,
    overlay.sizeMultiplier,
    overlay.transliterationEnabled,
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
    const videoId = overlay.loadedVideoId.includes("https://www.youtube.com/watch?v=")
      ? getVideoIdFromUrl(overlay.loadedVideoId)
      : overlay.loadedVideoId;
    const customSubtitles = await retrieveCustomSubtitles(videoId);
    if (!customSubtitles) {
      setSessionState({ isLoading: false });
      alert("Failed to load video subtitles");
      return;
    }
    setSession({
      ...session,
      videoId,
      srtContent: customSubtitles,
      originalSrtContent: customSubtitles,
      isLoading: false,
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
      void handleDrawCanvas(
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

  const scaledBackgroundOffsetY = scaleBackgroundImageOffsetY(
    overlay.backgroundImageOffsetY,
    previewHeight,
    overlay.isLandscapeMode,
  );
  const backgroundPosition = overlay.isLandscapeMode
    ? `center calc(50% + ${scaledBackgroundOffsetY}px)`
    : `center ${scaledBackgroundOffsetY}px`;
  const scaledTopBackgroundOffsetY = scaleBackgroundImageOffsetY(
    overlay.doubleBackgroundImageOffsetY.image1,
    previewHeight,
    overlay.isLandscapeMode,
  );
  const scaledBottomBackgroundOffsetY = scaleBackgroundImageOffsetY(
    overlay.doubleBackgroundImageOffsetY.image2,
    previewHeight,
    overlay.isLandscapeMode,
  );
  const sourceVideoHeight = Math.max(1, overlay.videoDimensions.height);
  const videoCrop = getClampedVideoCrop(
    overlay.videoCropTop,
    overlay.videoCropBottom,
    sourceVideoHeight,
  );
  const videoCropTopPercent = (videoCrop.top / sourceVideoHeight) * 100;
  const videoCropBottomPercent = (videoCrop.bottom / sourceVideoHeight) * 100;

  const videoOverlayContent = (
    <div className="flex h-full w-full flex-col gap-4">
      <div className="my-4 flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap">
        {youtubeDownloadsEnabled && (
          <div className="flex w-full min-w-0 gap-2 sm:flex-1">
            <input
              type="text"
              className="min-w-0 flex-1 rounded-2xl bg-white p-2 text-black"
              value={overlay.downloadVideoId || ""}
              onChange={(e) => {
                setOverlayState({ downloadVideoId: e.target.value });
              }}
            />
            <button
              type="button"
              className="shrink-0 cursor-pointer rounded-2xl bg-blue-600 p-2 font-semibold hover:bg-blue-700"
              onClick={handleDownloadVideo}
              disabled={overlay.downloadVideoId === ""}
            >
              Download
            </button>
          </div>
        )}
        <div className="flex w-full min-w-0 gap-2 sm:flex-1">
          <input
            type="text"
            className="min-w-0 flex-1 rounded-2xl bg-white p-2 text-black"
            value={overlay.loadedVideoId || ""}
            onChange={(e) => {
              setOverlayState({ loadedVideoId: e.target.value });
            }}
          />
          <button
            type="button"
            className="shrink-0 cursor-pointer rounded-2xl bg-blue-600 p-2 font-semibold hover:bg-blue-700"
            onClick={handleLoadVideo}
            disabled={overlay.loadedVideoId === ""}
          >
            Load
          </button>
        </div>
      </div>
      <div className="mb-4 flex w-full flex-col flex-wrap gap-2 sm:flex-row sm:gap-4">
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
                videoRef.current.style.width = "100%";
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
          <option value="double-image">Double Image</option>
        </select>
        {overlay.backgroundMode === "full-image" && (
          <input
            type="file"
            className="w-fit rounded-2xl bg-white p-2 text-black"
            accept="image/*"
            onChange={(e) => {
              const selectedFile = e.target.files?.[0];
              if (selectedFile) {
                const url = URL.createObjectURL(selectedFile);
                setOverlayState({ backgroundImage: url });
              }
            }}
          />
        )}
        {overlay.backgroundMode === "double-image" && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="flex items-center gap-2 text-sm">
              Top image
              <input
                type="file"
                className="w-fit rounded-2xl bg-white p-2 text-black"
                accept="image/*"
                onChange={(e) => {
                  const selectedFile = e.target.files?.[0];
                  if (selectedFile) {
                    setOverlayState({
                      doubleBackgroundImage: {
                        ...overlay.doubleBackgroundImage,
                        image1: URL.createObjectURL(selectedFile),
                      },
                    });
                  }
                }}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              Bottom image
              <input
                type="file"
                className="w-fit rounded-2xl bg-white p-2 text-black"
                accept="image/*"
                onChange={(e) => {
                  const selectedFile = e.target.files?.[0];
                  if (selectedFile) {
                    setOverlayState({
                      doubleBackgroundImage: {
                        ...overlay.doubleBackgroundImage,
                        image2: URL.createObjectURL(selectedFile),
                      },
                    });
                  }
                }}
              />
            </label>
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
      <div className="grid w-full gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Crop video top: {videoCrop.top}px
          <input
            className="w-full disabled:cursor-not-allowed disabled:opacity-50"
            type="range"
            min={0}
            max={Math.max(0, sourceVideoHeight - videoCrop.bottom - 1)}
            step={1}
            value={videoCrop.top}
            disabled={!overlay.previewUrl}
            onChange={(e) => {
              setOverlayState({ videoCropTop: Number.parseInt(e.target.value) });
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Crop video bottom: {videoCrop.bottom}px
          <input
            className="w-full disabled:cursor-not-allowed disabled:opacity-50"
            type="range"
            min={0}
            max={Math.max(0, sourceVideoHeight - videoCrop.top - 1)}
            step={1}
            value={videoCrop.bottom}
            disabled={!overlay.previewUrl}
            onChange={(e) => {
              setOverlayState({ videoCropBottom: Number.parseInt(e.target.value) });
            }}
          />
        </label>
      </div>
      <label className="flex w-full cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={overlay.transliterationEnabled}
          onChange={(e) => {
            setOverlayState({ transliterationEnabled: e.target.checked });
          }}
        />
        Include transliteration in output
      </label>
      <div
        className="relative mx-0 flex w-full max-w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-white drop-shadow-md sm:mx-4"
        style={{
          display: overlay.selectedTab === "editor" ? "flex" : "none",
        }}
      >
        <div
          className={`relative w-full overflow-hidden rounded-2xl border-2 border-white ${
            overlay.isLandscapeMode
              ? "aspect-video max-w-full xl:max-w-[56rem]"
              : "aspect-[9/16] max-w-[min(100%,22rem)] xl:max-w-[22rem]"
          }`}
        >
          <div
            ref={backgroundPreviewRef}
            className="absolute h-full w-full"
            style={{
              backgroundSize: "cover",
              backgroundPosition,
              backgroundRepeat: "no-repeat",
              backgroundImage:
                overlay.backgroundMode === "full-image"
                  ? `url(${overlay.backgroundImage})`
                  : "none",
              backgroundColor:
                overlay.backgroundMode === "colour" ? overlay.colour || "#000000" : "transparent",
            }}
          >
            {overlay.backgroundMode === "double-image" && (
              <>
                <div
                  className="absolute top-0 left-0 h-1/2 w-full bg-cover bg-center bg-no-repeat"
                  style={{
                    backgroundImage: overlay.doubleBackgroundImage.image1
                      ? `url(${overlay.doubleBackgroundImage.image1})`
                      : "none",
                    backgroundPosition: `center calc(50% + ${scaledTopBackgroundOffsetY}px)`,
                  }}
                />
                <div
                  className="absolute bottom-0 left-0 h-1/2 w-full bg-cover bg-center bg-no-repeat"
                  style={{
                    backgroundImage: overlay.doubleBackgroundImage.image2
                      ? `url(${overlay.doubleBackgroundImage.image2})`
                      : "none",
                    backgroundPosition: `center calc(50% + ${scaledBottomBackgroundOffsetY}px)`,
                  }}
                />
              </>
            )}
            <video
              ref={previewVideoRef}
              style={{
                display: overlay.previewUrl ? "block" : "none",
                placeSelf: overlay.videoPosition === "center" ? "anchor-center" : "auto",
                width: "100%",
                maxWidth: "100%",
                marginTop: overlay.videoPosition === "top" ? "0" : "50%",
                clipPath: `inset(${videoCropTopPercent}% 0 ${videoCropBottomPercent}% 0)`,
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
            className="anchor-center pointer-events-none absolute top-0 left-0 h-full w-full self-center justify-self-center"
            ref={canvasRef}
          />
        </div>
        <div className="pointer-events-none absolute bottom-0 flex w-full flex-row justify-start gap-2">
          <div className="flex w-full flex-col gap-2 pt-20">
            <div className="flex flex-row justify-start gap-2">
              <p className="w-full max-w-xs rounded-2xl bg-black/80 p-2 text-base font-bold sm:w-52 sm:p-4 sm:text-xl">
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
        <div className="pointer-events-none absolute top-0 left-0 flex justify-start">
          <button
            type="button"
            className="pointer-events-auto m-2 flex w-42 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-white bg-black/50 p-2 text-white backdrop-blur-md"
            onClick={() => inputFileRef.current?.click()}
          >
            <p className="text-sm font-bold">Upload Video</p>
            <ArrowUpCircleIcon className="h-6 w-6" />
          </button>
          <button
            type="button"
            className="pointer-events-auto m-2 flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-white bg-black/50 p-2 text-white backdrop-blur-md"
            onClick={() => {
              setOverlayState({
                selectedTab: overlay.selectedTab === "editor" ? "render" : "editor",
              });
            }}
          >
            <p className="text-sm font-bold">Render</p>
            <PlayIcon className="h-6 w-6" />
          </button>
        </div>
        {overlay.backgroundMode === "full-image" && (
          <div>
            <p
              className="absolute top-1/3 right-10 hidden text-xs whitespace-nowrap sm:block"
              style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
            >
              Background Y Offset: {overlay.backgroundImageOffsetY}px
            </p>
            <div className="pointer-events-none absolute top-1/2 right-14 hidden h-[50%] w-6 -translate-y-1/2 flex-col items-center justify-center gap-2 sm:flex">
              <input
                className="vertical-slider pointer-events-auto h-6 w-156 cursor-pointer"
                style={{
                  transform: "rotate(90deg)",
                  accentColor: "#3182ce",
                  marginTop: "100px",
                  marginBottom: "100px",
                }}
                type="range"
                min={0}
                max={3000}
                step={1}
                value={overlay.backgroundImageOffsetY}
                onChange={(e) => {
                  setOverlayState({
                    backgroundImageOffsetY: Number.parseInt(e.target.value),
                  });
                }}
              />
            </div>
          </div>
        )}
        {overlay.backgroundMode === "double-image" && (
          <div className="pointer-events-auto absolute top-2 right-2 z-20 flex w-48 flex-col gap-3 rounded-xl bg-black/70 p-3 text-xs">
            <label className="flex flex-col gap-1">
              Top image Y: {overlay.doubleBackgroundImageOffsetY.image1}px
              <input
                type="range"
                min={-1500}
                max={1500}
                step={1}
                value={overlay.doubleBackgroundImageOffsetY.image1}
                onChange={(e) =>
                  setOverlayState({
                    doubleBackgroundImageOffsetY: {
                      ...overlay.doubleBackgroundImageOffsetY,
                      image1: Number.parseInt(e.target.value),
                    },
                  })
                }
              />
            </label>
            <label className="flex flex-col gap-1">
              Bottom image Y: {overlay.doubleBackgroundImageOffsetY.image2}px
              <input
                type="range"
                min={-1500}
                max={1500}
                step={1}
                value={overlay.doubleBackgroundImageOffsetY.image2}
                onChange={(e) =>
                  setOverlayState({
                    doubleBackgroundImageOffsetY: {
                      ...overlay.doubleBackgroundImageOffsetY,
                      image2: Number.parseInt(e.target.value),
                    },
                  })
                }
              />
            </label>
          </div>
        )}
        <div>
          <p
            className="absolute top-1/3 right-0 hidden text-xs whitespace-nowrap sm:block"
            style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
          >
            Vertical Position (Y): {overlay.verticalPosition}px
          </p>
          <div className="pointer-events-none absolute top-1/2 right-4 hidden h-[50%] w-6 -translate-y-1/2 flex-col items-center justify-center gap-2 sm:flex">
            <input
              className="vertical-slider pointer-events-auto h-6 w-156 cursor-pointer"
              style={{
                transform: "rotate(90deg)",
                accentColor: "#3182ce",
                marginTop: "100px",
                marginBottom: "100px",
              }}
              type="range"
              min={0}
              max={3000}
              step={1}
              value={overlay.verticalPosition}
              onChange={(e) => {
                setOverlayState({
                  verticalPosition: Number.parseInt(e.target.value),
                });
              }}
            />
          </div>
        </div>
      </div>
      <div
        className="relative mx-0 flex min-h-138 w-full max-w-full flex-col items-center justify-start gap-1 rounded-2xl border-2 border-white drop-shadow-md"
        style={{ display: overlay.selectedTab === "render" ? "flex" : "none" }}
      >
        <div className="pointer-events-none absolute top-0 left-0 z-10 flex justify-start">
          <button
            type="button"
            className="pointer-events-auto m-2 flex w-42 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-white bg-black/50 p-2 text-white backdrop-blur-md"
            onClick={handleDownload}
          >
            <p className="text-sm font-bold">Download Video</p>
            <ArrowDownCircleIcon className="h-6 w-6" />
          </button>
          <button
            type="button"
            className="pointer-events-auto m-2 flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-white bg-black/50 p-2 text-white backdrop-blur-md"
            onClick={() => {
              setOverlayState({
                selectedTab: overlay.selectedTab === "editor" ? "render" : "editor",
              });
            }}
          >
            <p className="text-sm font-bold">Editor</p>
            <PencilIcon className="h-6 w-6" />{" "}
          </button>
        </div>
        {overlay.outputUrl && (
          <video
            className="relative z-0 h-140 w-full max-w-full rounded-2xl"
            ref={videoRef}
            controls
          >
            <track kind="captions" src={undefined} />
          </video>
        )}
      </div>
      <div className="flex flex-col items-center">
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
              const videoCrop = getClampedVideoCrop(
                overlay.videoCropTop,
                overlay.videoCropBottom,
                videoElement.videoHeight,
              );
              setOverlayState({
                videoLength: videoElement.duration,
                startTime: 0,
                endTime: videoElement.duration,
                videoDimensions: {
                  width: videoElement.videoWidth,
                  height: videoElement.videoHeight,
                },
                videoCropTop: videoCrop.top,
                videoCropBottom: videoCrop.bottom,
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
        <div className="flex w-full flex-col flex-wrap items-center justify-center gap-1 sm:flex-row">
          <div className="flex flex-row items-center justify-center gap-2">
            <p className="text-sm font-bold">{formatTime(overlay.startTime)}s</p>
            <button
              type="button"
              className="cursor-pointer rounded-2xl bg-blue-600 p-2 font-semibold hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-600"
              onClick={() => {
                setOverlayState({ startTime: overlay.currentTime });
              }}
            >
              <p className="text-sm font-bold">Set</p>
            </button>
          </div>
          <div className="flex flex-row items-center justify-center gap-2">
            <p className="text-sm font-bold">{formatTime(overlay.endTime)}s</p>
            <button
              type="button"
              className="cursor-pointer rounded-2xl bg-blue-600 p-2 font-semibold hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-600"
              onClick={() => {
                setOverlayState({ endTime: overlay.currentTime });
              }}
            >
              <p className="text-sm font-bold">Set</p>
            </button>
          </div>
        </div>
        <div className="flex flex-wrap justify-center gap-4">
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
    <div className="relative flex h-full min-h-0 w-full flex-col items-center overflow-y-auto rounded-3xl border-2 border-white/50 bg-black/50 p-2 font-sans text-white backdrop-blur-xs xl:p-4">
      {overlay.isLoading || (overlay.videoIsDownloading && <Loading />)}
      {videoOverlayContent}
    </div>
  );
}
