const jwt = require("jsonwebtoken");
const { SystemUser } = require("../models");
const { getJwtSecret } = require("../config/security");
const { getAccessibleCompanies } = require("../utils/companyAccess");

/**
 * Middleware padrão de autenticação.
 * Verifica se o token JWT é válido.
 */
async function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization;

    if (!header) {
      return res.status(401).json({
        error: "Token ausente. Faça login novamente.",
      });
    }

    const [, token] = header.split(" ");

    if (!token) {
      return res.status(401).json({
        error: "Token inválido ou mal formatado.",
      });
    }

    const decoded = jwt.verify(token, getJwtSecret());

    const user = await SystemUser.findByPk(decoded.id, {
      attributes: ["id", "email", "is_admin", "status", "default_company_id"],
    });

    if (!user || user.status !== "ACTIVE") {
      return res.status(401).json({
        error: "Usuário inexistente ou desativado.",
      });
    }

    // Permissões são sempre obtidas do banco para que desativações e
    // alterações de perfil tenham efeito imediatamente.
    const companies = await getAccessibleCompanies(user.id);
    req.user = {
      ...decoded,
      id: user.id,
      email: user.email,
      is_admin: user.is_admin,
      status: user.status,
      default_company_id: user.default_company_id,
      companies,
      company_ids: companies.map((company) => Number(company.id)),
    };

    next();
  } catch (err) {
    console.error("[AUTH] Erro de autenticação:", err);

    return res.status(401).json({
      error: "Token inválido ou expirado.",
    });
  }
}

/**
 * Define a empresa da requisição e confirma que o usuário tem acesso a ela.
 * A empresa padrão mantém compatibilidade com integrações antigas que ainda
 * não enviam o contexto na consulta de clientes.
 */
function companyContext(req, res, next) {
  const explicitValues = [
    req.headers["x-company-id"],
    req.query?.company_id,
    req.body?.company_id,
  ].filter((value) => value !== undefined && value !== null && value !== "");
  const allowedIds = (req.user?.company_ids || []).map(Number);

  let companyId;
  if (explicitValues.length) {
    const normalized = explicitValues.map(Number);
    if (normalized.some((value) => !Number.isInteger(value) || value <= 0)) {
      return res.status(400).json({ error: "company_id inválido." });
    }
    if (new Set(normalized).size > 1) {
      return res.status(400).json({ error: "company_id conflitante na requisição." });
    }
    [companyId] = normalized;
  } else if (allowedIds.includes(Number(req.user?.default_company_id))) {
    companyId = Number(req.user.default_company_id);
  } else {
    companyId = allowedIds[0];
  }

  if (!companyId) {
    return res.status(403).json({ error: "Usuário sem acesso a uma empresa." });
  }
  if (!allowedIds.includes(companyId)) {
    return res.status(403).json({ error: "Você não possui acesso a esta empresa." });
  }

  req.companyId = companyId;
  next();
}

/**
 * Middleware para permitir apenas administradores.
 */
function adminOnly(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: "Token inválido.",
      });
    }

    if (req.user.is_admin !== true) {
      return res.status(403).json({
        error: "Acesso negado. Apenas administradores.",
      });
    }

    next();
  } catch (err) {
    console.error("[AUTH] Erro no adminOnly:", err);
    return res.status(500).json({
      error: "Erro interno na verificação de permissão.",
    });
  }
}

module.exports = {
  authMiddleware,
  adminOnly,
  companyContext,
};
