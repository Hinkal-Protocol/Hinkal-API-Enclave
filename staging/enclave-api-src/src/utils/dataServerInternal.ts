import { DATA_SERVER_URL, httpClient } from '@hinkal/common';
import {
  buildRelayerCommunicationHeaders,
  PARTNER_INTERNAL_ROUTES,
  PartnerKeyResolveRequest,
  PartnerKeyResolveResponse,
  PartnerReferralTxRequest,
} from '@hinkal/backend-common';
import { DATA_SERVER_INTERNAL_TIMEOUT_MS, PARTNER_INTERNAL_KEY } from '../constants';

const postDataServerInternal = <T>(path: string, body: object) =>
  httpClient.post<T>(`${DATA_SERVER_URL}${path}`, body, {
    headers: buildRelayerCommunicationHeaders(PARTNER_INTERNAL_KEY, path, body),
    timeout: DATA_SERVER_INTERNAL_TIMEOUT_MS,
  });

export const resolvePartnerKey = (request: PartnerKeyResolveRequest) =>
  postDataServerInternal<PartnerKeyResolveResponse>(PARTNER_INTERNAL_ROUTES.resolveKey, request);

export const emitPartnerReferralTx = (payload: PartnerReferralTxRequest) =>
  postDataServerInternal<void>(PARTNER_INTERNAL_ROUTES.referralTx, payload);
