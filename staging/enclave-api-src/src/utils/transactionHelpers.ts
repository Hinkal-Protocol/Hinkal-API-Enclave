import { getAnyRecipientInfo } from '@hinkal/common/API/getAnyRecipientInfo';
import { isValidPrivateAddress } from '@hinkal/common/functions/utils/addresses';
import { getERC20Token } from '@hinkal/common/functions/utils/erc20tokenFunctions';
import { ERC20Token } from '@hinkal/common/types/token.types';
import { HttpError } from '@hinkal/common';

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

export const resolvePrivateRecipient = async (to: string): Promise<string | undefined> => {
  const existing = await getAnyRecipientInfo(to);
  if (existing && isValidPrivateAddress(existing)) return existing;
  return undefined;
};
