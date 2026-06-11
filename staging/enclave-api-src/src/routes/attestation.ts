import { Request, Response, Router } from 'express';
import { attestationService } from '../services/AttestationService';

const router = Router();

router.get('/attestation', async (req: Request, res: Response) => {
  const { nonce } = req.query as { nonce?: string };

  if (!nonce) {
    res.status(400).json({ error: 'Missing required query param: nonce' });
    return;
  }

  try {
    const { jwt, imageDigest } = await attestationService.fetchAttestation(nonce);
    res.status(200).json({ jwt, imageDigest });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch attestation token' });
  }
});

export default router;
