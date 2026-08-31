import { ObjectId } from "mongodb";
import { addMinutes, addSeconds } from "date-fns";
import { env } from "@/lib/env";
import { decrypt, encrypt } from "@/lib/crypto";
import { err, ok, type Result } from "@/lib/result";
import { logger } from "@/lib/logger";
import * as accounts from "@/db/repositories/accounts";
import { GmailAuthError } from "./client";

export const REQUIRED_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
];

/** Granular consent lets users tick only some scopes. Detect partial grants. */
export function missingScopes(granted: string[]): string[] {
  const have = new Set(granted);
  // openid/email/profile can come back under several aliases; only the gmail
  // scopes are load-bearing for the app.
  return [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.compose",
  ].filter((s) => !have.has(s));
}

export type TokenError = "needs_reconnect" | "revoked";

/**
 * Returns a valid access token, refreshing if within 5 minutes of expiry.
 *
 * invalid_grant — the 7-day testing expiry, user revocation, or a password
 * reset — is a STATE, not an error (§0.4): the account flips to
 * needs_reconnect and callers get a typed err, never an exception.
 */
export async function getValidAccessToken(
  accountId: ObjectId
): Promise<Result<string, TokenError>> {
  const account = await accounts.findById(accountId);
  if (!account) return err("revoked");

  if (account.status !== "active") {
    return err(account.status === "revoked" ? "revoked" : "needs_reconnect");
  }
  if (account.expiresAt > addMinutes(new Date(), 5)) {
    return ok(decrypt(account.accessTokenEnc));
  }

  const res = await fetch(env.GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: decrypt(account.refreshTokenEnc),
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (body.error === "invalid_grant") {
      logger.info("Refresh token expired or revoked; needs reconnect", {
        accountId: accountId.toHexString(),
      });
      await accounts.setStatus(accountId, "needs_reconnect");
      return err("needs_reconnect");
    }
    throw new GmailAuthError(`Token refresh failed: ${res.status}`);
  }

  const tokens = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  await accounts.updateTokens(accountId, {
    accessTokenEnc: encrypt(tokens.access_token),
    expiresAt: addSeconds(new Date(), tokens.expires_in),
  });

  return ok(tokens.access_token);
}

/** Authorization-code exchange for the Gmail connect flow. */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  scopes: string[];
  idToken: string | null;
}> {
  const res = await fetch(env.GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) {
    throw new GmailAuthError(`Code exchange failed: ${res.status}`);
  }
  const body = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
    id_token?: string;
  };
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresIn: body.expires_in,
    scopes: body.scope?.split(" ") ?? [],
    idToken: body.id_token ?? null,
  };
}
