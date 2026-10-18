import type { Metadata } from "next";
import { Barlow } from "next/font/google";
import "./spacexai.css";

// Barlow stands in for a DIN-style grotesk: wide, plain and good in tracked uppercase.
const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Software Engineer, AI Infrastructure | SpaceXAI Careers",
};

export default function SpaceXAILayout({ children }: { children: React.ReactNode }) {
  return <div className={`${barlow.variable} sx-root flex flex-1 flex-col`}>{children}</div>;
}
