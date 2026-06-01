import { isLocalCryptoMode } from '../constants';
import type { ICryptoHelper } from '../types';
import { KmsCryptoHelper } from './KmsCryptoHelper';
import { LocalCryptoHelper } from './LocalCryptoHelper';

export const cryptoHelper: ICryptoHelper = isLocalCryptoMode ? new LocalCryptoHelper() : new KmsCryptoHelper();
