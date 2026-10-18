import type { Metadata, Viewport } from "next";
import { DM_Sans, Sora } from "next/font/google";
import { PageBackground } from "@/components/PageBackground";
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
  description: "Fill forms from your own data. Businesses only get the answers you approve.",
  appleWebApp: { title: "Formly", capable: true },
};

// Matches the navy Formly header, so Safari's tab bar blends into it. Merchant layouts set their own.
export const viewport: Viewport = {
  themeColor: "#0f1a2a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${dmSans.variable} ${sora.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <PageBackground />
        {children}
      </body>
    </html>
  );
}
