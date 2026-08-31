import { type IUtxoConstructor, UserKeys } from '@hinkal/common';
import { ethers } from 'ethers';
import { sendToUtxoServer, UtxoOpcode } from './utxoServerHelper';

export const getUtxosFromUtxoServer = async (
  chainId: number,
  shieldedPrivateKey: string,
): Promise<IUtxoConstructor<string>[]> => {
  const { publicKey } = UserKeys.getEncryptionKeyPair(shieldedPrivateKey);
  const ownerKey = Buffer.from(ethers.getBytes(publicKey));
  const nullifyingKey = Buffer.from(ethers.getBytes(ethers.solidityPacked(['uint256'], [shieldedPrivateKey])));

  const responseBytes = await sendToUtxoServer(UtxoOpcode.GET_BALANCE, chainId, ownerKey, nullifyingKey);
  const parsed = JSON.parse(responseBytes.toString('utf-8')) as {
    preConfirmedUtxos?: IUtxoConstructor<string>[];
  };
  return parsed.preConfirmedUtxos ?? [];
};
