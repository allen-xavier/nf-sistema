const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const SystemUser = sequelize.define(
  'SystemUser',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(150), allowNull: false },
    email: { type: DataTypes.STRING(150), allowNull: false, unique: true },
    password_hash: { type: DataTypes.TEXT, allowNull: false },
    is_admin: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
  },
  {
    tableName: 'system_users',
    underscored: true
  }
);

module.exports = SystemUser;
