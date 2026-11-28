import { createHmac } from 'crypto';
import { Mutex } from 'async-mutex';
import { ethers } from 'ethers';
import {
  addressToHexFormat,
  API_CONFIG,
  API_ERROR_MESSAGES,
  BRIDGE_SUPPORTED_CHAINS,
  enclavePostSealedSigned,
  evmHexToTronBase58Address,
  getBridgeDestinationChains,
  getOrCreateMapValue,
  getReceiveVaultCanonicalChainId,
  HttpError,
  isNativePlaceholderAddress,
  isSolanaLike,
  isTronLike,
  normalizeAddress,
  ReceiveVaultNetwork,
  receiveVaultNetworkOf,
  ReceiveVaultRecord,
  toBase58IfTron,
} from '@hinkal/common';
import { Keypair } from '@solana/web3.js';
import { ENCLAVE_URL } from '@hinkal/common/functions/snarkjs/constant';
import { buildInternalHmacAuthHeaders } from '@hinkal/backend-common';
import { getERC20Token } from '@hinkal/erc20-registry';
import { API_KEY_ACCOUNT_SEED, RELAYER_COMMUNICATION_KEY } from '../constants';
import { decryptField, encryptField } from '../utils/orderFieldEncryption';
import { assertAddressForChain } from '../utils/queryGuards';
import { parseSlippagePercentage } from '../utils/transactionHelpers';
import { hinkalInitializerService } from './hinkalInitializerService';
import {
  CreateTransferAddressParams,
  EncryptedReceiveVaultBinding,
  ReceiveAddressRequest,
  ReceiveVaultAccountEntry,
  ReceiveVaultBinding,
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

// The exact bytes are the key: a stray character would change every creator keypair, so the format is fixed here.
if (!/^[0-9a-f]{64}$/i.test(API_KEY_ACCOUNT_SEED)) throw new Error('API_KEY_ACCOUNT_SEED must be 64 hex characters');
const CREATOR_SEED_KEY = Buffer.from(API_KEY_ACCOUNT_SEED, 'hex');

// One creator account per partner key, network and refundTo holds all of that partner's addresses refunding there.
// The server-only seed keeps the partner, who knows keyId and refundTo, from deriving the keypair.
export const partnerCreatorAddress = (network: ReceiveVaultNetwork, keyId: string, refundTo: string): string => {
  const chainId = getReceiveVaultCanonicalChainId(network);
  const seed = createHmac('sha256', CREATOR_SEED_KEY)
    .update(`${keyId}:${network}:${normalizeAddress(chainId, refundTo)}`)
    .digest();
  if (isSolanaLike(chainId)) return Keypair.fromSeed(seed).publicKey.toBase58();
  return toBase58IfTron(chainId, new ethers.Wallet(ethers.hexlify(seed)).address);
};

export const loadBinding = async (chainId: number, vaultAddress: string): Promise<ReceiveVaultBinding | null> => {
  const path = API_CONFIG.ROUTES.receiveVaultBinding;
  const { networkType, creatorAddress, ...encrypted } = await enclavePostSealedSigned<
    Partial<EncryptedReceiveVaultBinding> & {
      networkType?: ReceiveVaultNetwork;
      creatorAddress?: string;
    }
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

// sourceChainIds: chains the address takes payments on; a bridged target accepts only those that can reach it.
export const resolveTransferTarget = (
  {
    chainId,
    recipientAddress,
    destinationChainId,
    destinationTokenAddress,
    slippagePercentage,
  }: TransferAddressRequest,
  sourceChainIds = [chainId],
): TransferTarget => {
  if (destinationChainId === undefined && (destinationTokenAddress !== undefined || slippagePercentage !== undefined)) {
    throw new HttpError(400, API_ERROR_MESSAGES.BRIDGE_PARAMS_REQUIRE_DESTINATION_CHAIN);
  }
  const acceptedChainIds =
    destinationChainId === undefined
      ? sourceChainIds
      : sourceChainIds.filter(
          (id) => BRIDGE_SUPPORTED_CHAINS.includes(id) && getBridgeDestinationChains(id).includes(destinationChainId),
        );
  if (!acceptedChainIds.length) {
    throw new HttpError(
      400,
      `${API_ERROR_MESSAGES.BRIDGE_ROUTE_NOT_SUPPORTED}: ${sourceChainIds.join(', ')} -> ${destinationChainId}`,
    );
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
    acceptedChainIds,
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

const creationLocks = new Map<string, Mutex>();

export const createTransferAddress = async ({
  chainId,
  creatorAddress,
  target: { recipientAddress, bridge },
  variableRate,
  attribution: { ref, keyId, partnerFeeBps },
  trackedRef,
  refundTo,
}: CreateTransferAddressParams): Promise<ReceiveVaultRecord> => {
  const stored: StoredReceiveVaultBinding = {
    recipientAddress,
    refundTo,
    variableRate: variableRate.toString(),
    ...bridge,
    attributionRef: ref,
    ...(keyId !== undefined && { keyId, partnerFeeBps }),
  };
  const binding = {
    fields: await transformFields({ ...stored }, encryptField),
    signHeaders: signHeadersFor(API_CONFIG.ROUTES.registerReceiveVault),
  };
  const mutex = getOrCreateMapValue(creationLocks, creatorAddress, () => new Mutex());
  try {
    return await mutex.runExclusive(() =>
      hinkalInitializerService.withHinkalForAddress(creatorAddress, chainId, (hinkal) =>
        hinkal.createReceiveAddress(receiveVaultNetworkOf(chainId), true, binding, trackedRef),
      ),
    );
  } catch (error) {
    // A concurrent request for the same account registered this index first, under its own binding.
    if ((error as { response?: { status?: number } }).response?.status === 409) {
      throw new HttpError(409, API_ERROR_MESSAGES.TRANSFER_ADDRESS_CREATION_IN_PROGRESS);
    }
    throw error;
  } finally {
    if (!mutex.isLocked()) creationLocks.delete(creatorAddress);
  }
};
