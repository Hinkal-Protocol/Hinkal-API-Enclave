import { isAddress } from 'ethers';
import { getAnyRecipientInfo } from '@hinkal/common/API/getAnyRecipientInfo';
import {
  isValidPrivateAddress,
  isValidSolanaPublicKey,
  isValidTronAddress,
} from '@hinkal/common/functions/utils/addresses';
import { getRecipientInfoFromUserKeys } from '@hinkal/common/functions/utils/getRecipientInfoFromUserKeys';
import { UserKeys } from '@hinkal/common/data-structures/crypto-keys/keys';
import { getERC20Token } from '@hinkal/erc20-registry';
import { ERC20Token } from '@hinkal/common/types/token.types';
import { HttpError } from '@hinkal/common/error-handling/customErrors/HttpError';
import { userKeysService } from '../services/userKeysService';

export const parseChainId = (chainId: unknown): number => {
  const parsed = Number(chainId);
  if (!Number.isFinite(parsed)) throw new HttpError(400, 'Invalid or missing chainId');
  return parsed;
};

export const resolveToken = (tokenAddress: unknown, chainId: number): ERC20Token => {
  const token = getERC20Token(String(tokenAddress), chainId);
  if (!token) throw new HttpError(400, 'Token not found in registry for provided chainId');
  return token;
};

export const resolvePrivateRecipient = async (to: string): Promise<string> => {
  const existing = await getAnyRecipientInfo(to);
  if (existing && isValidPrivateAddress(existing)) return existing;

  throw new HttpError(400, 'Could not resolve private recipient info from provided public address');
};

export const resolveRecipientInfo = async (recipientInfo: string): Promise<string> => {
  if (isValidPrivateAddress(recipientInfo)) return recipientInfo;

  if (!isAddress(recipientInfo) && !isValidSolanaPublicKey(recipientInfo) && !isValidTronAddress(recipientInfo)) {
    throw new HttpError(
      400,
      'recipientInfo must be a valid private recipient info, Ethereum address, Solana address, or Tron address',
    );
  }

  // get private recipientInfo from ethereumAddress/solanaAddress/tronAddress
  const signature = await userKeysService.findOrCreatePrivateKey(recipientInfo);
  const userKeys = new UserKeys(signature);
  return getRecipientInfoFromUserKeys(userKeys);
};
