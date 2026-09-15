const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const express = require("express");
const bcrypt = require("bcryptjs");

const models = require("../src/models");
const { hashToken } = require("../src/utils/tokens");
const authExtraRouter = require("../src/routes/authExtra");

test("redefinição de senha consome o token e salva uma senha protegida", async () => {
  const rawToken = "a".repeat(64);
  const resetRecord = {
    user_id: 9,
    status: "PENDING",
    expires_at: new Date(Date.now() + 60_000),
    used_at: null,
    async save() {},
  };
  const userRecord = {
    id: 9,
    status: "ACTIVE",
    password_hash: null,
    async save() {},
  };

  const originals = {
    resetFind: models.PasswordResetToken.findOne,
    resetUpdate: models.PasswordResetToken.update,
    userFind: models.SystemUser.findByPk,
    auditCreate: models.AuditLog.create,
    transaction: models.sequelize.transaction,
  };

  models.PasswordResetToken.findOne = async ({ where }) => {
    assert.equal(where.token_hash, hashToken(rawToken));
    return resetRecord;
  };
  models.PasswordResetToken.update = async () => [0];
  models.SystemUser.findByPk = async () => userRecord;
  models.AuditLog.create = async () => ({});
  models.sequelize.transaction = async (callback) => callback({});

  const app = express();
  app.use(express.json());
  app.use("/api/auth", authExtraRouter);
  const server = app.listen(0);
  await once(server, "listening");

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: rawToken,
        password: "novaSenha123",
        password_confirmation: "novaSenha123",
      }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    assert.equal(resetRecord.status, "USED");
    assert.ok(resetRecord.used_at instanceof Date);
    assert.equal(await bcrypt.compare("novaSenha123", userRecord.password_hash), true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    models.PasswordResetToken.findOne = originals.resetFind;
    models.PasswordResetToken.update = originals.resetUpdate;
    models.SystemUser.findByPk = originals.userFind;
    models.AuditLog.create = originals.auditCreate;
    models.sequelize.transaction = originals.transaction;
    await models.sequelize.close();
  }
});
