const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Company = sequelize.define(
  "Company",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,   // CORRETO
      autoIncrement: true,
    },

    cnpj: {
      type: DataTypes.STRING(18),
      allowNull: false,
      unique: true,
    },

    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },

    access_key: {
      type: DataTypes.TEXT,
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
    tableName: "companies",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

module.exports = Company;
