import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  for (const key of [
    "LANGPAL_API_URL",
    "LANGPAL_ASR_API_URL",
    "LANGPAL_API_KEY",
    "VITE_LANGPAL_API_KEY",
  ]) {
    if (env[key] !== undefined && process.env[key] === undefined) process.env[key] = env[key];
  }
  return {
    base: "./",
    server: {
      port: 3000,
    },
    resolve: {
      tsconfigPaths: true,
    },
    plugins: [
      // TEMP: diagnose periodic HMR disconnects
      {
        name: "ws-close-logger",
        configureServer(server) {
          server.ws.on("connection", (socket, request) => {
            const openedAt = Date.now();
            console.log(
              `[ws] open ${new Date().toISOString()} ua=${request.headers["user-agent"]}`,
            );
            socket.on("close", (code, reason) =>
              console.log(
                `[ws] close ${new Date().toISOString()} code=${code} reason=${reason} after=${((Date.now() - openedAt) / 1000).toFixed(1)}s`,
              ),
            );
          });
        },
      },
      tailwindcss(),
      tanstackStart({
        srcDirectory: ".",
        router: {
          routesDirectory: "app/routes",
        },
      }),
      viteReact(),
      nitro(),
    ],
  };
});
