import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, Space_Grotesk } from "next/font/google";
import "./globals.css";

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--ff-ui",
  display: "swap",
});

const space = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--ff-num",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PayWise — Card Optimizer",
  description: "Which card should you actually pay with? Math-backed answers from your cards' real reward rules.",
  manifest: "/manifest.json",
  icons: { icon: "/favicon-32.png", apple: "/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#0b0d12",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${hanken.variable} ${space.variable}`}>
      <body>{children}</body>
    </html>
  );
}
