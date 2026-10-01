import { AsyncLocalStorage } from 'async_hooks';
import { randomBytes } from 'crypto';
import { Logger } from '@hinkal/common';

const flowStorage = new AsyncLocalStorage<string>();

export const currentFlow = () => flowStorage.getStore() ?? 'none';

export const runInFlow = <T>(prefix: string, fn: () => T): T =>
  flowStorage.run(`${prefix}-${randomBytes(4).toString('hex')}`, fn);

export const logTiming = (step: string, outcome: string, ms: number, flow = currentFlow()) =>
  Logger.log(`[timing] flow=${flow} step=${step} outcome=${outcome} ms=${Math.round(ms)}`);

export const timed = async <T>(step: string, fn: () => Promise<T>): Promise<T> => {
  const start = performance.now();
  let outcome = 'ok';
  try {
    return await fn();
  } catch (err) {
    outcome = 'failed';
    throw err;
  } finally {
    logTiming(step, outcome, performance.now() - start);
  }
};

export const withTiming =
  <A extends unknown[], R>(step: string, fn: (...args: A) => Promise<R>) =>
  (...args: A): Promise<R> =>
    timed(step, () => fn(...args));
