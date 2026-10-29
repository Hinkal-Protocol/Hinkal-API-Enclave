import {
  DepositAndWithdrawResponse,
  ENCLAVE_PUBLIC_SEND_VARIABLE_RATE,
  getErrorMessage,
  isValidAddressForChain,
  Logger,
} from '@hinkal/common';
import { Request, Response, Router } from 'express';
import {
  getHinkalVariableRate,
  getPartnerFeeBps,
  getRequestAttribution,
  partnerKeyMiddleware,
  verifyDepositAndWithdrawSignatureMiddleware,
  verifyReadOnlySignatureMiddleware,
} from '../middleware';
import { DepositAndWithdrawRequest } from '../types';
import { WHITELISTED_REFERRALS } from '@hinkal/backend-common';
import { hinkalInitializerService } from '../services/hinkalInitializerService';
import { getERC20Token } from '@hinkal/erc20-registry';
import {
  createDepositAndWithdrawOrder,
  getDepositAndWithdrawFeeStructure,
  prepareDepositAndWithdrawTx,
} from '../utils/depositAndWithdrawHelpers';
import { getDepositAndWithdrawOrderStatus } from '../utils/getDepositAndWithdrawOrderStatus';
import { INVALID_AMOUNTS_ERROR, isPositiveAmountList } from '../utils/transactionHelpers';
import { invalidAddressMessage } from '../utils/queryGuards';

const router = Router();

router.post(
  '/private-send',
  verifyDepositAndWithdrawSignatureMiddleware,
  partnerKeyMiddleware,
  async (
    req: Request<object, DepositAndWithdrawResponse, DepositAndWithdrawRequest>,
    res: Response<DepositAndWithdrawResponse>,
  ) => {
    const { chainId, tokenAddress, recipients, feeToken, txCompletionTime, ref } =
      req.body as DepositAndWithdrawRequest;
    const address = res.locals.address as string;

    if (!chainId || !tokenAddress || !recipients?.length) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: chainId, tokenAddress, recipients',
      });
      return;
    }

    if (!Array.isArray(recipients) || !isPositiveAmountList(recipients.map((r) => r?.amount))) {
      res.status(400).json({ success: false, error: INVALID_AMOUNTS_ERROR });
      return;
    }

    if (ref !== undefined && !WHITELISTED_REFERRALS.includes(ref)) {
      res.status(400).json({ success: false, error: `Invalid ref: '${ref}' is not a whitelisted referral` });
      return;
    }

    if (recipients.some((r) => !isValidAddressForChain(chainId, r?.address))) {
      res.status(400).json({ success: false, error: invalidAddressMessage('recipientAddress', chainId) });
      return;
    }

    try {
      const token = getERC20Token(tokenAddress, chainId);
      if (!token) {
        res.status(400).json({ success: false, error: `Token ${tokenAddress} not found on chain ${chainId}` });
        return;
      }

      const recipientAmounts = recipients.map((r) => BigInt(r.amount));
      const totalRecipientAmount = recipientAmounts.reduce((sum, a) => sum + a, 0n);
      const orderId = crypto.randomUUID();

      const feeStructurePromise = getDepositAndWithdrawFeeStructure(
        chainId,
        feeToken ?? token.erc20TokenAddress,
        token,
        recipients,
        getHinkalVariableRate(res, ENCLAVE_PUBLIC_SEND_VARIABLE_RATE) + getPartnerFeeBps(res),
      );
      feeStructurePromise.catch(() => undefined);

      const { serializedTx, utxoAmounts } = await hinkalInitializerService.withHinkalForAddress(
        address,
        chainId,
        async (hinkal) => {
          const feeStructure = await feeStructurePromise;
          return prepareDepositAndWithdrawTx(hinkal, chainId, token, recipientAmounts, feeStructure, orderId);
        },
      );

      const feeStructure = await feeStructurePromise;

      const attribution = getRequestAttribution(res, ref);

      res.status(200).json(
        await createDepositAndWithdrawOrder({
          orderId,
          chainId,
          address,
          token,
          recipients,
          totalRecipientAmount,
          utxoAmounts,
          feeStructure,
          serializedTx,
          attribution,
          txCompletionTime,
        }),
      );
    } catch (err) {
      Logger.error('[private-send] error:', err);
      res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  },
);

router.get('/private-send/:orderId', verifyReadOnlySignatureMiddleware, getDepositAndWithdrawOrderStatus(false));

export default router;
