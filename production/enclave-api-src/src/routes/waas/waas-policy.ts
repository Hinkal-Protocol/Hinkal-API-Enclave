import { Request, Response, Router } from 'express';
import { PolicyRecord } from '../../models/OrganizationSchema';
import {
  addOrganizationPolicy,
  removeOrganizationPolicy,
  updateOrganizationPolicy,
} from '../../services/organizationPolicyService';
import { findSignerOrThrow, requireRoot, resolveTargetUser } from '../../utils/authHelpers';
import { sendError } from '../../utils/routeError';
import { AddPolicyRequestBody, RemovePolicyRequestBody, UpdatePolicyRequestBody } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import { OrganizationDocuments } from '../../services/organizationDocumentService';
import { xStampMiddleware } from '../../middleware/xStamp';

const router = Router();

router.post('/waas/add-policy', xStampMiddleware, async (req: Request, res: Response) => {
  const body = req.body as AddPolicyRequestBody;

  if (!body.organizationId || !body.policy) {
    res.status(400).send({ status: 'error', message: 'Missing required fields: organizationId, policy' });
    return;
  }

  try {
    const signer = await findSignerOrThrow(body.organizationId, res.locals.signerPublicKey as string);
    requireRoot(signer, 'add policy');

    const policyDoc: PolicyRecord = {
      policyId: uuidv4(),
      userIds: body.policy.userIds,
      actionType: body.policy.actionType,
    };

    const policies = await addOrganizationPolicy(body.organizationId, policyDoc);

    res.status(200).send({
      status: 'success',
      data: { organizationId: body.organizationId, policies },
    });
  } catch (err: unknown) {
    sendError(res, err);
  }
});

router.post('/waas/remove-policy', xStampMiddleware, async (req: Request, res: Response) => {
  const body = req.body as RemovePolicyRequestBody;

  if (!body.organizationId || !body.policyId) {
    res.status(400).send({ status: 'error', message: 'Missing required fields: organizationId, policyId' });
    return;
  }

  try {
    const signer = await findSignerOrThrow(body.organizationId, res.locals.signerPublicKey as string);
    requireRoot(signer, 'remove policy');

    const policies = await removeOrganizationPolicy(body.organizationId, body.policyId);

    res.status(200).send({
      status: 'success',
      data: { organizationId: body.organizationId, policies },
    });
  } catch (err: unknown) {
    sendError(res, err);
  }
});

router.post('/waas/update-policy', xStampMiddleware, async (req: Request, res: Response) => {
  const body = req.body as UpdatePolicyRequestBody;

  if (!body.organizationId || !body.policyId || !body.newPolicy) {
    res.status(400).send({ status: 'error', message: 'Missing required fields: organizationId, policyId, newPolicy' });
    return;
  }

  try {
    const signer = await findSignerOrThrow(body.organizationId, res.locals.signerPublicKey as string);
    requireRoot(signer, 'update policy');

    const newPolicyDoc: PolicyRecord = {
      policyId: body.policyId,
      userIds: body.newPolicy.userIds,
      actionType: body.newPolicy.actionType,
    };

    const policies = await updateOrganizationPolicy(body.organizationId, body.policyId, newPolicyDoc);

    res.status(200).send({
      status: 'success',
      data: { organizationId: body.organizationId, policies },
    });
  } catch (err: unknown) {
    sendError(res, err);
  }
});

router.get('/waas/get-user-policy', xStampMiddleware, async (req: Request, res: Response) => {
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
        allowedActions: target.allowedActions,
      },
    });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/waas/get-organization-policy', xStampMiddleware, async (req: Request, res: Response) => {
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
    requireRoot(signer, 'fetch organization policy');

    const { policies } = await OrganizationDocuments.getPolicies(organizationId);

    res.status(200).send({
      status: 'success',
      data: { organizationId, policies },
    });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
