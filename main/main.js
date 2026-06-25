import { spawn } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { readFile } from "fs/promises";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { app, BrowserWindow, ipcMain, nativeImage, screen } from "electron";

const isDev = !app.isPackaged;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow;
let serverProcess;

function getResourcePath(...segments) {
  return isDev
    ? path.join(__dirname, "..", ...segments)
    : path.join(process.resourcesPath, ...segments);
}

function exec(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: "inherit" });
    proc.on("error", reject);
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`Exit ${code}`))));
  });
}

async function downloadVideo(videoId) {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const outputDir = path.join(app.getPath("userData"), "downloads");
  mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, `${videoId}.mp4`);
  if (!existsSync(outputPath)) {
    await exec(getResourcePath("youtube", "yt-dlp"), [
      "-f",
      "bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/mp4[height<=1080]",
      "--merge-output-format",
      "mp4",
      "--no-geo-bypass",
      "--no-check-certificate",
      url,
      "-o",
      outputPath,
    ]);
  }

  return readFile(outputPath);
}

ipcMain.handle("download-video", async (_event, videoId) => {
  if (!videoId) {
    throw new Error("No video ID provided");
  }

  return downloadVideo(videoId);
});

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
          res.resume();
          resolve(undefined);
        });
        req.on("error", reject);
      });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw new Error(`Timed out waiting for server at ${url}`);
}

async function startProductionServer() {
  const serverEntry = path.join(
    process.resourcesPath,
    "app.asar.unpacked",
    ".output",
    "server",
    "index.mjs",
  );

  serverProcess = spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: "4310",
      NITRO_PORT: "4310",
      HOST: "127.0.0.1",
    },
    stdio: "inherit",
  });

  await waitForServer("http://127.0.0.1:4310/");
  return "http://127.0.0.1:4310/";
}

async function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  const iconPath = path.join(__dirname, "../public/icon.png");

  mainWindow = new BrowserWindow({
    width,
    height,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#3b82f6",
      symbolColor: "#ffffff",
    },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
    icon: iconPath,
  });

  if (process.platform === "darwin") {
    app.dock.setIcon(nativeImage.createFromPath(iconPath));
  }

  app.setAboutPanelOptions({
    applicationName: "Chinese Subtitle Editor",
    applicationVersion: "0.1.0",
    version: "Build 0.1.0",
    credits: "Created by Langpal話朋",
    copyright: "Copyright © 2025 Langpal話朋",
    website: "https://langpal.com.hk",
    iconPath: iconPath,
  });

  app.setName("Chinese Subtitle Editor");

  const appUrl = isDev ? "http://localhost:3000/" : await startProductionServer();
  await mainWindow.loadURL(appUrl);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app
  .whenReady()
  .then(createWindow)
  .catch((error) => {
    console.error("Failed to create Electron window:", error);
    app.quit();
  });

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on("before-quit", () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});
