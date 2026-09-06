import type { Metadata } from "next";
import Room from "@/components/Room";
import { roomCode } from "@/lib/names";

/**
 * The link preview is a poster for the CODE, not for the app.
 *
 * People paste room links into WhatsApp, and whoever taps one ends up playing
 * in a browser tab — no home-screen icon, an address bar eating the canvas.
 * The code is the better door: it works in the installed app. So the preview
 * leads with it in the title (which is the line WhatsApp renders big) and
 * repeats it in the image, large enough to read off a thumbnail and type in.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ roomId: string }>;
}): Promise<Metadata> {
  const { roomId } = await params;
  const code = roomCode(roomId.toLowerCase());
  const title = `${code} — join my Doodle Disaster`;
  const description = `Open Doodle Disaster and punch in the code ${code}. (No app? This link works in a browser too.)`;

  return {
    title,
    description,
    // a room is ephemeral and semi-private; it has no business in a search index
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      title,
      description,
      siteName: "Doodle Disaster",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function RoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  return <Room roomId={roomId.toLowerCase()} />;
}
