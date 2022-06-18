import { Sequelize, ModelStatic, Model, DataTypes, UpdateOptions, DestroyOptions } from 'sequelize';

export default class SubscriptionClass {
  private model: ModelStatic<Model<any>>;

  constructor(seq: Sequelize) {
    this.model = seq.define('PushSubscriptions', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      deviceId: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: true
        }
      },
      walletId: { type: DataTypes.INTEGER, allowNull: false }
    });
  }

  addSubscription(body: any): Promise<Model<any>> {
    return Promise.resolve(this.model.create(body));
  }

  getSubscriptions(): Promise<Array<Model<any>>> {
    return Promise.resolve(this.model.findAll());
  }

  updateSubscription(body: any, opts: UpdateOptions): Promise<[number]> {
    return Promise.resolve(this.model.update(body, opts));
  }

  deleteSubscription(opts?: DestroyOptions): Promise<number> {
    return Promise.resolve(this.model.destroy(opts));
  }

  getModel(): ModelStatic<Model<any>> {
    return this.model;
  }
}
