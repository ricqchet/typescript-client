import { RicqchetError } from "./error";

export type Auth = { type: "bearer"; token: string } | { type: "none" };

export interface RequestOptions {
  headers?: Record<string, string>;
  body?: string | null;
  auth?: Auth;
}

/**
 * Shared HTTP client for the Ricqchet SDK.
 * @internal
 */
export class HttpClient {
  readonly baseUrl: string;
  readonly timeout: number;

  constructor(baseUrl: string, timeout: number) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.timeout = timeout;
  }

  async request(
    method: string,
    path: string,
    options: RequestOptions = {}
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "ricqchet-typescript/0.1.0",
      ...options.headers,
    };

    if (options.auth?.type === "bearer") {
      headers["Authorization"] = `Bearer ${options.auth.token}`;
    }

    try {
      return await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: options.body ?? null,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async parseError(response: Response): Promise<RicqchetError> {
    try {
      const data = await response.json();
      return RicqchetError.fromResponse(response.status, data);
    } catch {
      return new RicqchetError(
        "unknown_error",
        `Request failed with status ${response.status}`,
        response.status
      );
    }
  }
}
