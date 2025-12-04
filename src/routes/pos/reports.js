const express = require("express");
const { Op, fn, col, literal } = require("sequelize");
const { PosSale, Customer, PosCompany, PosTerminal } = require("../../models");
const { authMiddleware, adminOnly } = require("../../middleware/auth");

const router = express.Router();

router.use(authMiddleware);
router.use(adminOnly);

// Garante colunas de pagamento em bases antigas
async function ensurePaidColumns(req, res, next) {
  try {
    await PosSale.sequelize.query(
      "ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS paid BOOLEAN DEFAULT FALSE;"
    );
    await PosSale.sequelize.query(
      "ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP NULL;"
    );
    await PosSale.sequelize.query(
      "ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS payment_batch VARCHAR(100) NULL;"
    );
  } catch (err) {
    console.error("Nao foi possivel garantir colunas de pagamento:", err);
  }
  next();
}

router.use(ensurePaidColumns);

// Relatório geral por período
router.get("/summary", async (req, res) => {
  try {
    const { start, end } = req.query;
    const where = {};
    if (start || end) {
      where.sale_datetime = {};
      if (start) where.sale_datetime[Op.gte] = new Date(start);
      if (end) where.sale_datetime[Op.lte] = new Date(`${end} 23:59:59`);
    }

    const totals = await PosSale.findOne({
      where,
      attributes: [
        [fn("SUM", col("PosSale.amount")), "bruto"],
        [fn("SUM", col("PosSale.fee_value")), "taxas"],
        [fn("SUM", col("PosSale.net_amount")), "liquido"],
        [fn("COUNT", col("PosSale.id")), "total_vendas"],
      ],
      raw: true,
    });

    // top cliente no período
    const topCliente = await PosSale.findOne({
      where,
      attributes: [
        "customer_id",
        [fn("SUM", col("PosSale.amount")), "soma"],
        [fn("COUNT", col("PosSale.id")), "qtd"],
      ],
      include: [{ model: Customer, as: "Customer", attributes: ["name"] }],
      group: ["customer_id", "Customer.id", "Customer.name"],
      order: [[literal("soma"), "DESC"]],
    });

    // maior venda
    const maiorVenda = await PosSale.findOne({
      where,
      attributes: ["id", "amount", "sale_datetime"],
      include: [
        { model: Customer, as: "Customer", attributes: ["name"] },
        { model: PosCompany, as: "PosCompany", attributes: ["name"] },
      ],
      order: [["amount", "DESC"]],
    });

    // top do dia (considera hoje)
    const hoje = new Date();
    const startDay = new Date(hoje.toISOString().slice(0, 10) + "T00:00:00");
    const endDay = new Date(hoje.toISOString().slice(0, 10) + "T23:59:59");
    const topDia = await PosSale.findOne({
      where: {
        sale_datetime: { [Op.between]: [startDay, endDay] },
      },
      attributes: [
        "customer_id",
        [fn("SUM", col("PosSale.amount")), "soma"],
        [fn("COUNT", col("PosSale.id")), "qtd"],
      ],
      include: [{ model: Customer, as: "Customer", attributes: ["name"] }],
      group: ["customer_id", "Customer.id", "Customer.name"],
      order: [[literal("soma"), "DESC"]],
    });

    res.json({
      totals,
      topCliente,
      topDia,
      maiorVenda,
    });
  } catch (err) {
    console.error("Erro em /api/pos/reports/summary:", err);
    res.status(500).json({ error: "Erro ao gerar relatório" });
  }
});

