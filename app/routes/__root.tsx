import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../globals.css?url";
import { Providers } from "../providers";
import messages from "../../locales/en.json";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      { title: "Chinese Subtitle Editor" },
      {
        name: "description",
        content: "Chinese Subtitle Editor by Langpal話朋",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "icon",
        href: "/favicon.png",
      },
    ],
  }),
  component: RootLayout,
});

function RootLayout() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="font-sans antialiased">
        <div
          className="fixed top-0 left-0 z-0 h-screen w-screen blur-xs"
          style={{
            backgroundImage: "url('./background.jpg')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <Providers hostLocale="en" messages={messages}>
          <Outlet />
        </Providers>
        <Scripts />
      </body>
    </html>
  );
}
