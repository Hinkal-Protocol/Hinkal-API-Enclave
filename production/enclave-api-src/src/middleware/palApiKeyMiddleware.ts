import { NextFunction, Request, Response } from 'express';
import { PalApiKeyModel } from '../models/PalApiKeySchema';

export const palApiKeyMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || typeof apiKey !== 'string') {
      res.status(401).send({ status: 'error', message: 'Missing required header: X-Api-Key' });
      return;
    }

    const found = await PalApiKeyModel.exists({ apiKey });
    if (!found) {
      res.status(401).send({ status: 'error', message: 'Invalid API key' });
      return;
    }

    next();
  } catch {
    res.status(500).send({ status: 'error', message: 'Error validating API key' });
  }
};
