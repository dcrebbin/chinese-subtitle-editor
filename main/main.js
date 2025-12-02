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
