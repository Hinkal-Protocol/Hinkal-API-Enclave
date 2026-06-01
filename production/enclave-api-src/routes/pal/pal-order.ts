import { ethers } from 'ethers';
import crypto from 'crypto';
import { Request, Response, Router } from 'express';
import {
  ExternalActionId,
  getAmountInWei,
  getERC20Token,
  getFeeStructure,
  hinkalPalEvmDepositPrepare,
  hinkalPalSolanaDepositPrepare,
  hinkalPalTronDepositPrepare,
  HttpError,
  isSolanaLike,
  isTronLike,
  Logger,
  networkRegistry,
  PAY_SEND_VARIABLE_RATE,
} from '@hinkal/common';
import {
  DepositAndWithdrawOrderModel,
  DepositAndWithdrawOrderStatus,
} from '../../models/DepositAndWithdrawOrderSchema';
import { hinkalInitializerService } from '../../services/hinkalInitializerService';
import { sealDocument } from '../../utils/documentSigning';
import { sendError } from '../../utils/routeError';
import { palApiKeyMiddleware } from '../../middleware/palApiKeyMiddleware';

const router = Router();

router.post('/pal/order', palApiKeyMiddleware, async (req: Request, res: Response) => {
  const { chainId, sourceAssetId, amount, senderAddress, recipientAddress } = req.body ?? {};

  if (chainId === undefined || !sourceAssetId || !amount || !senderAddress || !recipientAddress) {
    res.status(400).send({
      status: 'error',
      message: 'Missing required fields: chainId, sourceAssetId, amount, senderAddress, recipientAddress',
    });
    return;
  }

  try {
    const parsed = Number(chainId);
    if (!Number.isFinite(parsed)) throw new HttpError(400, 'Invalid chainId');

    const token = getERC20Token(String(sourceAssetId), parsed);
    if (!token) throw new HttpError(400, 'Token not found in registry for provided chainId');

    const recipientAmount = getAmountInWei(token, String(amount));
    const orderId = crypto.randomUUID();
    const hinkal = await hinkalInitializerService.initalizeHinkalForAddress(String(senderAddress), parsed);

    const feeStructure = await getFeeStructure(
      parsed,
      token.erc20TokenAddress,
      [token.erc20TokenAddress],
      ExternalActionId.Transact,
      [],
      PAY_SEND_VARIABLE_RATE,
      isSolanaLike(parsed)
        ? { mintTo: token.erc20TokenAddress, recipient: String(recipientAddress), nullifierCount: 1 }
        : undefined,
    );

    let serializedTx: string;
    let utxoAmounts: bigint[];

    if (isSolanaLike(parsed)) {
      const result = await hinkalPalSolanaDepositPrepare(
        hinkal,
        parsed,
        token,
        [recipientAmount],
        feeStructure,
        orderId,
      );
      serializedTx = Buffer.from(result.unsignedTx.serialize()).toString('base64');
      utxoAmounts = result.utxoAmounts;
    } else if (isTronLike(parsed)) {
      const result = await hinkalPalTronDepositPrepare(hinkal, parsed, token, [recipientAmount], feeStructure, orderId);
      serializedTx = Buffer.from(JSON.stringify(result.unsignedTx)).toString('base64');
      utxoAmounts = result.utxoAmounts;
    } else {
      const result = await hinkalPalEvmDepositPrepare(hinkal, parsed, token, [recipientAmount], feeStructure, orderId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const txData = { ...(result.unsignedTx as any) };
      delete txData.from;
      const evmTx = ethers.Transaction.from(txData);
      serializedTx = Buffer.from(evmTx.unsignedSerialized.slice(2), 'hex').toString('base64');
      utxoAmounts = result.utxoAmounts;
    }

    const totalAmount = utxoAmounts.reduce((sum, a) => sum + a, 0n);
    const fee = totalAmount - recipientAmount;

    const sealed = await sealDocument({
      orderId,
      chainId: parsed,
      senderAddress: String(senderAddress),
      recipientAddress: String(recipientAddress),
      tokenAddress: token.erc20TokenAddress,
      amount: recipientAmount.toString(),
      feeToken: feeStructure.feeToken,
      flatFee: feeStructure.flatFee.toString(),
      variableRate: feeStructure.variableRate.toString(),
      utxoAmounts: utxoAmounts.map((a) => a.toString()),
      status: DepositAndWithdrawOrderStatus.AwaitingDeposit,
      preparedAt: new Date(),
    });
    await DepositAndWithdrawOrderModel.create(sealed);

    const approvalAddress = isSolanaLike(parsed)
      ? null
      : (networkRegistry[parsed].contractData.depositOnChainUtxosExternalActionAddress ?? null);

    res.status(200).send({
      status: 'success',
      data: {
        trackingId: orderId,
        approvalAddress,
        serializedTx,
        amountIn: totalAmount.toString(),
        amountOut: recipientAmount.toString(),
        fee: fee.toString(),
        eta: 60,
        sourceSymbol: token.symbol,
        destinationSymbol: token.symbol,
      },
    });
  } catch (err) {
    Logger.error('[pal/order] error:', err);
    sendError(res, err);
  }
});

export default router;
