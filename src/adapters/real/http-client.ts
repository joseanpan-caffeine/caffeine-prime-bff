import { Logger } from '@nestjs/common';

export interface HttpClientOptions {
  baseUrl: string;
  /** Headers fixos (ex.: `x-api-key`). */
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/**
 * Cliente HTTP mínimo sobre `fetch` (Node 22) usado pelos adaptadores reais.
 * Centraliza base URL, headers de autenticação, timeout e tratamento de erro.
 */
export class HttpClient {
  private readonly logger = new Logger(HttpClient.name);

  constructor(private readonly options: HttpClientOptions) {}

  get configured(): boolean {
    return Boolean(this.options.baseUrl);
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<T> {
    if (!this.configured) throw new Error(`HttpClient sem baseUrl configurada para ${path}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 10_000);
    try {
      const res = await fetch(`${this.options.baseUrl.replace(/\/$/, '')}${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          ...this.options.headers,
          ...extraHeaders,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await res.text();
      const data = text ? (JSON.parse(text) as T) : (undefined as T);
      if (!res.ok) {
        this.logger.warn(`${method} ${path} → ${res.status}`);
        throw new HttpClientError(res.status, data);
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  get<T>(path: string, headers?: Record<string, string>) {
    return this.request<T>('GET', path, undefined, headers);
  }
  post<T>(path: string, body?: unknown, headers?: Record<string, string>) {
    return this.request<T>('POST', path, body, headers);
  }
  patch<T>(path: string, body?: unknown, headers?: Record<string, string>) {
    return this.request<T>('PATCH', path, body, headers);
  }
  delete<T>(path: string, headers?: Record<string, string>) {
    return this.request<T>('DELETE', path, undefined, headers);
  }
}

export class HttpClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`HTTP ${status}`);
  }
}
