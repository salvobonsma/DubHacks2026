import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./tmobile.css";

// TeleNeo is licensed to T-Mobile only, so headlines fall back to Inter 800 per the brand guide.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["800"],
});

export const metadata: Metadata = {
  title: "Create your T-Mobile account",
};

export default function TMobileLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${inter.variable} tm-root flex flex-1 flex-col`}>{children}</div>;
}
