import { Response } from 'express';
import { getErrorMessage, HttpError } from '@hinkal/common';
import axios from 'axios';

export const sendError = (res: Response, err: unknown): void => {
  try {
    console.log('Error in route handler:', err);
    if (err instanceof HttpError) {
      res.status(err.status).send({ status: 'error', message: err.message });
      return;
    }

    if (axios.isAxiosError(err)) {
      const status = err.response?.status ?? 500;

      const message = err.response?.data?.detail || err.response?.data?.message || err.message;

      res.status(status).send({
        status: 'error',
        message,
      });
      return;
    }

    res.status(500).send({ status: 'error', message: getErrorMessage(err) });
  } catch {
    res.status(500).send({ status: 'error', message: 'Internal server error' });
  }
};
