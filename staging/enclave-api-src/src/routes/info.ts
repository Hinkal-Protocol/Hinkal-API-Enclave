import { Request, Response, Router } from 'express';
import { chainIds, getErrorMessage, HINKAL_SUPPORTED_CHAINS, isSolanaLike, networkRegistry } from '@hinkal/common';
import { SupportedChainsResponse, SupportedTokensRequest, SupportedTokensResponse } from '../types/route.types';
import { getPopularTokensForChain } from '../utils/supported.utils';
import { POPULAR_TOKEN_CHAIN_IDS } from '@hinkal/erc20-registry';

const router = Router();

router.get(
  '/supported-tokens',
  async (
    req: Request<object, SupportedTokensResponse, never, SupportedTokensRequest>,
    res: Response<SupportedTokensResponse>,
  ) => {
    try {
      const { chainId } = req.query;

      if (chainId !== undefined) {
        const chainIdNum = Number(chainId);
        if (!POPULAR_TOKEN_CHAIN_IDS.includes(chainIdNum)) {
          res.status(400).json({ success: false, error: `Unsupported chainId: ${chainId}` });
          return;
        }
        res.status(200).json({ success: true, tokens: { [chainIdNum]: getPopularTokensForChain(chainIdNum) } });
        return;
      }

      const tokens = Object.fromEntries(POPULAR_TOKEN_CHAIN_IDS.map((id) => [id, getPopularTokensForChain(id)]));
      res.status(200).json({ success: true, tokens });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  },
);

router.get('/supported-chains', async (_req: Request, res: Response<SupportedChainsResponse>) => {
  try {
    const chains = HINKAL_SUPPORTED_CHAINS.map((chainId) => ({
      chainId,
      name: networkRegistry[chainId]?.name ?? '',
    }));

    res.status(200).json({ success: true, chains });
  } catch (error) {
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

router.get('/contract-addresses', (_req: Request, res: Response) => {
  try {
    const addresses = Object.fromEntries(
      HINKAL_SUPPORTED_CHAINS.filter((chainId) => !isSolanaLike(chainId) && chainId !== chainIds.tronNile).map(
        (chainId) => {
          const { contractData } = networkRegistry[chainId];
          const entry: Record<string, string> = { hinkalAddress: contractData.hinkalAddress };
          if (contractData.hinkalHelperAddress) {
            entry.hinkalHelperAddress = contractData.hinkalHelperAddress;
          }
          return [chainId, entry];
        },
      ),
    );

    res.status(200).json({ success: true, addresses });
  } catch (error) {
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

export default router;
