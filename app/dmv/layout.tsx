import type { Metadata } from "next";
import { Figtree, Playfair_Display } from "next/font/google";
import "./dmv.css";

// The DMV sets body copy in TT Commons (licensed); Figtree is the closest free geometric sans.
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  weight: ["400", "700", "800"],
  style: ["normal", "italic"],
});

// Page headings are Playfair Display, as on dmv.ca.gov.
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Application for Title or Registration - California DMV demo",
};

export default function DmvLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${figtree.variable} ${playfair.variable} dmv-root flex flex-1 flex-col`}>{children}</div>;
}
