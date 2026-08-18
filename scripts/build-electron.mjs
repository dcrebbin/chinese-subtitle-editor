import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";

const youtubeDownloadsEnabled =
  process.argv.includes("--downloads") || process.env.VITE_DOWNLOAD_ENABLED === "true";
const buildDirectory = ".electron-build";
const environment = {
  ...process.env,
  VITE_DOWNLOAD_ENABLED: String(youtubeDownloadsEnabled),
};

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: environment,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("close", (code) => {
      code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

await mkdir(buildDirectory, { recursive: true });
await writeFile(
  `${buildDirectory}/download-config.json`,
  `${JSON.stringify({ youtubeDownloadsEnabled })}\n`,
);

try {
  await run("npx", ["vite", "build"]);
  await run("npx", ["electron-builder", "--config", "electron-builder.config.cjs"]);
} finally {
  await rm(buildDirectory, { recursive: true, force: true });
}
