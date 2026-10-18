import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./spacexai.css";

// SpaceXAI's job board sets everything in Untitled Sans; Inter is the closest free stand-in.
const inter = Inter({
  variable: "--font-inter-sx",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Job Application for Software Engineer, AI Infrastructure at SpaceXAI",
};

export default function SpaceXAILayout({ children }: { children: React.ReactNode }) {
  return <div className={`${inter.variable} sx-root flex flex-1 flex-col`}>{children}</div>;
}
