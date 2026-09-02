import {
  caseInsensitiveEqual,
  DepositAndWithdrawResponse,
  ENCLAVE_PUBLIC_SEND_VARIABLE_RATE,
  ExternalActionId,
  getErrorMessage,
  getFeeStructure,
  hinkalPalEvmDepositPrepare,
  hinkalPalSolanaDepositPrepare,
  hinkalPalTronDepositPrepare,
  isNativePlaceholderAddress,
  isSolanaLike,
  isTronLike,
  Logger,
  networkRegistry,
} from '@hinkal/common';
import { Request, Response, Router } from 'express';
import { verifyDepositAndWithdrawSignatureMiddleware, verifyReadOnlySignatureMiddleware } from '../middleware';
import { DepositAndWithdrawRequest } from '../types';
import { WHITELISTED_REFERRALS } from '@hinkal/backend-common';
import { ethers } from 'ethers';
import { DepositAndWithdrawOrderModel, DepositAndWithdrawOrderStatus } from '../models';
import { DEPLOYMENT_MODE } from '../constants';
import { hinkalInitializerService } from '../services/hinkalInitializerService';
import { sealDocument } from '../utils/documentSigning';
import { enclaveDepositDispatcherService } from '../services/EnclaveWithdrawDispatcherService';
import { resolveDepositAndWithdrawScheduleStatus } from '../services/resolveDepositAndWithdrawScheduleStatus';
import { resolveDepositAndWithdrawPublicStatus } from '../utils/resolveDepositAndWithdrawPublicStatus';
import { getERC20Token } from '@hinkal/erc20-registry';

const router = Router();

router.post(
  '/private-send',
  verifyDepositAndWithdrawSignatureMiddleware,
  async (
    req: Request<object, DepositAndWithdrawResponse, DepositAndWithdrawRequest>,
    res: Response<DepositAndWithdrawResponse>,
  ) => {
    const { chainId, tokenAddress, recipients, feeToken, txCompletionTime, ref } =
      req.body as DepositAndWithdrawRequest;

    if (!chainId || !tokenAddress || !recipients?.length) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: chainId, tokenAddress, recipients',
      });
      return;
    }

    if (ref !== undefined && !WHITELISTED_REFERRALS.includes(ref)) {
      res.status(400).json({ success: false, error: `Invalid ref: '${ref}' is not a whitelisted referral` });
      return;
    }

    if (recipients.some((r) => isNativePlaceholderAddress(r.address, chainId))) {
      res
        .status(400)
        .json({ success: false, error: 'Recipient address must not be the native token placeholder address' });
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

      const feeStructure = await getFeeStructure(
        chainId,
        feeToken ?? token.erc20TokenAddress,
        [token.erc20TokenAddress],
        ExternalActionId.Transact,
        [],
        ENCLAVE_PUBLIC_SEND_VARIABLE_RATE,
        isSolanaLike(chainId)
          ? { mintTo: token.erc20TokenAddress, recipient: recipients[0].address, nullifierCount: recipients.length }
          : undefined,
      );

      const { serializedTx, utxoAmounts } = await hinkalInitializerService.withHinkalForAddress(
        res.locals.address,
        chainId,
        async (hinkal) => {
          if (isSolanaLike(chainId)) {
            const result = await hinkalPalSolanaDepositPrepare(
              hinkal,
              chainId,
              token,
              recipientAmounts,
              feeStructure,
              orderId,
            );
            return {
              serializedTx: Buffer.from(result.unsignedTx.serialize()).toString('base64'),
              utxoAmounts: result.utxoAmounts,
            };
          }

          if (isTronLike(chainId)) {
            const result = await hinkalPalTronDepositPrepare(hinkal, token, recipientAmounts, feeStructure, orderId);
            return {
              serializedTx: Buffer.from(JSON.stringify(result.unsignedTx)).toString('base64'),
              utxoAmounts: result.utxoAmounts,
            };
          }

          const result = await hinkalPalEvmDepositPrepare(hinkal, token, recipientAmounts, feeStructure, orderId);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const txData = { ...(result.unsignedTx as any) };
          delete txData.from;
          const evmTx = ethers.Transaction.from(txData);
          return {
            serializedTx: Buffer.from(evmTx.unsignedSerialized.slice(2), 'hex').toString('base64'),
            utxoAmounts: result.utxoAmounts,
          };
        },
      );

      const totalAmount = utxoAmounts.reduce((sum, a) => sum + a, 0n);
      const fee = totalAmount - totalRecipientAmount;

      const sealed = await sealDocument({
        orderId,
        deploymentMode: DEPLOYMENT_MODE,
        chainId,
        senderAddress: res.locals.address,
        recipients,
        tokenAddress: token.erc20TokenAddress,
        feeToken: feeStructure.feeToken,
        flatFee: feeStructure.flatFee.toString(),
        variableRate: feeStructure.variableRate.toString(),
        utxoAmounts: utxoAmounts.map((a) => a.toString()),
        ...(txCompletionTime !== undefined && { txCompletionTime }),
        ...(ref !== undefined && { ref }),
        status: DepositAndWithdrawOrderStatus.AwaitingDeposit,
        preparedAt: new Date(),
      });
      await DepositAndWithdrawOrderModel.create(sealed);

      const approvalAddress = isSolanaLike(chainId)
        ? null
        : (networkRegistry[chainId].contractData.hinkalAddress ?? null);

      res.status(200).json({
        success: true,
        orderId,
        approvalAddress,
        serializedTx,
        amountIn: totalAmount.toString(),
        amountOut: totalRecipientAmount.toString(),
        fee: fee.toString(),
      });
    } catch (err) {
      Logger.error('[private-send] error:', err);
      res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  },
);

router.get('/private-send/:orderId', verifyReadOnlySignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params as { orderId: string };
    const order = await enclaveDepositDispatcherService.getOrder(orderId);

    if (!order || !caseInsensitiveEqual(order.senderAddress, res.locals.address as string)) {
      res.status(404).json({ success: false, error: `Order ${orderId} not found` });
      return;
    }

    const scheduledTransactions = order.scheduleId
      ? await resolveDepositAndWithdrawScheduleStatus(order.scheduleId)
      : null;

    res.status(200).json({
      success: true,
      status: resolveDepositAndWithdrawPublicStatus(order.status),
      ...(scheduledTransactions && { scheduledTransactions }),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: getErrorMessage(err) });
  }
});

export default router;
