import { PARTNER_PUBLISHABLE_KEY_PREFIX } from '@hinkal/common';
import { hashApiKey, PartnerKeyResolution, PartnerKeyResolveRequest } from '@hinkal/backend-common';
import { PARTNER_KEY_CACHE_MAX_ENTRIES, PARTNER_KEY_CACHE_TTL_MS } from '../constants';
import { CachedPartnerKey } from '../types';
import { resolvePartnerKey } from '../utils/dataServerInternal';

const cachedKeys = new Map<string, CachedPartnerKey>();
const pendingLookups = new Map<string, Promise<PartnerKeyResolution | null>>();

const toResolveRequest = (apiKey: string): PartnerKeyResolveRequest => {
  if (apiKey.startsWith(PARTNER_PUBLISHABLE_KEY_PREFIX)) return { publishableKey: apiKey };
  return { secretHash: hashApiKey(apiKey) };
};

const storeResolution = (cacheKey: string, resolution: PartnerKeyResolution | null) => {
  cachedKeys.delete(cacheKey);
  if (cachedKeys.size >= PARTNER_KEY_CACHE_MAX_ENTRIES) {
    const oldestKey = cachedKeys.keys().next().value;
    if (oldestKey !== undefined) cachedKeys.delete(oldestKey);
  }
  cachedKeys.set(cacheKey, { resolution, expiresAt: Date.now() + PARTNER_KEY_CACHE_TTL_MS });
};

const fetchResolution = async (cacheKey: string, apiKey: string) => {
  try {
    const { key } = await resolvePartnerKey(toResolveRequest(apiKey));
    storeResolution(cacheKey, key);
    return key;
  } finally {
    pendingLookups.delete(cacheKey);
  }
};

export const getPartnerKeyResolution = async (apiKey: string) => {
  const cacheKey = hashApiKey(apiKey);
  const cached = cachedKeys.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.resolution;

  const pendingLookup = pendingLookups.get(cacheKey) ?? fetchResolution(cacheKey, apiKey);
  pendingLookups.set(cacheKey, pendingLookup);
  return pendingLookup;
};
