import { ethers } from 'ethers';
import { ERC20ABI } from '@hinkal/common/externalABIs';
import { createJsonRpcProvider } from '@hinkal/common/functions/utils/create-provider';
import { walletSecretsService } from '../services/walletSecretsService';

export const buildEvmSigner = async (
  signerPublicKey: string,
  organizationId: string,
  userId: string,
  walletAddress: string,
  chainId: number,
): Promise<{ signer: ethers.Wallet; provider: ethers.JsonRpcProvider }> => {
  const { childWallet } = await walletSecretsService.getSeedHashAndChildWallet(
    organizationId,
    userId,
    signerPublicKey,
    walletAddress,
  );
  const provider = createJsonRpcProvider(chainId);
  const signer = new ethers.Wallet(childWallet.ethereum.privateKey, provider);
  return { signer, provider };
};

export const sendEvmTransaction = async (
  signer: ethers.Wallet,
  provider: ethers.JsonRpcProvider,
  tx: ethers.TransactionRequest,
): Promise<string> => {
  const [nonce, feeData, network] = await Promise.all([
    provider.getTransactionCount(await signer.getAddress(), 'pending'),
    provider.getFeeData(),
    provider.getNetwork(),
  ]);

  const populated: ethers.TransactionRequest = {
    ...tx,
    nonce,
    chainId: network.chainId,
    maxFeePerGas: feeData.maxFeePerGas ?? undefined,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? undefined,
  };

  if (!populated.gasLimit) {
    populated.gasLimit = await provider.estimateGas(populated);
  }

  const response = await signer.sendTransaction(populated);
  return response.hash;
};

export const encodeApproveCalldata = (spender: string, amount: bigint): string =>
  new ethers.Interface(ERC20ABI).encodeFunctionData('approve', [spender, amount]);

export const encodeTransferCalldata = (to: string, amount: bigint): string =>
  new ethers.Interface(ERC20ABI).encodeFunctionData('transfer', [to, amount]);
