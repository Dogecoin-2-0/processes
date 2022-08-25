import { Interface } from '@ethersproject/abi';
import { getAddress } from '@ethersproject/address';
import { hexValue } from '@ethersproject/bytes';
import { formatEther, formatUnits } from '@ethersproject/units';
import { AddressZero } from '@ethersproject/constants';
import { find, forEach, map, any as anyMatch, multiply } from 'ramda';
import redis from '../helpers/redis';
import rpcCall from '../utils/rpc';
import chainlist from '../chainlist.json';
import erc20Abi from '../assets/ERC20ABI.json';
import timelockAbi from '../assets/TimelockABI.json';
import { TransactionSchema } from '../objects/schemas';
import * as db from '../db';
import log from '../log';
import { redisLastProcessedBlockKey } from '../constants';
import { IOS_BUNDLE_ID } from '../env';
import push from '../objects/push';

const timelockAbiInterface = new Interface(timelockAbi);

function sleep(s: number) {
  return new Promise(resolve => setTimeout(resolve, s * 1000));
}

export function propagateBlockData(blockNumber: number, chainId: number) {
  return async () => {
    try {
      const chain = find(c => c.id === chainId, chainlist);

      if (!chain) throw new Error('invalid chain');

      const blockNumberAsHex = hexValue(blockNumber);

      log('Now reading block %s on chain %s', blockNumberAsHex, hexValue(chainId));

      await sleep(120);
      const blockResult: { transactions: Array<TransactionSchema>; timestamp: string } = await rpcCall(chain.rpcUrl, {
        method: 'eth_getBlockByNumber',
        params: [blockNumberAsHex, true]
      });

      forEach(async transaction => {
        const { from, to, value, hash } = transaction;

        log('Now reading transaction: ', hash);

        const allWallets = await db.models.wallet.findWallets();
        const allWalletsJson = map(walletModel => walletModel.toJSON(), allWallets);
        const walletExists = anyMatch(
          wallet => getAddress(wallet.address) === getAddress(from) || getAddress(wallet.address) === getAddress(to),
          allWalletsJson
        );

        (async () => {
          const abiInterface = new Interface(erc20Abi);
          const data = abiInterface.getSighash('decimals()');
          try {
            if (walletExists) {
              const matchingWallet = find(
                wallet =>
                  getAddress(wallet.address) === getAddress(from) || getAddress(wallet.address) === getAddress(to),
                allWalletsJson
              );
              await sleep(120);
              const callValue = await rpcCall(chain.rpcUrl, {
                method: 'eth_call',
                params: [{ to, data }, 'latest']
              });

              if (callValue === '0x' || callValue === '0x0') {
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
                  walletId: matchingWallet.id,
                  tokenAddress: AddressZero
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
              } else {
                log('Now calling eth_getLogs');

                await sleep(120);
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
                    const walletFound = anyMatch(
                      wallet =>
                        getAddress(wallet.address) === getAddress(sender) ||
                        getAddress(wallet.address) === getAddress(recipient),
                      allWalletsJson
                    );

                    if (walletFound) {
                      const matchingWallet = find(
                        wallet =>
                          getAddress(wallet.address) === getAddress(sender) ||
                          getAddress(wallet.address) === getAddress(recipient),
                        allWalletsJson
                      );
                      const valueInTokenUnits = parseFloat(amount);

                      const tokenNameHash = abiInterface.getSighash('name()');

                      await sleep(120);
                      let tokenName = await rpcCall(chain.rpcUrl, {
                        method: 'eth_call',
                        params: [{ to, data: tokenNameHash }, 'latest']
                      });
                      [tokenName] = abiInterface.decodeFunctionResult('name()', tokenName);

                      const symbolHash = abiInterface.getSighash('symbol()');

                      await sleep(120);
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
                        walletId: matchingWallet.id,
                        tokenAddress: to
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

        await sleep(120);
        let currentBlock = await rpcCall(chain.rpcUrl, {
          method: 'eth_blockNumber',
          params: []
        });
        currentBlock = parseInt(currentBlock);

        for (let i = lastProcessedBlock; i <= currentBlock; i++) {
          log('Now syncing block: %d', hexValue(i));
          await sleep(120);
          propagateBlockData(i, chainId)();
        }
      }
    } catch (err: any) {
      log(err.message);
    }
  })();
}

export function propagateLockedTxCreated(chainId: number) {
  return async function (logs: any) {
    try {
      const chain = find(c => c.id === chainId, chainlist);

      if (!chain) throw new Error('invalid chain');
      let {
        args: [id, amount, from, to, token, lockTime, fee]
      } = timelockAbiInterface.parseLog(logs);

      if (token === AddressZero) {
        amount = parseFloat(formatEther(amount));
        fee = parseFloat(formatEther(fee));
      } else {
        const abiInterface = new Interface(erc20Abi);
        const data = abiInterface.getSighash('decimals()');
        const callValue = await rpcCall(chain.rpcUrl, {
          method: 'eth_call',
          params: [{ to: token, data }, 'latest']
        });
        amount = parseFloat(formatUnits(amount, callValue));
        fee = parseFloat(formatUnits(fee, callValue));
      }

      lockTime = multiply(lockTime, 1000);

      const wallets = await db.models.wallet.findWallets();
      const walletsJson = map(wallet => wallet.toJSON(), wallets);
      const walletExists = anyMatch(wallet => getAddress(wallet.address) === getAddress(from), walletsJson);

      if (walletExists) {
        const { id: walletId } = find(wallet => getAddress(wallet.address) === getAddress(from), walletsJson);
        const tx = await db.models.lockedTransaction.addTransaction({
          from,
          to,
          lockTime,
          token,
          amount,
          chainId: hexValue(chainId),
          fee,
          id,
          walletId
        });
        log('Now adding locked tx %s', JSON.stringify(tx.toJSON(), undefined, 2));
      }
    } catch (err: any) {
      log(err.message);
    }
  };
}

export function propagateTimelockProcessedEvent(chainId: number) {
  return async function (logs: any) {
    try {
      const chain = find(c => c.id === chainId, chainlist);

      if (!chain) throw new Error('invalid chain');
      let {
        args: [id]
      } = timelockAbiInterface.parseLog(logs);

      await db.models.lockedTransaction.deleteTransaction(id);
    } catch (err: any) {
      log(err.message);
    }
  };
}

export function propagateTimelockCancelledEvent(chainId: number) {
  return async function (logs: any) {
    try {
      const chain = find(c => c.id === chainId, chainlist);

      if (!chain) throw new Error('invalid chain');
      let {
        args: [id]
      } = timelockAbiInterface.parseLog(logs);

      await db.models.lockedTransaction.deleteTransaction(id);
    } catch (err: any) {
      log(err.message);
    }
  };
}
