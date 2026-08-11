import { chainIds } from '@hinkal/common/constants/chains.constants';
import {
  buildEvmSigner,
  encodeApproveCalldata,
  readErc20Allowance,
  sendEvmTransaction,
} from '../utils/evm-wallet.utils';
import { buildSolanaSigner, signAndSendSerializedSolanaTransaction } from '../utils/solana-wallet.utils';
import { getPublicSwapQuote } from './getPublicSwapQuote';
import { SwapExecutionParams, SwapExecutionResult } from '../types/swap.types';

export const executeSolanaSwap = async (params: SwapExecutionParams): Promise<SwapExecutionResult> => {
  const { signerPublicKey, organizationId, userId, fromAddress, chainId, inToken, outToken } = params;
  const quote = await getPublicSwapQuote({
    walletAddress: fromAddress,
    inSwapToken: inToken,
    outSwapToken: outToken,
    inSwapAmount: params.amount,
    slippagePercentage: params.slippagePercentage,
  });
  const { signer, connection } = await buildSolanaSigner(signerPublicKey, organizationId, userId, fromAddress, chainId);
  const txHash = await signAndSendSerializedSolanaTransaction(connection, signer, quote.data);
  return { txHash, outAmount: quote.outAmount, minOutAmount: quote.minOutAmount };
};

export const executeEvmSwap = async (params: SwapExecutionParams): Promise<SwapExecutionResult> => {
  const { signerPublicKey, organizationId, userId, fromAddress, chainId, inToken, outToken } = params;
  const quote = await getPublicSwapQuote({
    walletAddress: fromAddress,
    inSwapToken: inToken,
    outSwapToken: outToken,
    inSwapAmount: params.amount,
    slippagePercentage: params.slippagePercentage,
  });
  const { signer, provider } = await buildEvmSigner(signerPublicKey, organizationId, userId, fromAddress, chainId);

  const confirmations = chainId === chainIds.base ? 2 : 1;

  let approveTxHash: string | undefined;
  if (!params.isNative) {
    if (inToken.symbol === 'USDT') {
      const allowance = await readErc20Allowance(provider, inToken.erc20TokenAddress, fromAddress, quote.spender);
      if (allowance > 0n) {
        const resetTxHash = await sendEvmTransaction(signer, provider, {
          to: inToken.erc20TokenAddress,
          data: encodeApproveCalldata(quote.spender, 0n),
          value: 0n,
        });
        await provider.waitForTransaction(resetTxHash, confirmations);
      }
    }

    approveTxHash = await sendEvmTransaction(signer, provider, {
      to: inToken.erc20TokenAddress,
      data: encodeApproveCalldata(quote.spender, params.amountWei),
      value: 0n,
    });
    await provider.waitForTransaction(approveTxHash, confirmations);
  }

  const txHash = await sendEvmTransaction(signer, provider, {
    to: quote.to,
    data: quote.data,
    value: quote.value,
  });
  return { txHash, approveTxHash, outAmount: quote.outAmount, minOutAmount: quote.minOutAmount };
};
