import { Keypair } from '@solana/web3.js';
import { Hinkal } from '@hinkal/common';
import { getNearIntentsQuote } from '@hinkal/common/API/callNearIntentsAPI';
import { SWAP_ROUTER_ADDRESSES } from '@hinkal/common/constants/addresses.constants';
import {
  NEAR_BRIDGE_QUOTE_DEADLINE_BUFFER_MS,
  NEAR_BRIDGE_SLIPPAGE_BPS,
} from '@hinkal/common/constants/bridging.constants';
import { isNearIntentsBridgeSource, isSolanaLike, networkRegistry } from '@hinkal/common/constants/chains.constants';
import {
  ENCLAVE_SWAP_VARIABLE_RATE,
  HINKAL_PRIVATE_SEND_VARIABLE_RATE,
  HINKAL_SHIELD_VARIABLE_RATE,
  zeroAddress,
} from '@hinkal/common/constants/protocol.constants';
import { AccountActions } from '@hinkal/common/data-structures/AccountActions/AccountActions';
import { calculateSolanaNullifierCount } from '@hinkal/common/functions/pre-transaction/calculateSolanaNullifierCount';
import { getFeeStructure } from '@hinkal/common/functions/pre-transaction/getFeeStructure';
import {
  createLifiBridgeOps,
  createTransaferEmporiumOpsBatch,
} from '@hinkal/common/functions/private-wallet/emporium.helpers';
import { caseInsensitiveEqual } from '@hinkal/common/functions/utils/caseInsensitive.utils';
import { convertEmporiumOpToCallInfo } from '@hinkal/common/functions/utils/convertEmporiumOpToCallInfo';
import { calculateTotalFee, calculateVariableFeeGrossUp } from '@hinkal/common/functions/utils/fees.utils';
import { resolveNearAssetId } from '@hinkal/common/functions/utils/nearIntents.utils';
import { getSolanaShieldFeeParams } from '@hinkal/common/functions/utils/sponsored-shield.utils';
import { buildTempSubAccountForChain, deriveBridgeTempWallets } from '@hinkal/common/functions/utils/temp-wallet.utils';
import { getAmountInToken, getAmountInWei, randomBigInt } from '@hinkal/common/functions/web3/etherFunctions';
import { getLifiPrice } from '@hinkal/common/functions/web3/lifiAPI';
import { BridgeQuote } from '@hinkal/common/types/bridging-tx.types';
import { ExternalActionId } from '@hinkal/common/types/external-action.types';
import { ERC20Token } from '@hinkal/common/types/token.types';
import { WaasFeeEstimateAction } from '@hinkal/common/types/enclaveApi.types';
import { WaasFeeEstimate, WaasSpendFeeAction } from '../types';
import { SPEND_VARIABLE_RATES } from '../constants/feeEstimate.constants';
import { getBestSwapQuote } from './getBestSwapQuote';

const estimateLifiBridgeOut = async (
  hinkal: Hinkal<unknown>,
  sourceToken: ERC20Token,
  destToken: ERC20Token,
  amount: string,
  slippage: number,
) => {
  const { chainId } = sourceToken;
  const lifiRouterAddress = SWAP_ROUTER_ADDRESSES[ExternalActionId.Lifi][chainId];
  if (!lifiRouterAddress) throw new Error(`LIFI not configured for chain ${chainId}`);

  const { sourceSubAccount, destinationSubAccount } = deriveBridgeTempWallets(
    hinkal,
    chainId,
    destToken.chainId,
    randomBigInt(6),
  );
  const sourceAddress = AccountActions.getAddressFromSubAccount(chainId, sourceSubAccount);
  const destinationAddress = AccountActions.getAddressFromSubAccount(destToken.chainId, destinationSubAccount);
  if (!sourceAddress || !destinationAddress) throw new Error('Missing temp wallet address for LIFI bridge');

  const { lifiDataValue, outSwapAmountValue, extraNativeTokenFee } = await getLifiPrice(
    sourceToken,
    destToken,
    amount,
    slippage,
    sourceAddress,
    destinationAddress,
  );
  const quote: BridgeQuote = {
    calldata: lifiDataValue,
    expectedAmount: outSwapAmountValue,
    nativeFee: extraNativeTokenFee,
  };

  const bridgeAmount = getAmountInWei(sourceToken, amount);
  const isNativeInput = caseInsensitiveEqual(sourceToken.erc20TokenAddress, zeroAddress);
  const needsNativeFee = quote.nativeFee > 0n && !isNativeInput;
  const fundingAmount = isNativeInput ? bridgeAmount + quote.nativeFee : bridgeAmount;
  const ops = createLifiBridgeOps(
    hinkal,
    chainId,
    sourceAddress,
    lifiRouterAddress,
    sourceToken.erc20TokenAddress,
    fundingAmount,
    bridgeAmount,
    quote,
  );

  const feeStructure = await getFeeStructure(
    chainId,
    sourceToken.erc20TokenAddress,
    needsNativeFee ? [sourceToken.erc20TokenAddress, zeroAddress] : [sourceToken.erc20TokenAddress],
    ExternalActionId.Emporium,
    ops.map((op) => convertEmporiumOpToCallInfo(op, sourceAddress, chainId)),
  );

  return { sourceFee: feeStructure.flatFee, nativeFee: quote.nativeFee, expectedAmount: quote.expectedAmount };
};

