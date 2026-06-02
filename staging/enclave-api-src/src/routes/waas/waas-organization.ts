import { Request, Response, Router } from 'express';
import { OrganizationModel, OrganizationUserModel, UserRole } from '../../models';
import { findSignerOrThrow, requireRoot, sendError } from '../../utils';
import { OrganizationDocuments, OrganizationUserDocuments } from '../../services/organizationDocumentService';
import { chainIds, currentTronChainId, WalletManager } from '@hinkal/common';
import { cryptoHelper } from '../../crypto';
import { CreateOrganizationRequestBody } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import { sealDocument } from '../../utils/documentSigning';
import { xStampMiddleware } from '../../middleware/xStamp';
import { ensureRecipientInfoPoolForApi } from '../../utils/ensureRecipientInfoPoolForApi';

const router = Router();

router.post('/waas/create-organization', xStampMiddleware, async (req: Request, res: Response) => {
  const body = req.body as CreateOrganizationRequestBody;

  if (!body.organizationName) {
    res.status(400).send({ status: 'error', message: 'Missing required field: organizationName' });
    return;
  }

  try {
    const signerPublicKey = res.locals.signerPublicKey as string;

    const organizationId = uuidv4();
    const userId = uuidv4();
    const walletManager = new WalletManager();
    const mnemonicPhrase = walletManager.generateMnemonic().join(' ');
    const { ethereum, tron, solana } = await walletManager.createMainWallet(mnemonicPhrase);
    const encrypted = await cryptoHelper.encrypt(Buffer.from(mnemonicPhrase, 'utf8'));
    const encryptedMnemonic = encrypted.toString('base64');

    const organizationDocument = await sealDocument({
      organizationId,
      name: body.organizationName,
      policies: [],
    });
    const organization = new OrganizationModel(organizationDocument);
    await organization.save();

    const orgUserDocument = await sealDocument({
      organizationId,
      userId,
      publicKey: signerPublicKey,
      role: UserRole.Root,
      encryptedMnemonic,
      wallets: [{ evmAddress: ethereum.address, tronAddress: tron.address, solanaAddress: solana.publicKey }],
      allowedActions: [],
    });
    const orgUser = new OrganizationUserModel(orgUserDocument);
    await orgUser.save();

    await Promise.all([
      ensureRecipientInfoPoolForApi(organizationId, userId, ethereum.address, signerPublicKey, chainIds.ethMainnet),
      ensureRecipientInfoPoolForApi(organizationId, userId, tron.address, signerPublicKey, currentTronChainId),
      ensureRecipientInfoPoolForApi(organizationId, userId, solana.publicKey, signerPublicKey, chainIds.solanaMainnet),
    ]);

    res.status(200).send({
      status: 'success',
      data: {
        organizationId,
        userId,
        role: UserRole.Root,
        addresses: [{ evm: ethereum.address, tron: tron.address, solana: solana.publicKey }],
      },
    });
  } catch (err: unknown) {
    sendError(res, err);
  }
});

router.get('/waas/get-organization', xStampMiddleware, async (req: Request, res: Response) => {
  const signerPublicKey = res.locals.signerPublicKey as string;

  const { organizationId } = req.query as Record<string, string>;

  if (!organizationId) {
    res.status(400).send({
      status: 'error',
      message: 'Missing required fields: organizationId',
    });
    return;
  }

  try {
    const signer = await findSignerOrThrow(organizationId, signerPublicKey);
    requireRoot(signer, 'fetch organization data');

    const [org, users] = await Promise.all([
      OrganizationDocuments.get(organizationId),
      OrganizationUserDocuments.listByOrganization(organizationId),
    ]);

    res.status(200).send({
      status: 'success',
      data: {
        name: org.name,
        policies: org.policies,
        users: users.map((u) => ({
          userId: u.userId,
          role: u.role,
          publicKey: u.publicKey,
          allowedActions: u.allowedActions,
        })),
      },
    });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/waas/delete-organization', xStampMiddleware, async (req: Request, res: Response) => {
  const signerPublicKey = res.locals.signerPublicKey as string;

  const { organizationId } = req.body as Record<string, string>;

  if (!organizationId) {
    res.status(400).send({
      status: 'error',
      message: 'Missing required fields: organizationId',
    });
    return;
  }

  try {
    const signer = await findSignerOrThrow(organizationId, signerPublicKey);
    requireRoot(signer, 'delete organization');

    await OrganizationModel.deleteOne({ organizationId });
    await OrganizationUserModel.deleteMany({ organizationId });

    res.status(200).send({
      status: 'success',
      message: 'Organization deleted successfully',
      data: { organizationId },
    });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
