import {
  ENCLAVE_API_URL,
  ExternalActionId,
  HINKAL_PRIVATE_SEND_VARIABLE_RATE,
  httpClient,
  waitForTransactionConfirmation,
} from '@hinkal/common';
import {
  buildAuthPostSolana,
  buildSolanaWithdrawAuthFields,
  createEnclaveSolanaSession,
} from '../../utils/enclaveSolanaAuthHelper';
import { depositUsdcToPrivate, getSolanaTokenBalance } from '../../utils/solanaIntegrationHelpers';
import { fetchFeeStructure } from '../../utils/fetchFeeStructureSolana';
import { getPrivateBalanceForToken } from '../../utils/getPrivateBalanceSolana';
import { SOLANA_MAINNET_USDC_ADDRESS } from '../../utils/solanaTestConstants';
import { getEnclaveSolanaTestWallet, type SolanaTestWallet } from '../../utils/solanaTestWallet';
import { solanaRelayFee } from '../../utils/solanaFeeHelpers';
import { TxHashResponse } from '../../../types';

const WITHDRAW_AMOUNT = BigInt('1000'); // 0.001 USDC

let wallet: SolanaTestWallet;

beforeAll(() => {
  wallet = getEnclaveSolanaTestWallet();
});

describe('withdraw route (Solana mainnet)', () => {
  jest.setTimeout(300_000);

  it('returns tx hash and increases public USDC balance after withdrawing from private balance', async () => {
    const authFields = await createEnclaveSolanaSession(wallet);

    const feeStructure = await fetchFeeStructure(
      wallet,
      SOLANA_MAINNET_USDC_ADDRESS,
      [SOLANA_MAINNET_USDC_ADDRESS],
      ExternalActionId.Transact,
      authFields,
      HINKAL_PRIVATE_SEND_VARIABLE_RATE,
      [WITHDRAW_AMOUNT],
    );

    const totalRelayFee = solanaRelayFee(feeStructure.flatFee, feeStructure.variableRate, WITHDRAW_AMOUNT);
    const depositAmount = WITHDRAW_AMOUNT + totalRelayFee;
    await depositUsdcToPrivate(wallet, depositAmount, authFields, SOLANA_MAINNET_USDC_ADDRESS, true);

    const balanceBeforeWithdraw = await getSolanaTokenBalance(wallet);
    const privateBalanceBeforeWithdraw = await getPrivateBalanceForToken(
      wallet,
      SOLANA_MAINNET_USDC_ADDRESS,
      authFields,
    );

    const txParams = {
      chainId: wallet.chainId,
      tokenAddresses: [SOLANA_MAINNET_USDC_ADDRESS],
      amounts: [WITHDRAW_AMOUNT.toString()],
      recipientAddress: wallet.address,
    };
    const { body, headers } = buildAuthPostSolana(
      authFields,
      wallet.chainId,
      '/withdraw',
      { ...txParams, feeStructure },
      () => buildSolanaWithdrawAuthFields(authFields, wallet, txParams),
    );

    const response = await httpClient.post<TxHashResponse>(
      `${ENCLAVE_API_URL}/withdraw`,
      body,
      headers ? { headers } : undefined,
    );

    const { txHash } = response as Extract<TxHashResponse, { success: true }>;

    expect(txHash).toBeDefined();

    await waitForTransactionConfirmation(wallet.chainId, txHash);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 15_000);
    });

    const balanceAfterWithdraw = await getSolanaTokenBalance(wallet);
    const privateBalanceAfterWithdraw = await getPrivateBalanceForToken(
      wallet,
      SOLANA_MAINNET_USDC_ADDRESS,
      authFields,
    );

    expect(balanceAfterWithdraw - balanceBeforeWithdraw).toBeGreaterThan(0n);
    expect(privateBalanceAfterWithdraw - privateBalanceBeforeWithdraw).toEqual(-WITHDRAW_AMOUNT - totalRelayFee);
  });
});
