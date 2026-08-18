import { readFileSync } from "fs";
import path from "path";
import { contextBridge, ipcRenderer } from "electron";

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

contextBridge.exposeInMainWorld(
  "electron",
  areYoutubeDownloadsEnabled()
    ? { downloadVideo: (videoId) => ipcRenderer.invoke("download-video", videoId) }
    : {},
);
