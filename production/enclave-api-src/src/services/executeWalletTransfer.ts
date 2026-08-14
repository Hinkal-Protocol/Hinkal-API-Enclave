import { PublicKey } from '@solana/web3.js';
import { isSolanaLike, isTronLike } from '@hinkal/common/constants/chains.constants';
import { zeroAddress } from '@hinkal/common/constants/protocol.constants';
import { caseInsensitiveEqual } from '@hinkal/common/functions/utils/caseInsensitive.utils';
import { WalletTransferParams } from '../types/swap.types';
import { buildEvmSigner, encodeTransferCalldata, sendEvmTransaction } from '../utils/evm-wallet.utils';
import {
  buildAndSendSolanaTransaction,
  buildSolanaSigner,
  buildSolanaTransferInstructionsForSend,
} from '../utils/solana-wallet.utils';
import { buildTronSigner, buildTronTransferTransaction, sendTronTransaction } from '../utils/tron-wallet.utils';

export const executeWalletTransfer = async (params: WalletTransferParams): Promise<string> => {
  const { signerPublicKey, organizationId, userId, fromAddress, chainId, token, amount, to } = params;

  if (isSolanaLike(chainId)) {
    const { signer, connection } = await buildSolanaSigner(
      signerPublicKey,
      organizationId,
      userId,
      fromAddress,
      chainId,
    );
    const instructions = await buildSolanaTransferInstructionsForSend(
      connection,
      signer.publicKey,
      new PublicKey(to),
      token,
      amount,
    );
    return buildAndSendSolanaTransaction(connection, signer, instructions);
  }

  if (isTronLike(chainId)) {
    const { tronWeb } = await buildTronSigner(signerPublicKey, organizationId, userId, fromAddress, chainId);
    const tx = await buildTronTransferTransaction(tronWeb, fromAddress, to, token.erc20TokenAddress, amount);
    return sendTronTransaction(tronWeb, tx);
  }

  const { signer, provider } = await buildEvmSigner(signerPublicKey, organizationId, userId, fromAddress, chainId);
  const isNative = caseInsensitiveEqual(token.erc20TokenAddress, zeroAddress);

  return sendEvmTransaction(signer, provider, {
    to: isNative ? to : token.erc20TokenAddress,
    data: isNative ? '0x' : encodeTransferCalldata(to, amount),
    value: isNative ? amount : 0n,
  });
};
