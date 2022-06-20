import { Interface } from '@ethersproject/abi';
import { getAddress } from '@ethersproject/address';
import { hexValue } from '@ethersproject/bytes';
import { formatEther, formatUnits } from '@ethersproject/units';
import { find, forEach, map, any as anyMatch, multiply } from 'ramda';
import rpcCall from '../utils/rpc';
import chainlist from '../chainlist.json';
import erc20Abi from '../assets/ERC20ABI.json';
import { TransactionSchema } from '../objects/schemas';
import * as db from '../db';
import log from '../log';

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
          const allWallets = await db.models.wallet.findWallets();
          const allWalletsJson = map(walletModel => walletModel.toJSON(), allWallets);
          const walletExists = anyMatch(
            wallet => getAddress(wallet.address) === getAddress(from) || getAddress(wallet.address) === getAddress(to),
            allWalletsJson
          );

          if (walletExists) {
            const matchingWallet = find(
              wallet =>
                getAddress(wallet.address) === getAddress(from) || getAddress(wallet.address) === getAddress(to),
              allWalletsJson
            );
            const valueInEther = parseFloat(formatEther(value));
            const tx = await db.models.transaction.addTransaction({
              from,
              to,
              amount: valueInEther,
              timeStamp: multiply(parseInt(blockResult.timestamp), 1000),
              chainIdHex: hexValue(chainId),
              isERC20LikeSpec: false,
              tokenName: chain.name,
              txId: hash,
              explorerUrl: chain.txExplorerUrl.replace(':hash', hash),
              walletId: matchingWallet.id
            });

            log('New transaction stored: %s', JSON.stringify(tx, undefined, 2));
          }
        } else {
          const logs = await rpcCall(chain.rpcUrl, {
            method: 'eth_getLogs',
            params: [{ fromBlock: blockNumberAsHex, toBlock: blockNumberAsHex, address: to }]
          });

          for (const l of logs) {
            const { args, name } = abiInterface.parseLog(l);

            if (name === 'Transfer') {
              const sender = args[0];
              const recipient = args[1];
              const amount = formatUnits(args[2], callValue);

              const allWallets = await db.models.wallet.findWallets();
              const allWalletsJson = map(walletModel => walletModel.toJSON(), allWallets);
              const walletExists = anyMatch(
                wallet =>
                  getAddress(wallet.address) === getAddress(sender) ||
                  getAddress(wallet.address) === getAddress(recipient),
                allWalletsJson
              );

              if (walletExists) {
                const matchingWallet = find(
                  wallet =>
                    getAddress(wallet.address) === getAddress(sender) ||
                    getAddress(wallet.address) === getAddress(recipient),
                  allWalletsJson
                );
                const valueInTokenUnits = parseFloat(amount);

                const tokenNameHash = abiInterface.getSighash('name()');
                const tokenName = await rpcCall(chain.rpcUrl, {
                  method: 'eth_call',
                  params: [{ to, data: tokenNameHash }]
                });

                const tx = await db.models.transaction.addTransaction({
                  from: sender,
                  to: recipient,
                  amount: valueInTokenUnits,
                  timeStamp: multiply(parseInt(blockResult.timestamp), 1000),
                  chainIdHex: hexValue(chainId),
                  isERC20LikeSpec: true,
                  tokenName,
                  txId: hash,
                  explorerUrl: chain.txExplorerUrl.replace(':hash', hash),
                  walletId: matchingWallet.id
                });

                log('New transaction stored: %s', JSON.stringify(tx, undefined, 2));
              }
            }
          }
        }
      })();
    }, blockResult.transactions);
  };
}
