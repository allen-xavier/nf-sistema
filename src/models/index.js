const sequelize = require("../config/database");

const Customer = require("./Customer");
const Company = require("./Company");
const Invoice = require("./Invoice");
const SystemUser = require("./SystemUser");

// ========== ASSOCIAÇÕES ==========

// Customer → Invoice
Customer.hasMany(Invoice, {
  foreignKey: "customer_id",
  onDelete: "CASCADE",
});

Invoice.belongsTo(Customer, {
  foreignKey: "customer_id",
  as: "Customer",
  onDelete: "CASCADE",
});

// Company → Invoice
Company.hasMany(Invoice, {
  foreignKey: "company_id",
  onDelete: "CASCADE",
});

Invoice.belongsTo(Company, {
  foreignKey: "company_id",
  as: "Company",
  onDelete: "CASCADE",
});

module.exports = {
  sequelize,
  Customer,
  Company,
  Invoice,
  SystemUser,
};
