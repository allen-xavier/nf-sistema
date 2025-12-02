const express = require("express");
const { PosTerminal, PosCompany, Customer } = require("../../models");
const { authMiddleware, adminOnly } = require("../../middleware/auth");

const router = express.Router();

router.use(authMiddleware);
router.use(adminOnly);

// LISTAR
router.get("/", async (_req, res) => {
  try {
    const list = await PosTerminal.findAll({
      include: [
        { model: PosCompany, as: "PosCompany" },
        { model: Customer, as: "Customer" },
      ],
      order: [["id", "ASC"]],
    });
    res.json(list);
  } catch (err) {
    console.error("Erro ao listar pos_terminals:", err);
    res.status(500).json({ error: "Erro ao listar terminais" });
  }
});

// CRIAR
router.post("/", async (req, res) => {
  try {
    const { pos_company_id, customer_id, terminal_code, is_active = true } = req.body;
    if (!pos_company_id || !customer_id || !terminal_code) {
      return res
        .status(400)
        .json({ error: "pos_company_id, customer_id e terminal_code são obrigatórios" });
    }
    const comp = await PosCompany.findByPk(pos_company_id);
    if (!comp) return res.status(404).json({ error: "Empresa da maquininha não encontrada" });
    const cust = await Customer.findByPk(customer_id);
    if (!cust) return res.status(404).json({ error: "Cliente não encontrado" });

    const exists = await PosTerminal.findOne({
      where: { pos_company_id, terminal_code },
    });
    if (exists) return res.status(400).json({ error: "Terminal já cadastrado para esta empresa" });

    const created = await PosTerminal.create({
      pos_company_id,
      customer_id,
      terminal_code,
      is_active,
    });
    res.status(201).json(created);
  } catch (err) {
    console.error("Erro ao criar terminal:", err);
    res.status(500).json({ error: "Erro ao criar terminal" });
  }
});

// ATUALIZAR
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const term = await PosTerminal.findByPk(id);
    if (!term) return res.status(404).json({ error: "Terminal não encontrado" });

    const { pos_company_id, customer_id, terminal_code, is_active } = req.body;

    if (pos_company_id) {
      const comp = await PosCompany.findByPk(pos_company_id);
      if (!comp) return res.status(404).json({ error: "Empresa da maquininha não encontrada" });
      term.pos_company_id = pos_company_id;
    }
    if (customer_id) {
      const cust = await Customer.findByPk(customer_id);
      if (!cust) return res.status(404).json({ error: "Cliente não encontrado" });
      term.customer_id = customer_id;
    }
    if (terminal_code) {
      const exists = await PosTerminal.findOne({
        where: {
          pos_company_id: term.pos_company_id,
          terminal_code,
        },
      });
      if (exists && exists.id !== term.id) {
        return res.status(400).json({ error: "Terminal já cadastrado para esta empresa" });
      }
      term.terminal_code = terminal_code;
    }
    if (is_active !== undefined) term.is_active = is_active;

    await term.save();
    res.json(term);
  } catch (err) {
    console.error("Erro ao atualizar terminal:", err);
    res.status(500).json({ error: "Erro ao atualizar terminal" });
  }
});

// DELETAR
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const term = await PosTerminal.findByPk(id);
    if (!term) return res.status(404).json({ error: "Terminal não encontrado" });
    await term.destroy();
    res.json({ success: true });
  } catch (err) {
    console.error("Erro ao excluir terminal:", err);
    res.status(500).json({ error: "Erro ao excluir terminal" });
  }
});

module.exports = router;
