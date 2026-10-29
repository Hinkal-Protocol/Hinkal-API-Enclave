import {
  AdminTransactionType,
  ENCLAVE_UNSHIELD_VARIABLE_RATE,
  getErrorMessage,
  isSolanaLike,
  isValidAddressForChain,
  PartnerTransactionType,
  TxHashResponse,
} from '@hinkal/common';
import { createHash } from 'crypto';
import { Request, Response, Router } from 'express';
import { hinkalInitializerService } from '../services/hinkalInitializerService';
import { WithdrawRequest } from '../types/route.types';
import { parseFeeStructure } from '../utils/parseFeeStructure';
import { INVALID_AMOUNTS_ERROR, isPositiveAmountList } from '../utils/transactionHelpers';
import { emitReferralVolume } from '../utils/emitReferralVolume';
import { invalidAddressMessage } from '../utils/queryGuards';
import {
  getHinkalVariableRate,
  getPartnerFeeBps,
  getRequestAttribution,
  partnerKeyMiddleware,
  verifyWithdrawSignatureMiddleware,
} from '../middleware';
import { getERC20Token } from '@hinkal/erc20-registry';
import { WHITELISTED_REFERRALS } from '@hinkal/backend-common';
import { WITHDRAW_REF_HASH_VARIABLE_RATE_BPS } from '../constants/withdrawRefVariableRates';

const router = Router();

router.post(
  '/withdraw',
  verifyWithdrawSignatureMiddleware,
  partnerKeyMiddleware,
  async (req: Request<object, TxHashResponse, WithdrawRequest>, res: Response<TxHashResponse>) => {
    try {
      const { chainId, tokenAddresses, amounts, recipientAddress, feeToken, feeAmount, ref } =
        req.body as WithdrawRequest;

      if (!isPositiveAmountList(amounts)) {
        res.status(400).json({ success: false, error: INVALID_AMOUNTS_ERROR });
        return;
      }

      if (tokenAddresses.length !== amounts.length) {
        res.status(400).json({ success: false, error: 'Token addresses and amounts must have the same length' });
        return;
      }

      if (!isValidAddressForChain(chainId, recipientAddress)) {
        res.status(400).json({ success: false, error: invalidAddressMessage('recipientAddress', chainId) });
        return;
      }

      const erc20Tokens = tokenAddresses
        .map((tokenAddress) => getERC20Token(tokenAddress, chainId))
        .filter((token) => token !== undefined);
      if (erc20Tokens.length !== tokenAddresses.length) {
        res.status(400).json({ success: false, error: `Token not found on chain ${chainId}` });
        return;
      }

      if (ref !== undefined && typeof ref !== 'string') {
        res.status(400).json({ success: false, error: 'Invalid ref: must be a string' });
        return;
      }

      const refVariableRate =
        ref !== undefined
          ? WITHDRAW_REF_HASH_VARIABLE_RATE_BPS[createHash('sha256').update(ref).digest('hex')]
          : undefined;
      const trackedRef = ref !== undefined && WHITELISTED_REFERRALS.includes(ref) ? ref : undefined;
      const isKnownRef = trackedRef !== undefined || refVariableRate !== undefined;

      if (ref !== undefined && !isKnownRef) {
        res.status(400).json({ success: false, error: `Invalid ref: '${ref}' is not a whitelisted referral` });
        return;
      }

      const resolvedFeeToken = isSolanaLike(chainId) ? tokenAddresses[0] : feeToken;
      // A ref-hash deal rate wins over the partner's Hinkal rate.
      const hinkalVariableRate = refVariableRate ?? getHinkalVariableRate(res, ENCLAVE_UNSHIELD_VARIABLE_RATE);
      const resolvedVariableRate = hinkalVariableRate + getPartnerFeeBps(res);
      const feeStructureOverride = parseFeeStructure(resolvedFeeToken, feeAmount, resolvedVariableRate);

      const txData = await hinkalInitializerService.withHinkalForAddress(
        res.locals.address,
        chainId,
        async (hinkal) => {
          return hinkal.withdraw(
            erc20Tokens,
            amounts.map((amount) => -1n * BigInt(amount)),
            recipientAddress,
            false,
            resolvedFeeToken,
            feeStructureOverride,
            resolvedVariableRate,
            AdminTransactionType.ApiWithdraw,
          );
        },
      );

      const txHash = typeof txData === 'string' ? txData : txData.hash;

      emitReferralVolume(
        getRequestAttribution(res, trackedRef),
        chainId,
        txHash,
        erc20Tokens,
        amounts,
        resolvedVariableRate,
        PartnerTransactionType.Withdraw,
      );

      res.status(200).json({ success: true, txHash });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  },
);

export default router;
