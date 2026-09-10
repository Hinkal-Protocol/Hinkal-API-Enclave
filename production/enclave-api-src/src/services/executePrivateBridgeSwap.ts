import { hinkalBridgePrivateToPrivate } from '@hinkal/common/data-structures/Hinkal/hinkalBridgePrivateToPrivate';
import { resolveBridgeSlippagePercent } from '../utils/bridgeSlippage';
import { PERCENT_TO_DECIMAL } from '../constants/swap.constants';
import { hinkalInitializerService } from './hinkalInitializerService';
import { PrivateBridgeSwapResult, PrivateSwapExecutionParams } from '../types/swap.types';

export const executePrivateBridgeSwap = async (
  params: PrivateSwapExecutionParams,
): Promise<PrivateBridgeSwapResult> => {
  const { organizationId, userId, signerPublicKey, fromAddress, chainId, inToken, outToken, amount, parsedSlippage } =
    params;

  const bridgeSlippage = (await resolveBridgeSlippagePercent(inToken, amount, parsedSlippage)) * PERCENT_TO_DECIMAL;

  const { sourceTxHash, destTxHash, destinationTokenAmount } = await hinkalInitializerService.withHinkalForOrganization(
    organizationId,
    userId,
    signerPublicKey,
    fromAddress,
    chainId,
    (hinkal) =>
      hinkalBridgePrivateToPrivate(
        hinkal,
        inToken,
        outToken,
        amount,
        { recipientInfo: hinkal.getRecipientInfo() },
        bridgeSlippage,
        inToken.erc20TokenAddress,
        undefined,
      ),
    false,
  );

  return { txHash: sourceTxHash, sourceTxHash, destTxHash, destinationTokenAmount };
};
