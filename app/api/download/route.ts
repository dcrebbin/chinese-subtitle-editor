import { spawn } from "node:child_process";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";

function exec(cmd: string, args: string[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: "inherit" });
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`Exit ${code}`))));
  });
}

async function downloadVideo(videoId: string) {
  try {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const outputDir = path.join(process.cwd(), "downloads");
    const outputPath = path.join(outputDir, `${videoId}.mp4`);
    if (existsSync(outputPath)) {
      console.log(`Video already exists: ${outputPath}, skipping download.`);
      return outputPath;
    }
    const args = [
      "-f",
      "worstvideo[ext=mp4]+worstvideo[ext=m4a]/mp4",
      "--merge-output-format",
      "mp4",
      "--no-geo-bypass",
      "--cookies",
      "cookies.txt",
      "--no-check-certificate",
      url,
      "-o",
      outputPath,
    ];

    await exec("./youtube/yt-dlp", args);
    console.log(`Downloaded video to ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error(`Failed to download video: ${error}`);
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const { videoId }: { videoId: string } = await request.json();
    if (!videoId) {
      return new Response(JSON.stringify({ error: "No video ID provided" }), { status: 400 });
    }
    const outputPath = await downloadVideo(videoId);
    const blob = new Blob([readFileSync(outputPath)], { type: "video/mp4" });
    return new Response(blob, {
      headers: { "Content-Type": "video/mp4" },
    });
  } catch (error) {
    console.error(`Failed to download video: ${error}`);
    return new Response(JSON.stringify({ error: "Failed to download video" }), { status: 500 });
  }
}
