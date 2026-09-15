const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Customer = sequelize.define(
  "Customer",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    company_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    name: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },

    whatsapp_number: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },

    uses_nf: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },

    uses_pos: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },

    fee_percent: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
    },

    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },

    created_by_user_id: {
      type: DataTypes.INTEGER,
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
    tableName: "customers",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      {
        name: "customers_company_whatsapp_unique",
        unique: true,
        fields: ["company_id", "whatsapp_number"],
      },
      { name: "customers_company_id_idx", fields: ["company_id"] },
    ],
  }
);

module.exports = Customer;
