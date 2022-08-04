import type { Sequelize } from 'sequelize';
import { nAry } from 'ramda';
import WalletClass from './wallet';
import TransactionClass from './transaction';
import SubscriptionClass from './subscription';
import LockedTransactionClass from './locked_transaction';

const composeModels = (s: Sequelize) => ({
  wallet: new WalletClass(s),
  transaction: new TransactionClass(s),
  subscription: new SubscriptionClass(s),
  lockedTransaction: new LockedTransactionClass(s)
});

export const buildModels = nAry(1, composeModels);
