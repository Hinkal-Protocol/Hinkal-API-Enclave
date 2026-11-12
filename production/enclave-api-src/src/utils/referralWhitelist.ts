import { createHash } from 'crypto';
import { Response } from 'express';
import { WHITELISTED_REFERRALS } from '@hinkal/backend-common';
import { REF_HASH_VARIABLE_RATE_BPS } from '../constants/refVariableRates';
import { getHinkalVariableRate, getPartnerFeeBps } from '../middleware/partnerKeyMiddleware';

export const rejectNonWhitelistedRef = (res: Response, ref: string | undefined): boolean => {
  if (ref === undefined || WHITELISTED_REFERRALS.includes(ref)) return false;

  res.status(400).json({ success: false, error: `Invalid ref: '${ref}' is not a whitelisted referral` });
  return true;
};

export const resolveRef = (
  res: Response,
  ref: unknown,
): { trackedRef?: string; refVariableRate?: bigint } | undefined => {
  if (ref === undefined) return {};

  if (typeof ref !== 'string') {
    res.status(400).json({ success: false, error: 'Invalid ref: must be a string' });
    return undefined;
  }

  const refVariableRate = REF_HASH_VARIABLE_RATE_BPS[createHash('sha256').update(ref).digest('hex')];
  const trackedRef = WHITELISTED_REFERRALS.includes(ref) ? ref : undefined;

  if (trackedRef === undefined && refVariableRate === undefined) {
    res.status(400).json({ success: false, error: `Invalid ref: '${ref}' is not a whitelisted referral` });
    return undefined;
  }

  return { trackedRef, refVariableRate };
};

export const resolveRefVariableRate = (
  res: Response,
  ref: unknown,
  defaultHinkalVariableRate: bigint,
): { trackedRef?: string; variableRate: bigint } | undefined => {
  const resolvedRef = resolveRef(res, ref);
  if (!resolvedRef) return undefined;

  const hinkalVariableRate = resolvedRef.refVariableRate ?? getHinkalVariableRate(res, defaultHinkalVariableRate);
  return { trackedRef: resolvedRef.trackedRef, variableRate: hinkalVariableRate + getPartnerFeeBps(res) };
};
