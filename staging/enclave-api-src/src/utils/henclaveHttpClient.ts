import { BasicHttpClient, HttpClient, Logger } from '@hinkal/common';
import { ENCLAVE_URL } from '@hinkal/common/functions/snarkjs/constant';
import { HENCLAVE_INTERNAL_URL, USE_HENCLAVE_INTERNAL_URL } from '../constants';

const basicHttpClient = new BasicHttpClient();
const henclaveRouteLabel = USE_HENCLAVE_INTERNAL_URL ? 'internal' : 'public';

const timeHenclaveCall = async <T>(method: string, url: string, send: (target: string) => Promise<T>): Promise<T> => {
  if (!url.startsWith(ENCLAVE_URL)) return send(url);
  const path = url.slice(ENCLAVE_URL.length);
  const start = performance.now();
  let outcome = 'ok';
  try {
    return await send(USE_HENCLAVE_INTERNAL_URL ? `${HENCLAVE_INTERNAL_URL}${path}` : url);
  } catch (err) {
    outcome = 'failed';
    throw err;
  } finally {
    Logger.log(
      `[henclave-timing] ${henclaveRouteLabel} ${method} /${path.split(/[/?]/)[1]} ${outcome} ${Math.round(performance.now() - start)}ms`,
    );
  }
};

export const henclaveHttpClient: HttpClient = {
  get: (url, config) => timeHenclaveCall('GET', url, (target) => basicHttpClient.get(target, config)),
  post: (url, data, config) => timeHenclaveCall('POST', url, (target) => basicHttpClient.post(target, data, config)),
  put: (url, data, config) => timeHenclaveCall('PUT', url, (target) => basicHttpClient.put(target, data, config)),
  patch: (url, data, config) => timeHenclaveCall('PATCH', url, (target) => basicHttpClient.patch(target, data, config)),
  delete: (url, config) => timeHenclaveCall('DELETE', url, (target) => basicHttpClient.delete(target, config)),
};
