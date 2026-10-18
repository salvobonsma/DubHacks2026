import type { Metadata } from "next";
import { Open_Sans } from "next/font/google";
import "./chase.css";

// Chase's application is set in Open Sans throughout.
const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin"],
  weight: ["400", "600"],
});

export const metadata: Metadata = {
  title: "Account Application - Credit Card - Chase demo",
};

export default function ChaseLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${openSans.variable} ch-root flex flex-1 flex-col`}>{children}</div>;
}