// Resumo para fechamento/pagamento
router.get("/payouts", async (req, res) => {
  try {
    let { start, end, pos_terminal_id, only_unpaid } = req.query;
    const where = {};
    if (start || end) {
      where.sale_datetime = {};
      if (start) where.sale_datetime[Op.gte] = new Date(start);
      if (end) where.sale_datetime[Op.lte] = new Date(`${end} 23:59:59`);
    }
    if (pos_terminal_id) where.pos_terminal_id = pos_terminal_id;
    if (only_unpaid === "true") {
      where.paid = { [Op.or]: [false, null] };
    }

    const list = await PosSale.findAll({
      where,
      include: [
        { model: Customer, as: "Customer" },
        { model: PosCompany, as: "PosCompany" },
        { model: PosTerminal, as: "PosTerminal" },
      ],
      order: [["sale_datetime", "DESC"]],
    });

    const totals = list.reduce(
      (acc, s) => {
        const bruto = Number(s.amount || 0);
        const taxa = Number(s.fee_value || 0);
        const liquido = Number(s.net_amount || 0);
        acc.bruto += bruto;
        acc.taxas += taxa;
        acc.liquido += liquido;
        if (s.paid) {
          acc.bruto_pago += bruto;
          acc.liquido_pago += liquido;
        } else {
          acc.bruto_a_pagar += bruto;
          acc.liquido_a_pagar += liquido;
        }
        return acc;
      },
      { bruto: 0, taxas: 0, liquido: 0, bruto_pago: 0, liquido_pago: 0, bruto_a_pagar: 0, liquido_a_pagar: 0 }
    );

    const topTerminal = await PosSale.findOne({
      where,
      attributes: [
        "pos_terminal_id",
        [fn("SUM", col("PosSale.amount")), "soma"],
        [fn("COUNT", col("PosSale.id")), "qtd"],
      ],
      include: [
        {
          model: PosTerminal,
          as: "PosTerminal",
          attributes: ["terminal_code"],
          include: [{ model: Customer, as: "Customer", attributes: ["name"] }],
        },
      ],
      group: [
        "pos_terminal_id",
        "PosTerminal.id",
        "PosTerminal.terminal_code",
        "PosTerminal->Customer.id",
        "PosTerminal->Customer.name",
      ],
      order: [[literal("soma"), "DESC"]],
    });

    const maiorVendaPeriodo = await PosSale.findOne({
      where,
      order: [["amount", "DESC"]],
      include: [
        { model: PosTerminal, as: "PosTerminal", attributes: ["terminal_code"] },
        { model: Customer, as: "Customer", attributes: ["name"] },
      ],
    });

    res.json({
      list,
      totals,
      topTerminal,
      maiorVendaPeriodo,
    });
  } catch (err) {
    console.error("Erro em /api/pos/reports/payouts:", err);
    res.status(500).json({ error: "Erro ao gerar resumo de pagamentos" });
  }
});

// Marca vendas como pagas
router.post("/payouts/mark-paid", async (req, res) => {
  try {
    let { sale_ids, start, end, pos_terminal_id } = req.body;
    const where = {};

    if (Array.isArray(sale_ids) && sale_ids.length) {
      where.id = sale_ids;
    } else {
      if (start || end) {
        where.sale_datetime = {};
        if (start) where.sale_datetime[Op.gte] = new Date(start);
        if (end) where.sale_datetime[Op.lte] = new Date(`${end} 23:59:59`);
      }
      if (pos_terminal_id) where.pos_terminal_id = pos_terminal_id;
      where.paid = { [Op.or]: [false, null] };
    }

    const batch = req.body.payment_batch || `fechamento-${Date.now()}`;
    const [count] = await PosSale.update(
      { paid: true, paid_at: new Date(), payment_batch: batch },
      { where }
    );

    res.json({ updated: count, batch });
  } catch (err) {
    console.error("Erro ao marcar vendas pagas:", err);
    res.status(500).json({ error: "Erro ao marcar vendas como pagas" });
  }
});

// Clientes inativos há > 30 dias
router.get("/inactive", async (_req, res) => {
  try {
    const limite = new Date();
    limite.setDate(limite.getDate() - 30);

    const ativosRows = await PosSale.findAll({
      attributes: ["customer_id"],
      where: { sale_datetime: { [Op.gte]: limite } },
      group: ["customer_id"],
      raw: true,
    });
    const ativosIds = ativosRows.map((r) => r.customer_id);

    const inativos = await Customer.findAll({
      where: {
        id: { [Op.notIn]: ativosIds.length ? ativosIds : [0] },
      },
      attributes: ["id", "name"],
      order: [["name", "ASC"]],
    });

    res.json(inativos);
  } catch (err) {
    console.error("Erro em /api/pos/reports/inactive:", err);
    res.status(500).json({ error: "Erro ao listar inativos" });
  }
});

module.exports = router;
