import { Request, Response, Router } from 'express';
import { isSolanaLike, isTronLike } from '@hinkal/common/constants/chains.constants';
import { zeroAddress } from '@hinkal/common/constants/protocol.constants';
import { getAmountInToken, getAmountInWei } from '@hinkal/common/functions/web3/etherFunctions';
import { caseInsensitiveEqual } from '@hinkal/common/functions/utils/caseInsensitive.utils';
import { HttpError } from '@hinkal/common';
import {
  hasMissingSwapFields,
  isNearIntentsBridgeRequest,
  parseChainId,
  resolveAndValidateNearBridgeRequest,
  resolveAndValidatePublicSwapRequest,
  resolveToken,
} from '../../utils/transactionHelpers';
import { buildEvmSigner, encodeApproveCalldata, sendEvmTransaction } from '../../utils/evm-wallet.utils';
import {
  buildTronApproveTransaction,
  buildTronExecuteTransaction,
  buildTronSigner,
  sendTronTransaction,
} from '../../utils/tron-wallet.utils';
import { buildSolanaSigner } from '../../utils/solana-wallet.utils';
import { sendError } from '../../utils/routeError';
import { xStampMiddleware } from '../../middleware';
import { requireActionPermission, resolveTargetUser } from '../../utils';
import { WaasPolicyAction } from '../../constants/policyActions';
import { executeEvmSwap, executeSolanaSwap } from '../../services/executePublicSwap';
import { executeNearBridgeDeposit } from '../../services/executeNearBridgeDeposit';
import { executeWalletTransfer } from '../../services/executeWalletTransfer';
import { REQUIRED_SWAP_FIELDS_MESSAGE } from '../../constants/swap.constants';
import { SwapExecutionParams, SwapExecutionResult } from '../../types/swap.types';

const router = Router();

