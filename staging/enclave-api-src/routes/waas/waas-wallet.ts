import { Request, Response, Router } from 'express';
import { requireActionPermission, requireRootOrSelf, resolveTargetUser } from '../../utils/authHelpers';
import { WaasPolicyAction } from '../../constants/policyActions';
import { sendError } from '../../utils/routeError';
import { chainIds, currentTronChainId, HttpError, WalletManager } from '@hinkal/common';
import { CreateWalletRequestBody } from '../../types';
import { cryptoHelper } from '../../crypto';
import { appendWalletToUser } from '../../services/organizationUserService';
import { xStampMiddleware } from '../../middleware/xStamp';
import { ensureRecipientInfoPoolForApi } from '../../utils/ensureRecipientInfoPoolForApi';

const router = Router();

router.post('/waas/create-wallet', xStampMiddleware, async (req: Request, res: Response) => {
  const body = req.body as CreateWalletRequestBody;

  if (!body.organizationId || !body.userId) {
    res.status(400).send({ status: 'error', message: 'Missing required fields: organizationId, userId' });
    return;
  }
  try {
    const publicKey = res.locals.signerPublicKey as string;

    const signer = await resolveTargetUser(body.organizationId, body.userId, publicKey);
    requireRootOrSelf(signer, body.userId);
    requireActionPermission(signer, WaasPolicyAction.CREATE_WALLET);

    const { encryptedMnemonic } = signer;
    const mnemonic = (await cryptoHelper.decrypt(Buffer.from(encryptedMnemonic, 'base64'))).toString('utf8');
    const newWalletIndex = signer.wallets.length;
    const walletManager = new WalletManager();
    walletManager.createMainWallet(mnemonic);
    const { ethereum, tron, solana } = await walletManager.createChildWallet(newWalletIndex);

    await appendWalletToUser(body.organizationId, body.userId, {
      evmAddress: ethereum.address,
      tronAddress: tron.address,
      solanaAddress: solana.publicKey,
    });

    await Promise.all([
      ensureRecipientInfoPoolForApi(body.organizationId, body.userId, ethereum.address, publicKey, chainIds.ethMainnet),
      ensureRecipientInfoPoolForApi(body.organizationId, body.userId, tron.address, publicKey, currentTronChainId),
      ensureRecipientInfoPoolForApi(
        body.organizationId,
        body.userId,
        solana.publicKey,
        publicKey,
        chainIds.solanaMainnet,
      ),
    ]);

    res.status(200).send({
      status: 'success',
      data: {
        addresses: {
          evm: ethereum.address,
          tron: tron.address,
          solana: solana.publicKey,
        },
      },
    });
  } catch (err: unknown) {
    sendError(res, err);
  }
});

router.get('/waas/get-wallets', xStampMiddleware, async (req: Request, res: Response) => {
  const signerPublicKey = res.locals.signerPublicKey as string;

  const { organizationId, userId } = req.query as Record<string, string>;

  if (!organizationId || !userId) {
    res.status(400).send({
      status: 'error',
      message: 'Missing required fields: organizationId, userId, signerPublicKey, stampSignature',
    });
    return;
  }

  try {
    const target = await resolveTargetUser(organizationId, userId, signerPublicKey);
    if (!target.wallets?.length) throw new HttpError(404, 'No wallets found');

    res.status(200).send({
      status: 'success',
      data: {
        wallets: target.wallets.map((w) => ({
          evm: w.evmAddress,
          tron: w.tronAddress,
          solana: w.solanaAddress,
        })),
      },
    });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
