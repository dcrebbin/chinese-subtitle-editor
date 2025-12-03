import path from "path";
import { app, BrowserWindow, nativeImage, screen } from "electron";
import prepareNext from "electron-next";

const isDev = !app.isPackaged;

let mainWindow;

async function createWindow() {
  await prepareNext("./");

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  const iconPath = path.join(path.dirname(new URL(import.meta.url).pathname), "../public/icon.png");

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
      preload: path.join(path.dirname(new URL(import.meta.url).pathname), "preload.js"),
    },
    icon: iconPath,
  });

  if (process.platform === "darwin") {
    app.dock.setIcon(nativeImage.createFromPath(iconPath));
  }

  app.setAboutPanelOptions({
    applicationName: "Chinese Subtitle Editor",
    applicationVersion: "0.1.0",
    version: "Build 0.1.0", // Optional: Build number
    credits: "Created by Langpal話朋",
    copyright: "Copyright © 2025 Langpal話朋",
    website: "https://langpal.com.hk",
    iconPath: iconPath,
  });

  app.setName("Chinese Subtitle Editor");

  const url = isDev
    ? "http://localhost:8000/"
    : `file://${path.join(__dirname, "../out/index.html")}`;

  mainWindow.loadURL(url);

  if (isDev) {
    // mainWindow.webContents.openDevTools();
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.on("ready", createWindow);

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
