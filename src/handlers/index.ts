import { hexValue } from '@ethersproject/bytes';
import { find, forEach } from 'ramda';
import rpcCall from '../utils/rpc';
import chainlist from '../chainlist.json';
import { TransactionSchema } from '../objects/schemas';

export function watchBlockChanges(blockNumber: number, chainId: number) {
  return async () => {
    const chain = find(c => c.id === chainId, chainlist);

    if (!chain) throw new Error('invalid chain');

    const blockNumberAsHex = hexValue(blockNumber);
    const blockResult: { transactions: Array<TransactionSchema>; timestamp: string } = await rpcCall(chain.rpcUrl, {
      jsonrpc: '2.0',
      method: 'eth_getBlockByNumber',
      params: [blockNumberAsHex, true]
    });

    forEach(transaction => {
      const { from, to, value, hash, input } = transaction;
    }, blockResult.transactions);
  };
}
