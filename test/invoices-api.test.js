const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const express = require("express");
const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");

process.env.JWT_SECRET = "segredo-de-teste-da-api";

const models = require("../src/models");
const invoicesRouter = require("../src/routes/invoices");

async function withServer(run) {
  const app = express();
  app.use(express.json());
  app.use("/api/invoices", invoicesRouter);

  const server = app.listen(0);
  await once(server, "listening");

  try {
    const { port } = server.address();
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("listagem de notas aplica busca, período e paginação sem alterar o contrato", async () => {
  const originalUserLookup = models.SystemUser.findByPk;
  const originalMembershipList = models.UserCompany.findAll;
  const originalInvoiceList = models.Invoice.findAndCountAll;
  let capturedOptions;

  models.SystemUser.findByPk = async () => ({
    id: 1,
    email: "operador@exemplo.com",
    is_admin: false,
    status: "ACTIVE",
    default_company_id: 20,
  });
  models.UserCompany.findAll = async () => [
    { Company: { id: 20, name: "Empresa teste", cnpj: "", is_active: true } },
  ];
  models.Invoice.findAndCountAll = async (options) => {
    capturedOptions = options;
    return { count: 0, rows: [] };
  };

  try {
    await withServer(async (baseUrl) => {
      const token = jwt.sign({ id: 1, is_admin: false }, process.env.JWT_SECRET);
      const response = await fetch(
        `${baseUrl}/api/invoices?search=Cliente&start=2026-09-01&end=2026-09-15&page=1&limit=50`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.deepEqual(body, {
        data: [],
        pagination: { total: 0, page: 1, limit: 50, pages: 0 },
      });
    });

    assert.equal(capturedOptions.limit, 50);
    assert.equal(capturedOptions.offset, 0);
    assert.equal(capturedOptions.subQuery, false);
    assert.ok(capturedOptions.where.issued_at[Op.gte] instanceof Date);
    assert.ok(capturedOptions.where.issued_at[Op.lte] instanceof Date);
    assert.equal(capturedOptions.where[Op.or].length, 4);
    assert.equal(capturedOptions.where.company_id, 20);
  } finally {
    models.SystemUser.findByPk = originalUserLookup;
    models.UserCompany.findAll = originalMembershipList;
    models.Invoice.findAndCountAll = originalInvoiceList;
  }
});

test("criação preserva taxa recebida e calcula somente quando ela não é enviada", async () => {
  const originalUserLookup = models.SystemUser.findByPk;
  const originalMembershipList = models.UserCompany.findAll;
  const originalInvoiceCreate = models.Invoice.create;
  const originalCustomerFind = models.Customer.findOne;
  const originalCompanyFind = models.Company.findOne;
  const originalAuditCreate = models.AuditLog.create;
  const createdPayloads = [];

  models.SystemUser.findByPk = async () => ({
    id: 1,
    email: "integracao@exemplo.com",
    is_admin: false,
    status: "ACTIVE",
    default_company_id: 20,
  });
  models.UserCompany.findAll = async () => [
    { Company: { id: 20, name: "Empresa teste", cnpj: "", is_active: true } },
  ];
  models.Customer.findOne = async () => ({ id: 10, company_id: 20 });
  models.Company.findOne = async () => ({ id: 20, is_active: true });
  models.Invoice.create = async (payload) => {
    createdPayloads.push(payload);
    return { id: createdPayloads.length, ...payload };
  };
  models.AuditLog.create = async () => ({});

  try {
    await withServer(async (baseUrl) => {
      const token = jwt.sign({ id: 1, is_admin: false }, process.env.JWT_SECRET);
      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };
      const basePayload = {
        customer_id: 10,
        company_id: 20,
        total_amount: 1000,
        paid_amount: 21,
        fee_percent: 2,
      };

      const calculatedResponse = await fetch(`${baseUrl}/api/invoices`, {
        method: "POST",
        headers,
        body: JSON.stringify(basePayload),
      });
      assert.equal(calculatedResponse.status, 201);

      const preservedResponse = await fetch(`${baseUrl}/api/invoices`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...basePayload, fee_value: 37.5 }),
      });
      assert.equal(preservedResponse.status, 201);
    });

    assert.equal(createdPayloads[0].fee_value, 21);
    assert.equal(createdPayloads[0].paid_amount, 21);
    assert.equal(createdPayloads[1].fee_value, 37.5);
  } finally {
    models.SystemUser.findByPk = originalUserLookup;
    models.UserCompany.findAll = originalMembershipList;
    models.Invoice.create = originalInvoiceCreate;
    models.Customer.findOne = originalCustomerFind;
    models.Company.findOne = originalCompanyFind;
    models.AuditLog.create = originalAuditCreate;
    await models.sequelize.close();
  }
});
