import type { TypedDataDomain } from 'ethers';

export type TypedDataField = { name: string; type: string };

/** EIP-712 primary type per enclave operation (no separate `transaction` field). */
export type EnclaveTypedDataPrimaryType =
  | 'Deposit'
  | 'ProoflessDeposit'
  | 'DepositForOther'
  | 'Transfer'
  | 'Withdraw'
  | 'Swap'
  | 'PrivateSend'
  | 'WithdrawStuckUtxos'
  | 'ReceiveVaultRecover';

export type EnclaveTypedDataPayload = {
  domain: TypedDataDomain;
  types: Record<string, TypedDataField[]>;
  value: Record<string, unknown>;
};

export type BaseAuthFields = {
  nonce: string;
  sessionId: string;
  chainId: number;
};

export type TokenAmountPair = {
  tokenAddress: string;
  amount: string;
};

export type DepositAndWithdrawRecipient = {
  address: string;
  amount: string;
};
