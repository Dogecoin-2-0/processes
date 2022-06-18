import { Interface } from '@ethersproject/abi';
import { hexValue } from '@ethersproject/bytes';
import { formatEther, formatUnits } from '@ethersproject/units';
import { find, forEach } from 'ramda';
import rpcCall from '../utils/rpc';
import chainlist from '../chainlist.json';
import erc20Abi from '../assets/ERC20ABI.json';
import { TransactionSchema } from '../objects/schemas';

export function watchBlockChanges(blockNumber: number, chainId: number) {
  return async () => {
    const chain = find(c => c.id === chainId, chainlist);

    if (!chain) throw new Error('invalid chain');

    const blockNumberAsHex = hexValue(blockNumber);
    const blockResult: { transactions: Array<TransactionSchema>; timestamp: string } = await rpcCall(chain.rpcUrl, {
      method: 'eth_getBlockByNumber',
      params: [blockNumberAsHex, true]
    });

    forEach(transaction => {
      const { from, to, value, hash, input } = transaction;
      (async () => {
        const abiInterface = new Interface(erc20Abi);
        const data = abiInterface.getSighash('decimals()');
        const callValue = await rpcCall(chain.rpcUrl, {
          method: 'eth_call',
          params: [{ to, data }]
        });

        if (callValue === '0x' || callValue === '0x0') {
        } else {
          const logs = await rpcCall(chain.rpcUrl, {
            method: 'eth_getLogs',
            params: [{ fromBlock: blockNumberAsHex, toBlock: blockNumberAsHex, address: to }]
          });

          for (const log of logs) {
            const { args, name } = abiInterface.parseLog(log);

            if (name === 'Transfer') {
              const sender = args[0];
              const recipient = args[1];
              const amount = formatUnits(args[2], callValue);
            }
          }
        }
      })();
    }, blockResult.transactions);
  };
}
