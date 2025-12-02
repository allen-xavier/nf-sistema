const express = require("express");
const { Op, fn, col, literal } = require("sequelize");
const { Invoice, Customer, Company } = require("../models");
const { authMiddleware, adminOnly } = require("../middleware/auth");

const router = express.Router();

// Proteção – igual ao arquivo antigo
router.use(authMiddleware);
router.use(adminOnly);

/**
 * GET /api/reports/summary
 * Query: start, end, customer_id, group_by=day|month
 */
router.get("/summary", async (req, res) => {
  try {
    const { start, end, customer_id, group_by } = req.query;

    const where = {};

    // FILTROS DE DATA
    if (start || end) {
      where.issued_at = {};
      if (start) where.issued_at[Op.gte] = new Date(start);
      if (end)
        where.issued_at[Op.lte] = new Date(end + "T23:59:59");
    }

    if (customer_id) {
      where.customer_id = customer_id;
    }

    // ============================================================
    // 1) TOTAL GERAL
    // ============================================================
    const totalsRow = await Invoice.findOne({
      where,
      attributes: [
        [fn("COUNT", col("id")), "total_notas"],
        [fn("SUM", col("total_amount")), "soma_valor_total"],
        [fn("SUM", col("fee_value")), "soma_taxas"],
      ],
      raw: true,
    });

    const totals = {
      total_notas: Number(totalsRow.total_notas || 0),
      soma_valor_total: Number(totalsRow.soma_valor_total || 0),
      soma_taxas: Number(totalsRow.soma_taxas || 0),
    };

    // ============================================================
    // 2) POR STATUS (para cards e dashboards)
    // ============================================================
    const porStatus = await Invoice.findAll({
      where,
      attributes: [
        "status",
        [fn("COUNT", col("id")), "total_notas"],
      ],
      group: ["status"],
      raw: true,
    });

    // ============================================================
    // 3) POR DIA (últimos 30 dias) – Dashboard
    // ============================================================
    let where30 = { ...where };
    if (!where30.issued_at) where30.issued_at = {};

    const hoje = new Date();
    const dt30 = new Date();
    dt30.setDate(hoje.getDate() - 30);

    if (!where30.issued_at[Op.gte]) {
      where30.issued_at[Op.gte] = dt30;
    }

    const porDiaBD = await Invoice.findAll({
      where: where30,
      attributes: [
        [literal(`DATE("issued_at")`), "data"],
        [fn("COUNT", col("id")), "total_notas"],
      ],
      group: [literal(`DATE("issued_at")`)],
      order: [literal(`DATE("issued_at") ASC`)],
      raw: true,
    });

    const porDia = porDiaBD.map((row) => {
      const d = new Date(row.data);
      const dia = String(d.getDate()).padStart(2, "0");
      const mes = String(d.getMonth() + 1).padStart(2, "0");
      return {
        date: row.data,
        label: `${dia}/${mes}`,
        total_notas: Number(row.total_notas),
      };
    });

    // ============================================================
    // 4) POR PERÍODO (para relatório) - day|month
    // ============================================================
    const groupBy = group_by === "month" ? "month" : "day";
    let groupExpr, labelExpr;

    if (groupBy === "month") {
      groupExpr = literal(`DATE_TRUNC('month', "issued_at")`);
      labelExpr = literal(
        `TO_CHAR(DATE_TRUNC('month', "issued_at"), 'MM/YYYY')`
      );
    } else {
      groupExpr = literal(`DATE("issued_at")`);
      labelExpr = literal(
        `TO_CHAR(DATE("issued_at"), 'DD/MM')`
      );
    }

    const porPeriodo = await Invoice.findAll({
      where,
      attributes: [
        [groupExpr, "periodo"],
        [labelExpr, "label"],
        [fn("COUNT", col("id")), "total_notas"],
        [fn("SUM", col("total_amount")), "soma_valor_total"],
      ],
      group: [groupExpr, labelExpr],
      order: [groupExpr],
      raw: true,
    });

    // ============================================================
    // 5) POR CLIENTE
    // ============================================================
    const porCliente = await Invoice.findAll({
      where,
      include: [{ model: Customer, attributes: ["name"] }],
      attributes: [
        "customer_id",
        [fn("COUNT", col("Invoice.id")), "total_notas"],
        [fn("SUM", col("total_amount")), "soma_valor_total"],
        [fn("SUM", col("fee_value")), "soma_taxas"],
      ],
      group: ["customer_id", "Customer.id", "Customer.name"],
      raw: true,
    }).then((rows) =>
      rows.map((r) => ({
        customer_id: r.customer_id,
        name: r["Customer.name"],
        total_notas: Number(r.total_notas),
        soma_valor_total: Number(r.soma_valor_total),
        soma_taxas: Number(r.soma_taxas),
      }))
    );

    // ============================================================
    // 6) POR EMPRESA
    // ============================================================
    const porEmpresa = await Invoice.findAll({
      where,
      include: [{ model: Company, attributes: ["name"] }],
      attributes: [
        "company_id",
        [fn("COUNT", col("Invoice.id")), "total_notas"],
        [fn("SUM", col("total_amount")), "soma_valor_total"],
      ],
      group: ["company_id", "Company.id", "Company.name"],
      raw: true,
    }).then((rows) =>
      rows.map((r) => ({
        company_id: r.company_id,
        name: r["Company.name"],
        total_notas: Number(r.total_notas),
        soma_valor_total: Number(r.soma_valor_total),
      }))
    );

    // ============================================================
    // RESPOSTA FINAL COMPLETA
    // ============================================================
    res.json({
      totals,
      porStatus,
      porDia,
      porPeriodo,
      porCliente,
      porEmpresa,
    });

  } catch (err) {
    console.error("Erro em /api/reports/summary:", err);
    res.status(500).json({ error: "Erro ao gerar relatório" });
  }
});

module.exports = router;
