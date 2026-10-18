import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home screen icon: the white/Volt mark on Ink, as in deck/brand "App icon". iOS rounds the corners. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0F1A2A",
        }}
      >
        <svg width="92" height="110" viewBox="0 0 247 296">
          <path fill="#ffffff" d="M55.6 0h74l-30 100h33L74.2 296H0.2l38.4-128H5.2z" />
          <path fill="#22C985" d="M140.6 0h106l-20.4 68h-106zM144.6 100h72l-20.4 68h-72z" />
        </svg>
      </div>
    ),
    size,
  );
}
