import { Sequelize } from 'sequelize';
import { buildModels } from './models';
import { DB_URI } from '../env';

export const sequelize = new Sequelize(DB_URI as string, {
  dialect: 'postgres',
  define: {
    underscored: true
  }
});

export const models = buildModels(sequelize);

models.wallet.hasMany(models.transaction.getModel(), {
  sourceKey: 'id',
  foreignKey: 'walletId'
});
models.wallet.hasOne(models.subscription.getModel(), {
  sourceKey: 'id',
  foreignKey: 'walletId'
});
