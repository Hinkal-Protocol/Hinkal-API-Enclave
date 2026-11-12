import {
  AdminTransactionType,
  ENCLAVE_TRANSACT_VARIABLE_RATE,
  getErrorMessage,
  isSolanaLike,
  isValidAddressForChain,
  PartnerTransactionType,
  TxHashResponse,
} from '@hinkal/common';
import { Request, Response, Router } from 'express';
import { hinkalInitializerService } from '../services/hinkalInitializerService';
import { WithdrawRequest } from '../types/route.types';
import { parseFeeStructure } from '../utils/parseFeeStructure';
import { INVALID_AMOUNTS_ERROR, isPositiveAmountList } from '../utils/transactionHelpers';
import { emitReferralVolume } from '../utils/emitReferralVolume';
import { invalidAddressMessage } from '../utils/queryGuards';
import { getRequestAttribution, partnerKeyMiddleware, verifyWithdrawSignatureMiddleware } from '../middleware';
import { getERC20Token } from '@hinkal/erc20-registry';
import { resolveRefVariableRate } from '../utils/referralWhitelist';

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

      const resolvedRef = resolveRefVariableRate(res, ref, ENCLAVE_TRANSACT_VARIABLE_RATE);
      if (!resolvedRef) return;
      const { trackedRef, variableRate: resolvedVariableRate } = resolvedRef;

      const resolvedFeeToken = isSolanaLike(chainId) ? tokenAddresses[0] : feeToken;
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
