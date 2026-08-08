import { getAddress } from 'ethers';
import { BaseAuthFields, DepositAndWithdrawRecipient, ParseResult } from '../types';
import type { FeeAuthFields, SerializedFeeStructure } from './enclaveAuthNormalization';

const parseChainId = (chainId: unknown): number | undefined => {
  const parsed = typeof chainId === 'number' ? chainId : Number(chainId);
  return Number.isFinite(parsed) ? parsed : undefined;
};

// \p{Cc} matches the Unicode "Control" category (newlines, tabs, NUL, DEL, ...).
const CONTROL_CHAR_REGEX = /\p{Cc}/u;
export const containsControlChars = (value: string): boolean => CONTROL_CHAR_REGEX.test(value);

const parseBaseAuthBody = (
  body: Record<string, unknown>,
): ParseResult<{ nonce: string; sessionId: string; chainId: number }> => {
  const { nonce, sessionId, chainId } = body;

  if (typeof nonce !== 'string' || !nonce || containsControlChars(nonce)) {
    return { ok: false, error: 'Missing required field: nonce' };
  }

  if (typeof sessionId !== 'string' || !sessionId || containsControlChars(sessionId)) {
    return { ok: false, error: 'Missing required field: sessionId' };
  }

  const parsedChainId = parseChainId(chainId);
  if (parsedChainId === undefined) {
    return { ok: false, error: 'Invalid chainId' };
  }

  return { ok: true, value: { nonce, sessionId, chainId: parsedChainId } };
};

const parseStringArray = (value: unknown, fieldName: string): ParseResult<string[]> => {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, error: `Missing or empty ${fieldName}` };
  }
  if (!value.every((item) => typeof item === 'string' && item && !containsControlChars(item))) {
    return { ok: false, error: `Invalid ${fieldName}` };
  }
  return { ok: true, value };
};

const parseRecipientAddress = (value: unknown, errorMessage = 'Missing recipient address'): ParseResult<string> => {
  if (typeof value !== 'string' || !value || containsControlChars(value)) {
    return { ok: false, error: errorMessage };
  }
  try {
    return { ok: true, value: getAddress(value) };
  } catch {
    return { ok: true, value };
  }
};

export const parseTokenDepositAuthBody = (
  body: Record<string, unknown>,
): ParseResult<BaseAuthFields & { tokenAddresses: string[]; amounts: string[] }> => {
  const base = parseBaseAuthBody(body);
  if (base.ok === false) return base;

  const tokenAddresses = parseStringArray(body.tokenAddresses, 'tokenAddresses');
  if (tokenAddresses.ok === false) return tokenAddresses;

  const amounts = parseStringArray(body.amounts, 'amounts');
  if (amounts.ok === false) return amounts;

  if (tokenAddresses.value.length !== amounts.value.length) {
    return { ok: false, error: 'tokenAddresses and amounts must have the same length' };
  }

  return {
    ok: true,
    value: { ...base.value, tokenAddresses: tokenAddresses.value, amounts: amounts.value },
  };
};

export const parseTokenDepositForOtherAuthBody = (
  body: Record<string, unknown>,
): ParseResult<BaseAuthFields & { tokenAddresses: string[]; amounts: string[]; recipientInfo: string }> => {
  const deposit = parseTokenDepositAuthBody(body);
  if (deposit.ok === false) return deposit;

  const recipient = parseRecipientAddress(body.recipientInfo, 'Missing recipientInfo');
  if (recipient.ok === false) return recipient;

  return { ok: true, value: { ...deposit.value, recipientInfo: recipient.value } };
};

const parseFeeFields = (body: Record<string, unknown>): ParseResult<FeeAuthFields> => {
  const rawFeeToken = body.feeToken;
  if (typeof rawFeeToken === 'string' && containsControlChars(rawFeeToken)) {
    return { ok: false, error: 'Invalid feeToken' };
  }
  const feeToken = typeof rawFeeToken === 'string' && rawFeeToken ? rawFeeToken : undefined;
  const raw = body.feeStructure;
  if (!raw) return { ok: true, value: { feeToken } };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Invalid feeStructure' };
  }
  const { feeToken: ft, flatFee, variableRate } = raw as Record<string, unknown>;
  if (typeof ft !== 'string' || typeof flatFee !== 'string' || typeof variableRate !== 'string') {
    return { ok: false, error: 'Invalid feeStructure' };
  }
  if (containsControlChars(ft) || containsControlChars(flatFee) || containsControlChars(variableRate)) {
    return { ok: false, error: 'Invalid feeStructure' };
  }
  return { ok: true, value: { feeToken, feeStructure: { feeToken: ft, flatFee, variableRate } } };
};

export const parseTokenTransferAuthBody = (
  body: Record<string, unknown>,
): ParseResult<
  BaseAuthFields & {
    tokenAddresses: string[];
    amounts: string[];
    recipientAddress: string;
    feeToken?: string;
    feeStructure?: SerializedFeeStructure;
  }
> => {
  const deposit = parseTokenDepositAuthBody(body);
  if (deposit.ok === false) return deposit;

  const recipient = parseRecipientAddress(body.recipientAddress);
  if (recipient.ok === false) return recipient;

  const fee = parseFeeFields(body);
  if (fee.ok === false) return fee;

  return {
    ok: true,
    value: {
      ...deposit.value,
      recipientAddress: recipient.value,
      ...fee.value,
    },
  };
};

