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

/**
 * Absolute base for og:image URLs — WhatsApp and friends will not follow a
 * relative one. Vercel hands us the deployment host; the production domain is
 * the fallback so a local build still emits sane links.
 */
const site =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_ENV === "production"
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "https://doodle-disaster.vercel.app");

const TITLE = "DoodleDisaster — draw badly, guess wildly";
const DESCRIPTION =
  "A lightweight pictionary game for friends. Create a room, share the link, start scribbling. No accounts, no ads, no mercy.";

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "Doodle Disaster",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
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
