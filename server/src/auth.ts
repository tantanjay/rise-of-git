import { Router, Request, Response } from "express";
import crypto from "crypto";
import { config } from "./env.js";
import { createSession, getSessionUserId, deleteSession, stmtGetUserById, claimGitLogin } from "./db.js";
import { loginListed } from "./kingdomUtils.js";

/**
 * "Sign in with Git" (OAuth2 authorization-code flow).
 * Sessions are random tokens stored in SQLite and sent as an httpOnly cookie.
 * Enabled only when GIT_OAUTH_CLIENT_ID / GIT_OAUTH_CLIENT_SECRET are set.
 */

const SESSION_COOKIE = "gtc_session";
const STATE_COOKIE = "gtc_oauth_state";
const SESSION_DAYS = 30;

export const authEnabled = () => Boolean(config.oauthClientId && config.oauthClientSecret);

/** Local machines only: every request is an admin, and only when ADMIN_WITHOUT_SIGNIN=true says so (never just because OAuth is unset) */
const adminWithoutSignin = () => config.adminWithoutSignin && !authEnabled() && config.adminUsers.length > 0;

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k !== name) continue;
    try {
      return decodeURIComponent(v.join("="));
    } catch {
      return null; // a malformed cookie is simply no cookie
    }
  }
  return null;
}

function cookie(name: string, value: string, maxAgeSeconds: number): string {
  const secure = config.appUrl.startsWith("https://") ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

const redirectUri = () => `${config.appUrl}/api/auth/callback`;

/** Only allow same-app relative return paths */
const safeReturnTo = (v: unknown) => (typeof v === "string" && v.startsWith("/") && !v.startsWith("//") ? v : "/");

/** The signed-in developer's id (Git login, lowercase), or null */
export function sessionUser(req: Request): string | null {
  const token = readCookie(req, SESSION_COOKIE);
  return token ? getSessionUserId(token) : null;
}

/** Check if a request has administrator privileges */
export function isRequestAdmin(req: Request): boolean {
  const adminSet = new Set(config.adminUsers.map((a) => a.toLowerCase()));
  if (adminSet.size === 0) return false;
  const userId = sessionUser(req);
  if (userId) {
    if (adminSet.has(userId.toLowerCase())) return true;
    const row = stmtGetUserById.get(userId) as { username?: string } | undefined;
    if (row?.username && adminSet.has(row.username.toLowerCase())) return true;
  }
  return adminWithoutSignin();
}

/** Check if a request is from a Special User / Overseer */
export function isRequestSpecialUser(req: Request): boolean {
  const specialSet = new Set(config.specialUsers.map((s) => s.toLowerCase()));
  if (specialSet.size === 0) return false;
  const userId = sessionUser(req);
  if (!userId) return false;
  if (specialSet.has(userId.toLowerCase())) return true;
  const row = stmtGetUserById.get(userId) as { username?: string } | undefined;
  if (row?.username && specialSet.has(row.username.toLowerCase())) return true;
  return false;
}

export const authRouter = Router();

authRouter.get("/me", (req: Request, res: Response) => {
  const userId = sessionUser(req);
  const row = userId ? (stmtGetUserById.get(userId) as { id: string; username: string; full_name?: string } | undefined) : undefined;
  const adminSet = new Set(config.adminUsers.map((a) => a.toLowerCase()));
  const isSessionAdmin = userId ? (adminSet.has(userId.toLowerCase()) || (row?.username ? adminSet.has(row.username.toLowerCase()) : false)) : false;
  const isAdmin = isSessionAdmin || adminWithoutSignin();
  const specialSet = new Set(config.specialUsers.map((s) => s.toLowerCase()));
  const isSpecial = userId ? (specialSet.has(userId.toLowerCase()) || (row?.username ? specialSet.has(row.username.toLowerCase()) : false)) : false;
  const isArchon = userId ? loginListed(config.archonUsers, { id: userId, username: row?.username }) : false;

  res.json({
    enabled: authEnabled(),
    user: row
      ? { id: row.id, username: row.username, name: row.full_name || row.username, isAdmin, isSpecial, isArchon }
      : userId
      ? { id: userId, username: userId, name: userId, isAdmin, isSpecial, isArchon }
      : null,
    isAdmin,
    isSpecial,
    isArchon,
    // Signed-out visitors may browse (GUEST_BROWSING=true); otherwise the login screen is the only way in
    guestBrowsing: config.guestBrowsing
  });
});

authRouter.get("/login", (req: Request, res: Response) => {
  if (!authEnabled()) return res.status(503).send("Git sign-in is not configured on this server.");
  const state = crypto.randomBytes(16).toString("hex");
  const returnTo = safeReturnTo(req.query.returnTo);
  res.setHeader("Set-Cookie", cookie(STATE_COOKIE, `${state}|${returnTo}`, 600));
  const params = new URLSearchParams({
    client_id: config.oauthClientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    state
  });
  res.redirect(`${config.gitUrl}/login/oauth/authorize?${params}`);
});

authRouter.get("/callback", async (req: Request, res: Response) => {
  const fail = (msg: string) => res.redirect(`${config.appUrl}/?signin_error=${encodeURIComponent(msg)}`);
  if (!authEnabled()) return fail("Sign-in is not configured");

  const [expectedState, returnTo] = (readCookie(req, STATE_COOKIE) || "").split("|");
  const code = typeof req.query.code === "string" ? req.query.code : "";
  if (!code || !expectedState || req.query.state !== expectedState) return fail("Sign-in expired, please try again");

  try {
    const tokenRes = await fetch(`${config.gitUrl}/login/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        client_id: config.oauthClientId,
        client_secret: config.oauthClientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri()
      })
    });
    const tokenJson = (await tokenRes.json()) as { access_token?: string; error_description?: string };
    if (!tokenRes.ok || !tokenJson.access_token) return fail(tokenJson.error_description || "Git rejected the sign-in");

    const userRes = await fetch(`${config.gitUrl}/api/v1/user`, { headers: { Authorization: `Bearer ${tokenJson.access_token}` } });
    const user = (await userRes.json()) as { login?: string; id?: number };
    if (!userRes.ok || !user.login) return fail("Could not read your Git profile");

    // A kingdom belongs to the Git account that first held its login, not to whoever registers that name later
    const login = user.login.toLowerCase();
    if (typeof user.id === "number" && !claimGitLogin(login, user.id)) {
      console.warn(`[Auth] Refused sign-in: login "${login}" is pinned to another Git account`);
      return fail("This Git login belonged to an earlier account. Ask an administrator");
    }

    const token = createSession(login, SESSION_DAYS);
    res.setHeader("Set-Cookie", [cookie(SESSION_COOKIE, token, SESSION_DAYS * 86400), cookie(STATE_COOKIE, "", 0)]);
    // returnTo is the browser's full pathname (already includes any /castle subpath), so join it to the origin only
    res.redirect(returnTo ? `${new URL(config.appUrl).origin}${safeReturnTo(returnTo)}` : `${config.appUrl}/`);
  } catch (err: any) {
    console.error("❌ Git sign-in failed:", err.message);
    fail("Sign-in failed");
  }
});

authRouter.post("/logout", (req: Request, res: Response) => {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) deleteSession(token);
  res.setHeader("Set-Cookie", cookie(SESSION_COOKIE, "", 0));
  res.json({ success: true });
});
