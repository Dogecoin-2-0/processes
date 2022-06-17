import { Sequelize, DataTypes, ModelStatic, Model, Op, HasManyOptions } from 'sequelize';

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

  findWallet(address: string): Promise<Model<any> | null> {
    return Promise.resolve(
      this.model.findOne({
        where: {
          address: {
            [Op.iLike]: address
          }
        }
      })
    );
  }

  // getModel(): ModelStatic<Model<any>> {
  //   return this.model;
  // }

  hasMany(model: ModelStatic<Model<any>>, opts?: HasManyOptions) {
    return this.model.hasMany(model, opts);
  }
}
