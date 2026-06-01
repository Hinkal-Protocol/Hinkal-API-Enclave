import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { safeJsonStringify } from '@hinkal/common/functions/utils/serialize.utils';
import { NewZkCallDataType, ProofGeneratorFn } from '@hinkal/common';

const execFileAsync = promisify(execFile);
const CIRCUITS_DIR = '/app/circuits';

const locateCircuit = async (nameOrUrl: string): Promise<string> => {
  const filename = nameOrUrl.startsWith('http') ? nameOrUrl.split('/').at(-1)! : nameOrUrl;
  if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..'))
    throw new Error(`Invalid circuit filename: ${nameOrUrl}`);
  const fullPath = path.join(CIRCUITS_DIR, filename);
  const stat = await fs.lstat(fullPath);
  if (stat.isSymbolicLink()) throw new Error(`Symlinks not allowed: ${filename}`);
  return fullPath;
};

const toHex64 = (signal: string): string => `0x${BigInt(signal).toString(16).padStart(64, '0')}`;

const createCalldata = (
  proof: { pi_a: string[]; pi_b: string[][]; pi_c: string[] },
  publicSignals: string[],
): NewZkCallDataType => {
  const hexList = (items: string[]) => items.map(toHex64);
  const piA = hexList(proof.pi_a);
  const piB = proof.pi_b.map(hexList);
  const piC = hexList(proof.pi_c);
  return [
    [piA[0], piA[1]],
    [
      [piB[0][1], piB[0][0]],
      [piB[1][1], piB[1][0]],
    ],
    [piC[0], piC[1]],
    hexList(publicSignals),
  ];
};

export const generateProof: ProofGeneratorFn = async (input, circuitWasm, circuitZkey) => {
  const wasmPath = await locateCircuit(circuitWasm);
  const zkeyPath = await locateCircuit(circuitZkey);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'proof-'));
  try {
    const inputPath = path.join(tempDir, 'input.json');
    const wtnsPath = path.join(tempDir, 'witness.wtns');
    const proofPath = path.join(tempDir, 'proof.json');
    const pubPath = path.join(tempDir, 'public.json');

    await fs.writeFile(inputPath, safeJsonStringify(input));
    await execFileAsync('snarkjs', ['wc', wasmPath, inputPath, wtnsPath]);
    await execFileAsync('prover', [zkeyPath, wtnsPath, proofPath, pubPath]);

    const proof = JSON.parse(await fs.readFile(proofPath, 'utf-8'));
    const publicSignals: string[] = JSON.parse(await fs.readFile(pubPath, 'utf-8'));
    return { proof, publicSignals, zkCallData: createCalldata(proof, publicSignals) };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
};
