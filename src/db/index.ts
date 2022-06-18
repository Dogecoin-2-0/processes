import { Sequelize } from 'sequelize';
import { buildModels } from './models';

export const sequelize = new Sequelize({});

export const models = buildModels(sequelize);

models.wallet.hasMany(models.transaction.getModel(), {
  sourceKey: 'id',
  foreignKey: 'walletId'
});
models.wallet.hasOne(models.subscription.getModel(), {
  sourceKey: 'id',
  foreignKey: 'walletId'
});