export const parseTokenWithdrawAuthBody = (
  body: Record<string, unknown>,
): ParseResult<
  BaseAuthFields & {
    tokenAddresses: string[];
    amounts: string[];
    recipientAddress: string;
    feeToken?: string;
    feeStructure?: SerializedFeeStructure;
  }
> => {
  const deposit = parseTokenDepositAuthBody(body);
  if (deposit.ok === false) return deposit;

  const recipient = parseRecipientAddress(body.recipientAddress);
  if (recipient.ok === false) return recipient;

  const fee = parseFeeFields(body);
  if (fee.ok === false) return fee;

  return {
    ok: true,
    value: {
      ...deposit.value,
      recipientAddress: recipient.value,
      ...fee.value,
    },
  };
};

export const parseTokenSwapAuthBody = (
  body: Record<string, unknown>,
): ParseResult<
  BaseAuthFields & {
    tokenAddresses: string[];
    amounts: string[];
    externalActionId: string;
    swapData: string;
    feeToken?: string;
    feeStructure?: SerializedFeeStructure;
  }
> => {
  const deposit = parseTokenDepositAuthBody(body);
  if (deposit.ok === false) return deposit;

  const { externalActionId, swapData } = body;
  if (typeof externalActionId !== 'string' || !externalActionId || containsControlChars(externalActionId)) {
    return { ok: false, error: 'Missing or invalid externalActionId' };
  }
  if (typeof swapData !== 'string' || !swapData || containsControlChars(swapData)) {
    return { ok: false, error: 'Missing or invalid swapData' };
  }

  const fee = parseFeeFields(body);
  if (fee.ok === false) return fee;

  return {
    ok: true,
    value: {
      ...deposit.value,
      externalActionId,
      swapData,
      ...fee.value,
    },
  };
};

const parseRecipients = (value: unknown): ParseResult<DepositAndWithdrawRecipient[]> => {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, error: 'Missing or empty recipients' };
  }

  return value.reduce<ParseResult<DepositAndWithdrawRecipient[]>>(
    (acc, item) => {
      if (acc.ok === false) return acc;

      if (!item || typeof item !== 'object') {
        return { ok: false, error: 'Invalid recipients' };
      }

      const { address, amount } = item as Record<string, unknown>;
      if (
        typeof address !== 'string' ||
        !address ||
        typeof amount !== 'string' ||
        !amount ||
        containsControlChars(amount)
      ) {
        return { ok: false, error: 'Invalid recipients' };
      }

      const recipient = parseRecipientAddress(address);
      if (recipient.ok === false) return recipient;

      return { ok: true, value: [...acc.value, { address: recipient.value, amount }] };
    },
    { ok: true, value: [] },
  );
};

export const parseDepositAndWithdrawAuthBody = (
  body: Record<string, unknown>,
): ParseResult<
  BaseAuthFields & {
    tokenAddress: string;
    recipients: DepositAndWithdrawRecipient[];
    feeToken?: string;
    txCompletionTime?: number;
    ref?: string;
  }
> => {
  const base = parseBaseAuthBody(body);
  if (base.ok === false) return base;

  const { tokenAddress } = body;
  const recipients = parseRecipients(body.recipients);

  if (typeof tokenAddress !== 'string' || !tokenAddress || containsControlChars(tokenAddress)) {
    return { ok: false, error: 'Missing tokenAddress' };
  }
  if (recipients.ok === false) return recipients;

  const rawFeeToken = body.feeToken;
  if (typeof rawFeeToken === 'string' && containsControlChars(rawFeeToken)) {
    return { ok: false, error: 'Invalid feeToken' };
  }
  const feeToken = typeof rawFeeToken === 'string' && rawFeeToken ? rawFeeToken : undefined;

  const rawTxCompletionTime = body.txCompletionTime;
  if (rawTxCompletionTime !== undefined && rawTxCompletionTime !== null && typeof rawTxCompletionTime !== 'number') {
    return { ok: false, error: 'Invalid txCompletionTime' };
  }
  const txCompletionTime = typeof rawTxCompletionTime === 'number' ? rawTxCompletionTime : undefined;

  const rawRef = body.ref;
  if (typeof rawRef === 'string' && containsControlChars(rawRef)) {
    return { ok: false, error: 'Invalid ref' };
  }
  const ref = typeof rawRef === 'string' && rawRef ? rawRef : undefined;

  return {
    ok: true,
    value: {
      ...base.value,
      tokenAddress,
      recipients: recipients.value,
      feeToken,
      txCompletionTime,
      ref,
    },
  };
};

export const parseWithdrawStuckUtxosAuthBody = (
  body: Record<string, unknown>,
): ParseResult<BaseAuthFields & { tokenAddress: string; recipientAddress: string }> => {
  const base = parseBaseAuthBody(body);
  if (base.ok === false) return base;

  const { tokenAddress } = body;
  const recipient = parseRecipientAddress(body.recipientAddress);

  if (typeof tokenAddress !== 'string' || !tokenAddress || containsControlChars(tokenAddress)) {
    return { ok: false, error: 'Missing tokenAddress' };
  }
  if (recipient.ok === false) return recipient;

  return {
    ok: true,
    value: { ...base.value, tokenAddress, recipientAddress: recipient.value },
  };
};
