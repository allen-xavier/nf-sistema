const express = require("express");
const { Op } = require("sequelize");
const {
  SystemUser,
  UserInvitation,
  UserCompany,
  sequelize,
} = require("../models");
const { authMiddleware, adminOnly } = require("../middleware/auth");
const { audit } = require("../middleware/audit");
const { generateToken, hashToken } = require("../utils/tokens");
const { sendActivationMail } = require("../mail/mailer");
const {
  getAccessibleCompanies,
  assertCompanyIdsAllowed,
} = require("../utils/companyAccess");

const router = express.Router();

router.use(authMiddleware);
router.use(adminOnly);

function currentCompanyId(req) {
  const requested = Number(req.headers["x-company-id"]);
  if ((req.user.company_ids || []).includes(requested)) return requested;
  const preferred = Number(req.user.default_company_id);
  if ((req.user.company_ids || []).includes(preferred)) return preferred;
  return req.user.company_ids?.[0] || null;
}

async function visibleUserIds(req) {
  const memberships = await UserCompany.findAll({
    where: { company_id: { [Op.in]: req.user.company_ids || [] } },
    attributes: ["user_id"],
    raw: true,
  });
  return [...new Set(memberships.map((membership) => Number(membership.user_id)))];
}

async function serializeManagedUser(user, allowedIds) {
  const companies = (await getAccessibleCompanies(user.id)).filter((company) =>
    allowedIds.includes(Number(company.id))
  );
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    is_admin: user.is_admin,
    status: user.status,
    default_company_id: user.default_company_id,
    activated_at: user.activated_at,
    last_login_at: user.last_login_at,
    created_at: user.created_at,
    companies,
  };
}

async function findManagedUser(req, id) {
  const membership = await UserCompany.findOne({
    where: {
      user_id: id,
      company_id: { [Op.in]: req.user.company_ids || [] },
    },
  });
  if (!membership) return null;
  return SystemUser.findByPk(id);
}

