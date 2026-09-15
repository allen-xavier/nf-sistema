const { Company, UserCompany } = require("../models");

async function getAccessibleCompanies(userId) {
  const memberships = await UserCompany.findAll({
    where: { user_id: userId },
    include: [
      {
        model: Company,
        as: "Company",
        attributes: ["id", "name", "cnpj", "is_active"],
      },
    ],
    order: [[{ model: Company, as: "Company" }, "name", "ASC"]],
  });

  return memberships
    .map((membership) => membership.Company || membership.company)
    .filter(Boolean)
    .map((company) => (company.toJSON ? company.toJSON() : company));
}

function publicUser(user, companies) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    is_admin: user.is_admin,
    status: user.status,
    default_company_id: user.default_company_id,
    companies,
  };
}

function assertCompanyIdsAllowed(requestedIds, allowedIds) {
  const normalized = [...new Set((requestedIds || []).map(Number).filter(Number.isInteger))];
  if (!normalized.length) {
    const error = new Error("Selecione pelo menos uma empresa.");
    error.status = 400;
    throw error;
  }

  const allowed = new Set((allowedIds || []).map(Number));
  if (normalized.some((id) => !allowed.has(id))) {
    const error = new Error("Você não pode conceder acesso a uma empresa que não administra.");
    error.status = 403;
    throw error;
  }
  return normalized;
}

module.exports = {
  getAccessibleCompanies,
  publicUser,
  assertCompanyIdsAllowed,
};
