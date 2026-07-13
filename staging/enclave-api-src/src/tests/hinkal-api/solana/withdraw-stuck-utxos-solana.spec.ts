import { ENCLAVE_API_URL, httpClient, waitForTransactionConfirmation } from '@hinkal/common';
import {
  buildAuthPostSolana,
  buildSolanaWithdrawStuckUtxosAuthFields,
  createEnclaveSolanaSession,
} from '../../utils/enclaveSolanaAuthHelper';
import { getSolanaTokenBalance } from '../../utils/solanaIntegrationHelpers';
import { requestSignatureGetHeader, sessionQueryParams } from '../../utils/enclaveAuthHelper';
import { SOLANA_MAINNET_USDC_ADDRESS } from '../../utils/solanaTestConstants';
import { getEnclaveSolanaTestWallet, type SolanaTestWallet } from '../../utils/solanaTestWallet';
import { BalanceResponse } from '../../../types';

let wallet: SolanaTestWallet;

beforeAll(() => {
  wallet = getEnclaveSolanaTestWallet();
});

const getStuckUtxoBalance = async (): Promise<bigint> => {
  const authFields = await createEnclaveSolanaSession(wallet);
  const params = new URLSearchParams(sessionQueryParams(authFields, wallet.chainId));
  const queryString = params.toString();
  const headers = requestSignatureGetHeader(authFields, '/stuck-utxo-balance', queryString);
  const response = await httpClient.get<BalanceResponse>(`${ENCLAVE_API_URL}/stuck-utxo-balance?${queryString}`, {
    headers,
  });
  if (response.success === false) throw new Error(response.error);
  return BigInt(
    response.balances.find((b) => b.tokenAddress.toLowerCase() === SOLANA_MAINNET_USDC_ADDRESS.toLowerCase())
      ?.balance ?? '0',
  );
};

describe('GET /stuck-utxo-balance (Solana mainnet)', () => {
  jest.setTimeout(60_000);

  it('returns a valid balance (zero or positive) for USDC', async () => {
    const balance = await getStuckUtxoBalance();
    console.log('balance is: ', balance);
    expect(balance >= 0n).toBe(true);
  });
});

describe('POST /withdraw-stuck-utxos (Solana mainnet)', () => {
  jest.setTimeout(300_000);

  it('withdraws any stuck USDC UTXOs to recipient and verifies balance clears', async () => {
    const session = await createEnclaveSolanaSession(wallet);
    const stuckBefore = await getStuckUtxoBalance();
    const recipientAddress = wallet.address;
    const publicBalanceBefore = await getSolanaTokenBalance(wallet, SOLANA_MAINNET_USDC_ADDRESS);

    const txParams = {
      chainId: wallet.chainId,
      tokenAddress: SOLANA_MAINNET_USDC_ADDRESS,
      recipientAddress,
    };
    const { body, headers } = buildAuthPostSolana(session, wallet.chainId, '/withdraw-stuck-utxos', txParams, () =>
      buildSolanaWithdrawStuckUtxosAuthFields(session, wallet, txParams),
    );

    const response = await httpClient.post<{ success: true; txHashes: string[] }>(
      `${ENCLAVE_API_URL}/withdraw-stuck-utxos`,
      body,
      headers ? { headers } : undefined,
    );

    const { txHashes } = response;
    expect(Array.isArray(txHashes)).toBe(true);

    if (stuckBefore === 0n) {
      expect(txHashes).toHaveLength(0);
      return;
    }

    expect(txHashes.length).toBeGreaterThan(0);

    await Promise.all(txHashes.map((h) => waitForTransactionConfirmation(wallet.chainId, h)));
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 15_000);
    });

    const stuckAfter = await getStuckUtxoBalance();
    expect(stuckAfter).toBe(0n);

    const publicBalanceAfter = await getSolanaTokenBalance(wallet, SOLANA_MAINNET_USDC_ADDRESS);
    expect(publicBalanceAfter).toBeGreaterThan(publicBalanceBefore);
  });
});
