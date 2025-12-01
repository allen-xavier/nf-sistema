const { DataTypes } = require('sequelize');
const sequelize = require('../db');
const Customer = require('./Customer');
const Company = require('./Company');

const Invoice = sequelize.define(
  'Invoice',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },

    total_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    paid_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },

    fee_percent: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
    fee_value: { type: DataTypes.DECIMAL(12, 2), allowNull: false },

    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'EMITIDA'
    },

    issued_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  },
  {
    tableName: 'invoices',
    underscored: true
  }
);

// Relacionamentos
Customer.hasMany(Invoice, { foreignKey: 'customer_id' });
Invoice.belongsTo(Customer, { foreignKey: 'customer_id' });

Company.hasMany(Invoice, { foreignKey: 'company_id' });
Invoice.belongsTo(Company, { foreignKey: 'company_id' });

module.exports = Invoice;
