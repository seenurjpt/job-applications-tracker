import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { ObjectId } from "mongodb";
import { env } from "@/lib/env";
import * as users from "@/db/repositories/users";

// Login OAuth is deliberately separate from the Gmail-scopes OAuth flow
// (/api/gmail/connect) — login asks only for identity, never restricted scopes.

const providers = [
  Google({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
  }),
];

// Test-only sign-in for Playwright: never registered outside E2E_TEST_MODE,
// and the env schema refuses E2E_TEST_MODE in production.
if (env.E2E_TEST_MODE) {
  providers.push(
     
    Credentials({
      id: "e2e",
      name: "E2E test login",
      credentials: { email: { label: "Email", type: "text" } },
      async authorize(credentials) {
        const email = typeof credentials?.email === "string" ? credentials.email : null;
        if (!email) return null;
        const user = await users.upsertByEmail({ email, name: "E2E User", image: null });
        return { id: user._id.toHexString(), email: user.email, name: user.name };
      },
    }) as never
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: env.AUTH_SECRET,
  session: { strategy: "jwt" },
  trustHost: true,
  providers,
  pages: { signIn: "/signin" },
  callbacks: {
    async jwt({ token, user, account }) {
      // First sign-in: persist our own user record and stamp its id.
      if (user?.email && (account || user.id)) {
        const record = await users.upsertByEmail({
          email: user.email,
          name: user.name ?? null,
          image: user.image ?? null,
        });
        token.userId = record._id.toHexString();
      }
      return token;
    },
    session({ session, token }) {
      if (typeof token.userId === "string") {
        session.user.id = token.userId;
      }
      return session;
    },
  },
});

/** Returns the signed-in user's ObjectId, or null. For Server Actions/pages. */
export async function currentUserId(): Promise<ObjectId | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id || !ObjectId.isValid(id)) return null;
  return new ObjectId(id);
}
