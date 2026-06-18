export type ParsedCreateSessionRequest = {
  signature: string;
  address: string;
  sessionId: string;
  clientPublicKey: string;
  useEIP712: boolean;
  timestamp?: number;
};

export type ParsedSignatureRequest = {
  signature: string;
  nonce: string;
  sessionId: string;
  chainId?: number;
  timestamp?: number;
};

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };
