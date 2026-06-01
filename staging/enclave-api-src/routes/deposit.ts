import { Request, Response, Router } from 'express';
import { getERC20Token, getErrorMessage, toJsonSafe } from '@hinkal/common';
import { hinkalInitializerService } from '../services/hinkalInitializerService';
import {
  DepositForOtherRequest,
  DepositRequest,
  DepositResponse,
  ProoflessDepositRequest,
  ProoflessDepositResponse,
  SolanaDepositForOtherRequest,
  SolanaDepositResponse,
} from '../types/route.types';
import { validateTokens } from '../utils';
import {
  verifyDepositForOtherSignatureMiddleware,
  verifyDepositSignatureMiddleware,
  verifyProoflessDepositSignatureMiddleware,
  verifySignatureMiddleware,
} from '../middleware';

const router = Router();

router.post(
  '/deposit',
  verifyDepositSignatureMiddleware,
  async (req: Request<object, DepositResponse, DepositRequest>, res: Response<DepositResponse>) => {
    try {
      const { address, chainId, tokenAddresses, amounts } = req.body;

      if (tokenAddresses.length !== amounts.length) {
        res.status(400).json({ success: false, error: 'tokenAddresses and amounts must have the same length' });
        return;
      }

      const validated = validateTokens(tokenAddresses, chainId);
      if (validated.ok === false) {
        res.status(400).json({ success: false, error: validated.error });
        return;
      }

      const hinkal = await hinkalInitializerService.initalizeHinkalForAddress(address, chainId);

      const txData = await hinkal.deposit(validated.tokens, amounts.map(BigInt), false, true);

      res.status(200).json(toJsonSafe({ success: true, txData }) as DepositResponse);
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  },
);

router.post(
  '/deposit-for-other',
  verifyDepositForOtherSignatureMiddleware,
  async (req: Request<object, DepositResponse, DepositForOtherRequest>, res: Response<DepositResponse>) => {
    try {
      const { address, chainId, tokenAddresses, amounts, recipientInfo } = req.body;

      if (tokenAddresses.length !== amounts.length) {
        res.status(400).json({ success: false, error: 'tokenAddresses and amounts must have the same length' });
        return;
      }

      const validated = validateTokens(tokenAddresses, chainId);
      if (validated.ok === false) {
        res.status(400).json({ success: false, error: validated.error });
        return;
      }

      const hinkal = await hinkalInitializerService.initalizeHinkalForAddress(address, chainId);

      const txData = await hinkal.depositForOther(validated.tokens, amounts.map(BigInt), recipientInfo, false, true);

      res.status(200).json(toJsonSafe({ success: true, txData }) as DepositResponse);
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  },
);

router.post(
  '/deposit-solana-for-other',
  verifySignatureMiddleware,
  async (
    req: Request<object, SolanaDepositResponse, SolanaDepositForOtherRequest>,
    res: Response<SolanaDepositResponse>,
  ) => {
    try {
      const { address, chainId, tokenAddress, amount, recipientInfo } = req.body;

      const token = getERC20Token(tokenAddress, chainId);
      if (!token) {
        res.status(400).json({ success: false, error: `Token ${tokenAddress} not found on chain ${chainId}` });
        return;
      }

      const hinkal = await hinkalInitializerService.initalizeHinkalForAddress(address, chainId);

      const txData = await hinkal.depositSolanaForOther(BigInt(amount), token, recipientInfo, true);

      res.status(200).json({ success: true, txData });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  },
);

router.post(
  '/proofless-deposit',
  verifyProoflessDepositSignatureMiddleware,
  async (
    req: Request<object, ProoflessDepositResponse, ProoflessDepositRequest>,
    res: Response<ProoflessDepositResponse>,
  ) => {
    try {
      const { address, chainId, tokenAddresses, amounts } = req.body;

      if (tokenAddresses.length !== amounts.length) {
        res.status(400).json({ success: false, error: 'tokenAddresses and amounts must have the same length' });
        return;
      }

      const validated = validateTokens(tokenAddresses, chainId);
      if (validated.ok === false) {
        res.status(400).json({ success: false, error: validated.error });
        return;
      }

      const hinkal = await hinkalInitializerService.initalizeHinkalForAddress(address, chainId);

      const result = await hinkal.prooflessDeposit(validated.tokens, amounts.map(BigInt), undefined, undefined, true);

      res.status(200).json(toJsonSafe({ success: true, txData: result }) as ProoflessDepositResponse);
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  },
);

export default router;
