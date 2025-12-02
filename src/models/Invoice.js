const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Invoice = sequelize.define(
  "Invoice",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    customer_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    company_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    issued_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },

    total_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },

    paid_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },

    fee_percent: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
    },

    fee_value: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },

    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "EMITIDA",
    },

    buyer_name: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },

    buyer_cpf: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },

    terminal_id: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },

    nsu: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },

    sale_datetime: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    sale_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },

    is_terminal_sale: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    is_our_terminal: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    pdf_url: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    nf_link: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },

    updated_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "invoices",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

module.exports = Invoice;
