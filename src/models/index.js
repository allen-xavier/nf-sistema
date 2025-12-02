const sequelize = require("../config/database");
const Invoice = require("./Invoice");
const Customer = require("./Customer");
const Company = require("./Company");
const SystemUser = require("./SystemUser");
const PosCompany = require("./PosCompany");
const PosTerminal = require("./PosTerminal");
const PosCustomerRate = require("./PosCustomerRate");
const PosSale = require("./PosSale");

// =============================
// RELACIONAMENTOS
// =============================

// --- CLIENTE -> NOTAS
Customer.hasMany(Invoice, {
  foreignKey: "customer_id",
  as: "Invoices",
});
Invoice.belongsTo(Customer, {
  foreignKey: "customer_id",
  as: "Customer",
});

// --- EMPRESA -> NOTAS
Company.hasMany(Invoice, {
  foreignKey: "company_id",
  as: "Invoices",
});
Invoice.belongsTo(Company, {
  foreignKey: "company_id",
  as: "Company",
});

// --- POS COMPANY -> POS TERMINAL
PosCompany.hasMany(PosTerminal, {
  foreignKey: "pos_company_id",
  as: "Terminals",
});
PosTerminal.belongsTo(PosCompany, {
  foreignKey: "pos_company_id",
  as: "PosCompany",
});

// --- CUSTOMER -> POS TERMINAL
Customer.hasMany(PosTerminal, {
  foreignKey: "customer_id",
  as: "PosTerminals",
});
PosTerminal.belongsTo(Customer, {
  foreignKey: "customer_id",
  as: "Customer",
});

// --- CUSTOMER -> POS CUSTOMER RATE (1:1)
Customer.hasOne(PosCustomerRate, {
  foreignKey: "customer_id",
  as: "PosRate",
});
PosCustomerRate.belongsTo(Customer, {
  foreignKey: "customer_id",
  as: "Customer",
});

// --- POS TERMINAL -> POS SALES
PosTerminal.hasMany(PosSale, {
  foreignKey: "pos_terminal_id",
  as: "PosSales",
});
PosSale.belongsTo(PosTerminal, {
  foreignKey: "pos_terminal_id",
  as: "PosTerminal",
});

// --- POS COMPANY -> POS SALES
PosCompany.hasMany(PosSale, {
  foreignKey: "pos_company_id",
  as: "PosSales",
});
PosSale.belongsTo(PosCompany, {
  foreignKey: "pos_company_id",
  as: "PosCompany",
});

// --- CUSTOMER -> POS SALES
Customer.hasMany(PosSale, {
  foreignKey: "customer_id",
  as: "PosSales",
});
PosSale.belongsTo(Customer, {
  foreignKey: "customer_id",
  as: "Customer",
});

module.exports = {
  sequelize,
  Invoice,
  Customer,
  Company,
  SystemUser,
  PosCompany,
  PosTerminal,
  PosCustomerRate,
  PosSale,
};
