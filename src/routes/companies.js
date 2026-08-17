const express = require("express");
const { Company } = require("../models");
const { authMiddleware, adminOnly } = require("../middleware/auth");

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
    const company = await Company.findByPk(id);
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

    const empresa = await Company.create({
      cnpj,
      name,
      access_key,
      is_active: is_active ?? true,
    });

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
    const company = await Company.findByPk(id);

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
    const company = await Company.findByPk(id);

    if (!company) return res.status(404).json({ error: "Empresa não encontrada." });

    await company.destroy();
    res.json({ success: true });
  } catch (err) {
    console.error("Erro ao excluir empresa:", err);
    res.status(500).json({ error: "Erro ao excluir empresa." });
  }
});

module.exports = router;
