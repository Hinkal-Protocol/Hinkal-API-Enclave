import { ethers } from 'ethers';
import {
  addressToHexFormat,
  API_CONFIG,
  API_ERROR_MESSAGES,
  BRIDGE_SUPPORTED_CHAINS,
  enclavePostSealedSigned,
  evmHexToTronBase58Address,
  getBridgeDestinationChains,
  HttpError,
  isNativePlaceholderAddress,
  isSolanaLike,
  isTronLike,
  ReceiveVaultNetwork,
  receiveVaultNetworkOf,
  ReceiveVaultRecord,
} from '@hinkal/common';
import { ENCLAVE_URL } from '@hinkal/common/functions/snarkjs/constant';
import { buildInternalHmacAuthHeaders } from '@hinkal/backend-common';
import { getERC20Token } from '@hinkal/erc20-registry';
import { RELAYER_COMMUNICATION_KEY } from '../constants';
import { decryptField, encryptField } from '../utils/orderFieldEncryption';
import { assertAddressForChain } from '../utils/queryGuards';
import { parseSlippagePercentage } from '../utils/transactionHelpers';
import { hinkalInitializerService } from './hinkalInitializerService';
import {
  EncryptedReceiveVaultBinding,
  ReceiveAddressRequest,
  ReceiveVaultAccountEntry,
  ReceiveVaultBinding,
  ReferralAttribution,
  StoredReceiveVaultBinding,
  TransferAddressRequest,
  TransferTarget,
} from '../types';

const toVaultKey = (chainId: number, vaultAddress: string): string => {
  if (isSolanaLike(chainId)) return vaultAddress;
  const hex = ethers.getAddress(addressToHexFormat(vaultAddress));
  return isTronLike(chainId) ? evmHexToTronBase58Address(hex) : hex;
};

const signHeadersFor = (path: string) => (body: unknown) =>
  buildInternalHmacAuthHeaders(RELAYER_COMMUNICATION_KEY, path, body);

const transformFields = async (
  fields: Record<string, string | number | undefined>,
  transform: (value: string) => Promise<string>,
): Promise<Record<string, string>> =>
  Object.fromEntries(
    await Promise.all(
      Object.entries(fields)
        .filter(([, value]) => value !== undefined)
        .map(async ([key, value]) => [key, await transform(String(value))]),
    ),
  );

const toOptionalNumber = (value?: string): number | undefined => (value === undefined ? undefined : Number(value));

export const loadBinding = async (chainId: number, vaultAddress: string): Promise<ReceiveVaultBinding | null> => {
  const path = API_CONFIG.ROUTES.receiveVaultBinding;
  const { networkType, creatorAddress, ...encrypted } = await enclavePostSealedSigned<
    Partial<EncryptedReceiveVaultBinding> & { networkType?: ReceiveVaultNetwork; creatorAddress?: string }
  >(`${ENCLAVE_URL}${path}`, { vaultAddress: toVaultKey(chainId, vaultAddress) }, signHeadersFor(path));
  if (!networkType || !creatorAddress) return null;
  const fields = (await transformFields(encrypted, decryptField)) as EncryptedReceiveVaultBinding;
  return {
    ...fields,
    networkType,
    creatorAddress,
    destinationChainId: toOptionalNumber(fields.destinationChainId),
    slippagePercentage: toOptionalNumber(fields.slippagePercentage),
    partnerFeeBps: toOptionalNumber(fields.partnerFeeBps),
  };
};

// henclave lists each transfer address's payout terms encrypted with this service's key.
export const decryptTransferTerms = (entries: ReceiveVaultRecord[]): Promise<ReceiveVaultAccountEntry[]> =>
  Promise.all(
    entries.map(async ({ recipientAddress, destinationChainId, destinationTokenAddress, ...entry }) => {
      const terms = await transformFields(
        { recipientAddress, destinationChainId, destinationTokenAddress },
        decryptField,
      );
      return { ...entry, ...terms, destinationChainId: toOptionalNumber(terms.destinationChainId) };
    }),
  );

export const isTransferAddressRequest = (request: ReceiveAddressRequest): request is TransferAddressRequest =>
  request.recipientAddress !== undefined;

