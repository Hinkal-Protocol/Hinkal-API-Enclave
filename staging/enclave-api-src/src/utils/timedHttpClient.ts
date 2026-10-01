import { BasicHttpClient, DATA_SERVER_URL, HttpClient, SERVER_URL } from '@hinkal/common';
import { ENCLAVE_URL } from '@hinkal/common/functions/snarkjs/constant';
import { timed } from './timing';

const basicHttpClient = new BasicHttpClient();

const KNOWN_BASES: [string, string][] = [
  [ENCLAVE_URL, 'henclave'],
  [DATA_SERVER_URL, 'data-server'],
  [SERVER_URL, 'server'],
];

const describeUrl = (url: string) => {
  const known = KNOWN_BASES.find(([base]) => url.startsWith(base));
  if (known) return `${known[1]}:/${url.slice(known[0].length).split(/[/?]/)[1] ?? ''}`;
  const [, host = 'unknown', firstSegment = '/'] = url.match(/^https?:\/\/([^/?]+)(\/[^/?]*)?/) ?? [];
  return `${host}:${firstSegment}`;
};

export const timedHttpClient: HttpClient = {
  get: (url, config) => timed(`http:GET:${describeUrl(url)}`, () => basicHttpClient.get(url, config)),
  post: (url, data, config) => timed(`http:POST:${describeUrl(url)}`, () => basicHttpClient.post(url, data, config)),
  put: (url, data, config) => timed(`http:PUT:${describeUrl(url)}`, () => basicHttpClient.put(url, data, config)),
  patch: (url, data, config) => timed(`http:PATCH:${describeUrl(url)}`, () => basicHttpClient.patch(url, data, config)),
  delete: (url, config) => timed(`http:DELETE:${describeUrl(url)}`, () => basicHttpClient.delete(url, config)),
};
