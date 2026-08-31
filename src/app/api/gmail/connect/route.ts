import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import { currentUserId } from "@/auth";
import { REQUIRED_SCOPES } from "@/services/gmail/tokens";

/**
 * Starts the Gmail-scopes OAuth flow — separate from login OAuth (§ phase 1).
 * access_type=offline + prompt=consent are required to receive a refresh token.
 */
export async function GET(): Promise<NextResponse> {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.redirect(new URL("/signin", env.AUTH_URL));
  }

  const state = randomBytes(24).toString("base64url");
  const jar = await cookies();
  jar.set("gmail_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/api/gmail",
  });

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", `${env.AUTH_URL}/api/gmail/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", REQUIRED_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);

  return NextResponse.redirect(url);
}
