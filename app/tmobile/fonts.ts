/**
 * TeleNeo, the real T-Mobile font, served from public/fonts-local (committed; the repo is private).
 * Declared inline (a <style> tag) so a missing file just 404s and text falls back to Inter / the system font.
 */
export const TELENEO_FACES = `
@font-face { font-family: "TeleNeo"; font-weight: 800; font-display: swap; src: url("/fonts-local/TeleNeoWeb-ExtraBold.woff2") format("woff2"); }
@font-face { font-family: "TeleNeo"; font-weight: 400; font-display: swap; src: url("/fonts-local/TeleNeoWeb-Regular.woff2") format("woff2"); }
@font-face { font-family: "TeleNeo"; font-weight: 500 600; font-display: swap; src: url("/fonts-local/TeleNeoWeb-Medium.woff2") format("woff2"); }
@font-face { font-family: "TeleNeo"; font-weight: 700; font-display: swap; src: url("/fonts-local/TeleNeoWeb-Bold.woff2") format("woff2"); }
`;
