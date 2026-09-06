import { ImageResponse } from "next/og";
import { roomCode } from "@/lib/names";

export const alt = "Doodle Disaster room code";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The share card. One job: make the code readable at thumbnail size, so the
 * person on the other end can type it into the installed app instead of
 * tapping through to a browser tab.
 */
export default async function Image({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  const code = roomCode(roomId.toLowerCase());

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#fff8ee",
          fontFamily: "sans-serif",
          color: "#241b12",
          border: "18px solid #ffc93c",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 44,
            fontWeight: 800,
            letterSpacing: 6,
            color: "#cf3f1c",
          }}
        >
          DOODLE DISASTER
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 22,
            fontSize: 30,
            color: "rgba(36, 27, 18, 0.55)",
          }}
        >
          open the app and type this code
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 26,
            padding: "26px 64px",
            borderRadius: 40,
            background: "#ffffff",
            border: "8px solid #241b12",
            fontSize: 176,
            fontWeight: 800,
            letterSpacing: 22,
            // the letter-spacing above pads the right edge; pull it back
            paddingRight: 42,
          }}
        >
          {code}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 30,
            fontSize: 26,
            color: "rgba(36, 27, 18, 0.5)",
          }}
        >
          draw badly · guess wildly · blame the pen
        </div>
      </div>
    ),
    size
  );
}
