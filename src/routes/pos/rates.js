const express = require("express");
const { PosCustomerRate, Customer } = require("../../models");
const { authMiddleware, adminOnly, companyContext } = require("../../middleware/auth");

const router = express.Router();

router.use(authMiddleware);
router.use(adminOnly);
router.use(companyContext);

// OBTÉM taxa do cliente
router.get("/:customer_id", async (req, res) => {
  try {
    const { customer_id } = req.params;
    const rate = await PosCustomerRate.findOne({
      where: { customer_id, company_id: req.companyId },
    });
    res.json(rate || null);
  } catch (err) {
    console.error("Erro ao buscar taxa:", err);
    res.status(500).json({ error: "Erro ao buscar taxa do cliente" });
  }
});

// CRIA/ATUALIZA taxa do cliente
router.post("/:customer_id", async (req, res) => {
  try {
    const { customer_id } = req.params;
    const cust = await Customer.findOne({ where: { id: customer_id, company_id: req.companyId } });
    if (!cust) return res.status(404).json({ error: "Cliente não encontrado" });

    const payload = {
      debit_percent: req.body.debit_percent ?? 0,
      credit_avista_percent: req.body.credit_avista_percent ?? 0,
      credit_2a6_percent: req.body.credit_2a6_percent ?? 0,
      credit_7a12_percent: req.body.credit_7a12_percent ?? 0,
      pix_key: req.body.pix_key ?? null,
      customer_id,
      company_id: req.companyId,
    };

    const existing = await PosCustomerRate.findOne({
      where: { customer_id, company_id: req.companyId },
    });
    if (existing) {
      await existing.update(payload);
      return res.json(existing);
    }
    const created = await PosCustomerRate.create(payload);
    res.status(201).json(created);
  } catch (err) {
    console.error("Erro ao salvar taxa:", err);
    res.status(500).json({ error: "Erro ao salvar taxa do cliente" });
  }
});

module.exports = router;
