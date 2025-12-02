const express = require("express");
const { Op, fn, col, literal } = require("sequelize");
const { PosSale, Customer, PosCompany, PosTerminal } = require("../../models");
const { authMiddleware, adminOnly } = require("../../middleware/auth");

const router = express.Router();

router.use(authMiddleware);
router.use(adminOnly);

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
        [fn("SUM", col("amount")), "bruto"],
        [fn("SUM", col("fee_value")), "taxas"],
        [fn("SUM", col("net_amount")), "liquido"],
        [fn("COUNT", col("id")), "total_vendas"],
      ],
      raw: true,
    });

    // top cliente no período
    const topCliente = await PosSale.findOne({
      where,
      attributes: [
        "customer_id",
        [fn("SUM", col("amount")), "soma"],
        [fn("COUNT", col("id")), "qtd"],
      ],
      include: [{ model: Customer, as: "Customer", attributes: ["name"] }],
      group: ["customer_id", "Customer.id", "Customer.name"],
      order: [[literal("soma"), "DESC"]],
      raw: true,
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
        [fn("SUM", col("amount")), "soma"],
        [fn("COUNT", col("id")), "qtd"],
      ],
      include: [{ model: Customer, as: "Customer", attributes: ["name"] }],
      group: ["customer_id", "Customer.id", "Customer.name"],
      order: [[literal("soma"), "DESC"]],
      raw: true,
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
