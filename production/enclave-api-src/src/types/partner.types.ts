import { PartnerKeyResolution } from '@hinkal/backend-common';

export interface ReferralAttribution {
  ref?: string;
  keyId?: string;
  partnerFeeBps?: number;
  hinkalVariableRateBps?: number;
}

export interface CachedPartnerKey {
  resolution: PartnerKeyResolution | null;
  expiresAt: number;
}
