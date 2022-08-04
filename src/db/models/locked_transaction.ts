import { Sequelize, DataTypes, ModelStatic, Model } from 'sequelize';

export default class LockedTransactionClass {
  private model: ModelStatic<Model<any>>;

  constructor(seq: Sequelize) {
    this.model = seq.define('LockedTransaction', {
      id: { type: DataTypes.STRING, primaryKey: true },
      from: { type: DataTypes.STRING, allowNull: false },
      to: { type: DataTypes.STRING, allowNull: false },
      amount: { type: DataTypes.DOUBLE, allowNull: false },
      fee: { type: DataTypes.DOUBLE, allowNull: false },
      lockTime: { type: DataTypes.INTEGER, allowNull: false },
      token: { type: DataTypes.STRING, allowNull: false },
      walletId: { type: DataTypes.INTEGER, allowNull: false },
      chainId: { type: DataTypes.STRING, allowNull: false }
    });
  }

  addTransaction(body: any): Promise<Model<any>> {
    return Promise.resolve(this.model.create(body));
  }

  getAllTransactions(): Promise<Array<Model<any>>> {
    return Promise.resolve(this.model.findAll());
  }

  getModel(): ModelStatic<Model<any>> {
    return this.model;
  }
}
