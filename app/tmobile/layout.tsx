import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { TELENEO_FACES } from "./fonts";
import "./tmobile.css";

// Headline fallback when TeleNeo isn't on this machine: Inter 800, per the brand guide.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["800"],
});

export const metadata: Metadata = {
  title: "Get started with T-Mobile",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function TMobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${inter.variable} tm-root flex flex-1 flex-col`}>
      <style dangerouslySetInnerHTML={{ __html: TELENEO_FACES }} />
      {children}
    </div>
  );
}
