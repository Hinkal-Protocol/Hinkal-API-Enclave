import { Request, Response, Router } from 'express';
import { verifyDepositAndWithdrawSignatureMiddleware } from '../middleware';
import { DepositAndWithdrawRequest, DepositAndWithdrawResponse } from '../types';
import {
  ExternalActionId,
  getERC20Token,
  getErrorMessage,
  getFeeStructure,
  hinkalPalEvmDepositPrepare,
  hinkalPalSolanaDepositPrepare,
  hinkalPalTronDepositPrepare,
  isSolanaLike,
  isTronLike,
  Logger,
  networkRegistry,
  PAY_SEND_VARIABLE_RATE,
} from '@hinkal/common';
import { ethers } from 'ethers';
import { DepositAndWithdrawOrderModel, DepositAndWithdrawOrderStatus } from '../models';
import { hinkalInitializerService } from '../services/hinkalInitializerService';
import { sealDocument } from '../utils/documentSigning';
import { signResponseBody } from '../utils/responseSignature';
import { enclaveDepositDispatcherService } from '../services/EnclaveWithdrawDispatcherService';
import { resolveDepositAndWithdrawScheduleStatus } from '../services/resolveDepositAndWithdrawScheduleStatus';
import { resolveDepositAndWithdrawPublicStatus } from '../utils/resolveDepositAndWithdrawPublicStatus';

const router = Router();

router.post(
  '/private-send',
  verifyDepositAndWithdrawSignatureMiddleware,
  async (
    req: Request<object, DepositAndWithdrawResponse, DepositAndWithdrawRequest>,
    res: Response<DepositAndWithdrawResponse>,
  ) => {
    const { address, chainId, tokenAddress, recipients, feeToken, txCompletionTime } =
      req.body as DepositAndWithdrawRequest;

    if (!address || !chainId || !tokenAddress || !recipients?.length) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: address, chainId, tokenAddress, recipients',
      });
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
      const hinkal = await hinkalInitializerService.initalizeHinkalForAddress(address, chainId);

      const feeStructure = await getFeeStructure(
        chainId,
        feeToken ?? token.erc20TokenAddress,
        [token.erc20TokenAddress],
        ExternalActionId.Transact,
        [],
        PAY_SEND_VARIABLE_RATE,
        isSolanaLike(chainId)
          ? { mintTo: token.erc20TokenAddress, recipient: recipients[0].address, nullifierCount: recipients.length }
          : undefined,
      );

      let serializedTx: string;
      let utxoAmounts: bigint[];

      if (isSolanaLike(chainId)) {
        const result = await hinkalPalSolanaDepositPrepare(
          hinkal,
          chainId,
          token,
          recipientAmounts,
          feeStructure,
          orderId,
        );
        serializedTx = Buffer.from(result.unsignedTx.serialize()).toString('base64');
        utxoAmounts = result.utxoAmounts;
      } else if (isTronLike(chainId)) {
        const result = await hinkalPalTronDepositPrepare(
          hinkal,
          chainId,
          token,
          recipientAmounts,
          feeStructure,
          orderId,
        );
        serializedTx = Buffer.from(JSON.stringify(result.unsignedTx)).toString('base64');
        utxoAmounts = result.utxoAmounts;
      } else {
        const result = await hinkalPalEvmDepositPrepare(
          hinkal,
          chainId,
          token,
          recipientAmounts,
          feeStructure,
          orderId,
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const txData = { ...(result.unsignedTx as any) };
        delete txData.from;
        const evmTx = ethers.Transaction.from(txData);
        serializedTx = Buffer.from(evmTx.unsignedSerialized.slice(2), 'hex').toString('base64');
        utxoAmounts = result.utxoAmounts;
      }

      const totalAmount = utxoAmounts.reduce((sum, a) => sum + a, 0n);
      const fee = totalAmount - totalRecipientAmount;

      const sealed = await sealDocument({
        orderId,
        chainId,
        senderAddress: address,
        recipients,
        tokenAddress: token.erc20TokenAddress,
        feeToken: feeStructure.feeToken,
        flatFee: feeStructure.flatFee.toString(),
        variableRate: feeStructure.variableRate.toString(),
        utxoAmounts: utxoAmounts.map((a) => a.toString()),
        ...(txCompletionTime !== undefined && { txCompletionTime }),
        status: DepositAndWithdrawOrderStatus.AwaitingDeposit,
        preparedAt: new Date(),
      });
      await DepositAndWithdrawOrderModel.create(sealed);

      const approvalAddress = isSolanaLike(chainId)
        ? null
        : (networkRegistry[chainId].contractData.depositOnChainUtxosExternalActionAddress ?? null);

      const responseBody = JSON.stringify({
        success: true,
        orderId,
        approvalAddress,
        serializedTx,
        amountIn: totalAmount.toString(),
        amountOut: totalRecipientAmount.toString(),
        fee: fee.toString(),
      });
      res.setHeader('X-Enclave-Signature', signResponseBody(responseBody));
      (res.status(200).type('json') as unknown as Response).send(responseBody);
    } catch (err) {
      Logger.error('[private-send] error:', err);
      res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  },
);

router.get('/private-send/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params as { orderId: string };
    const order = await enclaveDepositDispatcherService.getOrder(orderId);

    if (!order) {
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
