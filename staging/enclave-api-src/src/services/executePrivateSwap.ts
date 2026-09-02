import { isSolanaLike } from '@hinkal/common/constants/chains.constants';
import { ENCLAVE_SWAP_VARIABLE_RATE } from '@hinkal/common/constants/protocol.constants';
import { getFeeStructure } from '@hinkal/common/functions/pre-transaction/getFeeStructure';
import { calculateSolanaNullifierCount } from '@hinkal/common/functions/pre-transaction/calculateSolanaNullifierCount';
import { hinkalInitializerService } from './hinkalInitializerService';
import { getBestSwapQuote } from './getBestSwapQuote';
import { PrivateSwapExecutionParams } from '../types/swap.types';

export const executePrivateSwap = async (params: PrivateSwapExecutionParams): Promise<string> => {
  const {
    organizationId,
    userId,
    signerPublicKey,
    fromAddress,
    chainId,
    inToken,
    outToken,
    amount,
    amountWei,
    parsedSlippage,
  } = params;
  const isSolana = isSolanaLike(chainId);

  return hinkalInitializerService.withHinkalForOrganization(
    organizationId,
    userId,
    signerPublicKey,
    fromAddress,
    chainId,
    async (hinkal) => {
      const { swapData, externalActionId, outSwapAmount } = await getBestSwapQuote({
        chainId,
        inSwapToken: inToken,
        outSwapToken: outToken,
        inSwapAmount: amount,
        slippagePercentage: parsedSlippage,
      });

      const nullifierCount = await calculateSolanaNullifierCount(
        hinkal,
        chainId,
        [inToken.erc20TokenAddress, outToken.erc20TokenAddress],
        [-amountWei, outSwapAmount],
      );

      const feeStructureOverride = await getFeeStructure(
        chainId,
        outToken.erc20TokenAddress,
        [inToken.erc20TokenAddress, outToken.erc20TokenAddress],
        externalActionId,
        [],
        ENCLAVE_SWAP_VARIABLE_RATE,
        isSolana
          ? { mintTo: outToken.erc20TokenAddress, mintFrom: inToken.erc20TokenAddress, nullifierCount }
          : undefined,
      );

      return hinkal.swap(
        [inToken, outToken],
        [-amountWei, outSwapAmount],
        externalActionId,
        swapData,
        outToken.erc20TokenAddress,
        feeStructureOverride,
        parsedSlippage,
      );
    },
  );
};
