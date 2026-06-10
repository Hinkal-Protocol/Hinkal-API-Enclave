import {
  ENCLAVE_API_URL,
  ExternalActionId,
  HINKAL_PRIVATE_SEND_VARIABLE_RATE,
  httpClient,
  waitForTransactionConfirmation,
} from '@hinkal/common';
import { depositUsdtToPrivate, getTronUsdtBalance } from '../../utils/tronIntegrationHelpers';
import { buildWithdrawAuthFieldsTron, createEnclaveSessionTron } from '../../utils/enclaveAuthHelperTron';
import { fetchFeeStructure } from '../../utils/fetchFeeStructureTron';
import { getPrivateBalanceForToken } from '../../utils/getPrivateBalanceTron';
import { TRON_NILE_CHAIN_ID, TRON_NILE_USDT_ADDRESS } from '../../utils/tronTestConstants';
import { getEnclaveTronTestWallet, type TronTestWallet } from '../../utils/tronTestWallet';
import { tronRelayFee } from '../../utils/tronFeeHelpers';
import { TxHashResponse } from '../../../types';

const WITHDRAW_AMOUNT = BigInt('10000'); // 0.01 USDT

let wallet: TronTestWallet;

beforeAll(() => {
  wallet = getEnclaveTronTestWallet();
});

describe('withdraw route (Tron Nile)', () => {
  jest.setTimeout(300_000);

  it('returns tx hash and increases public USDT balance after withdrawing from private balance', async () => {
    const authFields = await createEnclaveSessionTron(wallet.tronWeb, wallet.address, TRON_NILE_CHAIN_ID);

    const feeStructure = await fetchFeeStructure(
      wallet,
      TRON_NILE_USDT_ADDRESS,
      [TRON_NILE_USDT_ADDRESS],
      ExternalActionId.Transact,
      authFields,
      HINKAL_PRIVATE_SEND_VARIABLE_RATE,
    );

    const totalRelayFee = tronRelayFee(feeStructure.flatFee, feeStructure.variableRate, WITHDRAW_AMOUNT);
    const depositAmount = WITHDRAW_AMOUNT + totalRelayFee;
    await depositUsdtToPrivate(wallet, depositAmount, TRON_NILE_USDT_ADDRESS, true);

    const balanceBeforeWithdraw = await getTronUsdtBalance(wallet);
    const privateBalanceBeforeWithdraw = await getPrivateBalanceForToken(wallet, TRON_NILE_USDT_ADDRESS, authFields);

    const txData = {
      chainId: wallet.chainId,
      tokenAddresses: [TRON_NILE_USDT_ADDRESS],
      amounts: [WITHDRAW_AMOUNT.toString()],
      recipientAddress: wallet.address,
    };

    const withdrawAuthFields = buildWithdrawAuthFieldsTron(wallet.tronWeb, wallet.address, txData);

    const response = await httpClient.post<TxHashResponse>(`${ENCLAVE_API_URL}/withdraw`, {
      ...withdrawAuthFields,
      address: wallet.address,
      ...txData,
      feeToken: TRON_NILE_USDT_ADDRESS,
      feeStructure,
    });

    const { txHash } = response as Extract<TxHashResponse, { success: true }>;

    expect(txHash).toBeDefined();

    await waitForTransactionConfirmation(wallet.chainId, txHash);

    const balanceAfterWithdraw = await getTronUsdtBalance(wallet);
    const privateBalanceAfterWithdraw = await getPrivateBalanceForToken(wallet, TRON_NILE_USDT_ADDRESS, authFields);

    expect(balanceAfterWithdraw - balanceBeforeWithdraw).toBeGreaterThan(0n);
    expect(privateBalanceAfterWithdraw - privateBalanceBeforeWithdraw).toEqual(-WITHDRAW_AMOUNT - totalRelayFee);
  });
});
