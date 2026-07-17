import { Request, Response, Router } from 'express';
import { isSolanaLike, isTronLike } from '@hinkal/common/constants/chains.constants';
import { zeroAddress } from '@hinkal/common/constants/protocol.constants';
import { getAmountInWei } from '@hinkal/common/functions/web3/etherFunctions';
import { HttpError } from '@hinkal/common';
import { PublicKey } from '@solana/web3.js';
import { parseChainId, resolveToken } from '../../utils/transactionHelpers';
import {
  buildEvmSigner,
  encodeApproveCalldata,
  encodeTransferCalldata,
  sendEvmTransaction,
} from '../../utils/evm-wallet.utils';
import {
  buildTronApproveTransaction,
  buildTronExecuteTransaction,
  buildTronSigner,
  buildTronTransferTransaction,
  sendTronTransaction,
} from '../../utils/tron-wallet.utils';
import {
  buildAndSendSolanaTransaction,
  buildSolanaSigner,
  buildSolanaTransferInstructionsForSend,
} from '../../utils/solana-wallet.utils';
import { sendError } from '../../utils/routeError';
import { xStampMiddleware } from '../../middleware';
import { requireActionPermission, resolveTargetUser } from '../../utils';
import { WaasPolicyAction } from '../../constants/policyActions';

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

    if (isSolanaLike(parsedChainId)) {
      const { signer, connection } = await buildSolanaSigner(
        signerPublicKey,
        organizationId,
        userId,
        fromAddress,
        parsedChainId,
      );
      const instructions = await buildSolanaTransferInstructionsForSend(
        connection,
        signer.publicKey,
        new PublicKey(to),
        token,
        parsedAmount,
      );
      const txHash = await buildAndSendSolanaTransaction(connection, signer, instructions);
      res.status(200).send({ status: 'success', data: { txHash } });
      return;
    }

    if (isTronLike(parsedChainId)) {
      const { tronWeb } = await buildTronSigner(signerPublicKey, organizationId, userId, fromAddress, parsedChainId);
      const tx = await buildTronTransferTransaction(tronWeb, fromAddress, to, token.erc20TokenAddress, parsedAmount);
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
    const isNative = token.erc20TokenAddress.toLowerCase() === zeroAddress.toLowerCase();
    const txHash = await sendEvmTransaction(signer, provider, {
      to: isNative ? to : token.erc20TokenAddress,
      data: isNative ? '0x' : encodeTransferCalldata(to, parsedAmount),
      value: isNative ? parsedAmount : 0n,
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

export default router;
