import { EnclaveSessionAuthMode, HEADER_REQUEST_SIGNATURE, isSolanaLike } from '@hinkal/common';
import { NextFunction, Request, Response } from 'express';
import { verifySignature, verifyTypedDataSignature } from '../utils';
import {
  buildDepositAndWithdrawTypedData,
  buildDepositForOtherTypedData,
  buildDepositTypedData,
  buildProoflessDepositTypedData,
  buildReceiveVaultRecoverTypedData,
  buildSwapTypedData,
  buildTransferTypedData,
  buildWithdrawStuckUtxosTypedData,
  buildWithdrawTypedData,
} from '../utils/enclaveTypedData';
import {
  buildSolanaDepositForOtherMessage,
  buildSolanaDepositMessage,
  buildSolanaPrivateSendMessage,
  buildSolanaProoflessDepositMessage,
  buildSolanaSwapMessage,
  buildSolanaTransferMessage,
  buildSolanaWithdrawMessage,
  buildSolanaWithdrawStuckUtxosMessage,
} from '../utils/enclaveSolanaMessage';
import {
  parseDepositAndWithdrawAuthBody,
  parseReceiveVaultRecoverAuthBody,
  parseTokenDepositAuthBody,
  parseTokenDepositForOtherAuthBody,
  parseTokenSwapAuthBody,
  parseTokenTransferAuthBody,
  parseTokenWithdrawAuthBody,
  parseWithdrawStuckUtxosAuthBody,
} from '../utils/enclaveTypedDataAuthBody';
import { consumeRequestNonceOrRespond, parseSignatureRequest } from './signatureMiddlewareUtils';
import { verifyRequestSignatureSession } from '../utils/requestSignatureUtils';
import { getSignedRequestFields } from '../utils/requestBinding';
import { getEnclaveSession, isEnclaveSessionActive } from '../models/EnclaveSessionSchema';
import { EnclaveTypedDataPayload, ParsedSignatureRequest, ParseResult } from '../types';

const verifyRequestSignature = async (
  body: Record<string, unknown>,
  request: ParsedSignatureRequest,
  address: string,
  buildTypedData: (body: Record<string, unknown>) => ParseResult<EnclaveTypedDataPayload>,
  buildSolanaMessage?: (body: Record<string, unknown>) => ParseResult<string>,
): Promise<ParseResult<boolean>> => {
  const { signature, chainId } = request;

  if (chainId === undefined) return { ok: false, error: 'Missing chainId' };

  if (isSolanaLike(chainId) && buildSolanaMessage) {
    const messageResult = buildSolanaMessage(body);
    if (messageResult.ok === false) return messageResult;
    const isValid = await verifySignature(signature, address, messageResult.value, chainId);
    return { ok: true, value: isValid };
  }

  const typedDataResult = buildTypedData(body);
  if (typedDataResult.ok === false) {
    return typedDataResult;
  }

  const { domain, types, value } = typedDataResult.value;
  const isValid = await verifyTypedDataSignature(signature, address, domain, types, value, chainId);
  return { ok: true, value: isValid };
};

