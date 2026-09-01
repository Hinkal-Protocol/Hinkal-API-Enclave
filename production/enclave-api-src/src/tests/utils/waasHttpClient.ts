import { createVerify, randomUUID } from 'crypto';
import { buildXStamp, SignKeyPair } from './stamp';

const HEADER_ENCLAVE_SIGNATURE = 'x-hinkal-response-signature';

let attestedKey: Promise<string> | undefined;

const verificationPublicKey = (baseUrl: string): Promise<string> => {
  attestedKey ??= fetch(`${baseUrl}/attestation?nonce=${randomUUID()}`)
    .then((res) => res.json() as Promise<{ verificationPublicKey?: string }>)
    .then(({ verificationPublicKey: key }) => {
      if (!key) throw new Error('enclave returned no verificationPublicKey to verify responses against');
      return key;
    });
  return attestedKey;
};

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

  /**
   * TLS terminates at the load balancer, outside the TEE, so every WAAS response must carry the enclave's
   * signature over the raw body and echo the request nonce.
   */
  private async assertSignedByEnclave(path: string, res: Response, text: string, nonce?: string): Promise<void> {
    const signature = res.headers.get(HEADER_ENCLAVE_SIGNATURE);
    if (!signature) throw new Error(`WAAS ${path} responded without ${HEADER_ENCLAVE_SIGNATURE}`);

    const signed = createVerify('SHA256')
      .update(text)
      .verify({ key: await verificationPublicKey(this.baseUrl), dsaEncoding: 'ieee-p1363' }, signature, 'base64');
    if (!signed) throw new Error(`WAAS ${path} response failed enclave signature verification`);

    if (nonce && (JSON.parse(text) as { nonce?: string }).nonce !== nonce)
      throw new Error(`WAAS ${path} response does not echo nonce ${nonce}`);
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
      headers = { 'Content-Type': 'application/json', 'X-Stamp': buildXStamp('POST', path, finalBody, signer) };
    }

    const res = await fetch(this.url(path), {
      method: 'POST',
      headers,
      body: JSON.stringify(finalBody),
    });
    const text = await res.text();
    await this.assertSignedByEnclave(path, res, text, finalBody.nonce as string | undefined);
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
      headers = { 'Content-Type': 'application/json', 'X-Stamp': buildXStamp('POST', path, finalBody, signer) };
    }

    const res = await fetch(this.url(path), {
      method: 'POST',
      headers,
      body: JSON.stringify(finalBody),
    });
    const text = await res.text();
    await this.assertSignedByEnclave(path, res, text, finalBody.nonce as string | undefined);
    let json: unknown = null;
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      /* non-JSON body */
    }
    return { status: res.status, text, json };
  }

  async getJson<T>(
    path: string,
    params: Record<string, string> = {},
    signer?: SignKeyPair,
    signingRoutePath?: string,
  ): Promise<T> {
    let headers: Record<string, string>;
    let qs: string;

    if (this.apiKey) {
      headers = { 'x-api-key': this.apiKey };
      qs = new URLSearchParams(params).toString();
    } else {
      if (!signer) throw new Error('signer required when no apiKey configured');
      const paramsObj = { ...params, nonce: randomUUID() };
      headers = { 'X-Stamp': buildXStamp('GET', signingRoutePath ?? path, paramsObj, signer) };
      qs = new URLSearchParams(paramsObj as Record<string, string>).toString();
    }

    const fullPath = qs ? `${path}?${qs}` : path;
    const res = await fetch(this.url(fullPath), { method: 'GET', headers });
    const text = await res.text();
    await this.assertSignedByEnclave(path, res, text, new URLSearchParams(qs).get('nonce') ?? undefined);
    if (!res.ok) throw createHttpError(path, res.status, text);
    return this.parseEnvelope<T>(path, res.status, text);
  }
}
