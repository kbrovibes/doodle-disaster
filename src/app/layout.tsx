import type { Metadata, Viewport } from "next";
import { Fredoka, Nunito } from "next/font/google";
import PwaSetup from "@/components/PwaSetup";
import "./globals.css";

const display = Fredoka({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const body = Nunito({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DoodleDisaster — draw badly, guess wildly",
  description:
    "A lightweight pictionary game for friends. Create a room, share the link, start scribbling. No accounts, no ads, no mercy.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "DoodleDisaster",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#fdf8ef",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <PwaSetup />
        {children}
      </body>
    </html>
  );
}
