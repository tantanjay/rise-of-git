// Must be the FIRST import in index.ts — ES module imports are evaluated in order,
// so this guarantees .env values exist before any service reads process.env.
try {
  process.loadEnvFile();
} catch {
  // .env is optional (falls back to demo kingdoms when no token is set)
}

// Internal Git uses a certificate chain Node can't verify by default
if (!process.env.NODE_TLS_REJECT_UNAUTHORIZED) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

/** A numeric setting: anything that isn't a finite number falls back to the default, and values are held inside their range */
function envNumber(raw: string | undefined, fallback: number, min = -Infinity, max = Infinity): number {
  const n = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** Longest timer Node can hold (2^31 − 1 ms) in whole hours; a longer one would fire at once, over and over */
const MAX_TIMER_HOURS = 596;

export const config = {
  get gitUrl() {
    return (process.env.GIT_URL || "https://git.example.com").replace(/\/+$/, "");
  },
  get gitToken() {
    return (process.env.GIT_TOKEN || "").trim();
  },
  /** Rolling window for live head sync in days (defaults to 3 days) */
  get liveSyncLookbackDays() {
    return envNumber(process.env.LIVE_SYNC_LOOKBACK_DAYS || process.env.GIT_LOOKBACK_DAYS, 3, 0);
  },
  /** Backward-compatible alias for liveSyncLookbackDays */
  get lookbackDays() {
    return this.liveSyncLookbackDays;
  },
  /** Enable or disable background historical backfill */
  get backfillEnabled() {
    return process.env.BACKFILL_ENABLED !== "false";
  },
  /** Starting year for historical walk (starts Jan 1st 00:00:00 UTC of that year) */
  get backfillStartYear() {
    return envNumber(process.env.BACKFILL_START_YEAR, 2020, 1970);
  },
  /** Gentle pause between repos in ms (keeps CPU & Git load near zero) */
  get backfillDelayMs() {
    return envNumber(process.env.BACKFILL_DELAY_MS, 500, 0);
  },
  /** When true, resets all repository backfill checkpoints on startup and re-syncs history */
  get backfillForceReset() {
    return process.env.BACKFILL_FORCE_RESET === "true";
  },
  /** Safety cap on commits fetched per repository per sync (0 = unlimited) */
  get maxCommitsPerRepo() {
    return envNumber(process.env.GIT_MAX_COMMITS_PER_REPO, 5000, 0);
  },
  /** Max buildings rendered per kingdom (top repos by commit count) */
  get maxBuildingsPerKingdom() {
    return envNumber(process.env.GIT_MAX_BUILDINGS, 100, 0);
  },
  /** Resource harvest interval */
  get syncIntervalMinutes() {
    const minutes = envNumber(process.env.SYNC_INTERVAL_MINUTES, 15);
    return minutes > 0 ? minutes : 15;
  },
  /** Natural lifespan of a 1.0× civ (humans); each civ scales it by its lifespan factor (GAME_GUIDE §13) */
  get baseLifespanHours() {
    const hours = Number(process.env.BASE_LIFESPAN_HOURS || 24);
    return Number.isFinite(hours) && hours > 0 ? hours : 24;
  },
  /** How often Git data is re-pulled in the background (hours, minimum 1 to spare the Git server) */
  get gitSyncIntervalHours() {
    return envNumber(process.env.GIT_SYNC_INTERVAL_HOURS, 1, 1, MAX_TIMER_HOURS);
  },
  /** "Sign in with Git" OAuth2 app (Git → Settings → Applications → OAuth2 Applications) */
  get oauthClientId() {
    return (process.env.GIT_OAUTH_CLIENT_ID || "").trim();
  },
  get oauthClientSecret() {
    return (process.env.GIT_OAUTH_CLIENT_SECRET || "").trim();
  },
  /**
   * Let signed-out visitors browse the realm (kingdoms, repos, developer names). Off by default: then every API
   * route except sign-in answers 401 without a session. Only "true" turns it on
   */
  get guestBrowsing() {
    return (process.env.GUEST_BROWSING || "").trim().toLowerCase() === "true";
  },
  /** Local machines without Git sign-in: every request counts as an admin (needs ADMIN_USERS too; ignored once OAuth is set). Only "true" turns it on */
  get adminWithoutSignin() {
    return (process.env.ADMIN_WITHOUT_SIGNIN || "").trim().toLowerCase() === "true";
  },
  /** Public URL the browser uses for this app (the OAuth redirect URI is APP_URL/api/auth/callback) */
  get appUrl() {
    return (process.env.APP_URL || "http://localhost:5173").replace(/\/+$/, "");
  },
  /**
   * Logins of every overseer locked to Nethergarde Voidrift as a max-level kingdom: the Special Overseers
   * (SPECIAL_USERS) plus the Archons (ARCHON_USERS), who have everything an overseer has
   */
  get specialUsers(): string[] {
    const raw = process.env.SPECIAL_USERS || process.env.NETHERGARDE_USERS || "";
    const special = raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    return [...new Set([...special, ...this.archonUsers])];
  },
  /** Logins of the Archons of the Realm: overseers above the overseers, untouchable, seated at the Voidrift's heart */
  get archonUsers(): string[] {
    const raw = process.env.ARCHON_USERS || "";
    return raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  },
  /** Logins of administrators who can access admin controls (e.g. world reset) */
  get adminUsers(): string[] {
    const raw = process.env.ADMIN_USERS || "";
    return raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  },
  /** Month (1–12) the fiscal year starts in: the Hall of Renown's Year tab covers this fiscal year so far */
  get fiscalYearStartMonth(): number {
    const val = Math.round(Number(process.env.FISCAL_YEAR_START_MONTH || 10));
    return Number.isFinite(val) && val >= 1 && val <= 12 ? val : 10;
  },
  /**
   * The day the game started (YYYY-MM-DD), for the Watchtower's before / after comparison. Empty: the realm's first
   * harvest, remembered in realm_meta once read
   */
  get gameLaunchDate(): string | null {
    const raw = (process.env.GAME_LAUNCH_DATE || "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
  },
  /**
   * The realm's time zone (an IANA name): world disasters start between 06:00 and 22:00 on this clock, so a
   * "morning" disaster comes when the team is at work. Weekly resets stay at Sunday 00:00 UTC
   */
  get realmTimezone(): string {
    const raw = (process.env.REALM_TIMEZONE || "").trim() || "Asia/Manila";
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: raw });
      return raw;
    } catch {
      return "Asia/Manila";
    }
  },
  /** Number of non-overseer player slots in Nethergarde Voidrift */
  get nethergardePlayerSlots(): number {
    const val = Number(process.env.NETHERGARDE_PLAYER_SLOTS || 3);
    return Number.isFinite(val) && val > 0 ? val : 3;
  }
};

