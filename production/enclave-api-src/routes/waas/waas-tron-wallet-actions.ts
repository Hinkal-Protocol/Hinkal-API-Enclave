import { Request, Response, Router } from 'express';
import { isTronLike } from '@hinkal/common/constants/chains.constants';
import { HttpError } from '@hinkal/common';
import { parseChainId } from '../../utils/transactionHelpers';
import {
  buildTronDelegateResourceTransaction,
  buildTronFreezeTransaction,
  buildTronSigner,
  buildTronUnfreezeTransaction,
  sendTronTransaction,
} from '../../utils/tron-wallet.utils';
import { sendError } from '../../utils/routeError';
import { xStampMiddleware } from '../../middleware';

const router = Router();

const VALID_RESOURCES = ['ENERGY', 'BANDWIDTH'] as const;
type TronResource = (typeof VALID_RESOURCES)[number];

const parseTronResource = (resource: unknown): TronResource => {
  if (!VALID_RESOURCES.includes(resource as TronResource)) {
    throw new HttpError(400, `resource must be one of: ${VALID_RESOURCES.join(', ')}`);
  }
  return resource as TronResource;
};

router.post('/waas/wallet/tron/freeze', xStampMiddleware, async (req: Request, res: Response) => {
  const { organizationId, userId, fromAddress, chainId, amount, resource } = req.body ?? {};

  if (!organizationId || !userId || !fromAddress || chainId === undefined || !amount || !resource) {
    res.status(400).send({
      status: 'error',
      message: 'Missing required fields: organizationId, userId, fromAddress, chainId, amount, resource',
    });
    return;
  }

  try {
    const signerPublicKey = res.locals.signerPublicKey as string;
    const parsedChainId = parseChainId(chainId);
    if (!isTronLike(parsedChainId)) throw new HttpError(400, 'chainId is not a Tron chain');

    const { tronWeb } = await buildTronSigner(signerPublicKey, organizationId, userId, fromAddress, parsedChainId);
    const tx = await buildTronFreezeTransaction(tronWeb, fromAddress, BigInt(amount), parseTronResource(resource));
    const txHash = await sendTronTransaction(tronWeb, tx);
    res.status(200).send({ status: 'success', data: { txHash } });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/waas/wallet/tron/unfreeze', xStampMiddleware, async (req: Request, res: Response) => {
  const { organizationId, userId, fromAddress, chainId, amount, resource } = req.body ?? {};

  if (!organizationId || !userId || !fromAddress || chainId === undefined || !amount || !resource) {
    res.status(400).send({
      status: 'error',
      message: 'Missing required fields: organizationId, userId, fromAddress, chainId, amount, resource',
    });
    return;
  }

  try {
    const signerPublicKey = res.locals.signerPublicKey as string;
    const parsedChainId = parseChainId(chainId);
    if (!isTronLike(parsedChainId)) throw new HttpError(400, 'chainId is not a Tron chain');

    const { tronWeb } = await buildTronSigner(signerPublicKey, organizationId, userId, fromAddress, parsedChainId);
    const tx = await buildTronUnfreezeTransaction(tronWeb, fromAddress, BigInt(amount), parseTronResource(resource));
    const txHash = await sendTronTransaction(tronWeb, tx);
    res.status(200).send({ status: 'success', data: { txHash } });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/waas/wallet/tron/delegate-resource', xStampMiddleware, async (req: Request, res: Response) => {
  const { organizationId, userId, fromAddress, chainId, to, amount, resource } = req.body ?? {};

  if (!organizationId || !userId || !fromAddress || chainId === undefined || !to || !amount || !resource) {
    res.status(400).send({
      status: 'error',
      message: 'Missing required fields: organizationId, userId, fromAddress, chainId, to, amount, resource',
    });
    return;
  }

  try {
    const signerPublicKey = res.locals.signerPublicKey as string;
    const parsedChainId = parseChainId(chainId);
    if (!isTronLike(parsedChainId)) throw new HttpError(400, 'chainId is not a Tron chain');

    const { tronWeb } = await buildTronSigner(signerPublicKey, organizationId, userId, fromAddress, parsedChainId);
    const tx = await buildTronDelegateResourceTransaction(
      tronWeb,
      fromAddress,
      to,
      BigInt(amount),
      parseTronResource(resource),
    );
    const txHash = await sendTronTransaction(tronWeb, tx);
    res.status(200).send({ status: 'success', data: { txHash } });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
