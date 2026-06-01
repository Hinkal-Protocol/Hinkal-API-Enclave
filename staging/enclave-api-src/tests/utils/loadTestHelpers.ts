import { ethers } from 'ethers';
import { ARC_TESTNET_USDC_ADDRESS, ERC20ABI } from '@hinkal/common';

export const fundWalletsWithUsdc = async (
  funder: ethers.Wallet,
  wallets: ethers.HDNodeWallet[],
  amount: bigint,
  provider: ethers.JsonRpcProvider,
): Promise<void> => {
  const baseNonce = await provider.getTransactionCount(funder.address, 'pending');
  const feeData = await provider.getFeeData();
  const gasOverrides = {
    maxFeePerGas: feeData.maxFeePerGas,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? 0n,
  };

  const usdc = new ethers.Contract(ARC_TESTNET_USDC_ADDRESS, ERC20ABI, funder);
  const hashes = await Promise.all(
    wallets.map((wallet, i) =>
      usdc['transfer'](wallet.address, amount, { nonce: baseNonce + i, ...gasOverrides }).then(
        (tx: ethers.TransactionResponse) => tx.hash,
      ),
    ),
  );

  await Promise.all(hashes.map((hash) => provider.waitForTransaction(hash, 1, 300_000)));
};
