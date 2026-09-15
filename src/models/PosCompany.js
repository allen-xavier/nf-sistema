const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const PosCompany = sequelize.define(
  "PosCompany",
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
    cnpj: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
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
    tableName: "pos_companies",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      {
        name: "pos_companies_company_cnpj_unique",
        unique: true,
        fields: ["company_id", "cnpj"],
      },
      { name: "pos_companies_company_id_idx", fields: ["company_id"] },
    ],
  }
);

module.exports = PosCompany;
