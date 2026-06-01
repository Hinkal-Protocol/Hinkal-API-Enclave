import { TronWeb, Types as TronWebTypes } from 'tronweb';
import { createTronWeb, evmHexToTronBase58Address } from '@hinkal/common/functions/utils/tron.utils';
import { TRON_DEFAULT_FEE_LIMIT_SUN, zeroAddress } from '@hinkal/common/constants/protocol.constants';
import { TronLocalSigner } from '../data-structures';
import { walletSecretsService } from '../services/walletSecretsService';

export const buildTronSigner = async (
  signerPublicKey: string,
  organizationId: string,
  userId: string,
  walletAddress: string,
  chainId: number,
): Promise<{ signer: TronLocalSigner; tronWeb: TronWeb }> => {
  const { childWallet } = await walletSecretsService.getSeedHashAndChildWallet(
    organizationId,
    userId,
    signerPublicKey,
    walletAddress,
  );

  const signer = new TronLocalSigner(childWallet.tron.privateKey, chainId);
  const tronWeb = createTronWeb(chainId);
  tronWeb.setAddress(walletAddress);
  tronWeb.trx.sign = ((tx: TronWebTypes.Transaction) => signer.signTransaction(tx)) as typeof tronWeb.trx.sign;
  return { signer, tronWeb };
};

export const sendTronTransaction = async (tronWeb: TronWeb, tx: TronWebTypes.Transaction): Promise<string> => {
  const signed = await tronWeb.trx.sign(tx);
  const result = await tronWeb.trx.sendRawTransaction(signed as TronWebTypes.SignedTransaction);
  if (!result.result) throw new Error(`Tron transaction failed: ${result.message}`);
  return result.txid;
};

export const buildTronTransferTransaction = async (
  tronWeb: TronWeb,
  from: string,
  to: string,
  tokenAddress: string,
  amount: bigint,
): Promise<TronWebTypes.Transaction> => {
  if (tokenAddress.toLowerCase() === zeroAddress.toLowerCase()) {
    return tronWeb.transactionBuilder.sendTrx(to, Number(amount), from);
  }
  const contractBase58 = evmHexToTronBase58Address(tokenAddress);
  const { transaction } = await tronWeb.transactionBuilder.triggerSmartContract(
    contractBase58,
    'transfer(address,uint256)',
    { feeLimit: TRON_DEFAULT_FEE_LIMIT_SUN },
    [
      { type: 'address', value: to },
      { type: 'uint256', value: amount.toString() },
    ],
    from,
  );
  return transaction;
};

export const buildTronApproveTransaction = async (
  tronWeb: TronWeb,
  from: string,
  tokenAddress: string,
  spender: string,
  amount: bigint,
): Promise<TronWebTypes.Transaction<TronWebTypes.TriggerSmartContract>> => {
  const contractBase58 = evmHexToTronBase58Address(tokenAddress);
  const { transaction } = await tronWeb.transactionBuilder.triggerSmartContract(
    contractBase58,
    'approve(address,uint256)',
    { feeLimit: TRON_DEFAULT_FEE_LIMIT_SUN },
    [
      { type: 'address', value: spender },
      { type: 'uint256', value: amount.toString() },
    ],
    from,
  );
  return transaction;
};

export const buildTronExecuteTransaction = async (
  tronWeb: TronWeb,
  from: string,
  contractAddress: string,
  functionSelector: string,
  parameters: TronWebTypes.ContractFunctionParameter[],
  value?: bigint,
): Promise<TronWebTypes.Transaction<TronWebTypes.TriggerSmartContract>> => {
  const contractBase58 = evmHexToTronBase58Address(contractAddress);
  const { transaction } = await tronWeb.transactionBuilder.triggerSmartContract(
    contractBase58,
    functionSelector,
    { feeLimit: TRON_DEFAULT_FEE_LIMIT_SUN, callValue: value ? Number(value) : 0 },
    parameters,
    from,
  );
  return transaction;
};

export const buildTronFreezeTransaction = async (
  tronWeb: TronWeb,
  from: string,
  amount: bigint,
  resource: 'ENERGY' | 'BANDWIDTH',
): Promise<TronWebTypes.Transaction<TronWebTypes.FreezeBalanceV2Contract>> =>
  tronWeb.transactionBuilder.freezeBalanceV2(Number(amount), resource, from);

export const buildTronUnfreezeTransaction = async (
  tronWeb: TronWeb,
  from: string,
  amount: bigint,
  resource: 'ENERGY' | 'BANDWIDTH',
): Promise<TronWebTypes.Transaction<TronWebTypes.UnfreezeBalanceV2Contract>> =>
  tronWeb.transactionBuilder.unfreezeBalanceV2(Number(amount), resource, from);

export const buildTronDelegateResourceTransaction = async (
  tronWeb: TronWeb,
  from: string,
  to: string,
  amount: bigint,
  resource: 'ENERGY' | 'BANDWIDTH',
): Promise<TronWebTypes.Transaction<TronWebTypes.DelegateResourceContract>> =>
  tronWeb.transactionBuilder.delegateResource(Number(amount), to, resource, from, false);
