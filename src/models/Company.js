const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const Company = sequelize.define(
  'Company',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    cnpj: { type: DataTypes.STRING(18), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(255), allowNull: false },
    access_key: { type: DataTypes.TEXT, allowNull: false },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
  },
  {
    tableName: 'companies',
    underscored: true
  }
);

module.exports = Company;
