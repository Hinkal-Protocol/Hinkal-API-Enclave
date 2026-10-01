import { DATA_SERVER_URL } from '@hinkal/common';
import { safeJsonStringify } from '@hinkal/common/functions/utils/serialize.utils';

const GAS_ESTIMATE_URL_PREFIX = `${DATA_SERVER_URL}/gas-estimation/`;
const CACHE_TTL_MS = 15_000;

interface CachedEstimate {
  expiresAt: number;
  response: Promise<unknown>;
}

const estimates = new Map<string, CachedEstimate>();

const removeExpired = (now: number) => {
  estimates.forEach((estimate, key) => {
    if (estimate.expiresAt <= now) estimates.delete(key);
  });
};

const isSuccessful = (estimate: unknown) => (estimate as { status?: string } | undefined)?.status === 'success';

export const isGasEstimateUrl = (url: string) => url.startsWith(GAS_ESTIMATE_URL_PREFIX);

export const cachedGasEstimate = async <T>(url: string, body: unknown, fetchEstimate: () => Promise<T>): Promise<T> => {
  const now = Date.now();
  removeExpired(now);

  const key = `${url}|${safeJsonStringify(body)}`;
  const cached = estimates.get(key);
  if (cached) return cached.response as Promise<T>;

  const response = fetchEstimate();
  estimates.set(key, { expiresAt: now + CACHE_TTL_MS, response });

  try {
    const estimate = await response;
    if (!isSuccessful(estimate)) estimates.delete(key);
    return estimate;
  } catch (err) {
    estimates.delete(key);
    throw err;
  }
};
