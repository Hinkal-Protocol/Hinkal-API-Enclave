import { Response } from 'express';
import { getErrorMessage, HttpError, Logger } from '@hinkal/common';
import axios from 'axios';

export const resolveRouteError = (err: unknown): { status: number; message: string } => {
  // HttpError only picks the status; the message is mapped like any other error.
  if (err instanceof HttpError) {
    return { status: err.status, message: getErrorMessage(err) };
  }

  if (axios.isAxiosError(err)) {
    const upstreamStatus = err.response?.status;
    const status =
      upstreamStatus && upstreamStatus >= 400 && upstreamStatus < 500 && ![401, 403, 404].includes(upstreamStatus)
        ? upstreamStatus
        : 502;

    return { status, message: getErrorMessage(err) };
  }

  return { status: 500, message: getErrorMessage(err) };
};

export const sendError = (res: Response, err: unknown): void => {
  try {
    const { status, message } = resolveRouteError(err);
    Logger.error(`[${res.req.method} ${res.req.path}] ${status}:`, err);
    res.status(status).send({ status: 'error', message });
  } catch {
    res.status(500).send({ status: 'error', message: 'Internal server error' });
  }
};
