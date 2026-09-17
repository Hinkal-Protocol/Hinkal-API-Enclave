import { Response } from 'express';
import { WHITELISTED_REFERRALS } from '@hinkal/backend-common';

export const rejectNonWhitelistedRef = (res: Response, ref: string | undefined): boolean => {
  if (ref === undefined || WHITELISTED_REFERRALS.includes(ref)) return false;

  res.status(400).json({ success: false, error: `Invalid ref: '${ref}' is not a whitelisted referral` });
  return true;
};
