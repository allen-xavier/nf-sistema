const express = require("express");
const { Op } = require("sequelize");
const {
  PosSale,
  PosTerminal,
  PosCompany,
  PosCustomerRate,
  Customer,
} = require("../../models");
const { authMiddleware, adminOnly } = require("../../middleware/auth");

const router = express.Router();

router.use(authMiddleware);
router.use(adminOnly);

function getFeePercent(rate, payment_type) {
  if (!rate) return 0;
  if (payment_type === "DEBITO") return Number(rate.debit_percent || 0);
  if (payment_type === "CREDITO_AVISTA") return Number(rate.credit_avista_percent || 0);
  if (payment_type === "CREDITO_2A6") return Number(rate.credit_2a6_percent || 0);
  if (payment_type === "CREDITO_7A12") return Number(rate.credit_7a12_percent || 0);
  return 0;
}

// LISTAGEM paginada/filtrada
router.get("/", async (req, res) => {
  try {
    let { page = 1, limit = 50, customer_id, pos_company_id, pos_terminal_id, payment_type, start, end } =
      req.query;
    page = Number(page) || 1;
    limit = Number(limit) || 50;
    const offset = (page - 1) * limit;

    const where = {};
    if (customer_id) where.customer_id = customer_id;
    if (pos_company_id) where.pos_company_id = pos_company_id;
    if (pos_terminal_id) where.pos_terminal_id = pos_terminal_id;
    if (payment_type) where.payment_type = payment_type;
    if (start || end) {
      where.sale_datetime = {};
      if (start) where.sale_datetime[Op.gte] = new Date(start);
      if (end) where.sale_datetime[Op.lte] = new Date(`${end} 23:59:59`);
    }

    const { rows, count } = await PosSale.findAndCountAll({
      where,
      include: [
        { model: PosTerminal, as: "PosTerminal" },
        { model: PosCompany, as: "PosCompany" },
        { model: Customer, as: "Customer" },
      ],
      order: [["sale_datetime", "DESC"]],
      limit,
      offset,
    });

    res.json({
      data: rows,
      pagination: {
        total: count,
        page,
        limit,
        pages: Math.ceil(count / limit),
      },
    });
  } catch (err) {
    console.error("Erro ao listar vendas pos:", err);
    res.status(500).json({ error: "Erro ao listar vendas" });
  }
});

// CRIAR venda
router.post("/", async (req, res) => {
  try {
    const {
      pos_terminal_id,
      nsu,
      sale_datetime,
      amount,
      payment_type,
    } = req.body;

    if (!pos_terminal_id || !nsu || !sale_datetime || !amount || !payment_type) {
      return res
        .status(400)
        .json({ error: "pos_terminal_id, nsu, sale_datetime, amount, payment_type são obrigatórios" });
    }

    const term = await PosTerminal.findByPk(pos_terminal_id, {
      include: [
        { model: PosCompany, as: "PosCompany" },
        { model: Customer, as: "Customer" },
      ],
    });
    if (!term) return res.status(404).json({ error: "Terminal não encontrado" });
    if (!term.is_active) return res.status(400).json({ error: "Terminal inativo" });

    const rate = await PosCustomerRate.findOne({
      where: { customer_id: term.customer_id },
    });

    const feePercent = getFeePercent(rate, payment_type);
    const feeValue = Number(((Number(amount) || 0) * feePercent) / 100).toFixed(2);
    const net = Number(Number(amount || 0) - Number(feeValue)).toFixed(2);

    const sale = await PosSale.create({
      customer_id: term.customer_id,
      pos_company_id: term.pos_company_id,
      pos_terminal_id,
      nsu,
      sale_datetime,
      amount,
      payment_type,
      fee_percent: feePercent,
      fee_value: feeValue,
      net_amount: net,
    });

    res.status(201).json(sale);
  } catch (err) {
    console.error("Erro ao criar venda pos:", err);
    res.status(500).json({ error: "Erro ao criar venda" });
  }
});

// DELETE venda
router.delete("/:id", async (req, res) => {
  try {
    const sale = await PosSale.findByPk(req.params.id);
    if (!sale) return res.status(404).json({ error: "Venda não encontrada" });
    await sale.destroy();
    res.json({ success: true });
  } catch (err) {
    console.error("Erro ao excluir venda pos:", err);
    res.status(500).json({ error: "Erro ao excluir venda" });
  }
});

module.exports = router;
