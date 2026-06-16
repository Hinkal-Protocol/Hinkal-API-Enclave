import { Request, Response, Router } from 'express';
import { getGasTokenSymbols, HttpError } from '@hinkal/common';
import { sendError } from '../../utils/routeError';
import { palApiKeyMiddleware } from '../../middleware/palApiKeyMiddleware';
import { getErc20TokensForChain } from '@hinkal/erc20-registry';

const router = Router();

router.get('/pal/tokens', palApiKeyMiddleware, async (req: Request, res: Response) => {
  try {
    const parsed = Number(req.query.chainId);
    if (!Number.isFinite(parsed)) throw new HttpError(400, 'Invalid or missing chainId');

    const gasTokenSymbols = await getGasTokenSymbols(parsed);
    const supportedSymbols = new Set(gasTokenSymbols);
    const tokens = getErc20TokensForChain(parsed)
      .filter((t) => supportedSymbols.has(t.symbol))
      .map((t) => ({ assetId: t.erc20TokenAddress, symbol: t.symbol, decimals: t.decimals }));

    res.status(200).send({ status: 'success', data: { tokens } });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
