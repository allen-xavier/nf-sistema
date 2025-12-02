const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const PosSale = sequelize.define(
  "PosSale",
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
    pos_company_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    pos_terminal_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    nsu: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    sale_datetime: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    payment_type: {
      type: DataTypes.ENUM(
        "DEBITO",
        "CREDITO_AVISTA",
        "CREDITO_2A6",
        "CREDITO_7A12",
        "PIX"
      ),
      allowNull: false,
    },
    fee_percent: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
    },
    fee_value: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    net_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
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
    tableName: "pos_sales",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { fields: ["customer_id"] },
      { fields: ["pos_company_id"] },
      { fields: ["pos_terminal_id"] },
      { fields: ["sale_datetime"] },
    ],
  }
);

module.exports = PosSale;
