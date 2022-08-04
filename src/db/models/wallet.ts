import { Sequelize, DataTypes, ModelStatic, Model, HasManyOptions, HasOneOptions } from 'sequelize';

export default class WalletClass {
  private model: ModelStatic<Model<any>>;

  constructor(seq: Sequelize) {
    this.model = seq.define('Wallet', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      address: { type: DataTypes.STRING, allowNull: false }
    });
  }

  addWallet(body: any): Promise<Model<any>> {
    return Promise.resolve(this.model.create(body));
  }

  findWallets(): Promise<Array<Model<any>>> {
    return Promise.resolve(this.model.findAll());
  }

  // getModel(): ModelStatic<Model<any>> {
  //   return this.model;
  // }

  hasMany(model: ModelStatic<Model<any>>, opts?: HasManyOptions) {
    return this.model.hasMany(model, opts);
  }

  hasOne(model: ModelStatic<Model<any>>, opts?: HasOneOptions) {
    return this.model.hasOne(model, opts);
  }
}
