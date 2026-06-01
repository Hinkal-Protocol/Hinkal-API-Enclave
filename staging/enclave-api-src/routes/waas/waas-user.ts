import { Request, Response, Router } from 'express';
import { findSignerOrThrow, requireRoot, resolveTargetUser } from '../../utils/authHelpers';
import { sendError } from '../../utils/routeError';
import { CreateUserRequestBody } from '../../types';
import { WalletManager } from '@hinkal/common';
import { v4 as uuidv4 } from 'uuid';
import { cryptoHelper } from '../../crypto';
import { OrganizationUserModel, UserRole } from '../../models/OrganizationUserSchema';
import { sealDocument } from '../../utils/documentSigning';
import { xStampMiddleware } from '../../middleware/xStamp';

const router = Router();

router.post('/waas/create-user', xStampMiddleware, async (req: Request, res: Response) => {
  const body = req.body as CreateUserRequestBody;

  if (!body.organizationId || !body.publicKey) {
    res.status(400).send({ status: 'error', message: 'Missing required fields: organizationId, publicKey' });
    return;
  }

  try {
    const signer = await findSignerOrThrow(body.organizationId, res.locals.signerPublicKey as string);
    requireRoot(signer, 'create user');

    const userId = uuidv4();
    const walletManager = new WalletManager();
    const mnemonicPhrase = walletManager.generateMnemonic().join(' ');
    const { ethereum, tron, solana } = await walletManager.createMainWallet(mnemonicPhrase);
    const encrypted = await cryptoHelper.encrypt(Buffer.from(mnemonicPhrase, 'utf8'));
    const encryptedMnemonic = encrypted.toString('base64');
    const userDocument = await sealDocument({
      organizationId: body.organizationId,
      userId,
      publicKey: body.publicKey,
      role: UserRole.User,
      encryptedMnemonic,
      wallets: [{ evmAddress: ethereum.address, tronAddress: tron.address, solanaAddress: solana.publicKey }],
      allowedActions: [],
    });

    const user = new OrganizationUserModel(userDocument);
    await user.save();

    res.status(200).send({
      status: 'success',
      data: {
        userId,
        role: UserRole.User,
        addresses: [{ evm: ethereum.address, tron: tron.address, solana: solana.publicKey }],
      },
    });
  } catch (err: unknown) {
    sendError(res, err);
  }
});

router.get('/waas/get-user', xStampMiddleware, async (req: Request, res: Response) => {
  const signerPublicKey = res.locals.signerPublicKey as string;

  const { organizationId, userId } = req.query as Record<string, string>;

  if (!organizationId || !userId) {
    res.status(400).send({
      status: 'error',
      message: 'Missing required fields: organizationId, userId',
    });
    return;
  }

  try {
    const target = await resolveTargetUser(organizationId, userId, signerPublicKey);

    res.status(200).send({
      status: 'success',
      data: {
        role: target.role,
        publicKey: target.publicKey,
        allowedActions: target.allowedActions,
        addresses: (target.wallets ?? []).map((w) => ({
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
