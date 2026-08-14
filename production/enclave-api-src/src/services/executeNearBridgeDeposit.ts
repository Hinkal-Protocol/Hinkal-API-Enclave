import { HttpError } from '@hinkal/common';
import { getNearIntentsQuote } from '@hinkal/common/API/callNearIntentsAPI';
import {
  NEAR_BRIDGE_QUOTE_DEADLINE_BUFFER_MS,
  NEAR_BRIDGE_SLIPPAGE_BPS,
} from '@hinkal/common/constants/bridging.constants';
import { resolveNearAssetId } from '@hinkal/common/functions/utils/nearIntents.utils';
import { NearBridgeDepositParams, NearBridgeDepositResult } from '../types/swap.types';
import { executeWalletTransfer } from './executeWalletTransfer';

export const executeNearBridgeDeposit = async (params: NearBridgeDepositParams): Promise<NearBridgeDepositResult> => {
  const {
    signerPublicKey,
    organizationId,
    userId,
    fromAddress,
    sourceChainId,
    destChainId,
    sourceToken,
    destToken,
    bridgeAmount,
    parsedSlippage,
    destinationRecipient,
  } = params;

  const [originAsset, destinationAsset] = await Promise.all([
    resolveNearAssetId(sourceChainId, sourceToken.erc20TokenAddress),
    resolveNearAssetId(destChainId, destToken.erc20TokenAddress),
  ]);
  const slippageBps =
    parsedSlippage === undefined ? NEAR_BRIDGE_SLIPPAGE_BPS : Math.max(1, Math.round(parsedSlippage * 100));

  const { quote } = await getNearIntentsQuote({
    dry: false,
    swapType: 'EXACT_INPUT',
    slippageTolerance: slippageBps,
    originAsset,
    depositType: 'ORIGIN_CHAIN',
    destinationAsset,
    amount: bridgeAmount.toString(),
    recipient: destinationRecipient,
    recipientType: 'DESTINATION_CHAIN',
    refundTo: fromAddress,
    refundType: 'ORIGIN_CHAIN',
    deadline: new Date(Date.now() + NEAR_BRIDGE_QUOTE_DEADLINE_BUFFER_MS).toISOString(),
  });
  if (!quote.depositAddress) throw new HttpError(502, 'NEAR Intents quote returned no deposit address');

  const txHash = await executeWalletTransfer({
    signerPublicKey,
    organizationId,
    userId,
    fromAddress,
    chainId: sourceChainId,
    token: sourceToken,
    amount: bridgeAmount,
    to: quote.depositAddress,
  });

  return { txHash, depositAddress: quote.depositAddress, amountOut: quote.amountOut };
};
