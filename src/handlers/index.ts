import { Interface } from '@ethersproject/abi';
import { getAddress } from '@ethersproject/address';
import { hexValue } from '@ethersproject/bytes';
import { formatEther, formatUnits } from '@ethersproject/units';
import { AddressZero } from '@ethersproject/constants';
import { find, forEach, map, any as anyMatch, multiply, toLower } from 'ramda';
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
import { sleepBeforeRpcCall } from '../utils/misc';

const timelockAbiInterface = new Interface(timelockAbi);

export function propagateBlockData(blockNumber: number, chainId: number) {
  return async () => {
    try {
      const chain = find(c => c.id === chainId, chainlist);

      if (!chain) throw new Error('invalid chain');

      const blockNumberAsHex = hexValue(blockNumber);

      log('Now reading block %s on chain %s', blockNumberAsHex, hexValue(chainId));

      const blockResult: { transactions: Array<TransactionSchema>; timestamp: string } = await sleepBeforeRpcCall(
        120,
        chain.rpcUrl,
        'eth_getBlockByNumber',
        [blockNumberAsHex, true]
      );

      forEach(transaction => {
        const { from, to, hash } = transaction;
        log('Now reading transaction: ', hash);
        (async () => {
          try {
            const redisResponse1 = await redis.setObjectVal(
              toLower(from),
              hash,
              { ...transaction, chainId: hexValue(chainId) },
              60 * 60 * 24 * 30
            );
            const redisResponse2 = await redis.setObjectVal(
              toLower(to),
              hash,
              { ...transaction, chainId: hexValue(chainId) },
              60 * 60 * 24 * 30
            );
            log('Redis response: ', redisResponse1);
            log('Redis response: ', redisResponse2);

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

              if (getAddress(to) === getAddress(matchingWallet.address)) {
                // Find push subscription
                const allSubscriptions = await db.models.subscription.getSubscriptions();
                const allSubscriptionsJson = map(sub => sub.toJSON(), allSubscriptions);
                const exactSub = allSubscriptionsJson.find(sub => sub.walletId === matchingWallet.id);

                if (typeof exactSub !== 'undefined') {
                  const pushResult = await push.send(exactSub.deviceId, {
                    title: 'New Transaction',
                    body: `Asset has been deposited in your wallet`,
                    topic: IOS_BUNDLE_ID
                  });
                  log('Push notification sent with result: %s', JSON.stringify(pushResult, undefined, 2));
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

        let currentBlock = await sleepBeforeRpcCall(30, chain.rpcUrl, 'eth_blockNumber', []);
        currentBlock = parseInt(currentBlock);

        for (let i = lastProcessedBlock; i <= currentBlock; i++) {
          log('Now syncing block: %d', hexValue(i));
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
        const callValue = await rpcCall(chain.alternateRpcUrl, {
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
