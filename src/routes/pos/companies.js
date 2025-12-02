const express = require("express");
const { PosCompany } = require("../../models");
const { authMiddleware, adminOnly } = require("../../middleware/auth");

const router = express.Router();

router.use(authMiddleware);
router.use(adminOnly);

// LISTAR
router.get("/", async (_req, res) => {
  try {
    const list = await PosCompany.findAll({
      order: [["id", "ASC"]],
    });
    res.json(list);
  } catch (err) {
    console.error("Erro ao listar pos_companies:", err);
    res.status(500).json({ error: "Erro ao listar empresas de maquininha" });
  }
});

// CRIAR
router.post("/", async (req, res) => {
  try {
    const { name, cnpj, is_active = true } = req.body;
    if (!name || !cnpj) {
      return res.status(400).json({ error: "Nome e CNPJ são obrigatórios" });
    }
    const existing = await PosCompany.findOne({ where: { cnpj } });
    if (existing) {
      return res.status(400).json({ error: "Já existe empresa com esse CNPJ" });
    }
    const created = await PosCompany.create({ name, cnpj, is_active });
    res.status(201).json(created);
  } catch (err) {
    console.error("Erro ao criar pos_company:", err);
    res.status(500).json({ error: "Erro ao criar empresa de maquininha" });
  }
});

// ATUALIZAR
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const company = await PosCompany.findByPk(id);
    if (!company) return res.status(404).json({ error: "Empresa não encontrada" });

    const { name, cnpj, is_active } = req.body;
    if (cnpj && cnpj !== company.cnpj) {
      const exists = await PosCompany.findOne({ where: { cnpj } });
      if (exists) return res.status(400).json({ error: "CNPJ já utilizado" });
    }

    company.name = name ?? company.name;
    company.cnpj = cnpj ?? company.cnpj;
    if (is_active !== undefined) company.is_active = is_active;
    await company.save();
    res.json(company);
  } catch (err) {
    console.error("Erro ao atualizar pos_company:", err);
    res.status(500).json({ error: "Erro ao atualizar empresa de maquininha" });
  }
});

// DELETAR
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const company = await PosCompany.findByPk(id);
    if (!company) return res.status(404).json({ error: "Empresa não encontrada" });
    await company.destroy();
    res.json({ success: true });
  } catch (err) {
    console.error("Erro ao excluir pos_company:", err);
    res.status(500).json({ error: "Erro ao excluir empresa de maquininha" });
  }
});

module.exports = router;
