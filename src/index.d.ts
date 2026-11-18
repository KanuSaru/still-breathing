export type LinkState = "ok" | "dead" | "unsure";

export interface LinkResult {
  url: string;
  /** ok: it answered. dead: 404, 410 or the domain is gone. unsure: blocked, slow or a server error. */
  state: LinkState;
  status: number | null;
  detail: string;
  /** where it ended up, if it redirected */
  finalUrl?: string;
}

export interface CheckOptions {
  /** milliseconds to wait for each request. Default 15000 */
  timeout?: number;
  /** extra tries when the answer wasn't clear. Default 1 */
  retries?: number;
  userAgent?: string;
  fetch?: typeof fetch;
}

export interface CheckAllOptions extends CheckOptions {
  /** links checked at once. Default 8 */
  concurrency?: number;
  /** links checked at once on the same site. Default 2 */
  perHost?: number;
  onResult?: (result: LinkResult, done: number, total: number) => void;
}

export interface Place {
  file: string;
  line: number;
}

export function extractLinks(text: string, opts?: { html?: boolean }): { url: string; line: number }[];
export function normalize(url: string): string | null;
export function checkLink(url: string, opts?: CheckOptions): Promise<LinkResult>;
export function checkLinks(urls: string[], opts?: CheckAllOptions): Promise<LinkResult[]>;
export const DEFAULT_EXTENSIONS: string[];
export function collect(
  targets: string[],
  opts?: { extensions?: string[]; ignore?: (string | RegExp)[]; local?: boolean },
): { links: Map<string, Place[]>; files: number };
export function summarize(results: LinkResult[]): Record<LinkState, LinkResult[]>;
export function textReport(results: LinkResult[], links?: Map<string, Place[]>): string;
export function markdownReport(results: LinkResult[], links?: Map<string, Place[]>): string;
export function jsonReport(results: LinkResult[], links?: Map<string, Place[]>): string;
