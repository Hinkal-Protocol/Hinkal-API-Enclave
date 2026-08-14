import { Response } from 'express';
import { getErrorMessage, HttpError, transactionErrorCodes } from '@hinkal/common';
import axios from 'axios';

const detailedMessage = (err: unknown): string => {
  const mapped = getErrorMessage(err);
  return mapped === transactionErrorCodes.UNKNOWN && err instanceof Error && err.message ? err.message : mapped;
};

export const sendError = (res: Response, err: unknown): void => {
  try {
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

    res.status(500).send({ status: 'error', message: detailedMessage(err) });
  } catch {
    res.status(500).send({ status: 'error', message: 'Internal server error' });
  }
};
