const express = require("express");
const { Op, fn, col, literal } = require("sequelize");
const { Invoice, Customer, Company } = require("../models");
const { authMiddleware, companyContext } = require("../middleware/auth");

const router = express.Router();

router.use(authMiddleware);
router.use(companyContext);

function buildDateWhere(base = {}, start, end) {
  const where = { ...base };
  const issuedFilter = {};
  if (start) {
    const parsed = parseDateBoundary(start);
    if (!parsed) throw createDateError("Data inicial inválida.");
    issuedFilter[Op.gte] = parsed;
  }
  if (end) {
    const parsed = parseDateBoundary(end, true);
    if (!parsed) throw createDateError("Data final inválida.");
    issuedFilter[Op.lte] = parsed;
  }
  // Os operadores do Sequelize (Op.gte/Op.lte) são Symbols e, por isso,
  // não aparecem em Object.keys(). Verificamos os parâmetros recebidos para
  // garantir que o período seja realmente anexado à consulta.
  if (start || end) {
    where.issued_at = issuedFilter;
  }
  return where;
}

function parseDateBoundary(value, endOfDay = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const time = endOfDay ? "T23:59:59.999-03:00" : "T00:00:00-03:00";
  const parsed = new Date(`${value}${time}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function createDateError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

/**
 * -------------------------------------------------------------
 * DASHBOARD / VISÃO GERAL
 * GET /api/reports/summary
 * -------------------------------------------------------------
 *
 * Frontend espera:
 *  - totals
 *  - porDia      (para gráfico do dashboard)
 *  - porStatus   (para gráfico de pizza do dashboard)
 *  - porPeriodo  (para tela de Relatórios / Visão geral)
 *  - porCliente  (top clientes)
 *  - porEmpresa  (top empresas)
 */
router.get("/summary", async (req, res) => {
  try {
    const { start, end, group_by = "day" } = req.query;

    const where = buildDateWhere({ company_id: req.companyId }, start, end);

    // 1️⃣ Totais gerais
    const totals = await Invoice.findOne({
      where,
      attributes: [
        [fn("COUNT", col("id")), "total_notas"],
        [fn("SUM", col("total_amount")), "soma_valor_total"],
        [fn("SUM", col("paid_amount")), "soma_taxas"],
      ],
      raw: true,
    });

    // 2️⃣ Dados por DIA (para o dashboard: gráfico "Notas por dia (últimos 30 dias)")
    //    Aqui vamos sempre agrupar por dia (DD/MM), independente do group_by.
    //    Opcionalmente você poderia limitar aos últimos 30 dias. Vou deixar sem limite
    //    de datas, respeitando o filtro start/end se vierem da query.
    const porDia = await Invoice.findAll({
      where,
      attributes: [
        [literal("TO_CHAR(issued_at, 'DD/MM')"), "label"],
        [literal("TO_CHAR(issued_at, 'YYYY-MM-DD')"), "period_key"],
        [fn("COUNT", col("id")), "total_notas"],
      ],
      group: ["label", "period_key"],
      raw: true,
      order: [literal("MIN(issued_at)")],
    });

    // 3️⃣ Agrupado por período (dia ou mês) – usado na aba "Relatórios / Visão geral"
    const dateFormat =
      group_by === "month"
        ? "TO_CHAR(issued_at, 'MM/YYYY')"
        : "TO_CHAR(issued_at, 'DD/MM')";
    const periodKeyFormat =
      group_by === "month"
        ? "TO_CHAR(issued_at, 'YYYY-MM')"
        : "TO_CHAR(issued_at, 'YYYY-MM-DD')";

    const porPeriodo = await Invoice.findAll({
      where,
      attributes: [
        [literal(dateFormat), "label"],
        [literal(periodKeyFormat), "period_key"],
        [fn("COUNT", col("id")), "total_notas"],
        [fn("SUM", col("total_amount")), "soma_valor_total"],
        [fn("SUM", col("paid_amount")), "soma_taxas"],
      ],
      group: ["label", "period_key"],
      raw: true,
      order: [literal("MIN(issued_at)")],
    });

    // 4️⃣ Por status – usado no gráfico de pizza do dashboard
    const porStatus = await Invoice.findAll({
      where,
      attributes: [
        "status",
        [fn("COUNT", col("id")), "total_notas"],
      ],
      group: ["status"],
      raw: true,
    });

    // 5️⃣ Top clientes (para relatórios)
    const topClientesRaw = await Invoice.findAll({
      where,
      include: [{ model: Customer, as: "Customer", attributes: [] }],
      attributes: [
        "customer_id",
        [fn("COUNT", col("Invoice.id")), "total_notas"],
        [fn("SUM", col("Invoice.total_amount")), "soma_valor_total"],
        [col("Customer.name"), "customer_name"],
      ],
      group: ["customer_id", "Customer.id", "Customer.name"],
      order: [[fn("SUM", col("Invoice.total_amount")), "DESC"]],
      raw: true,
    });

    const porCliente = topClientesRaw.map((c) => ({
      customer_id: c.customer_id,
      total_notas: Number(c.total_notas || 0),
      soma_valor_total: c.soma_valor_total,
      name: c.customer_name || null,
    }));

    // 6️⃣ Top empresas (para relatórios)
    const topEmpresasRaw = await Invoice.findAll({
      where,
      include: [{ model: Company, as: "Company", attributes: [] }],
      attributes: [
        "company_id",
        [fn("COUNT", col("Invoice.id")), "total_notas"],
        [fn("SUM", col("Invoice.total_amount")), "soma_valor_total"],
        [col("Company.name"), "company_name"],
      ],
      group: ["company_id", "Company.id", "Company.name"],
      order: [[fn("SUM", col("Invoice.total_amount")), "DESC"]],
      raw: true,
    });

    const porEmpresa = topEmpresasRaw.map((e) => ({
      company_id: e.company_id,
      total_notas: Number(e.total_notas || 0),
      soma_valor_total: e.soma_valor_total,
      name: e.company_name || null,
    }));

    res.json({
      totals,
      porDia,      // 👈 para o dashboard
      porStatus,   // 👈 para o dashboard (pizza)
      porPeriodo,  // 👈 para aba Relatórios / Visão geral
      porCliente,
      porEmpresa,
    });
  } catch (err) {
    console.error("Erro em /api/reports/summary:", err);
    res.status(err.status || 500).json({ error: err.status ? err.message : "Erro ao gerar resumo" });
  }
});

/**
 * -------------------------------------------------------------
 * RELATÓRIO POR CLIENTE
 * GET /api/reports/cliente/:id
 * -------------------------------------------------------------
 */
router.get("/cliente/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { start, end, group_by = "day" } = req.query;

    const cliente = await Customer.findOne({ where: { id, company_id: req.companyId } });
    if (!cliente) {
      return res.status(404).json({ error: "Cliente não encontrado" });
    }

    const where = buildDateWhere(
      { customer_id: id, company_id: req.companyId },
      start,
      end
    );

    // Notas do cliente (com empresa junto)
    const notas = await Invoice.findAll({
      where,
      include: [{ model: Company, as: "Company" }],
      order: [["issued_at", "DESC"]],
    });

    // Totais do cliente
    const totais = await Invoice.findOne({
      where,
      attributes: [
        [fn("COUNT", col("id")), "total_notas"],
        [fn("SUM", col("total_amount")), "soma_valor_total"],
        [fn("SUM", col("paid_amount")), "soma_taxas"],
      ],
      raw: true,
    });

    // Agrupado por período
    const dateFormat =
      group_by === "month"
        ? "TO_CHAR(issued_at, 'MM/YYYY')"
        : "TO_CHAR(issued_at, 'DD/MM')";
    const periodKeyFormat =
      group_by === "month"
        ? "TO_CHAR(issued_at, 'YYYY-MM')"
        : "TO_CHAR(issued_at, 'YYYY-MM-DD')";

    const porPeriodo = await Invoice.findAll({
      where,
      attributes: [
        [literal(dateFormat), "label"],
        [literal(periodKeyFormat), "period_key"],
        [fn("COUNT", col("id")), "total_notas"],
        [fn("SUM", col("total_amount")), "soma_valor_total"],
      ],
      group: ["label", "period_key"],
      raw: true,
      order: [literal("label ASC")],
    });

    // Agrupado por empresa (onde esse cliente emite)
    const porEmpresaRaw = await Invoice.findAll({
      where,
      include: [{ model: Company, as: "Company", attributes: [] }],
      attributes: [
        "company_id",
        [fn("COUNT", col("Invoice.id")), "total_notas"],
        [fn("SUM", col("Invoice.total_amount")), "soma_valor_total"],
        [col("Company.name"), "company_name"],
      ],
      group: ["company_id", "Company.id"],
      raw: true,
      order: [[literal("soma_valor_total"), "DESC"]],
    });

    const porEmpresa = porEmpresaRaw.map((e) => ({
      company_id: e.company_id,
      total_notas: Number(e.total_notas || 0),
      soma_valor_total: e.soma_valor_total,
      name: e.company_name || null,
    }));

    res.json({
      cliente,
      totais,
      notas,
      porPeriodo,
      porEmpresa,
    });
  } catch (err) {
    console.error("Erro em /api/reports/cliente/:id", err);
    res.status(err.status || 500).json({ error: err.status ? err.message : "Erro ao gerar relatório do cliente" });
  }
});

/**
 * -------------------------------------------------------------
 * RELATÓRIO POR EMPRESA
 * GET /api/reports/empresa/:id
 * -------------------------------------------------------------
 */
router.get("/empresa/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { start, end, group_by = "day" } = req.query;

    const empresa = Number(id) === req.companyId
      ? await Company.findByPk(id)
      : null;
    if (!empresa) {
      return res.status(404).json({ error: "Empresa não encontrada" });
    }

    const where = buildDateWhere({ company_id: id }, start, end);

    // Notas da empresa (com cliente junto)
    const notas = await Invoice.findAll({
      where,
      include: [{ model: Customer, as: "Customer" }],
      order: [["issued_at", "DESC"]],
    });

    // Totais da empresa
    const totais = await Invoice.findOne({
      where,
      attributes: [
        [fn("COUNT", col("id")), "total_notas"],
        [fn("SUM", col("total_amount")), "soma_valor_total"],
      ],
      raw: true,
    });

    // Agrupado por período
    const dateFormat =
      group_by === "month"
        ? "TO_CHAR(issued_at, 'MM/YYYY')"
        : "TO_CHAR(issued_at, 'DD/MM')";
    const periodKeyFormat =
      group_by === "month"
        ? "TO_CHAR(issued_at, 'YYYY-MM')"
        : "TO_CHAR(issued_at, 'YYYY-MM-DD')";

    const porPeriodo = await Invoice.findAll({
      where,
      attributes: [
        [literal(dateFormat), "label"],
        [literal(periodKeyFormat), "period_key"],
        [fn("COUNT", col("id")), "total_notas"],
        [fn("SUM", col("total_amount")), "soma_valor_total"],
      ],
      group: ["label", "period_key"],
      raw: true,
      order: [literal("label ASC")],
    });

    // Agrupado por cliente
    const porClienteRaw = await Invoice.findAll({
      where,
      include: [{ model: Customer, as: "Customer", attributes: [] }],
      attributes: [
        "customer_id",
        [fn("COUNT", col("Invoice.id")), "total_notas"],
        [fn("SUM", col("Invoice.total_amount")), "soma_valor_total"],
        [col("Customer.name"), "customer_name"],
      ],
      group: ["customer_id", "Customer.id"],
      raw: true,
      order: [[literal("soma_valor_total"), "DESC"]],
    });

    const porCliente = porClienteRaw.map((c) => ({
      customer_id: c.customer_id,
      total_notas: Number(c.total_notas || 0),
      soma_valor_total: c.soma_valor_total,
      name: c.customer_name || null,
    }));

    res.json({
      empresa,
      totais,
      notas,
      porPeriodo,
      porCliente,
    });
  } catch (err) {
    console.error("Erro em /api/reports/empresa/:id", err);
    res.status(err.status || 500).json({ error: err.status ? err.message : "Erro ao gerar relatório da empresa" });
  }
});

module.exports = router;



