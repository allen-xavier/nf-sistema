const sequelize = require("../config/database");
const Invoice = require("./Invoice");
const Customer = require("./Customer");
const Company = require("./Company");
const SystemUser = require("./SystemUser");

// =============================
// RELACIONAMENTOS CORRETOS
// =============================

// --- CLIENTE → NOTAS
Customer.hasMany(Invoice, {
  foreignKey: "customer_id",
  as: "Invoices",              // <── ALIAS CORRETO
});

Invoice.belongsTo(Customer, {
  foreignKey: "customer_id",
  as: "Customer",              // <── BATE COM REPORTS
});

// --- EMPRESA → NOTAS
Company.hasMany(Invoice, {
  foreignKey: "company_id",
  as: "Invoices",              // <── ALIAS CORRETO
});

Invoice.belongsTo(Company, {
  foreignKey: "company_id",
  as: "Company",               // <── BATE COM REPORTS
});

module.exports = {
  sequelize,
  Invoice,
  Customer,
  Company,
  SystemUser,
};
