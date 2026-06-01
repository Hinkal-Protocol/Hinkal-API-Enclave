import { Request, Response, Router } from 'express';

const router = Router();

router.get('/ping', async (_req: Request, res: Response) => {
  res.status(200).send({
    status: 'success',
    message: 'hinkal api is on',
  });
});

export default router;