export const createVerifyTypedDataSignatureMiddleware = (
  buildTypedData: (body: Record<string, unknown>) => ParseResult<EnclaveTypedDataPayload>,
  buildSolanaMessage?: (body: Record<string, unknown>) => ParseResult<string>,
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.headers[HEADER_REQUEST_SIGNATURE]) {
        const payload = (req as Request & { rawBody?: string }).rawBody ?? '';
        const session = await verifyRequestSignatureSession(req, res, true, payload);
        if (!session) return;

        if (!(await consumeRequestNonceOrRespond(req, res))) return;

        res.locals.address = session.address;
        next();
        return;
      }

      const body = getSignedRequestFields(req);
      const parsed = parseSignatureRequest(body);
      if (parsed.ok === false) {
        res.status(400).json({ error: parsed.error });
        return;
      }

      const parsedRequest = parsed.value;
      const { sessionId } = parsedRequest;

      const session = await getEnclaveSession(sessionId);
      if (!session) {
        res.status(401).json({ error: 'Session not found. Create a session first via POST /create-session' });
        return;
      }

      if (!isEnclaveSessionActive(session)) {
        res.status(401).json({ error: 'Session expired' });
        return;
      }

      if (session.authMode !== EnclaveSessionAuthMode.EIP712) {
        res.status(403).json({ error: 'Typed data transaction authorization requires eip712 auth mode' });
        return;
      }

      const signatureVerificationResult = await verifyRequestSignature(
        body,
        parsedRequest,
        session.address,
        buildTypedData,
        buildSolanaMessage,
      );
      if (signatureVerificationResult.ok === false) {
        res.status(400).json({ error: signatureVerificationResult.error });
        return;
      }

      if (!signatureVerificationResult.value) {
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }

      if (!(await consumeRequestNonceOrRespond(req, res))) return;

      res.locals.address = session.address;
      next();
    } catch {
      res.status(401).json({ error: 'Signature verification failed' });
    }
  };
};

const createVerifyEnclaveTxMiddleware = <TPayload extends Record<string, unknown>>(
  parseBody: (body: Record<string, unknown>) => ParseResult<TPayload>,
  buildTypedData: (payload: TPayload) => EnclaveTypedDataPayload,
  buildSolanaMessage: (payload: TPayload) => string,
) =>
  createVerifyTypedDataSignatureMiddleware(
    (body) => {
      const parsed = parseBody(body);
      if (parsed.ok === false) return parsed;
      return { ok: true, value: buildTypedData(parsed.value) };
    },
    (body) => {
      const parsed = parseBody(body);
      if (parsed.ok === false) return parsed;
      return { ok: true, value: buildSolanaMessage(parsed.value) };
    },
  );

export const verifyDepositSignatureMiddleware = createVerifyEnclaveTxMiddleware(
  parseTokenDepositAuthBody,
  buildDepositTypedData,
  buildSolanaDepositMessage,
);

export const verifyProoflessDepositSignatureMiddleware = createVerifyEnclaveTxMiddleware(
  parseTokenDepositAuthBody,
  buildProoflessDepositTypedData,
  buildSolanaProoflessDepositMessage,
);

export const verifyDepositForOtherSignatureMiddleware = createVerifyEnclaveTxMiddleware(
  parseTokenDepositForOtherAuthBody,
  buildDepositForOtherTypedData,
  buildSolanaDepositForOtherMessage,
);

export const verifyWithdrawSignatureMiddleware = createVerifyEnclaveTxMiddleware(
  parseTokenWithdrawAuthBody,
  buildWithdrawTypedData,
  buildSolanaWithdrawMessage,
);

export const verifyTransferSignatureMiddleware = createVerifyEnclaveTxMiddleware(
  parseTokenTransferAuthBody,
  buildTransferTypedData,
  buildSolanaTransferMessage,
);

export const verifySwapSignatureMiddleware = createVerifyEnclaveTxMiddleware(
  parseTokenSwapAuthBody,
  buildSwapTypedData,
  buildSolanaSwapMessage,
);

export const verifyDepositAndWithdrawSignatureMiddleware = createVerifyEnclaveTxMiddleware(
  parseDepositAndWithdrawAuthBody,
  buildDepositAndWithdrawTypedData,
  buildSolanaPrivateSendMessage,
);

export const verifyWithdrawStuckUtxosSignatureMiddleware = createVerifyEnclaveTxMiddleware(
  parseWithdrawStuckUtxosAuthBody,
  buildWithdrawStuckUtxosTypedData,
  buildSolanaWithdrawStuckUtxosMessage,
);

export const verifyReceiveVaultRecoverSignatureMiddleware = createVerifyTypedDataSignatureMiddleware((body) => {
  const parsed = parseReceiveVaultRecoverAuthBody(body);
  if (parsed.ok === false) return parsed;
  return { ok: true, value: buildReceiveVaultRecoverTypedData(parsed.value) };
});
