const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const UserCompany = sequelize.define(
  "UserCompany",
  {
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
    },
    company_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "user_companies",
    timestamps: false,
    indexes: [{ fields: ["user_id"] }, { fields: ["company_id"] }],
  }
);

module.exports = UserCompany;
