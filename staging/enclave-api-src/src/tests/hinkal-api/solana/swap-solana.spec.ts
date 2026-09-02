import {
  BalanceResponse,
  caseInsensitiveEqual,
  ENCLAVE_API_URL,
  ENCLAVE_SWAP_VARIABLE_RATE,
  EnclaveSessionAuthFields,
  ExternalActionId,
  getAmountInWei,
  GetSwapDataResponse,
  httpClient,
  sessionQueryParams,
  TxHashResponse,
  waitForTransactionConfirmation,
} from '@hinkal/common';
import { getERC20Token } from '@hinkal/erc20-registry';
import {
  buildAuthPostSolana,
  buildSolanaSwapAuthFields,
  createEnclaveSolanaSession,
} from '../../utils/enclaveSolanaAuthHelper';
import { requestSignatureGetHeader } from '../../utils/enclaveAuthHelper';
import { fetchFee } from '../../utils/fetchFeeSolana';
import { SOLANA_MAINNET_CHAIN_ID, SOLANA_MAINNET_USDC_ADDRESS } from '../../utils/solanaTestConstants';
import { getEnclaveSolanaTestWallet, type SolanaTestWallet } from '../../utils/solanaTestWallet';

const SOLANA_MAINNET_USDT_ADDRESS = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
const CHAIN_ID = SOLANA_MAINNET_CHAIN_ID;
const SWAP_INPUT_AMOUNT = '1.2'; // 0.1 USDC

let wallet: SolanaTestWallet;

beforeAll(() => {
  wallet = getEnclaveSolanaTestWallet();
});

const getPrivateBalanceForToken = async (
  tokenAddress: string,
  authFields: EnclaveSessionAuthFields,
): Promise<bigint> => {
  const params = new URLSearchParams(sessionQueryParams(authFields, CHAIN_ID));
  const queryString = params.toString();
  const headers = requestSignatureGetHeader(authFields, '/balance', queryString);
  const response = await httpClient.get<BalanceResponse>(`${ENCLAVE_API_URL}/balance?${queryString}`, { headers });
  if (response.success === false) throw new Error(response.error);
  return BigInt(response.balances.find((b) => caseInsensitiveEqual(b.tokenAddress, tokenAddress))?.balance ?? '0');
};

const fetchSolanaSwapData = async (
  authFields: EnclaveSessionAuthFields,
  inputTokenAddress: string,
  outputTokenAddress: string,
  amount: string,
): Promise<Extract<GetSwapDataResponse, { success: true }>> => {
  const params = new URLSearchParams({
    ...sessionQueryParams(authFields, CHAIN_ID),
    inputTokenAddress,
    outputTokenAddress,
    amount,
  });
  const queryString = params.toString();
  const headers = requestSignatureGetHeader(authFields, '/get-swap-data', queryString);
  const response = await httpClient.get<GetSwapDataResponse>(`${ENCLAVE_API_URL}/get-swap-data?${queryString}`, {
    headers,
  });
  if (response.success === false) throw new Error(response.error);
  return response;
};

describe('Solana swap routes', () => {
  jest.setTimeout(300_000);

  it('get-swap-data returns an OKX quote for a USDC to USDT pair on Solana', async () => {
    const authFields = await createEnclaveSolanaSession(wallet);

    const { swapData, externalActionId, outSwapAmount } = await fetchSolanaSwapData(
      authFields,
      SOLANA_MAINNET_USDC_ADDRESS,
      SOLANA_MAINNET_USDT_ADDRESS,
      SWAP_INPUT_AMOUNT,
    );

    expect(swapData).toBeTruthy();
    expect(externalActionId).toBeTruthy();
    expect(BigInt(outSwapAmount)).toBeGreaterThan(0n);
  });

  it('returns tx hash and updates private balances after swapping USDC to USDT on Solana', async () => {
    const authFields = await createEnclaveSolanaSession(wallet);

    const inSwapToken = getERC20Token(SOLANA_MAINNET_USDC_ADDRESS, CHAIN_ID);
    const outSwapToken = getERC20Token(SOLANA_MAINNET_USDT_ADDRESS, CHAIN_ID);
    if (!inSwapToken || !outSwapToken) throw new Error('Swap tokens not found on Solana mainnet');

    const privateUsdcBefore = await getPrivateBalanceForToken(SOLANA_MAINNET_USDC_ADDRESS, authFields);
    const privateUsdtBefore = await getPrivateBalanceForToken(SOLANA_MAINNET_USDT_ADDRESS, authFields);

    const {
      swapData,
      externalActionId,
      outSwapAmount: quotedOutSwapAmount,
    } = await fetchSolanaSwapData(
      authFields,
      SOLANA_MAINNET_USDC_ADDRESS,
      SOLANA_MAINNET_USDT_ADDRESS,
      SWAP_INPUT_AMOUNT,
    );

    const inSwapAmountWei = getAmountInWei(inSwapToken, SWAP_INPUT_AMOUNT);
    const tokenAddresses = [SOLANA_MAINNET_USDC_ADDRESS, SOLANA_MAINNET_USDT_ADDRESS];

    const feeAmount = await fetchFee(
      wallet,
      SOLANA_MAINNET_USDT_ADDRESS,
      tokenAddresses,
      ExternalActionId.Okx,
      authFields,
      ENCLAVE_SWAP_VARIABLE_RATE,
      [inSwapAmountWei, -BigInt(quotedOutSwapAmount)],
      SOLANA_MAINNET_USDC_ADDRESS,
    );

    const txParams = {
      chainId: CHAIN_ID,
      tokenAddresses,
      amounts: [(-inSwapAmountWei).toString(), quotedOutSwapAmount],
      externalActionId,
      swapData,
      feeAmount,
    };
    const { body, headers } = buildAuthPostSolana(authFields, CHAIN_ID, '/swap', txParams, () =>
      buildSolanaSwapAuthFields(authFields, wallet, txParams),
    );

    const response = await httpClient.post<TxHashResponse>(
      `${ENCLAVE_API_URL}/swap`,
      body,
      headers ? { headers } : undefined,
    );

    const { txHash } = response as Extract<TxHashResponse, { success: true }>;
    expect(txHash).toBeDefined();

    await waitForTransactionConfirmation(CHAIN_ID, txHash);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 15_000);
    });

    const privateUsdcAfter = await getPrivateBalanceForToken(SOLANA_MAINNET_USDC_ADDRESS, authFields);
    const privateUsdtAfter = await getPrivateBalanceForToken(SOLANA_MAINNET_USDT_ADDRESS, authFields);
    expect(privateUsdcBefore - privateUsdcAfter).toEqual(inSwapAmountWei);
    expect(privateUsdtAfter - privateUsdtBefore).toBeGreaterThan(0n);
  });
});
