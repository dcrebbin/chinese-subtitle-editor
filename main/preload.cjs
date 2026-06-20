import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {
  downloadVideo: (videoId) => ipcRenderer.invoke("download-video", videoId),
});
