import type { MetadataRoute } from "next";

/** Lets "Add to Home Screen" save the site as "Formly". */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Formly",
    short_name: "Formly",
    start_url: "/",
    display: "standalone",
    background_color: "#0f1a2a",
    theme_color: "#0a121e",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