const estimateNearBridgeOut = async (
  hinkal: Hinkal<unknown>,
  sourceToken: ERC20Token,
  destToken: ERC20Token,
  amount: string,
  slippage: number,
) => {
  const { chainId } = sourceToken;
  const tempWalletAddress = AccountActions.getAddressFromSubAccount(
    destToken.chainId,
    buildTempSubAccountForChain(hinkal, destToken.chainId, randomBigInt(6)),
  );
  if (!tempWalletAddress) throw new Error('Missing temp wallet address for NEAR bridge');

  const bridgeAmount = getAmountInWei(sourceToken, amount);
  const [originAsset, destinationAsset] = await Promise.all([
    resolveNearAssetId(chainId, sourceToken.erc20TokenAddress),
    resolveNearAssetId(destToken.chainId, destToken.erc20TokenAddress),
  ]);
  const { quote } = await getNearIntentsQuote({
    dry: true,
    swapType: 'EXACT_INPUT',
    slippageTolerance: Math.round(slippage * 10_000) || NEAR_BRIDGE_SLIPPAGE_BPS,
    originAsset,
    depositType: 'ORIGIN_CHAIN',
    destinationAsset,
    amount: bridgeAmount.toString(),
    recipient: tempWalletAddress,
    recipientType: 'DESTINATION_CHAIN',
    refundTo: hinkal.userKeys.getNearIntentsAccountId(),
    refundType: 'INTENTS',
    deadline: new Date(Date.now() + NEAR_BRIDGE_QUOTE_DEADLINE_BUFFER_MS).toISOString(),
  });

  const feeStructure = await getFeeStructure(
    chainId,
    sourceToken.erc20TokenAddress,
    [sourceToken.erc20TokenAddress],
    ExternalActionId.Transact,
    [],
    0n,
    isSolanaLike(chainId)
      ? {
          mintTo: sourceToken.erc20TokenAddress,
          recipient: Keypair.generate().publicKey.toString(),
          nullifierCount: await calculateSolanaNullifierCount(
            hinkal,
            chainId,
            [sourceToken.erc20TokenAddress],
            [-bridgeAmount],
          ),
        }
      : undefined,
  );

  return { sourceFee: feeStructure.flatFee, nativeFee: 0n, expectedAmount: BigInt(quote.amountOut ?? '0') };
};

const estimateBridgeShieldFee = async (hinkal: Hinkal<unknown>, destToken: ERC20Token, landedAmount: bigint) => {
  const { chainId, erc20TokenAddress } = destToken;
  if (isSolanaLike(chainId)) {
    const feeStructure = await getFeeStructure(
      chainId,
      erc20TokenAddress,
      [erc20TokenAddress],
      ExternalActionId.Transact,
      [],
      HINKAL_SHIELD_VARIABLE_RATE,
      getSolanaShieldFeeParams(chainId, destToken),
    );
    return calculateTotalFee(landedAmount, feeStructure);
  }

  const { hinkalAddress } = networkRegistry[chainId].contractData;
  const transferOps = createTransaferEmporiumOpsBatch(hinkal, chainId, [erc20TokenAddress], [1n]);
  const feeStructure = await getFeeStructure(
    chainId,
    erc20TokenAddress,
    [erc20TokenAddress],
    ExternalActionId.Emporium,
    transferOps.map((op) => convertEmporiumOpToCallInfo(op, hinkalAddress, chainId)),
    HINKAL_PRIVATE_SEND_VARIABLE_RATE,
  );
  return calculateTotalFee(landedAmount, feeStructure);
};

