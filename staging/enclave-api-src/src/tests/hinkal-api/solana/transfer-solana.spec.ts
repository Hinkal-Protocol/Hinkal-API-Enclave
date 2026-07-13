import {
  ENCLAVE_API_URL,
  ExternalActionId,
  HINKAL_PRIVATE_SEND_VARIABLE_RATE,
  httpClient,
  waitForTransactionConfirmation,
} from '@hinkal/common';
import {
  buildAuthPostSolana,
  buildSolanaTransferAuthFields,
  createEnclaveSolanaSession,
} from '../../utils/enclaveSolanaAuthHelper';
import { depositUsdcToPrivate } from '../../utils/solanaIntegrationHelpers';
import { requestSignatureGetHeader, sessionQueryParams } from '../../utils/enclaveAuthHelper';
import { fetchFeeStructure } from '../../utils/fetchFeeStructureSolana';
import { getPrivateBalanceForToken } from '../../utils/getPrivateBalanceSolana';
import { SOLANA_MAINNET_USDC_ADDRESS } from '../../utils/solanaTestConstants';
import { getEnclaveSolanaTestWallet, type SolanaTestWallet } from '../../utils/solanaTestWallet';
import { solanaRelayFee } from '../../utils/solanaFeeHelpers';
import { RecipientInfoResponse, TxHashResponse } from '../../../types';

const TRANSFER_AMOUNT = BigInt('10000'); // 0.01 USDC

let wallet: SolanaTestWallet;

beforeAll(() => {
  wallet = getEnclaveSolanaTestWallet();
});

describe('transfer route (Solana mainnet)', () => {
  jest.setTimeout(300_000);

  it('returns tx hash after transferring USDC to a private recipient', async () => {
    const authFields = await createEnclaveSolanaSession(wallet);

    const feeStructure = await fetchFeeStructure(
      wallet,
      SOLANA_MAINNET_USDC_ADDRESS,
      [SOLANA_MAINNET_USDC_ADDRESS],
      ExternalActionId.Transact,
      authFields,
      HINKAL_PRIVATE_SEND_VARIABLE_RATE,
      [TRANSFER_AMOUNT],
    );

    const totalRelayFee = solanaRelayFee(feeStructure.flatFee, feeStructure.variableRate, TRANSFER_AMOUNT);
    const depositAmount = TRANSFER_AMOUNT + totalRelayFee;
    await depositUsdcToPrivate(wallet, depositAmount, authFields, SOLANA_MAINNET_USDC_ADDRESS, true);

    const recipientParams = new URLSearchParams(sessionQueryParams(authFields, wallet.chainId));
    const recipientQueryString = recipientParams.toString();
    const { recipientInfo } = await httpClient.get<Extract<RecipientInfoResponse, { success: true }>>(
      `${ENCLAVE_API_URL}/recipient-info?${recipientQueryString}`,
      { headers: requestSignatureGetHeader(authFields, '/recipient-info', recipientQueryString) },
    );
    expect(recipientInfo).toBeTruthy();

    const privateBalanceBeforeTransfer = await getPrivateBalanceForToken(
      wallet,
      SOLANA_MAINNET_USDC_ADDRESS,
      authFields,
    );

    const txParams = {
      chainId: wallet.chainId,
      tokenAddresses: [SOLANA_MAINNET_USDC_ADDRESS],
      amounts: [TRANSFER_AMOUNT.toString()],
      recipientAddress: recipientInfo,
    };
    const { body, headers } = buildAuthPostSolana(
      authFields,
      wallet.chainId,
      '/transfer',
      { ...txParams, feeStructure },
      () => buildSolanaTransferAuthFields(authFields, wallet, txParams),
    );

    const response = await httpClient.post<TxHashResponse>(
      `${ENCLAVE_API_URL}/transfer`,
      body,
      headers ? { headers } : undefined,
    );

    const { txHash } = response as Extract<TxHashResponse, { success: true }>;

    expect(txHash).toBeDefined();

    await waitForTransactionConfirmation(wallet.chainId, txHash);

    const privateBalanceAfterTransfer = await getPrivateBalanceForToken(
      wallet,
      SOLANA_MAINNET_USDC_ADDRESS,
      authFields,
    );
    expect(privateBalanceAfterTransfer).toEqual(privateBalanceBeforeTransfer - totalRelayFee);
  });
});
