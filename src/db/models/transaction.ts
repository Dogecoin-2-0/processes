import { Sequelize, DataTypes, ModelStatic, Model } from 'sequelize';

export default class TransactionClass {
  private model: ModelStatic<Model<any>>;

  constructor(seq: Sequelize) {
    this.model = seq.define('Transaction', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      from: { type: DataTypes.STRING, allowNull: false },
      to: { type: DataTypes.STRING, allowNull: false },
      amount: { type: DataTypes.DOUBLE, allowNull: false },
      timeStamp: { type: DataTypes.INTEGER, allowNull: false },
      chainIdHex: { type: DataTypes.STRING, allowNull: false },
      isERC20LikeSpec: { type: DataTypes.BOOLEAN, defaultValue: false },
      tokenName: DataTypes.STRING,
      txId: { type: DataTypes.STRING, allowNull: false },
      explorerUrl: { type: DataTypes.STRING, allowNull: false },
      walletId: { type: DataTypes.INTEGER, allowNull: false }
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
