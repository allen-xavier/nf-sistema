const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const express = require("express");
const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");

process.env.JWT_SECRET = "segredo-de-teste-dos-relatorios";

const models = require("../src/models");
const reportsRouter = require("../src/routes/reports");

test("resumo aplica o período informado a todas as consultas", async () => {
  const originalUserLookup = models.SystemUser.findByPk;
  const originalInvoiceFindOne = models.Invoice.findOne;
  const originalInvoiceFindAll = models.Invoice.findAll;
  const capturedWhere = [];

  models.SystemUser.findByPk = async () => ({
    id: 1,
    email: "operador@exemplo.com",
    is_admin: false,
    status: "ACTIVE",
  });
  models.Invoice.findOne = async (options) => {
    capturedWhere.push(options.where);
    return { total_notas: "0", soma_valor_total: null, soma_taxas: null };
  };
  models.Invoice.findAll = async (options) => {
    capturedWhere.push(options.where);
    return [];
  };

  const app = express();
  app.use("/api/reports", reportsRouter);
  const server = app.listen(0);
  await once(server, "listening");

  try {
    const { port } = server.address();
    const token = jwt.sign({ id: 1, is_admin: false }, process.env.JWT_SECRET);
    const response = await fetch(
      `http://127.0.0.1:${port}/api/reports/summary?start=2026-09-14&end=2026-09-14`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    assert.equal(response.status, 200);
    assert.equal(capturedWhere.length, 6);

    for (const where of capturedWhere) {
      assert.ok(where.issued_at);
      assert.equal(
        where.issued_at[Op.gte].toISOString(),
        "2026-09-14T03:00:00.000Z"
      );
      assert.equal(
        where.issued_at[Op.lte].toISOString(),
        "2026-09-15T02:59:59.999Z"
      );
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    models.SystemUser.findByPk = originalUserLookup;
    models.Invoice.findOne = originalInvoiceFindOne;
    models.Invoice.findAll = originalInvoiceFindAll;
    await models.sequelize.close();
  }
});