router.post('/waas/wallet/sign-message', xStampMiddleware, async (req: Request, res: Response) => {
  const { organizationId, userId, fromAddress, chainId, message } = req.body ?? {};

  if (!organizationId || !userId || !fromAddress || chainId === undefined || !message) {
    res.status(400).send({
      status: 'error',
      message: 'Missing required fields: organizationId, userId, fromAddress, chainId, message',
    });
    return;
  }

  try {
    const signerPublicKey = res.locals.signerPublicKey as string;
    const authorizedUser = await resolveTargetUser(organizationId, userId, signerPublicKey);
    requireActionPermission(authorizedUser, WaasPolicyAction.SIGN_TRANSACTION);

    const parsedChainId = parseChainId(chainId);

    if (isSolanaLike(parsedChainId)) {
      const { signer } = await buildSolanaSigner(signerPublicKey, organizationId, userId, fromAddress, parsedChainId);
      const messageBytes = Buffer.from(String(message), 'utf8');
      const { signature } = await signer.signMessage(messageBytes);
      res.status(200).send({ status: 'success', data: { signature: Buffer.from(signature).toString('base64') } });
      return;
    }

    if (isTronLike(parsedChainId)) {
      const { signer } = await buildTronSigner(signerPublicKey, organizationId, userId, fromAddress, parsedChainId);
      const signature = await signer.signMessage(String(message));
      res.status(200).send({ status: 'success', data: { signature } });
      return;
    }

    const { signer } = await buildEvmSigner(signerPublicKey, organizationId, userId, fromAddress, parsedChainId);
    const signature = await signer.signMessage(String(message));
    res.status(200).send({ status: 'success', data: { signature } });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/waas/wallet/sign-typed-data', xStampMiddleware, async (req: Request, res: Response) => {
  const { organizationId, userId, fromAddress, chainId, domain, types, value } = req.body ?? {};

  if (!organizationId || !userId || !fromAddress || chainId === undefined || !domain || !types || !value) {
    res.status(400).send({
      status: 'error',
      message: 'Missing required fields: organizationId, userId, fromAddress, chainId, domain, types, value',
    });
    return;
  }

  try {
    const signerPublicKey = res.locals.signerPublicKey as string;
    const authorizedUser = await resolveTargetUser(organizationId, userId, signerPublicKey);
    requireActionPermission(authorizedUser, WaasPolicyAction.SIGN_TRANSACTION);

    const parsedChainId = parseChainId(chainId);

    if (isSolanaLike(parsedChainId) || isTronLike(parsedChainId)) {
      throw new HttpError(400, 'sign-typed-data is only supported on EVM chains');
    }

    const { signer } = await buildEvmSigner(signerPublicKey, organizationId, userId, fromAddress, parsedChainId);
    const signature = await signer.signTypedData(domain, types, value);
    res.status(200).send({ status: 'success', data: { signature } });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/waas/wallet/send', xStampMiddleware, async (req: Request, res: Response) => {
  const { organizationId, userId, fromAddress, to, token: tokenAddress, amount, chainId } = req.body ?? {};

  if (!organizationId || !userId || !fromAddress || !to || !tokenAddress || !amount || chainId === undefined) {
    res.status(400).send({
      status: 'error',
      message: 'Missing required fields: organizationId, userId, fromAddress, to, token, amount, chainId',
    });
    return;
  }

  try {
    const signerPublicKey = res.locals.signerPublicKey as string;
    const authorizedUser = await resolveTargetUser(organizationId, userId, signerPublicKey);
    requireActionPermission(authorizedUser, WaasPolicyAction.SIGN_TRANSACTION);

    const parsedChainId = parseChainId(chainId);
    const token = resolveToken(tokenAddress, parsedChainId);
    const parsedAmount = getAmountInWei(token, String(amount));

    const txHash = await executeWalletTransfer({
      signerPublicKey,
      organizationId,
      userId,
      fromAddress,
      chainId: parsedChainId,
      token,
      amount: parsedAmount,
      to,
    });
    res.status(200).send({ status: 'success', data: { txHash } });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/waas/wallet/contract/approve', xStampMiddleware, async (req: Request, res: Response) => {
  const { organizationId, userId, fromAddress, chainId, token: tokenAddress, spender, amount } = req.body ?? {};

  if (!organizationId || !userId || !fromAddress || chainId === undefined || !tokenAddress || !spender || !amount) {
    res.status(400).send({
      status: 'error',
      message: 'Missing required fields: organizationId, userId, fromAddress, chainId, token, spender, amount',
    });
    return;
  }

  try {
    const signerPublicKey = res.locals.signerPublicKey as string;
    const authorizedUser = await resolveTargetUser(organizationId, userId, signerPublicKey);
    requireActionPermission(authorizedUser, WaasPolicyAction.SIGN_TRANSACTION);

    const parsedChainId = parseChainId(chainId);

    if (isSolanaLike(parsedChainId)) {
      throw new HttpError(400, 'Solana token approval uses a different model — not supported via this route');
    }

    const token = resolveToken(tokenAddress, parsedChainId);
    const parsedAmount = getAmountInWei(token, String(amount));

    if (isTronLike(parsedChainId)) {
      const { tronWeb } = await buildTronSigner(signerPublicKey, organizationId, userId, fromAddress, parsedChainId);
      const tx = await buildTronApproveTransaction(
        tronWeb,
        fromAddress,
        token.erc20TokenAddress,
        spender,
        parsedAmount,
      );
      const txHash = await sendTronTransaction(tronWeb, tx);
      res.status(200).send({ status: 'success', data: { txHash } });
      return;
    }

    const { signer, provider } = await buildEvmSigner(
      signerPublicKey,
      organizationId,
      userId,
      fromAddress,
      parsedChainId,
    );
    const txHash = await sendEvmTransaction(signer, provider, {
      to: token.erc20TokenAddress,
      data: encodeApproveCalldata(spender, parsedAmount),
      value: 0n,
    });
    res.status(200).send({ status: 'success', data: { txHash } });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/waas/wallet/contract/execute', xStampMiddleware, async (req: Request, res: Response) => {
  const { organizationId, userId, fromAddress, chainId, to, data, value, functionSelector, parameters } =
    req.body ?? {};

  if (!organizationId || !userId || !fromAddress || chainId === undefined || !to) {
    res.status(400).send({
      status: 'error',
      message: 'Missing required fields: organizationId, userId, fromAddress, chainId, to',
    });
    return;
  }

  try {
    const signerPublicKey = res.locals.signerPublicKey as string;
    const authorizedUser = await resolveTargetUser(organizationId, userId, signerPublicKey);
    requireActionPermission(authorizedUser, WaasPolicyAction.SIGN_TRANSACTION);

    const parsedChainId = parseChainId(chainId);

    if (isSolanaLike(parsedChainId)) {
      throw new HttpError(400, 'Solana does not use contract calldata — use POST /waas/wallet/solana/execute instead');
    }

    if (isTronLike(parsedChainId)) {
      if (!functionSelector || !Array.isArray(parameters)) {
        throw new HttpError(400, 'Tron contract execute requires functionSelector and parameters array');
      }
      const { tronWeb } = await buildTronSigner(signerPublicKey, organizationId, userId, fromAddress, parsedChainId);
      const tx = await buildTronExecuteTransaction(
        tronWeb,
        fromAddress,
        to,
        functionSelector,
        parameters,
        value ? BigInt(value) : undefined,
      );
      const txHash = await sendTronTransaction(tronWeb, tx);
      res.status(200).send({ status: 'success', data: { txHash } });
      return;
    }

    if (!data) throw new HttpError(400, 'EVM contract execute requires data (hex calldata)');
    const { signer, provider } = await buildEvmSigner(
      signerPublicKey,
      organizationId,
      userId,
      fromAddress,
      parsedChainId,
    );
    const txHash = await sendEvmTransaction(signer, provider, {
      to,
      data,
      value: value ? BigInt(value) : 0n,
    });
    res.status(200).send({ status: 'success', data: { txHash } });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/waas/wallet/swap', xStampMiddleware, async (req: Request, res: Response) => {
  const { organizationId, userId, fromAddress, fromToken, toToken, amount, chainId, toChainId, slippagePercentage } =
    req.body ?? {};

  if (hasMissingSwapFields(req.body ?? {})) {
    res.status(400).send({ status: 'error', message: REQUIRED_SWAP_FIELDS_MESSAGE });
    return;
  }

  try {
    const signerPublicKey = res.locals.signerPublicKey as string;
    const authorizedUser = await resolveTargetUser(organizationId, userId, signerPublicKey);
    requireActionPermission(authorizedUser, WaasPolicyAction.SIGN_TRANSACTION);

    const sourceChainId = parseChainId(chainId);
    const destChainId = toChainId === undefined || toChainId === null ? sourceChainId : parseChainId(toChainId);

    if (isNearIntentsBridgeRequest(sourceChainId, destChainId)) {
      const validated = resolveAndValidateNearBridgeRequest(
        fromToken,
        toToken,
        amount,
        sourceChainId,
        destChainId,
        fromAddress,
        authorizedUser.wallets,
        slippagePercentage,
      );

      const { txHash, depositAddress, amountOut } = await executeNearBridgeDeposit({
        ...validated,
        signerPublicKey,
        organizationId,
        userId,
        fromAddress,
        sourceChainId,
        destChainId,
      });

      res.status(200).send({
        status: 'success',
        data: {
          txHash,
          depositAddress,
          expectedOutput: getAmountInToken(validated.destToken, BigInt(amountOut)),
          destinationChainId: destChainId,
          destinationRecipient: validated.destinationRecipient,
        },
      });
      return;
    }

    const { parsedChainId, isCrossChain, inToken, outToken, amountWei, parsedSlippage } =
      resolveAndValidatePublicSwapRequest(fromToken, toToken, chainId, amount, slippagePercentage, toChainId);

    const swapParams: SwapExecutionParams = {
      signerPublicKey,
      organizationId,
      userId,
      fromAddress,
      chainId: parsedChainId,
      inToken,
      outToken,
      amount: String(amount),
      amountWei,
      isNative: caseInsensitiveEqual(inToken.erc20TokenAddress, zeroAddress),
      slippagePercentage: parsedSlippage,
    };

    const result: SwapExecutionResult = isSolanaLike(parsedChainId)
      ? await executeSolanaSwap(swapParams)
      : await executeEvmSwap(swapParams);

    res.status(200).send({
      status: 'success',
      data: {
        txHash: result.txHash,
        approveTxHash: result.approveTxHash,
        expectedOutput: getAmountInToken(outToken, result.outAmount),
        minimumOutput: getAmountInToken(outToken, result.minOutAmount),
        ...(isCrossChain ? { destinationChainId: outToken.chainId } : {}),
      },
    });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
