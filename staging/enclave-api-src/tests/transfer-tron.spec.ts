import {
  ENCLAVE_API_URL,
  ExternalActionId,
  HINKAL_PRIVATE_SEND_VARIABLE_RATE,
  httpClient,
  waitForTransactionConfirmation,
} from '@hinkal/common';
import { depositUsdtToPrivate } from './utils/tronIntegrationHelpers';
import { buildEnclaveTronTransferAuthFields, createEnclaveTronSession } from './utils/enclaveTronAuthHelper';
import { fetchFeeStructure } from './utils/fetchFeeStructureTron';
import { getPrivateBalanceForToken } from './utils/getPrivateBalanceTron';
import { TRON_NILE_CHAIN_ID, TRON_NILE_USDT_ADDRESS } from './utils/tronTestConstants';
import { getEnclaveTronTestWallet, type TronTestWallet } from './utils/tronTestWallet';
import { tronRelayFee } from './utils/tronFeeHelpers';
import { RecipientInfoResponse, TxHashResponse } from '../types';

const TRANSFER_AMOUNT = BigInt('50000'); // 0.05 USDT

let wallet: TronTestWallet;

beforeAll(() => {
  wallet = getEnclaveTronTestWallet();
});

describe('transfer route (Tron Nile)', () => {
  jest.setTimeout(300_000);

  it('returns tx hash after transferring USDT to a private recipient', async () => {
    const authFields = await createEnclaveTronSession(wallet, TRON_NILE_CHAIN_ID);

    const feeStructure = await fetchFeeStructure(
      wallet,
      TRON_NILE_USDT_ADDRESS,
      [TRON_NILE_USDT_ADDRESS],
      ExternalActionId.Transact,
      authFields,
      HINKAL_PRIVATE_SEND_VARIABLE_RATE,
    );

    const totalRelayFee = tronRelayFee(feeStructure.flatFee, feeStructure.variableRate, TRANSFER_AMOUNT);
    const depositAmount = TRANSFER_AMOUNT + totalRelayFee;
    await depositUsdtToPrivate(wallet, depositAmount, TRON_NILE_USDT_ADDRESS, true);

    const recipientInfoResponse = await httpClient.post<RecipientInfoResponse>(`${ENCLAVE_API_URL}/recipient-info`, {
      ...authFields,
      address: wallet.address,
      chainId: wallet.chainId,
    });

    const { recipientInfo } = recipientInfoResponse as Extract<RecipientInfoResponse, { success: true }>;
    expect(recipientInfo).toBeTruthy();

    const privateBalanceBeforeTransfer = await getPrivateBalanceForToken(wallet, TRON_NILE_USDT_ADDRESS, authFields);

    const txData = {
      chainId: wallet.chainId,
      tokenAddresses: [TRON_NILE_USDT_ADDRESS],
      amounts: [TRANSFER_AMOUNT.toString()],
      recipientAddress: recipientInfo,
    };

    const transferAuthFields = await buildEnclaveTronTransferAuthFields(wallet, txData);

    const response = await httpClient.post<TxHashResponse>(`${ENCLAVE_API_URL}/transfer`, {
      ...transferAuthFields,
      address: wallet.address,
      ...txData,
      feeToken: TRON_NILE_USDT_ADDRESS,
      feeStructure,
    });

    const { txHash } = response as Extract<TxHashResponse, { success: true }>;

    expect(txHash).toBeDefined();

    await waitForTransactionConfirmation(wallet.chainId, txHash);

    const privateBalanceAfterTransfer = await getPrivateBalanceForToken(wallet, TRON_NILE_USDT_ADDRESS, authFields);
    expect(privateBalanceAfterTransfer).toEqual(privateBalanceBeforeTransfer - totalRelayFee);
  });
});