const resolveTransferTarget = ({
  chainId,
  recipientAddress,
  destinationChainId,
  destinationTokenAddress,
  slippagePercentage,
}: TransferAddressRequest): TransferTarget => {
  if (destinationChainId === undefined) {
    if (destinationTokenAddress !== undefined || slippagePercentage !== undefined) {
      throw new HttpError(400, API_ERROR_MESSAGES.BRIDGE_PARAMS_REQUIRE_DESTINATION_CHAIN);
    }
  } else if (
    !(BRIDGE_SUPPORTED_CHAINS.includes(chainId) && getBridgeDestinationChains(chainId).includes(destinationChainId))
  ) {
    throw new HttpError(400, `${API_ERROR_MESSAGES.BRIDGE_ROUTE_NOT_SUPPORTED}: ${chainId} -> ${destinationChainId}`);
  }

  const destinationToken =
    destinationChainId === undefined ? undefined : getERC20Token(destinationTokenAddress ?? '', destinationChainId);
  if (destinationChainId !== undefined && !destinationToken) {
    throw new HttpError(400, API_ERROR_MESSAGES.TOKEN_NOT_FOUND);
  }

  const recipientChainId = destinationChainId ?? chainId;
  assertAddressForChain(recipientAddress, 'recipientAddress', recipientChainId);
  const placeholderCheck = isTronLike(recipientChainId) ? addressToHexFormat(recipientAddress) : recipientAddress;
  if (isNativePlaceholderAddress(placeholderCheck, recipientChainId)) {
    throw new HttpError(400, API_ERROR_MESSAGES.RECIPIENT_ADDRESS_IS_NATIVE_PLACEHOLDER);
  }

  const slippage = parseSlippagePercentage(slippagePercentage);
  return {
    recipientAddress:
      isSolanaLike(recipientChainId) || isTronLike(recipientChainId)
        ? recipientAddress
        : ethers.getAddress(recipientAddress),
    bridge: destinationToken && {
      destinationChainId: destinationToken.chainId,
      destinationTokenAddress: destinationToken.erc20TokenAddress,
      ...(slippage !== undefined && { slippagePercentage: slippage }),
    },
  };
};

export const createReceiveAddress = async (
  creatorAddress: string,
  { chainId, ref, forceFresh, destinationChainId, destinationTokenAddress, slippagePercentage }: ReceiveAddressRequest,
  trackedRef?: string,
): Promise<ReceiveVaultRecord> => {
  // A plain address charges no fee, so it takes only a whitelisted ref, not a fee discount code.
  // A discount code is the one case where trackedRef drops the ref: "abc" -> "abc" OK, "promo123" -> undefined, 400.
  if (ref !== trackedRef) {
    throw new HttpError(400, API_ERROR_MESSAGES.RATE_REF_NOT_FOR_RECEIVE_ADDRESS);
  }
  if ([destinationChainId, destinationTokenAddress, slippagePercentage].some((param) => param !== undefined)) {
    throw new HttpError(400, API_ERROR_MESSAGES.TRANSFER_PARAMS_REQUIRE_RECIPIENT);
  }
  return hinkalInitializerService.withHinkalForAddress(creatorAddress, chainId, (hinkal) =>
    hinkal.createReceiveAddress(receiveVaultNetworkOf(chainId), forceFresh, undefined, trackedRef),
  );
};

export const createTransferAddress = async (
  creatorAddress: string,
  request: TransferAddressRequest,
  variableRate: bigint,
  { ref, keyId, partnerFeeBps }: ReferralAttribution,
  trackedRef?: string,
): Promise<ReceiveVaultRecord> => {
  const { chainId } = request;
  const { recipientAddress, bridge } = resolveTransferTarget(request);
  const stored: StoredReceiveVaultBinding = {
    recipientAddress,
    variableRate: variableRate.toString(),
    ...bridge,
    attributionRef: ref,
    ...(keyId !== undefined && { keyId, partnerFeeBps }),
  };
  const binding = {
    fields: await transformFields({ ...stored }, encryptField),
    signHeaders: signHeadersFor(API_CONFIG.ROUTES.registerReceiveVault),
  };
  try {
    return await hinkalInitializerService.withHinkalForAddress(creatorAddress, chainId, (hinkal) =>
      hinkal.createReceiveAddress(receiveVaultNetworkOf(chainId), true, binding, trackedRef),
    );
  } catch (error) {
    // A concurrent request for the same account registered this index first, under its own binding.
    if ((error as { response?: { status?: number } }).response?.status === 409) {
      throw new HttpError(409, API_ERROR_MESSAGES.TRANSFER_ADDRESS_CREATION_IN_PROGRESS);
    }
    throw error;
  }
};
