import { ethers } from 'ethers';
import {
  ARC_TESTNET_USDC_ADDRESS,
  calculateTotalFee,
  chainIds,
  ENCLAVE_API_URL,
  ExternalActionId,
  HINKAL_PRIVATE_SEND_VARIABLE_RATE,
  httpClient,
  waitForEthereumTransactionConfirmation,
} from '@hinkal/common';
import { createJsonRpcProvider } from '@hinkal/common/functions/utils/create-provider';
import { requireEnv } from '@hinkal/common/functions/utils/requireEnv';
import { depositUsdcToPrivate } from '../utils/enclaveIntegrationHelpers';
import {
  buildAuthPost,
  buildTransferAuthFields,
  createEnclaveSession,
  requestSignatureGetHeader,
  sessionQueryParams,
} from '../utils/enclaveAuthHelper';
import { fetchFeeStructure } from '../utils/fetchFeeStructure';
import { RecipientInfoResponse, TxHashResponse } from '../../types';
import { getPrivateBalanceForToken } from '../utils/getPrivateBalance';

const CHAIN_ID = chainIds.arcTestnet;
const DEPOSIT_AMOUNT = BigInt('100000'); // 0.1 USDC (6 decimals)
const TRANSFER_AMOUNT = BigInt('50000'); // 0.05 USDC (6 decimals)

let wallet: ethers.Wallet;

beforeAll(() => {
  const privateKey = requireEnv('ENCLAVE_TESTING_PRIVATE_KEY');
  const provider = createJsonRpcProvider(CHAIN_ID);
  wallet = new ethers.Wallet(privateKey, provider);
});

describe('transfer route', () => {
  jest.setTimeout(300_000);

  it('returns tx hash after transferring USDC to a private recipient', async () => {
    const authFields = await createEnclaveSession(wallet);

    await depositUsdcToPrivate(wallet, CHAIN_ID, DEPOSIT_AMOUNT, authFields);

    const recipientParams = new URLSearchParams(sessionQueryParams(authFields, CHAIN_ID));
    const recipientQueryString = recipientParams.toString();
    const recipientHeaders = requestSignatureGetHeader(authFields, recipientQueryString);
    const recipientInfoResponse = await httpClient.get<RecipientInfoResponse>(
      `${ENCLAVE_API_URL}/recipient-info?${recipientQueryString}`,
      { headers: recipientHeaders },
    );

    const { recipientInfo } = recipientInfoResponse as Extract<RecipientInfoResponse, { success: true }>;
    expect(recipientInfo).toBeTruthy();

    const privateBalanceBeforeTransfer = await getPrivateBalanceForToken(
      wallet,
      CHAIN_ID,
      ARC_TESTNET_USDC_ADDRESS,
      authFields,
    );

    const feeStructure = await fetchFeeStructure(
      wallet,
      CHAIN_ID,
      ARC_TESTNET_USDC_ADDRESS,
      [ARC_TESTNET_USDC_ADDRESS],
      ExternalActionId.Transact,
      authFields,
      HINKAL_PRIVATE_SEND_VARIABLE_RATE,
    );

    const txParams = {
      chainId: CHAIN_ID,
      tokenAddresses: [ARC_TESTNET_USDC_ADDRESS],
      amounts: [TRANSFER_AMOUNT.toString()],
      recipientAddress: recipientInfo,
    };
    const { body, headers } = await buildAuthPost(
      authFields,
      CHAIN_ID,
      { ...txParams, feeToken: ARC_TESTNET_USDC_ADDRESS, feeStructure },
      () => buildTransferAuthFields(authFields, wallet, txParams),
    );
    const response = await httpClient.post<TxHashResponse>(
      `${ENCLAVE_API_URL}/transfer`,
      body,
      headers ? { headers } : undefined,
    );

    const { txHash } = response as Extract<TxHashResponse, { success: true }>;

    expect(txHash).toBeDefined();

    await waitForEthereumTransactionConfirmation(CHAIN_ID, txHash);

    const privateBalanceAfterTransfer = await getPrivateBalanceForToken(
      wallet,
      CHAIN_ID,
      ARC_TESTNET_USDC_ADDRESS,
      authFields,
    );
    const totalRelayFee = calculateTotalFee(TRANSFER_AMOUNT, {
      feeToken: feeStructure.feeToken,
      flatFee: BigInt(feeStructure.flatFee),
      variableRate: BigInt(feeStructure.variableRate),
    });
    expect(privateBalanceAfterTransfer).toEqual(privateBalanceBeforeTransfer - totalRelayFee);
  });
});
