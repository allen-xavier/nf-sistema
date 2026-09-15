const express = require("express");
const { Op } = require("sequelize");
const { Company, Customer, Invoice, SystemUser, UserCompany, sequelize } = require("../models");
const { authMiddleware, adminOnly } = require("../middleware/auth");
const { audit } = require("../middleware/audit");

const router = express.Router();

// Autenticação para todas as rotas
router.use(authMiddleware);

/**
 * GET /api/companies
 * Lista todas as empresas (qualquer usuário logado)
 */
router.get("/", async (req, res) => {
  try {
    const companies = await Company.findAll({
      where: { id: { [Op.in]: req.user.company_ids || [] } },
      order: [["name", "ASC"]],
    });
    res.json(companies);
  } catch (err) {
    console.error("Erro ao listar empresas:", err);
    res.status(500).json({ error: "Erro ao listar empresas." });
  }
});

/**
 * GET /api/companies/:id
 */
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const company = await Company.findOne({
      where: { [Op.and]: [{ id }, { id: { [Op.in]: req.user.company_ids || [] } }] },
    });
    if (!company) return res.status(404).json({ error: "Empresa não encontrada." });
    res.json(company);
  } catch (err) {
    console.error("Erro ao buscar empresa:", err);
    res.status(500).json({ error: "Erro ao buscar empresa." });
  }
});

/**
 * POST /api/companies (admin only)
 */
router.post("/", adminOnly, async (req, res) => {
  try {
    const { cnpj, name, access_key, is_active } = req.body;

    if (!cnpj || !name || !access_key) {
      return res.status(400).json({ error: "CNPJ, nome e chave de acesso são obrigatórios." });
    }

    const empresa = await sequelize.transaction(async (transaction) => {
      const created = await Company.create({
        cnpj,
        name,
        access_key,
        is_active: is_active ?? true,
      }, { transaction });

      await UserCompany.create({
        user_id: req.user.id,
        company_id: created.id,
      }, { transaction });

      const currentUser = await SystemUser.findByPk(req.user.id, { transaction });
      if (currentUser && !currentUser.default_company_id) {
        currentUser.default_company_id = created.id;
        await currentUser.save({ transaction });
      }

      return created;
    });

    req.companyId = empresa.id;
    await audit(req.user.id, "CREATE_COMPANY", "Company", empresa.id, {
      name: empresa.name,
      cnpj: empresa.cnpj,
      is_active: empresa.is_active,
    }, req);

    res.status(201).json(empresa);
  } catch (err) {
    console.error("Erro ao criar empresa:", err);
    if (err.name === "SequelizeUniqueConstraintError") {
      return res.status(400).json({ error: "Já existe uma empresa com esse CNPJ." });
    }
    res.status(500).json({ error: "Erro ao criar empresa." });
  }
});

/**
 * PUT /api/companies/:id (admin only)
 */
router.put("/:id", adminOnly, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const company = await Company.findOne({
      where: { [Op.and]: [{ id }, { id: { [Op.in]: req.user.company_ids || [] } }] },
    });

    if (!company) return res.status(404).json({ error: "Empresa não encontrada." });

    const { cnpj, name, access_key, is_active } = req.body;

    if (!cnpj || !name || !access_key) {
      return res.status(400).json({ error: "CNPJ, nome e chave de acesso são obrigatórios." });
    }

    company.cnpj = cnpj;
    company.name = name;
    company.access_key = access_key;
    company.is_active = is_active ?? company.is_active;

    await company.save();
    req.companyId = company.id;
    await audit(req.user.id, "UPDATE_COMPANY", "Company", company.id, {
      name: company.name,
      cnpj: company.cnpj,
      is_active: company.is_active,
    }, req);
    res.json(company);
  } catch (err) {
    console.error("Erro ao atualizar empresa:", err);
    if (err.name === "SequelizeUniqueConstraintError") {
      return res.status(400).json({ error: "Já existe uma empresa com esse CNPJ." });
    }
    res.status(500).json({ error: "Erro ao atualizar empresa." });
  }
});

/**
 * DELETE /api/companies/:id (admin only)
 */
router.delete("/:id", adminOnly, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const company = await Company.findOne({
      where: { [Op.and]: [{ id }, { id: { [Op.in]: req.user.company_ids || [] } }] },
    });

    if (!company) return res.status(404).json({ error: "Empresa não encontrada." });

    const [customerCount, invoiceCount] = await Promise.all([
      Customer.count({ where: { company_id: id } }),
      Invoice.count({ where: { company_id: id } }),
    ]);
    if (customerCount || invoiceCount) {
      return res.status(409).json({
        error: "Esta empresa possui clientes ou notas. Desative-a em vez de excluir.",
      });
    }

    await company.destroy();
    req.companyId = null;
    await audit(req.user.id, "DELETE_COMPANY", "Company", id, {
      name: company.name,
      cnpj: company.cnpj,
    }, req);
    res.json({ success: true });
  } catch (err) {
    console.error("Erro ao excluir empresa:", err);
    res.status(500).json({ error: "Erro ao excluir empresa." });
  }
});

module.exports = router;
