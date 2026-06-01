import { Request, Response, Router } from 'express';
import { getErc20TokensForChain, getGasTokenSymbols, HttpError } from '@hinkal/common';
import { sendError } from '../../utils/routeError';
import { palApiKeyMiddleware } from '../../middleware/palApiKeyMiddleware';

const router = Router();

router.get('/pal/tokens', palApiKeyMiddleware, (req: Request, res: Response) => {
  try {
    const parsed = Number(req.query.chainId);
    if (!Number.isFinite(parsed)) throw new HttpError(400, 'Invalid or missing chainId');

    const supportedSymbols = new Set(getGasTokenSymbols(parsed));
    const tokens = getErc20TokensForChain(parsed)
      .filter((t) => supportedSymbols.has(t.symbol))
      .map((t) => ({ assetId: t.erc20TokenAddress, symbol: t.symbol, decimals: t.decimals }));

    res.status(200).send({ status: 'success', data: { tokens } });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
