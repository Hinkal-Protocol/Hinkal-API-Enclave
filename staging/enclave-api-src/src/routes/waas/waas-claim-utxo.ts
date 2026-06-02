import { Request, Response, Router } from 'express';
import { Utxo } from '@hinkal/common';
import { parseChainId, resolveToken } from '../../utils/transactionHelpers';
import { sendError } from '../../utils/routeError';
import { hinkalInitializerService } from '../../services/hinkalInitializerService';
import { xStampMiddleware } from '../../middleware';

const router = Router();

router.post('/waas/claim-utxo', xStampMiddleware, async (req: Request, res: Response) => {
  const { organizationId, userId, fromAddress, token: tokenAddress, chainId, utxo } = req.body ?? {};

  if (!organizationId || !userId || !fromAddress || !tokenAddress || chainId === undefined || !utxo) {
    res.status(400).send({
      status: 'error',
      message: 'Missing required fields: organizationId, userId, fromAddress, token, chainId, utxo',
    });
    return;
  }

  const { amount, randomization, stealthAddress, shieldedPrivateKey } = utxo;
  if (amount === undefined || randomization === undefined || !stealthAddress || !shieldedPrivateKey) {
    res.status(400).send({
      status: 'error',
      message: 'Missing required utxo fields: amount, randomization, stealthAddress, shieldedPrivateKey',
    });
    return;
  }

  try {
    const signerPublicKey = res.locals.signerPublicKey as string;
    const parsedChainId = parseChainId(chainId);
    const token = resolveToken(tokenAddress, parsedChainId);
    const hinkal = await hinkalInitializerService.initHinkalForOrganization(
      organizationId,
      userId,
      signerPublicKey,
      fromAddress,
      parsedChainId,
    );

    const claimableUtxo = new Utxo({
      amount: BigInt(amount),
      erc20TokenAddress: utxo.erc20TokenAddress,
      mintAddress: utxo.mintAddress,
      randomization: BigInt(randomization),
      stealthAddress,
      shieldedPrivateKey,
      timeStamp: utxo.timeStamp,
      tokenId: utxo.tokenId,
    });

    const txHash = await hinkal.claimUtxo(token, claimableUtxo);

    res.status(200).send({ status: 'success', data: { txHash } });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
