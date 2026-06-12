export type ParsedSignatureRequest = {
  signature: string;
  address: string;
  chainId: number;
  nonce: string;
  writeAccess: boolean;
};

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };
