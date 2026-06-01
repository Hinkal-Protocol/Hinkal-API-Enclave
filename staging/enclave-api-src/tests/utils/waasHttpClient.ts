import { randomUUID } from 'crypto';
import { buildXStamp, SignKeyPair } from './stamp';

export interface WaasSuccessEnvelope<T> {
  status: 'success';
  data: T;
}

const createHttpError = (path: string, httpStatus: number, bodyText: string): Error =>
  new Error(`WAAS ${path} failed (${httpStatus}): ${bodyText.slice(0, 400)}`);

/**
 * HTTP client for a running WAAS instance. Paths are relative to `baseUrl`.
 * Supports two auth modes:
 *   - Stamp auth (default): pass `signer` to each method, X-Stamp header is built per-request.
 *   - API-key auth: construct with `new WaasHttpClient(baseUrl, apiKey)`, no signer needed.
 */
export class WaasHttpClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey?: string,
  ) {}

  private url(path: string): string {
    const root = this.baseUrl.replace(/\/+$/, '');
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${root}${p}`;
  }

  private parseEnvelope<T>(path: string, status: number, text: string): T {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw createHttpError(path, status, text);
    }
    const envelope = parsed as WaasSuccessEnvelope<T>;
    if (envelope.status !== 'success') throw createHttpError(path, status, text);
    return envelope.data;
  }

  async postJson<T>(path: string, body: Record<string, unknown>, signer?: SignKeyPair): Promise<T> {
    let headers: Record<string, string>;
    let finalBody: Record<string, unknown>;

    if (this.apiKey) {
      headers = { 'Content-Type': 'application/json', 'x-api-key': this.apiKey };
      finalBody = body;
    } else {
      if (!signer) throw new Error('signer required when no apiKey configured');
      finalBody = { ...body, nonce: randomUUID() };
      headers = { 'Content-Type': 'application/json', 'X-Stamp': buildXStamp(finalBody, signer) };
    }

    const res = await fetch(this.url(path), {
      method: 'POST',
      headers,
      body: JSON.stringify(finalBody),
    });
    const text = await res.text();
    if (!res.ok) throw createHttpError(path, res.status, text);
    return this.parseEnvelope<T>(path, res.status, text);
  }

  /** POST without treating 4xx/5xx as failure — use for asserting expected error responses. */
  async postRaw(
    path: string,
    body: Record<string, unknown>,
    signer?: SignKeyPair,
  ): Promise<{ status: number; text: string; json: unknown }> {
    let headers: Record<string, string>;
    let finalBody: Record<string, unknown>;

    if (this.apiKey) {
      headers = { 'Content-Type': 'application/json', 'x-api-key': this.apiKey };
      finalBody = body;
    } else {
      if (!signer) throw new Error('signer required when no apiKey configured');
      finalBody = { ...body, nonce: randomUUID() };
      headers = { 'Content-Type': 'application/json', 'X-Stamp': buildXStamp(finalBody, signer) };
    }

    const res = await fetch(this.url(path), {
      method: 'POST',
      headers,
      body: JSON.stringify(finalBody),
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      /* non-JSON body */
    }
    return { status: res.status, text, json };
  }

  async getJson<T>(path: string, params: Record<string, string> = {}, signer?: SignKeyPair): Promise<T> {
    let headers: Record<string, string>;
    let qs: string;

    if (this.apiKey) {
      headers = { 'x-api-key': this.apiKey };
      qs = new URLSearchParams(params).toString();
    } else {
      if (!signer) throw new Error('signer required when no apiKey configured');
      const paramsObj = { ...params, nonce: randomUUID() };
      headers = { 'X-Stamp': buildXStamp(paramsObj, signer) };
      qs = new URLSearchParams(paramsObj as Record<string, string>).toString();
    }

    const fullPath = qs ? `${path}?${qs}` : path;
    const res = await fetch(this.url(fullPath), { method: 'GET', headers });
    const text = await res.text();
    if (!res.ok) throw createHttpError(path, res.status, text);
    return this.parseEnvelope<T>(path, res.status, text);
  }
}
