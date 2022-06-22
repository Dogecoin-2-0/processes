import { Interface } from '@ethersproject/abi';
import { getAddress } from '@ethersproject/address';
import { hexValue } from '@ethersproject/bytes';
import { formatEther, formatUnits } from '@ethersproject/units';
import { find, forEach, map, any as anyMatch, multiply } from 'ramda';
import redis from '../helpers/redis';
import rpcCall from '../utils/rpc';
import chainlist from '../chainlist.json';
import erc20Abi from '../assets/ERC20ABI.json';
import { TransactionSchema } from '../objects/schemas';
import * as db from '../db';
import log from '../log';
import { redisLastProcessedBlockKey } from '../constants';
import { IOS_BUNDLE_ID } from '../env';
import push from '../objects/push';

export function propagateBlockData(blockNumber: number, chainId: number) {
  return async () => {
    try {
      const chain = find(c => c.id === chainId, chainlist);

      if (!chain) throw new Error('invalid chain');

      const blockNumberAsHex = hexValue(blockNumber);

      log('Now reading block %s on chain %s', blockNumberAsHex, hexValue(chainId));

      const blockResult: { transactions: Array<TransactionSchema>; timestamp: string } = await rpcCall(chain.rpcUrl, {
        method: 'eth_getBlockByNumber',
        params: [blockNumberAsHex, true]
      });

      forEach(transaction => {
        const { from, to, value, hash } = transaction;

        log('Now reading transaction: ', hash);

        (async () => {
          const abiInterface = new Interface(erc20Abi);
          const data = abiInterface.getSighash('decimals()');
          try {
            const callValue = await rpcCall(chain.rpcUrl, {
              method: 'eth_call',
              params: [{ to, data }, 'latest']
            });

            if (callValue === '0x' || callValue === '0x0') {
              const allWallets = await db.models.wallet.findWallets();
              const allWalletsJson = map(walletModel => walletModel.toJSON(), allWallets);
              const walletExists = anyMatch(
                wallet =>
                  getAddress(wallet.address) === getAddress(from) || getAddress(wallet.address) === getAddress(to),
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
                // Log stored transaction information
                log('New transaction stored: %s', JSON.stringify(tx, undefined, 2));

                if (getAddress(to) === getAddress(matchingWallet.address)) {
                  // Find push subscription
                  const allSubscriptions = await db.models.subscription.getSubscriptions();
                  const allSubscriptionsJson = map(sub => sub.toJSON(), allSubscriptions);
                  const exactSub = allSubscriptionsJson.find(sub => sub.walletId === matchingWallet.id);

                  if (typeof exactSub !== 'undefined') {
                    const pushResult = await push.send(exactSub.deviceId, {
                      title: 'New Deposit',
                      body: `${valueInEther} ${chain.symbol} deposited in your wallet.`,
                      topic: IOS_BUNDLE_ID
                    });
                    log('Push notification sent with result: %s', JSON.stringify(pushResult, undefined, 2));
                  }
                }
              }
            } else {
              log('Now calling eth_getLogs');

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
                      params: [{ to, data: tokenNameHash }, 'latest']
                    });

                    const symbolHash = abiInterface.getSighash('symbol()');
                    let symbol = await rpcCall(chain.rpcUrl, {
                      method: 'eth_call',
                      params: [{ to, data: symbolHash }, 'latest']
                    });

                    symbol = symbol.startsWith('0x') ? Buffer.from(symbol, 'hex').toString() : symbol;

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

                    if (getAddress(recipient) === getAddress(matchingWallet.address)) {
                      // Find push subscription
                      const allSubscriptions = await db.models.subscription.getSubscriptions();
                      const allSubscriptionsJson = map(sub => sub.toJSON(), allSubscriptions);
                      const exactSub = allSubscriptionsJson.find(sub => sub.walletId === matchingWallet.id);

                      if (typeof exactSub !== 'undefined') {
                        const pushResult = await push.send(exactSub.deviceId, {
                          title: 'New Deposit',
                          body: `${valueInTokenUnits} ${symbol} deposited in your wallet.`,
                          topic: IOS_BUNDLE_ID
                        });
                        log('Push notification sent with result: %s', JSON.stringify(pushResult, undefined, 2));
                      }
                    }
                  }
                }
              }
            }
          } catch (err: any) {
            log(err.message);
          }
        })();
      }, blockResult.transactions);

      const val = await redis.simpleSet(
        redisLastProcessedBlockKey.replace(':chainIdHex:', hexValue(chainId)),
        blockNumber
      );

      log('Block data processed successfully. Redis response: ', val);
    } catch (err: any) {
      log(err.message);
    }
  };
}

export function syncFromLastProcessedBlock(chainId: number) {
  (async () => {
    try {
      log('Preparing to sync from last processed block');
      const exists = await redis.exists(redisLastProcessedBlockKey.replace(':chainIdHex:', hexValue(chainId)));

      if (exists) {
        let lastProcessedBlock: any = await redis.simpleGet(
          redisLastProcessedBlockKey.replace(':chainIdHex:', hexValue(chainId))
        );
        lastProcessedBlock = parseInt(lastProcessedBlock);
        log('Last processed block: %s', hexValue(lastProcessedBlock));

        const chain = find(c => c.id === chainId, chainlist);

        if (!chain) throw new Error('invalid chain');

        let currentBlock = await rpcCall(chain.rpcUrl, {
          method: 'eth_blockNumber',
          params: []
        });
        currentBlock = parseInt(currentBlock);

        for (let i = lastProcessedBlock; i <= currentBlock; i++) {
          log('Now syncing block: %d', hexValue(i));
          setTimeout(() => {}, 1000);
          propagateBlockData(i, chainId)();
        }
      }
    } catch (err: any) {
      log(err.message);
    }
  })();
}
