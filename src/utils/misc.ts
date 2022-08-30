import { Interface } from '@ethersproject/abi';
import { formatEther, formatUnits } from '@ethersproject/units';
import { AddressZero } from '@ethersproject/constants';
import { forEach, multiply } from 'ramda';
import log from '../log';
import rpcCall from './rpc';
import { TransactionSchema } from '../objects/schemas';
import chainlist from '../chainlist.json';
import erc20Abi from '../assets/ERC20ABI.json';

export function sleepBeforeRpcCall(s: number, url: string, method: string, params: any): Promise<any> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      log('Now making RPC call after %d seconds', s);
      rpcCall(url, { method, params }).then(resolve).catch(reject);
    }, s * 1000);
  });
}

export async function mapRedisResponsesToIdealTxs(redisResponses: Array<TransactionSchema>) {
  try {
    let mappedResponses: Array<any> = [];
    for (const tx of redisResponses) {
      const derivedIdealTx: { [key: string]: any } = {};
      const chain = chainlist.find(c => c.id === parseInt(tx.chainId));
      const url = chain?.rpcUrl as string;
      const block = await sleepBeforeRpcCall(0.5, url, 'eth_getBlockByNumber', [tx.blockNumber, false]);
      const addressCode = await sleepBeforeRpcCall(0.5, url, 'eth_getCode', [tx.to, 'latest']);

      if (addressCode === '0x' || addressCode === '0x0') {
        // Not a contract
        derivedIdealTx.amount = parseFloat(formatEther(tx.value));
        derivedIdealTx.from = tx.from;
        derivedIdealTx.to = tx.to;
        derivedIdealTx.timeStamp = multiply(parseInt(block.timestamp), 1000);
        derivedIdealTx.chainIdHex = tx.chainId;
        derivedIdealTx.isERC20LikeSpec = false;
        derivedIdealTx.tokenName = chain?.name;
        derivedIdealTx.txId = tx.hash;
        derivedIdealTx.explorerUrl = chain?.txExplorerUrl.replace(':hash', tx.hash);
        derivedIdealTx.tokenAddress = AddressZero;
      } else {
        const abiInterface = new Interface(erc20Abi);
        const data = abiInterface.getSighash('decimals()');
        const callValue = await sleepBeforeRpcCall(0.5, url, 'eth_call', [{ to: tx.to, data }, 'latest']);

        if (callValue !== '0x0' && callValue !== '0x') {
          const logs = await sleepBeforeRpcCall(0.5, url, 'eth_getLogs', [
            { fromBlock: tx.blockNumber, toBlock: tx.blockNumber, address: tx.to }
          ]);

          for (const l of logs) {
            const { args, name } = abiInterface.parseLog(l);
            if (name === 'Transfer') {
              const tokenNameHash = abiInterface.getSighash('name()');

              let tokenName = await rpcCall(url, {
                method: 'eth_call',
                params: [{ to: tx.to, data: tokenNameHash }, 'latest']
              });
              [tokenName] = abiInterface.decodeFunctionResult('name()', tokenName);

              derivedIdealTx.amount = parseFloat(formatUnits(args[2], callValue));
              derivedIdealTx.from = tx.from;
              derivedIdealTx.to = tx.to;
              derivedIdealTx.timeStamp = multiply(parseInt(block.timestamp), 1000);
              derivedIdealTx.chainIdHex = tx.chainId;
              derivedIdealTx.isERC20LikeSpec = true;
              derivedIdealTx.tokenName = chain?.name;
              derivedIdealTx.txId = tx.hash;
              derivedIdealTx.explorerUrl = chain?.txExplorerUrl.replace(':hash', tx.hash);
              derivedIdealTx.tokenAddress = tx.to;
            }
          }
        }
      }

      mappedResponses = [...mappedResponses, derivedIdealTx];
    }

    return Promise.resolve(mappedResponses);
  } catch (err: any) {
    return Promise.reject(err);
  }
}
