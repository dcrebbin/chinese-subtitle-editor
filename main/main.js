const { app, BrowserWindow } = require("electron");
const path = require("path");
const prepareNext = require("electron-next");

const isDev = !app.isPackaged;

let mainWindow;

async function createWindow() {
  await prepareNext("./");

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

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
