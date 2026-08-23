import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DoodleDisaster",
    short_name: "DoodleDisaster",
    description:
      "Draw badly. Guess wildly. Blame the pen. Lightweight pictionary for friends.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fdf8ef",
    theme_color: "#fdf8ef",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
