import { Request, Response, Router } from 'express';
import {
  addressToHexFormat,
  ENCLAVE_TRANSACT_VARIABLE_RATE,
  getReceiveVaultCanonicalChainId,
  isNativePlaceholderAddress,
  isTronLike,
  isValidAddressForChain,
  Logger,
  receiveVaultChainsForNetwork,
  ReceiveVaultNetwork,
} from '@hinkal/common';
import {
  getRequestAttribution,
  partnerKeyMiddleware,
  requirePartnerKeyMiddleware,
  verifyRefundToRecoverSignatureMiddleware,
} from '../middleware';
import { createTransferAddress, partnerCreatorAddress, resolveTransferTarget } from '../services/receiveVaultBinding';
import { getRefundToNetworks, getRefundToStuckBalances, recoverRefundToStuckBalance } from '../services/stuckBalances';
import {
  PartnerTransferAddressRequest,
  PartnerTransferAddressResponse,
  RefundToRecoverRequest,
  RefundToRecoverResponse,
  RefundToStuckBalancesResponse,
} from '../types';
import { invalidAddressMessage } from '../utils/queryGuards';
import { resolveRefVariableRate } from '../utils/referralWhitelist';
import { resolveRouteError } from '../utils/routeError';

// Transfer addresses for partners: a secret API key stands in for the wallet signature, since an API-key
// address belongs to a fresh account with no owner to sign.
const router = Router();

router.post(
  '/partner/transfer-address',
  partnerKeyMiddleware,
  requirePartnerKeyMiddleware,
  async (
    req: Request<object, PartnerTransferAddressResponse, PartnerTransferAddressRequest>,
    res: Response<PartnerTransferAddressResponse>,
  ) => {
    try {
      const { networkType, refundTo, ref } = req.body;

      const networkChainIds = Object.values(ReceiveVaultNetwork).includes(networkType)
        ? receiveVaultChainsForNetwork(networkType)
        : [];
      if (!networkChainIds.length) {
        res
          .status(400)
          .json({ success: false, error: `Transfer addresses are not available on network ${networkType}` });
        return;
      }
      // Any chain of the network resolves the same vault, so one stands in for validation and setup.
      const chainId = getReceiveVaultCanonicalChainId(networkType);

      const resolvedRef = resolveRefVariableRate(res, ref, ENCLAVE_TRANSACT_VARIABLE_RATE);
      if (!resolvedRef) return;
      const { trackedRef, variableRate } = resolvedRef;

      const target = resolveTransferTarget({ ...req.body, chainId }, networkChainIds);
      if (
        !isValidAddressForChain(chainId, refundTo) ||
        isNativePlaceholderAddress(isTronLike(chainId) ? addressToHexFormat(refundTo) : refundTo, chainId)
      ) {
        res.status(400).json({ success: false, error: invalidAddressMessage('refundTo', chainId) });
        return;
      }

      const attribution = getRequestAttribution(res, trackedRef);
      if (!attribution.keyId) throw new Error('partner keyId missing after requirePartnerKeyMiddleware');
      const record = await createTransferAddress({
        chainId,
        creatorAddress: partnerCreatorAddress(networkType, attribution.keyId, refundTo),
        target,
        variableRate,
        attribution,
        trackedRef,
        refundTo,
      });

      res.status(200).json({ success: true, record, acceptedChainIds: target.acceptedChainIds });
    } catch (error) {
      Logger.error('[/partner/transfer-address] error:', error);
      const { status, message } = resolveRouteError(error);
      res.status(status).json({ success: false, error: message });
    }
  },
);

// What is stuck for refundTo, summed over the partner's own addresses that refund to it.
router.get(
  '/partner/transfer-address/stuck-balances',
  partnerKeyMiddleware,
  requirePartnerKeyMiddleware,
  async (req: Request<object, RefundToStuckBalancesResponse>, res: Response<RefundToStuckBalancesResponse>) => {
    try {
      const { refundTo } = req.query;
      if (typeof refundTo !== 'string' || !getRefundToNetworks(refundTo).length) {
        res.status(400).json({ success: false, error: 'refundTo must be a valid EVM, Tron or Solana address' });
        return;
      }
      const { keyId } = getRequestAttribution(res, undefined);
      if (!keyId) throw new Error('partner keyId missing after requirePartnerKeyMiddleware');

      res.status(200).json({ success: true, chains: await getRefundToStuckBalances(refundTo, keyId) });
    } catch (error) {
      const { status, message } = resolveRouteError(error);
      res.status(status).json({ success: false, error: message });
    }
  },
);

// Recovers one token and kind to refundTo, signed by the refundTo wallet. Vault funds come back as txData
// for that wallet to send.
router.post(
  '/partner/transfer-address/recover',
  partnerKeyMiddleware,
  requirePartnerKeyMiddleware,
  verifyRefundToRecoverSignatureMiddleware,
  async (
    req: Request<object, RefundToRecoverResponse, RefundToRecoverRequest>,
    res: Response<RefundToRecoverResponse>,
  ) => {
    try {
      const { refundTo, chainId, tokenAddress, kind } = req.body;
      const { keyId } = getRequestAttribution(res, undefined);
      if (!keyId) throw new Error('partner keyId missing after requirePartnerKeyMiddleware');

      const results = await recoverRefundToStuckBalance(refundTo, keyId, chainId, tokenAddress, kind);
      res.status(200).json({ success: true, results });
    } catch (error) {
      Logger.error('[/partner/transfer-address/recover] error:', error);
      const { status, message } = resolveRouteError(error);
      res.status(status).json({ success: false, error: message });
    }
  },
);

export default router;