/** Lista os usuários que compartilham ao menos uma empresa com o administrador. */
router.get("/", async (req, res) => {
  try {
    const ids = await visibleUserIds(req);
    const list = await SystemUser.findAll({
      where: { id: { [Op.in]: ids } },
      attributes: [
        "id",
        "name",
        "email",
        "is_admin",
        "status",
        "default_company_id",
        "activated_at",
        "last_login_at",
        "created_at",
      ],
      order: [["created_at", "DESC"]],
    });
    res.json(
      await Promise.all(
        list.map((user) => serializeManagedUser(user, req.user.company_ids || []))
      )
    );
  } catch (err) {
    console.error("Erro ao listar usuários:", err);
    res.status(500).json({ error: "Erro ao listar usuários." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const user = await findManagedUser(req, Number(req.params.id));
    if (!user) return res.status(404).json({ error: "Usuário não encontrado." });
    res.json(await serializeManagedUser(user, req.user.company_ids || []));
  } catch (err) {
    console.error("Erro ao buscar usuário:", err);
    res.status(500).json({ error: "Erro ao buscar usuário." });
  }
});

/** Cria um convite já vinculado a uma ou mais empresas. */
router.post("/", async (req, res) => {
  try {
    const { name, email, is_admin } = req.body;
    if (!name || !email) {
      return res.status(400).json({ error: "Nome e e-mail são obrigatórios." });
    }

    const fallbackCompanyId = currentCompanyId(req);
    const companyIds = assertCompanyIdsAllowed(
      req.body.company_ids || (fallbackCompanyId ? [fallbackCompanyId] : []),
      req.user.company_ids || []
    );

    const existing = await SystemUser.findOne({ where: { email } });
    if (existing) return res.status(400).json({ error: "Já existe um usuário com esse e-mail." });

    const token = generateToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const user = await sequelize.transaction(async (transaction) => {
      const created = await SystemUser.create(
        {
          name,
          email,
          password_hash: null,
          is_admin: is_admin || false,
          status: "PENDING",
          default_company_id: companyIds[0],
        },
        { transaction }
      );

      await UserCompany.bulkCreate(
        companyIds.map((companyId) => ({ user_id: created.id, company_id: companyId })),
        { transaction }
      );

      await UserInvitation.create(
        {
          user_id: created.id,
          email,
          token_hash: tokenHash,
          status: "PENDING",
          expires_at: expiresAt,
          created_by_user_id: req.user.id,
          ip_address: req.ip,
        },
        { transaction }
      );
      return created;
    });

    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
    const activationUrl = `${appUrl}/?token=${token}`;
    let emailSent = false;
    try {
      await sendActivationMail(email, name, activationUrl);
      emailSent = true;
    } catch (mailErr) {
      console.error("[USERS] Falha ao enviar e-mail de ativação:", mailErr.message);
    }

    req.companyId = companyIds[0];
    await audit(
      req.user.id,
      "CREATE_USER",
      "SystemUser",
      user.id,
      { email, is_admin: is_admin || false, company_ids: companyIds },
      req
    );

    res.status(201).json({
      user: await serializeManagedUser(user, req.user.company_ids || []),
      invitation: {
        email_sent: emailSent,
        activation_url: emailSent ? null : activationUrl,
        expires_at: expiresAt,
      },
    });
  } catch (err) {
    console.error("Erro ao criar usuário:", err);
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err.name === "SequelizeUniqueConstraintError") {
      return res.status(400).json({ error: "E-mail já cadastrado." });
    }
    res.status(500).json({ error: "Erro ao criar usuário." });
  }
});

/** Atualiza dados e os acessos do usuário dentro das empresas administradas. */
router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = await findManagedUser(req, id);
    if (!user) return res.status(404).json({ error: "Usuário não encontrado." });

    if (id === req.user.id && req.body.is_admin === false) {
      return res.status(400).json({ error: "Você não pode revogar seu próprio acesso admin." });
    }

    const { name, email, is_admin, status } = req.body;
    let companyIds = null;
    if (req.body.company_ids !== undefined) {
      companyIds = assertCompanyIdsAllowed(req.body.company_ids, req.user.company_ids || []);
    }

    await sequelize.transaction(async (transaction) => {
      if (name) user.name = name;
      if (email) user.email = email;
      if (is_admin !== undefined) user.is_admin = is_admin;
      if (status) user.status = status;

      if (companyIds) {
        await UserCompany.destroy({
          where: {
            user_id: id,
            company_id: { [Op.in]: req.user.company_ids || [] },
          },
          transaction,
        });
        await UserCompany.bulkCreate(
          companyIds.map((companyId) => ({ user_id: id, company_id: companyId })),
          { transaction }
        );

        const allMemberships = await UserCompany.findAll({
          where: { user_id: id },
          attributes: ["company_id"],
          transaction,
          raw: true,
        });
        const allIds = allMemberships.map((membership) => Number(membership.company_id));
        if (!allIds.includes(Number(user.default_company_id))) {
          user.default_company_id = allIds[0] || null;
        }
      }

      await user.save({ transaction });
    });

    req.companyId = currentCompanyId(req);
    await audit(
      req.user.id,
      "UPDATE_USER",
      "SystemUser",
      id,
      { name, email, is_admin, status, company_ids: companyIds },
      req
    );
    res.json(await serializeManagedUser(user, req.user.company_ids || []));
  } catch (err) {
    console.error("Erro ao atualizar usuário:", err);
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err.name === "SequelizeUniqueConstraintError") {
      return res.status(400).json({ error: "E-mail já cadastrado." });
    }
    res.status(500).json({ error: "Erro ao atualizar usuário." });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (id === req.user.id) {
      return res.status(400).json({ error: "Você não pode deletar a si mesmo." });
    }

    const user = await findManagedUser(req, id);
    if (!user) return res.status(404).json({ error: "Usuário não encontrado." });

    await user.destroy();
    req.companyId = currentCompanyId(req);
    await audit(req.user.id, "DELETE_USER", "SystemUser", id, { email: user.email }, req);
    res.json({ success: true });
  } catch (err) {
    console.error("Erro ao deletar usuário:", err);
    res.status(500).json({ error: "Erro ao deletar usuário." });
  }
});

router.post("/:id/resend-invite", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = await findManagedUser(req, id);
    if (!user) return res.status(404).json({ error: "Usuário não encontrado." });
    if (user.status !== "PENDING") {
      return res.status(400).json({ error: "Usuário já está ativo." });
    }

    await UserInvitation.update(
      { status: "REVOKED" },
      { where: { user_id: id, status: "PENDING" } }
    );

    const token = generateToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await UserInvitation.create({
      user_id: user.id,
      email: user.email,
      token_hash: hashToken(token),
      status: "PENDING",
      expires_at: expiresAt,
      created_by_user_id: req.user.id,
      ip_address: req.ip,
    });

    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
    const activationUrl = `${appUrl}/?token=${token}`;
    let emailSent = false;
    try {
      await sendActivationMail(user.email, user.name, activationUrl);
      emailSent = true;
    } catch (mailErr) {
      console.error("[USERS] Falha ao reenviar e-mail:", mailErr.message);
    }

    req.companyId = currentCompanyId(req);
    await audit(req.user.id, "RESEND_INVITE", "SystemUser", id, {}, req);
    res.json({
      success: true,
      email_sent: emailSent,
      activation_url: emailSent ? null : activationUrl,
      expires_at: expiresAt,
    });
  } catch (err) {
    console.error("Erro ao reenviar convite:", err);
    res.status(500).json({ error: "Erro ao reenviar convite." });
  }
});

module.exports = router;
