import { nAry } from 'ramda';
import { JsonRpcProvider, Networkish } from '@ethersproject/providers';

const composeProvider = (url: string, networkish?: Networkish) => new JsonRpcProvider(url, networkish);

export const buildProvider = nAry(2, composeProvider);
