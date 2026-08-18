const youtubeDownloadsEnabled = process.env.VITE_DOWNLOAD_ENABLED === "true";

module.exports = {
  appId: "cn.langpal.cantosubtitles",
  files: ["main/**/*", ".output/**/*", "public/icon.png", "package.json"],
  asarUnpack: [".output/**/*", "main/preload.cjs"],
  extraResources: [
    { from: ".electron-build/download-config.json", to: "download-config.json" },
    ...(youtubeDownloadsEnabled ? [{ from: "youtube", to: "youtube" }] : []),
  ],
  productName: "Chinese Subtitle Editor",
  directories: { output: "dist" },
  mac: {
    category: "public.app-category.education",
    icon: "public/icon.png",
    identity: null,
    target: "dir",
  },
};
