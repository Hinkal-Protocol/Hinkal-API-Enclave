import { Response } from 'express';
import { getErrorMessage, HttpError, transactionErrorCodes } from '@hinkal/common';
import axios from 'axios';

const detailedMessage = (err: unknown): string => {
  const mapped = getErrorMessage(err);
  return mapped === transactionErrorCodes.UNKNOWN && err instanceof Error && err.message ? err.message : mapped;
};

export const resolveRouteError = (err: unknown): { status: number; message: string } => {
  if (err instanceof HttpError) {
    return { status: err.status, message: err.message };
  }

  if (axios.isAxiosError(err)) {
    const upstreamStatus = err.response?.status;
    const status =
      upstreamStatus && upstreamStatus >= 400 && upstreamStatus < 500 && ![401, 403, 404].includes(upstreamStatus)
        ? upstreamStatus
        : 502;

    const message =
      err.response?.data?.detail || err.response?.data?.message || err.response?.data?.error?.message || err.message;

    return { status, message };
  }

  return { status: 500, message: detailedMessage(err) };
};

export const sendError = (res: Response, err: unknown): void => {
  try {
    const { status, message } = resolveRouteError(err);
    res.status(status).send({ status: 'error', message });
  } catch {
    res.status(500).send({ status: 'error', message: 'Internal server error' });
  }
};
