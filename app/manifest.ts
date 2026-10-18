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
    icons: [{ src: "/apple-icon", sizes: "180x180", type: "image/png" }],
  };
}