export const estimatePrivateBridgeFee = async (
  hinkal: Hinkal<unknown>,
  sourceToken: ERC20Token,
  destToken: ERC20Token,
  amount: string,
  slippage: number,
): Promise<WaasFeeEstimate> => {
  const bridgeOut = isNearIntentsBridgeSource(sourceToken.chainId)
    ? await estimateNearBridgeOut(hinkal, sourceToken, destToken, amount, slippage)
    : await estimateLifiBridgeOut(hinkal, sourceToken, destToken, amount, slippage);
  const destinationFee = await estimateBridgeShieldFee(hinkal, destToken, bridgeOut.expectedAmount);
  const shieldedAmount = getAmountInWei(
    sourceToken,
    getAmountInToken(destToken, bridgeOut.expectedAmount - destinationFee),
  );
  return {
    fee: bridgeOut.sourceFee + getAmountInWei(sourceToken, amount) - shieldedAmount,
    feeToken: sourceToken,
    nativeFee: bridgeOut.nativeFee,
  };
};

export const estimatePrivateSwapFee = async (
  hinkal: Hinkal<unknown>,
  inToken: ERC20Token,
  outToken: ERC20Token,
  amount: string,
  slippagePercentage: number | undefined,
): Promise<WaasFeeEstimate> => {
  const { chainId } = inToken;
  const { externalActionId, outSwapAmount } = await getBestSwapQuote({
    chainId,
    inSwapToken: inToken,
    outSwapToken: outToken,
    inSwapAmount: amount,
    slippagePercentage,
  });
  const feeStructure = await getFeeStructure(
    chainId,
    outToken.erc20TokenAddress,
    [inToken.erc20TokenAddress, outToken.erc20TokenAddress],
    externalActionId,
    [],
    ENCLAVE_SWAP_VARIABLE_RATE,
    isSolanaLike(chainId)
      ? {
          mintTo: outToken.erc20TokenAddress,
          mintFrom: inToken.erc20TokenAddress,
          nullifierCount: await calculateSolanaNullifierCount(
            hinkal,
            chainId,
            [inToken.erc20TokenAddress, outToken.erc20TokenAddress],
            [-getAmountInWei(inToken, amount), outSwapAmount],
          ),
        }
      : undefined,
  );
  return { fee: calculateTotalFee(outSwapAmount, feeStructure), feeToken: outToken, nativeFee: 0n };
};

export const estimateSpendFee = async (
  hinkal: Hinkal<unknown>,
  action: WaasSpendFeeAction,
  token: ERC20Token,
  amount: string,
  recipient: string,
): Promise<WaasFeeEstimate> => {
  const { chainId, erc20TokenAddress } = token;
  const isSolana = isSolanaLike(chainId);
  const isTransfer = action === WaasFeeEstimateAction.PrivateTransfer;
  const amountWei = getAmountInWei(token, amount);
  const variableRate = SPEND_VARIABLE_RATES[action];

  const feeStructure = await getFeeStructure(
    chainId,
    erc20TokenAddress,
    [erc20TokenAddress],
    ExternalActionId.Transact,
    [],
    variableRate,
    isSolana
      ? {
          mintTo: erc20TokenAddress,
          recipient: isTransfer ? undefined : recipient,
          nullifierCount:
            action === WaasFeeEstimateAction.PrivateSend
              ? 1
              : await calculateSolanaNullifierCount(hinkal, chainId, [erc20TokenAddress], [-amountWei]),
        }
      : undefined,
  );

  const fee =
    isSolana || isTransfer
      ? calculateTotalFee(amountWei, feeStructure)
      : feeStructure.flatFee + calculateVariableFeeGrossUp(amountWei, variableRate);
  return { fee, feeToken: token, nativeFee: 0n };
};
