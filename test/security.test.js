const test = require("node:test");
const assert = require("node:assert/strict");

const { generateToken, hashToken, safeCompare } = require("../src/utils/tokens");
const { getJwtSecret, getJwtExpiresIn } = require("../src/config/security");
const { calculateInvoiceFee } = require("../src/utils/fees");

test("tokens aleatórios têm tamanho e hash esperados", () => {
  const first = generateToken();
  const second = generateToken();

  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, second);
  assert.match(hashToken(first), /^[a-f0-9]{64}$/);
  assert.equal(safeCompare(hashToken(first), hashToken(first)), true);
  assert.equal(safeCompare(hashToken(first), hashToken(second)), false);
});

test("cálculo padrão da taxa respeita mínimo e acréscimo", () => {
  assert.equal(calculateInvoiceFee(100, 2), 12);
  assert.equal(calculateInvoiceFee(1000, 2), 21);
  assert.equal(calculateInvoiceFee(2500, 2), 50);
});

test("JWT exige segredo explícito e respeita a duração configurada", () => {
  const previousSecret = process.env.JWT_SECRET;
  const previousExpiration = process.env.JWT_EXPIRES_IN;

  try {
    delete process.env.JWT_SECRET;
    delete process.env.JWT_EXPIRES_IN;
    assert.throws(() => getJwtSecret(), /JWT_SECRET/);
    assert.equal(getJwtExpiresIn(), "1d");

    process.env.JWT_SECRET = "segredo-de-teste";
    process.env.JWT_EXPIRES_IN = "2h";
    assert.equal(getJwtSecret(), "segredo-de-teste");
    assert.equal(getJwtExpiresIn(), "2h");
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;

    if (previousExpiration === undefined) delete process.env.JWT_EXPIRES_IN;
    else process.env.JWT_EXPIRES_IN = previousExpiration;
  }
});
