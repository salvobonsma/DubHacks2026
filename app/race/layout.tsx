import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { TELENEO_FACES } from "../tmobile/fonts";
import "../tmobile/tmobile.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["800"],
});

export const metadata: Metadata = {
  title: "T-Mobile x Formly race",
};

/** The race screen wears the T-Mobile frame (same tokens as /tmobile); the Formly side brings its own look. */
export default function RaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${inter.variable} tm-root flex flex-1 flex-col`}>
      <style dangerouslySetInnerHTML={{ __html: TELENEO_FACES }} />
      {children}
    </div>
  );
}
