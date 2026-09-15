const sequelize = require("../config/database");
const Invoice = require("./Invoice");
const Customer = require("./Customer");
const Company = require("./Company");
const SystemUser = require("./SystemUser");
const UserInvitation = require("./UserInvitation");
const AuditLog = require("./AuditLog");
const PasswordResetToken = require("./PasswordResetToken");
const PosCompany = require("./PosCompany");
const PosTerminal = require("./PosTerminal");
const PosCustomerRate = require("./PosCustomerRate");
const PosSale = require("./PosSale");
const UserCompany = require("./UserCompany");

// =============================
// RELACIONAMENTOS
// =============================

// --- CLIENTE -> NOTAS
Customer.hasMany(Invoice, { foreignKey: "customer_id", as: "Invoices" });
Invoice.belongsTo(Customer, { foreignKey: "customer_id", as: "Customer" });

// --- EMPRESA -> NOTAS
Company.hasMany(Invoice, { foreignKey: "company_id", as: "Invoices" });
Invoice.belongsTo(Company, { foreignKey: "company_id", as: "Company" });

// --- EMPRESA -> CLIENTES
Company.hasMany(Customer, { foreignKey: "company_id", as: "Customers" });
Customer.belongsTo(Company, { foreignKey: "company_id", as: "Company" });

// --- USUÁRIOS <-> EMPRESAS
SystemUser.belongsToMany(Company, {
  through: UserCompany,
  foreignKey: "user_id",
  otherKey: "company_id",
  as: "Companies",
});
Company.belongsToMany(SystemUser, {
  through: UserCompany,
  foreignKey: "company_id",
  otherKey: "user_id",
  as: "Users",
});
UserCompany.belongsTo(SystemUser, { foreignKey: "user_id", as: "User" });
UserCompany.belongsTo(Company, { foreignKey: "company_id", as: "Company" });
SystemUser.belongsTo(Company, {
  foreignKey: "default_company_id",
  as: "DefaultCompany",
});

// --- CLIENTE -> CRIADO POR USUARIO
Customer.belongsTo(SystemUser, { foreignKey: "created_by_user_id", as: "CreatedBy" });
SystemUser.hasMany(Customer, { foreignKey: "created_by_user_id", as: "Customers" });

// --- CONVITES -> USUARIO
UserInvitation.belongsTo(SystemUser, { foreignKey: "user_id", as: "User" });
UserInvitation.belongsTo(SystemUser, { foreignKey: "created_by_user_id", as: "InvitedBy" });

// --- AUDITORIA -> USUARIO
AuditLog.belongsTo(SystemUser, { foreignKey: "user_id", as: "User" });
AuditLog.belongsTo(Company, { foreignKey: "company_id", as: "Company" });

// --- RECUPERAÇÃO DE SENHA -> USUÁRIO
PasswordResetToken.belongsTo(SystemUser, { foreignKey: "user_id", as: "User" });
SystemUser.hasMany(PasswordResetToken, { foreignKey: "user_id", as: "PasswordResetTokens" });

// --- POS COMPANY -> POS TERMINAL
PosCompany.hasMany(PosTerminal, { foreignKey: "pos_company_id", as: "Terminals" });
PosTerminal.belongsTo(PosCompany, { foreignKey: "pos_company_id", as: "PosCompany" });

Company.hasMany(PosCompany, { foreignKey: "company_id", as: "PosCompanies" });
PosCompany.belongsTo(Company, { foreignKey: "company_id", as: "Company" });
Company.hasMany(PosTerminal, { foreignKey: "company_id", as: "PosTerminals" });
PosTerminal.belongsTo(Company, { foreignKey: "company_id", as: "OwnerCompany" });
Company.hasMany(PosCustomerRate, { foreignKey: "company_id", as: "PosCustomerRates" });
PosCustomerRate.belongsTo(Company, { foreignKey: "company_id", as: "Company" });
Company.hasMany(PosSale, { foreignKey: "company_id", as: "PosSales" });
PosSale.belongsTo(Company, { foreignKey: "company_id", as: "OwnerCompany" });

// --- CUSTOMER -> POS TERMINAL
Customer.hasMany(PosTerminal, { foreignKey: "customer_id", as: "PosTerminals" });
PosTerminal.belongsTo(Customer, { foreignKey: "customer_id", as: "Customer" });

// --- CUSTOMER -> POS CUSTOMER RATE (1:1)
Customer.hasOne(PosCustomerRate, { foreignKey: "customer_id", as: "PosRate" });
PosCustomerRate.belongsTo(Customer, { foreignKey: "customer_id", as: "Customer" });

// --- POS TERMINAL -> POS SALES
PosTerminal.hasMany(PosSale, { foreignKey: "pos_terminal_id", as: "PosSales" });
PosSale.belongsTo(PosTerminal, { foreignKey: "pos_terminal_id", as: "PosTerminal" });

// --- POS COMPANY -> POS SALES
PosCompany.hasMany(PosSale, { foreignKey: "pos_company_id", as: "PosSales" });
PosSale.belongsTo(PosCompany, { foreignKey: "pos_company_id", as: "PosCompany" });

// --- CUSTOMER -> POS SALES
Customer.hasMany(PosSale, { foreignKey: "customer_id", as: "PosSales" });
PosSale.belongsTo(Customer, { foreignKey: "customer_id", as: "Customer" });

module.exports = {
  sequelize,
  Invoice,
  Customer,
  Company,
  SystemUser,
  UserInvitation,
  AuditLog,
  PasswordResetToken,
  PosCompany,
  PosTerminal,
  PosCustomerRate,
  PosSale,
  UserCompany,
};
