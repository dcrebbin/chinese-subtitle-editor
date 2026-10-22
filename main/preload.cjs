import { readFileSync } from "fs";
import path from "path";
import { contextBridge, ipcRenderer, webUtils } from "electron";

function areYoutubeDownloadsEnabled() {
  const runtime = globalThis.process;
  if (!runtime.resourcesPath) {
    return runtime.env.VITE_DOWNLOAD_ENABLED === "true";
  }

  try {
    const configPath = path.join(runtime.resourcesPath, "download-config.json");
    return JSON.parse(readFileSync(configPath, "utf8")).youtubeDownloadsEnabled === true;
  } catch {
    return runtime.env.VITE_DOWNLOAD_ENABLED === "true";
  }
}

contextBridge.exposeInMainWorld("electron", {
  getVideoFilePath: (file) => webUtils.getPathForFile(file),
  showVideoInFinder: (filePath) => ipcRenderer.invoke("show-video-in-finder", filePath),
  ...(areYoutubeDownloadsEnabled()
    ? {
        downloadVideo: (videoId, existingOnly = false) =>
          ipcRenderer.invoke("download-video", videoId, existingOnly),
      }
    : {}),
});
