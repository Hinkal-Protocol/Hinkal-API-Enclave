import { type MerkleSiblingsProviderFn } from '@hinkal/common';
import { sendToUtxoServer, UtxoOpcode } from './utxoServerHelper';

type MerkleSiblingsResponse =
  | {
      inCommitmentSiblings: string[][][];
      inCommitmentSiblingSides: string[][][];
      rootHashHinkal: string;
      rootHashHinkalIndex: string;
      error?: undefined;
    }
  | { error: string };

export const getMerkleSiblingsFromUtxoServer: MerkleSiblingsProviderFn = async (
  chainId,
  inputCommitments,
  pendingLeaves,
) => {
  const request = Buffer.from(JSON.stringify({ inputCommitments, pendingLeaves }), 'utf-8');
  const responseBytes = await sendToUtxoServer(UtxoOpcode.GET_MERKLE_SIBLINGS, chainId, request);
  const response = JSON.parse(responseBytes.toString('utf-8')) as MerkleSiblingsResponse;
  if (response.error !== undefined) throw new Error(response.error);

  return {
    inCommitmentSiblings: response.inCommitmentSiblings,
    inCommitmentSiblingSides: response.inCommitmentSiblingSides,
    rootHashHinkal: BigInt(response.rootHashHinkal),
    rootHashHinkalIndex: BigInt(response.rootHashHinkalIndex),
  };
};
