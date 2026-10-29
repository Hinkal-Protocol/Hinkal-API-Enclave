import { API_ERROR_MESSAGES, currentTronChainId, getErrorMessage, HttpError, toBase58IfTron } from '@hinkal/common';
import { Organization, OrganizationModel, PolicyRecord } from '../models/OrganizationSchema';
import { OrganizationUser, OrganizationUserModel } from '../models/OrganizationUserSchema';
import { publicDoc, toRecord, verifyRawDoc } from '../utils/documentSigning';
import { assertString, assertUuid } from '../utils/queryGuards';

const ORG_INTEGRITY_LABEL = 'organization';
const USER_INTEGRITY_LABEL = 'organization user';

const verifyOrHttpError = async <T>(
  doc: unknown,
  label: string,
  notFoundStatus: number,
  notFoundMessage: string,
): Promise<T> => {
  try {
    const verified = await verifyRawDoc(toRecord(doc), label);
    if (!verified) throw new HttpError(notFoundStatus, notFoundMessage);
    return verified as T;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(500, getErrorMessage(err));
  }
};

export class OrganizationDocuments {
  static async get(organizationId: string): Promise<Organization> {
    const raw = await OrganizationModel.findOne({
      organizationId: assertUuid(organizationId, 'organizationId'),
    }).lean();
    return verifyOrHttpError<Organization>(raw, ORG_INTEGRITY_LABEL, 404, API_ERROR_MESSAGES.ORGANIZATION_NOT_FOUND);
  }

  static async getPolicies(organizationId: string): Promise<{ organizationId: string; policies: PolicyRecord[] }> {
    const raw = await OrganizationModel.findOne({
      organizationId: assertUuid(organizationId, 'organizationId'),
    }).lean();
    const org = await publicDoc(toRecord(raw), ORG_INTEGRITY_LABEL);
    if (!org) throw new HttpError(404, API_ERROR_MESSAGES.ORGANIZATION_NOT_FOUND);
    return { organizationId, policies: (org.policies as PolicyRecord[]) ?? [] };
  }
}

export class OrganizationUserDocuments {
  static async getByPublicKey(organizationId: string, publicKey: string): Promise<OrganizationUser> {
    const raw = await OrganizationUserModel.findOne({
      organizationId: assertUuid(organizationId, 'organizationId'),
      publicKey: assertString(publicKey, 'publicKey'),
    }).lean();
    return verifyOrHttpError<OrganizationUser>(
      raw,
      USER_INTEGRITY_LABEL,
      403,
      API_ERROR_MESSAGES.SIGNER_NOT_IN_ORGANIZATION,
    );
  }

  static async getByUserId(organizationId: string, userId: string): Promise<OrganizationUser> {
    const raw = await OrganizationUserModel.findOne({
      organizationId: assertUuid(organizationId, 'organizationId'),
      userId: assertUuid(userId, 'userId'),
    }).lean();
    return verifyOrHttpError<OrganizationUser>(raw, USER_INTEGRITY_LABEL, 404, API_ERROR_MESSAGES.USER_NOT_FOUND);
  }

  static async getByWallet(organizationId: string, userId: string, walletAddress: string): Promise<OrganizationUser> {
    const assertedWallet = assertString(walletAddress, 'walletAddress');
    const raw = await OrganizationUserModel.findOne({
      organizationId: assertUuid(organizationId, 'organizationId'),
      userId: assertUuid(userId, 'userId'),
      $or: [
        { 'wallets.evmAddress': assertedWallet },
        { 'wallets.tronAddress': toBase58IfTron(currentTronChainId, assertedWallet) },
        { 'wallets.solanaAddress': assertedWallet },
      ],
    }).lean();
    return verifyOrHttpError<OrganizationUser>(raw, USER_INTEGRITY_LABEL, 403, API_ERROR_MESSAGES.WALLET_NOT_OWNED);
  }

  static async listByOrganization(organizationId: string): Promise<OrganizationUser[]> {
    const raws = await OrganizationUserModel.find({
      organizationId: assertUuid(organizationId, 'organizationId'),
    }).lean();
    return Promise.all(
      raws.map((raw) =>
        verifyOrHttpError<OrganizationUser>(
          raw,
          USER_INTEGRITY_LABEL,
          500,
          API_ERROR_MESSAGES.USER_INTEGRITY_CHECK_FAILED,
        ),
      ),
    );
  }
}
