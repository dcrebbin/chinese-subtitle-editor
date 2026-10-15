import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
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
          console.log(`[ws] open ${new Date().toISOString()} ua=${request.headers["user-agent"]}`);
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
});
