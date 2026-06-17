import { Request, Response, Router } from 'express';
import {
  calculateTotalFee,
  ExternalActionId,
  getAmountInWei,
  getFeeStructure,
  HttpError,
  isSolanaLike,
  PAY_SEND_VARIABLE_RATE,
} from '@hinkal/common';
import { sendError } from '../../utils/routeError';
import { palApiKeyMiddleware } from '../../middleware/palApiKeyMiddleware';
import { getERC20Token } from '@hinkal/erc20-registry';

const ESTIMATED_DURATION_SECONDS = 60;

const router = Router();

router.post('/pal/quote', palApiKeyMiddleware, async (req: Request, res: Response) => {
  const { chainId, sourceAssetId, amount, recipientAddress } = req.body ?? {};

  if (chainId === undefined || !sourceAssetId || !amount) {
    res.status(400).send({ status: 'error', message: 'Missing required fields: chainId, sourceAssetId, amount' });
    return;
  }

  try {
    const parsed = Number(chainId);
    if (!Number.isFinite(parsed)) throw new HttpError(400, 'Invalid chainId');

    const token = getERC20Token(String(sourceAssetId), parsed);
    if (!token) throw new HttpError(400, 'Token not found in registry for provided chainId');

    const recipientAmount = getAmountInWei(token, String(amount));

    const feeStructure = await getFeeStructure(
      parsed,
      token.erc20TokenAddress,
      [token.erc20TokenAddress],
      ExternalActionId.Transact,
      [],
      PAY_SEND_VARIABLE_RATE,
      isSolanaLike(parsed)
        ? { mintTo: token.erc20TokenAddress, recipient: String(recipientAddress ?? ''), nullifierCount: 1 }
        : undefined,
    );

    const fee = calculateTotalFee(recipientAmount, feeStructure);
    const amountIn = recipientAmount + fee;

    res.status(200).send({
      status: 'success',
      data: {
        amountIn: amountIn.toString(),
        amountOut: recipientAmount.toString(),
        fee: fee.toString(),
        duration: ESTIMATED_DURATION_SECONDS,
      },
    });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
