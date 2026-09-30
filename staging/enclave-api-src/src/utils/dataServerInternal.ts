import { DATA_SERVER_URL, httpClient } from '@hinkal/common';
import {
  buildRelayerCommunicationHeaders,
  PARTNER_INTERNAL_ROUTES,
  PartnerKeyResolveRequest,
  PartnerKeyResolveResponse,
  PartnerReferralTxRequest,
} from '@hinkal/backend-common';
import {
  DATA_SERVER_INTERNAL_TIMEOUT_MS,
  DATA_SERVER_REFERRAL_TX_TIMEOUT_MS,
  PARTNER_INTERNAL_KEY,
} from '../constants';

const postDataServerInternal = <T>(path: string, body: object, timeout = DATA_SERVER_INTERNAL_TIMEOUT_MS) =>
  httpClient.post<T>(`${DATA_SERVER_URL}${path}`, body, {
    headers: buildRelayerCommunicationHeaders(PARTNER_INTERNAL_KEY, path, body),
    timeout,
  });

export const resolvePartnerKey = (request: PartnerKeyResolveRequest) =>
  postDataServerInternal<PartnerKeyResolveResponse>(PARTNER_INTERNAL_ROUTES.resolveKey, request);

export const emitPartnerReferralTx = (payload: PartnerReferralTxRequest) =>
  postDataServerInternal<void>(PARTNER_INTERNAL_ROUTES.referralTx, payload, DATA_SERVER_REFERRAL_TX_TIMEOUT_MS);
