const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const Customer = sequelize.define(
  'Customer',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(150), allowNull: false },
    whatsapp_number: { type: DataTypes.STRING(20), allowNull: false, unique: true },
    fee_percent: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
  },
  {
    tableName: 'customers',
    underscored: true
  }
);

module.exports = Customer;
