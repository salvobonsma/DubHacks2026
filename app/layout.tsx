import type { Metadata, Viewport } from "next";
import { DM_Sans, Sora } from "next/font/google";
import { DemoBanner } from "@/components/DemoBanner";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["600"],
});

export const metadata: Metadata = {
  title: "Formly",
  description: "Fill any form with your own data, without handing it over.",
};

// Matches the demo banner at the top of every page, so Safari's tab bar blends into it.
export const viewport: Viewport = {
  themeColor: "#0a121e",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${dmSans.variable} ${sora.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <DemoBanner />
        {children}
      </body>
    </html>
  );
}
