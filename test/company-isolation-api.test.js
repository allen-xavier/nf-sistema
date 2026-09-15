const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const express = require("express");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "segredo-de-teste-multiempresa";

const models = require("../src/models");
const customersRouter = require("../src/routes/customers");

async function withServer(run) {
  const app = express();
  app.use(express.json());
  app.use("/api/customers", customersRouter);
  const server = app.listen(0);
  await once(server, "listening");
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("clientes são consultados somente dentro de uma empresa autorizada", async () => {
  const originals = {
    userFind: models.SystemUser.findByPk,
    memberships: models.UserCompany.findAll,
    customerList: models.Customer.findAll,
  };
  const captured = [];

  models.SystemUser.findByPk = async () => ({
    id: 1,
    email: "admin@exemplo.com",
    is_admin: true,
    status: "ACTIVE",
    default_company_id: 12,
  });
  models.UserCompany.findAll = async () => [
    { Company: { id: 12, name: "Empresa atual", cnpj: "", is_active: true } },
    { Company: { id: 13, name: "Empresa nova", cnpj: "", is_active: true } },
  ];
  models.Customer.findAll = async (options) => {
    captured.push(options.where);
    return [];
  };

  try {
    await withServer(async (baseUrl) => {
      const token = jwt.sign({ id: 1, is_admin: true }, process.env.JWT_SECRET);
      const allowed = await fetch(`${baseUrl}/api/customers?whatsapp_number=5511999999999`, {
        headers: { Authorization: `Bearer ${token}`, "X-Company-Id": "13" },
      });
      assert.equal(allowed.status, 200);
      assert.equal(captured[0].company_id, 13);
      assert.equal(captured[0].whatsapp_number, "5511999999999");

      const denied = await fetch(`${baseUrl}/api/customers`, {
        headers: { Authorization: `Bearer ${token}`, "X-Company-Id": "99" },
      });
      assert.equal(denied.status, 403);
      assert.equal(captured.length, 1);

      const conflict = await fetch(`${baseUrl}/api/customers`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Company-Id": "13",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          company_id: 12,
          name: "Cliente",
          whatsapp_number: "5511888888888",
          fee_percent: 2,
        }),
      });
      assert.equal(conflict.status, 400);
      assert.match((await conflict.json()).error, /conflitante/);
    });
  } finally {
    models.SystemUser.findByPk = originals.userFind;
    models.UserCompany.findAll = originals.memberships;
    models.Customer.findAll = originals.customerList;
    await models.sequelize.close();
  }
});
