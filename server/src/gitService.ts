import { config } from "./env.js";

/** Thin, paginated Git REST client (token comes from .env only). */

export class GitHttpError extends Error {
  constructor(public status: number, public path: string) {
    super(`Git ${path} returned HTTP ${status}`);
  }
}

interface GetAllOptions<T> {
  /** Extract the item array from a response body (e.g. repos/search wraps in { data }) */
  unwrap?: (json: any) => T[];
  /** Stop after collecting this many items */
  maxItems?: number;
  /** Stop paging once an item matches (that item and later ones are dropped) */
  stopWhen?: (item: T) => boolean;
}

const PAGE_SIZE = 50; // Git's default MAX_RESPONSE_ITEMS

class GitService {
  get hasToken() {
    return config.gitToken.length > 0;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { Accept: "application/json" };
    if (this.hasToken) h.Authorization = `token ${config.gitToken}`;
    return h;
  }

  async get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    const url = new URL(`${config.gitUrl}/api/v1${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new GitHttpError(res.status, path);
    return (await res.json()) as T;
  }

  /** One page of a list plus the list's full size from Git's `X-Total-Count` header (null when Git sends none) */
  async getPage<T>(path: string, params: Record<string, string | number> = {}): Promise<{ items: T[]; total: number | null }> {
    const url = new URL(`${config.gitUrl}/api/v1${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new GitHttpError(res.status, path);
    const json = await res.json();
    const header = res.headers.get("x-total-count");
    return { items: Array.isArray(json) ? (json as T[]) : [], total: header === null || !Number.isFinite(Number(header)) ? null : Number(header) };
  }

  /** Raw text (e.g. a commit diff); bodies over `maxBytes` throw so huge generated diffs are skipped */
  async getText(path: string, maxBytes = 2_000_000): Promise<string> {
    const res = await fetch(`${config.gitUrl}/api/v1${path}`, { headers: { ...this.headers(), Accept: "text/plain" } });
    if (!res.ok) throw new GitHttpError(res.status, path);
    // Read the body in chunks and give up past maxBytes: reading a huge diff (a committed dump or binary) whole with
    // res.text() builds a string past V8's limit, which kills the process ("kMaxInt >= len") before any catch runs
    const tooBig = () => new Error(`Git ${path} body larger than ${maxBytes} bytes`);
    if (Number(res.headers.get("content-length") ?? 0) > maxBytes) {
      await res.body?.cancel();
      throw tooBig();
    }
    if (!res.body) return "";
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw tooBig();
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  }

  async getAll<T>(path: string, params: Record<string, string | number> = {}, opts: GetAllOptions<T> = {}): Promise<T[]> {
    const out: T[] = [];
    for (let page = 1; page < 1000; page++) {
      const json = await this.get<any>(path, { ...params, limit: PAGE_SIZE, page });
      const batch: T[] = opts.unwrap ? opts.unwrap(json) : json;
      if (!Array.isArray(batch) || batch.length === 0) break;

      for (const item of batch) {
        if (opts.stopWhen?.(item)) return out;
        out.push(item);
        if (opts.maxItems && out.length >= opts.maxItems) return out;
      }
      if (batch.length < PAGE_SIZE) break;
    }
    return out;
  }

  async status() {
    try {
      const { version } = await this.get<{ version: string }>("/version");
      if (!this.hasToken) {
        return { reachable: true, authenticated: false, version, url: config.gitUrl };
      }
      const me = await this.get<{ login: string; is_admin: boolean }>("/user");
      return { reachable: true, authenticated: true, version, user: me.login, isAdmin: me.is_admin, url: config.gitUrl };
    } catch (err: any) {
      return { reachable: false, authenticated: false, url: config.gitUrl, error: err.message };
    }
  }
}

export const git = new GitService();
