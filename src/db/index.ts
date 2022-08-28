import { Sequelize } from 'sequelize';
import { buildModels } from './models';
import { DB_URI } from '../env';

export const sequelize = new Sequelize(DB_URI as string, {
  dialect: 'postgres',
  define: {
    underscored: true
  },
  sync: {
    force: false
  }
});

export const models = buildModels(sequelize);
models.wallet.hasOne(models.subscription.getModel(), {
  sourceKey: 'id',
  foreignKey: 'walletId'
});
models.wallet.hasMany(models.lockedTransaction.getModel(), {
  sourceKey: 'id',
  foreignKey: 'walletId'
});
