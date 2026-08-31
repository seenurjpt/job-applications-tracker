import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { addSeconds } from "date-fns";
import { env } from "@/lib/env";
import { encrypt } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import { currentUserId } from "@/auth";
import * as accounts from "@/db/repositories/accounts";
import {
  exchangeCodeForTokens,
  missingScopes,
} from "@/services/gmail/tokens";
import { getProfile } from "@/services/gmail/messages";

function redirectTo(path: string): NextResponse {
  return NextResponse.redirect(new URL(path, env.AUTH_URL));
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const userId = await currentUserId();
  if (!userId) return redirectTo("/signin");

  const params = req.nextUrl.searchParams;
  if (params.get("error")) {
    return redirectTo("/onboarding?gmail_error=denied");
  }

  const code = params.get("code");
  const state = params.get("state");
  const jar = await cookies();
  const expectedState = jar.get("gmail_oauth_state")?.value;
  jar.delete("gmail_oauth_state");
  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectTo("/onboarding?gmail_error=state_mismatch");
  }

  try {
    const tokens = await exchangeCodeForTokens(
      code,
      `${env.AUTH_URL}/api/gmail/callback`
    );

    // Granular consent: the user may have ticked only some scopes (§ phase 1).
    const missing = missingScopes(tokens.scopes);
    if (missing.length > 0) {
      logger.info("Gmail connect returned partial scopes", { missing });
      return redirectTo("/onboarding?gmail_error=partial_scopes");
    }
    if (!tokens.refreshToken) {
      return redirectTo("/onboarding?gmail_error=no_refresh_token");
    }

    const profile = await getProfile(tokens.accessToken);
    await accounts.upsertConnection({
      userId,
      email: profile.emailAddress.toLowerCase(),
      accessTokenEnc: encrypt(tokens.accessToken),
      refreshTokenEnc: encrypt(tokens.refreshToken),
      expiresAt: addSeconds(new Date(), tokens.expiresIn),
      scopes: tokens.scopes,
    });

    return redirectTo("/onboarding?gmail=connected");
  } catch (e) {
    logger.error("Gmail connect failed", e);
    return redirectTo("/onboarding?gmail_error=exchange_failed");
  }
}
