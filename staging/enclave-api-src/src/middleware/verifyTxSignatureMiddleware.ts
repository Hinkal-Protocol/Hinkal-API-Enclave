import { NextFunction, Request, Response } from 'express';
import { EnclaveSessionAccess } from '../constants';
import { verifyTypedDataSignature } from '../utils';
import {
  buildDepositAndWithdrawTypedData,
  buildDepositForOtherTypedData,
  buildDepositTypedData,
  buildProoflessDepositTypedData,
  buildSwapTypedData,
  buildTransferTypedData,
  buildWithdrawStuckUtxosTypedData,
  buildWithdrawTypedData,
} from '../utils/enclaveTypedData';
import {
  parseDepositAndWithdrawAuthBody,
  parseTokenDepositAuthBody,
  parseTokenDepositForOtherAuthBody,
  parseTokenSwapAuthBody,
  parseTokenTransferAuthBody,
  parseWithdrawStuckUtxosAuthBody,
} from '../utils/enclaveTypedDataAuthBody';
import { getEnclaveNonceSession } from '../models/EnclaveNonceSchema';
import {
  isActiveWriteSessionForRequest,
  parseSignatureRequest,
  registerTxNonceOrRespond,
  verifyEnclaveSessionSignature,
} from './signatureMiddlewareUtils';
import { EnclaveTypedDataPayload, ParsedSignatureRequest, ParseResult } from '../types';

const verifyRequestSignature = async (
  body: Record<string, unknown>,
  request: ParsedSignatureRequest,
  buildTypedData: (body: Record<string, unknown>) => ParseResult<EnclaveTypedDataPayload>,
): Promise<ParseResult<boolean>> => {
  const { signature, address, chainId } = request;

  const typedDataResult = buildTypedData(body);
  if (typedDataResult.ok === false) {
    return typedDataResult;
  }

  const { domain, types, value } = typedDataResult.value;
  const isValid = await verifyTypedDataSignature(signature, address, domain, types, value, chainId);
  return { ok: true, value: isValid };
};

const tryVerifyWriteSessionSignature = async (res: Response, request: ParsedSignatureRequest): Promise<boolean> => {
  const session = await getEnclaveNonceSession(request.nonce);
  if (!session || !isActiveWriteSessionForRequest(session, request)) {
    return false;
  }

  const isValid = await verifyEnclaveSessionSignature(request, EnclaveSessionAccess.Write);
  if (!isValid) {
    res.status(401).json({ error: 'Invalid signature' });
    return true;
  }

  return true;
};

export const createVerifyTypedDataSignatureMiddleware = (
  buildTypedData: (body: Record<string, unknown>) => ParseResult<EnclaveTypedDataPayload>,
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = { ...req.query, ...req.body } as Record<string, unknown>;
      const parsed = parseSignatureRequest(body);
      if (parsed.ok === false) {
        res.status(400).json({ error: parsed.error });
        return;
      }

      const request = parsed.value;

      const usedWriteSession = await tryVerifyWriteSessionSignature(res, request);
      if (usedWriteSession) {
        if (res.headersSent) {
          return;
        }
        next();
        return;
      }

      const signatureVerificationResult = await verifyRequestSignature(body, request, buildTypedData);
      if (signatureVerificationResult.ok === false) {
        res.status(400).json({ error: signatureVerificationResult.error });
        return;
      }

      if (!signatureVerificationResult.value) {
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }

      const isNonceValid = await registerTxNonceOrRespond(request.nonce, res);
      if (!isNonceValid) {
        return;
      }

      next();
    } catch {
      res.status(401).json({ error: 'Signature verification failed' });
    }
  };
};

const createVerifyEnclaveTxMiddleware = <TPayload extends Record<string, unknown>>(
  parseBody: (body: Record<string, unknown>) => ParseResult<TPayload>,
  buildTypedData: (payload: TPayload) => EnclaveTypedDataPayload,
) =>
  createVerifyTypedDataSignatureMiddleware((body) => {
    const parsed = parseBody(body);
    if (parsed.ok === false) {
      return parsed;
    }

    return {
      ok: true,
      value: buildTypedData(parsed.value),
    };
  });

export const verifyDepositSignatureMiddleware = createVerifyEnclaveTxMiddleware(
  parseTokenDepositAuthBody,
  buildDepositTypedData,
);

export const verifyProoflessDepositSignatureMiddleware = createVerifyEnclaveTxMiddleware(
  parseTokenDepositAuthBody,
  buildProoflessDepositTypedData,
);

export const verifyDepositForOtherSignatureMiddleware = createVerifyEnclaveTxMiddleware(
  parseTokenDepositForOtherAuthBody,
  buildDepositForOtherTypedData,
);

export const verifyWithdrawSignatureMiddleware = createVerifyEnclaveTxMiddleware(
  parseTokenTransferAuthBody,
  buildWithdrawTypedData,
);

export const verifyTransferSignatureMiddleware = createVerifyEnclaveTxMiddleware(
  parseTokenTransferAuthBody,
  buildTransferTypedData,
);

export const verifySwapSignatureMiddleware = createVerifyEnclaveTxMiddleware(
  parseTokenSwapAuthBody,
  buildSwapTypedData,
);

export const verifyDepositAndWithdrawSignatureMiddleware = createVerifyEnclaveTxMiddleware(
  parseDepositAndWithdrawAuthBody,
  buildDepositAndWithdrawTypedData,
);

export const verifyWithdrawStuckUtxosSignatureMiddleware = createVerifyEnclaveTxMiddleware(
  parseWithdrawStuckUtxosAuthBody,
  buildWithdrawStuckUtxosTypedData,
);
