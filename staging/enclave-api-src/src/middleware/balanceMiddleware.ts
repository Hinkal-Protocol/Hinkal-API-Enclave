import { NextFunction, Request, Response } from 'express';
import { UserRole } from '../models/OrganizationUserSchema';
import { OrganizationUserDocuments } from '../services/organizationDocumentService';
import { sendError } from '../utils/routeError';

export const balanceAuthMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const { organizationId, userId, walletAddress } = req.query as Record<string, string>;

  if (!organizationId || !userId || !walletAddress) {
    res.status(400).send({
      status: 'error',
      message: 'Missing required fields: organizationId, userId, walletAddress',
    });
    return;
  }

  const signerPublicKey = res.locals.signerPublicKey as string;

  try {
    const signer = await OrganizationUserDocuments.getByPublicKey(organizationId, signerPublicKey);

    const isRoot = signer.role === UserRole.Root;
    const isSelf = signer.userId === userId;

    if (!isRoot && !isSelf) {
      res.status(403).send({ status: 'error', message: 'Access denied' });
      return;
    }

    await OrganizationUserDocuments.getByWallet(organizationId, userId, walletAddress);
    next();
  } catch (err) {
    sendError(res, err);
  }
};
