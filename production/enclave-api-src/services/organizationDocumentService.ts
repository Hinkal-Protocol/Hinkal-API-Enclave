import { getErrorMessage, HttpError } from '@hinkal/common';
import { Organization, OrganizationModel, PolicyRecord } from '../models/OrganizationSchema';
import { OrganizationUser, OrganizationUserModel } from '../models/OrganizationUserSchema';
import { publicDoc, toRecord, verifyRawDoc } from '../utils/documentSigning';

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
    const raw = await OrganizationModel.findOne({ organizationId }).lean();
    return verifyOrHttpError<Organization>(raw, ORG_INTEGRITY_LABEL, 404, 'Organization not found');
  }

  static async getPolicies(organizationId: string): Promise<{ organizationId: string; policies: PolicyRecord[] }> {
    const raw = await OrganizationModel.findOne({ organizationId }).lean();
    const org = await publicDoc(toRecord(raw), ORG_INTEGRITY_LABEL);
    if (!org) throw new HttpError(404, 'Organization not found');
    return { organizationId, policies: (org.policies as PolicyRecord[]) ?? [] };
  }
}

export class OrganizationUserDocuments {
  static async getByPublicKey(organizationId: string, publicKey: string): Promise<OrganizationUser> {
    const raw = await OrganizationUserModel.findOne({ organizationId, publicKey }).lean();
    return verifyOrHttpError<OrganizationUser>(raw, USER_INTEGRITY_LABEL, 403, 'Signer not found in organization');
  }

  static async getByUserId(organizationId: string, userId: string): Promise<OrganizationUser> {
    const raw = await OrganizationUserModel.findOne({ organizationId, userId }).lean();
    return verifyOrHttpError<OrganizationUser>(raw, USER_INTEGRITY_LABEL, 404, 'User not found');
  }

  static async getByWallet(organizationId: string, userId: string, walletAddress: string): Promise<OrganizationUser> {
    const raw = await OrganizationUserModel.findOne({
      organizationId,
      userId,
      $or: [
        { 'wallets.evmAddress': walletAddress },
        { 'wallets.tronAddress': walletAddress },
        { 'wallets.solanaAddress': walletAddress },
      ],
    }).lean();
    return verifyOrHttpError<OrganizationUser>(raw, USER_INTEGRITY_LABEL, 403, 'Wallet does not belong to user');
  }

  static async listByOrganization(organizationId: string): Promise<OrganizationUser[]> {
    const raws = await OrganizationUserModel.find({ organizationId }).lean();
    return Promise.all(
      raws.map((raw) =>
        verifyOrHttpError<OrganizationUser>(raw, USER_INTEGRITY_LABEL, 500, 'User integrity check failed'),
      ),
    );
  }
}
