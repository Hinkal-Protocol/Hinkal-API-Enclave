import { NextFunction, Request, Response } from 'express';
import {
  getErrorMessage,
  isValidPartnerFeeBps,
  Logger,
  PARTNER_API_KEY_HEADER,
  PARTNER_PUBLISHABLE_KEY_PREFIX,
  PARTNER_SECRET_KEY_PREFIX,
} from '@hinkal/common';
import { PARTNER_KEY_HEX_PATTERN, PartnerKeyResolution } from '@hinkal/backend-common';
import { PARTNER_KEY_MARKER } from '../constants';
import { getPartnerKeyResolution } from '../services/partnerKeyCache';
import { ReferralAttribution } from '../types';

const isWellFormedKey = (apiKey: string) => {
  const prefix = [PARTNER_SECRET_KEY_PREFIX, PARTNER_PUBLISHABLE_KEY_PREFIX].find((keyPrefix) =>
    apiKey.startsWith(keyPrefix),
  );
  if (!prefix) return false;
  return PARTNER_KEY_HEX_PATTERN.test(apiKey.slice(prefix.length));
};

const isOriginAllowed = (req: Request, apiKey: string, resolution: PartnerKeyResolution) => {
  if (!apiKey.startsWith(PARTNER_PUBLISHABLE_KEY_PREFIX)) return true;
  return resolution.allowedOrigins.includes(req.header('origin') ?? '');
};

export const partnerKeyMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const apiKey = req.header(PARTNER_API_KEY_HEADER);
  if (!apiKey?.startsWith(PARTNER_KEY_MARKER)) {
    next();
    return;
  }

  if (!isWellFormedKey(apiKey)) {
    res.status(401).json({ success: false, error: 'Invalid API key' });
    return;
  }

  let resolution: PartnerKeyResolution | null;
  try {
    resolution = await getPartnerKeyResolution(apiKey);
  } catch (error) {
    Logger.error('partner key resolve failed:', getErrorMessage(error));
    res.status(503).json({ success: false, error: 'Partner key service unavailable' });
    return;
  }

  if (!resolution) {
    res.status(401).json({ success: false, error: 'Invalid API key' });
    return;
  }

  if (!isOriginAllowed(req, apiKey, resolution)) {
    res.status(403).json({ success: false, error: 'Origin not allowed for this publishable key' });
    return;
  }

  res.locals.partnerAttribution = {
    ref: resolution.ref,
    keyId: resolution.keyId,
    partnerFeeBps: isValidPartnerFeeBps(resolution.partnerFeeBps) ? resolution.partnerFeeBps : 0,
  };
  next();
};

export const getRequestAttribution = (res: Response, bodyRef: string | undefined): ReferralAttribution =>
  (res.locals.partnerAttribution as ReferralAttribution | undefined) ?? { ref: bodyRef };

export const getPartnerFeeBps = (res: Response): bigint =>
  BigInt((res.locals.partnerAttribution as ReferralAttribution | undefined)?.partnerFeeBps ?? 0);
