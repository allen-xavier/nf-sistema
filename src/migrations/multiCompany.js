const { DataTypes, QueryTypes } = require("sequelize");

const SCOPED_TABLES = [
  "customers",
  "pos_companies",
  "pos_terminals",
  "pos_customer_rates",
  "pos_sales",
];
const MIGRATION_KEY = "20260915_multi_company_v1";

async function tableExists(queryInterface, tableName) {
  const tables = await queryInterface.showAllTables();
  return tables.some((table) => {
    const name = typeof table === "string" ? table : table.tableName;
    return String(name).toLowerCase() === tableName.toLowerCase();
  });
}

async function columnExists(queryInterface, tableName, columnName) {
  if (!(await tableExists(queryInterface, tableName))) return false;
  const definition = await queryInterface.describeTable(tableName);
  return Boolean(definition[columnName]);
}

async function ensureColumn(queryInterface, tableName, columnName, definition) {
  if (!(await tableExists(queryInterface, tableName))) return;
  if (!(await columnExists(queryInterface, tableName, columnName))) {
    await queryInterface.addColumn(tableName, columnName, definition);
  }
}

async function ensureIndex(queryInterface, tableName, fields, options) {
  if (!(await tableExists(queryInterface, tableName))) return;
  const indexes = await queryInterface.showIndex(tableName);
  if (!indexes.some((index) => index.name === options.name)) {
    await queryInterface.addIndex(tableName, fields, options);
  }
}

async function removeSingleColumnUnique(queryInterface, sequelize, tableName, columnName) {
  if (!(await tableExists(queryInterface, tableName))) return;

  const constraints = await sequelize.query(
    `SELECT con.conname
       FROM pg_constraint con
       JOIN pg_class rel ON rel.oid = con.conrelid
       JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
       JOIN unnest(con.conkey) WITH ORDINALITY cols(attnum, ord) ON TRUE
       JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = cols.attnum
      WHERE nsp.nspname = current_schema()
        AND rel.relname = :tableName
        AND con.contype = 'u'
      GROUP BY con.conname
     HAVING COUNT(*) = 1 AND MAX(att.attname) = :columnName`,
    { replacements: { tableName, columnName }, type: QueryTypes.SELECT }
  );

  for (const constraint of constraints) {
    await queryInterface.removeConstraint(tableName, constraint.conname);
  }

  const indexes = await queryInterface.showIndex(tableName);
  for (const index of indexes) {
    const fields = (index.fields || []).map((field) => field.attribute || field.name);
    if (index.unique && fields.length === 1 && fields[0] === columnName && !index.primary) {
      await queryInterface.removeIndex(tableName, index.name);
    }
  }
}

async function resolveLegacyCompanyId(sequelize) {
  const companies = await sequelize.query(
    "SELECT id FROM companies ORDER BY id",
    { type: QueryTypes.SELECT }
  );
  if (!companies.length) return null;

  const configured = Number(process.env.LEGACY_COMPANY_ID || 12);
  if (Number.isInteger(configured) && companies.some((company) => Number(company.id) === configured)) {
    return configured;
  }
  if (companies.length === 1) return Number(companies[0].id);

  throw new Error(
    "Não foi possível identificar a empresa legada. Configure LEGACY_COMPANY_ID com o ID atual."
  );
}

async function ensureUserCompaniesTable(queryInterface) {
  if (await tableExists(queryInterface, "user_companies")) return;
  if (
    !(await tableExists(queryInterface, "system_users")) ||
    !(await tableExists(queryInterface, "companies"))
  ) {
    return;
  }

  await queryInterface.createTable("user_companies", {
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      references: { model: "system_users", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    company_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      references: { model: "companies", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  });
}

async function ensureMigrationsTable(queryInterface) {
  if (await tableExists(queryInterface, "app_migrations")) return;
  await queryInterface.createTable("app_migrations", {
    name: {
      type: DataTypes.STRING(150),
      allowNull: false,
      primaryKey: true,
    },
    applied_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  });
}

async function migrationWasApplied(sequelize) {
  const rows = await sequelize.query(
    "SELECT name FROM app_migrations WHERE name = :name",
    { replacements: { name: MIGRATION_KEY }, type: QueryTypes.SELECT }
  );
  return rows.length > 0;
}

async function ensureNotNull(queryInterface, sequelize, tableName, columnName) {
  const definition = await queryInterface.describeTable(tableName);
  if (definition[columnName]?.allowNull !== false) {
    await sequelize.query(
      `ALTER TABLE "${tableName}" ALTER COLUMN "${columnName}" SET NOT NULL`
    );
  }
}

async function runMultiCompanyMigration(sequelize) {
  const queryInterface = sequelize.getQueryInterface();

  if (!(await tableExists(queryInterface, "companies"))) {
    return { legacyCompanyId: null };
  }

  await ensureMigrationsTable(queryInterface);
  await ensureUserCompaniesTable(queryInterface);

  await ensureColumn(queryInterface, "system_users", "default_company_id", {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: "companies", key: "id" },
    onUpdate: "CASCADE",
    onDelete: "SET NULL",
  });
  await ensureColumn(queryInterface, "audit_logs", "company_id", {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: "companies", key: "id" },
    onUpdate: "CASCADE",
    onDelete: "SET NULL",
  });

  for (const tableName of SCOPED_TABLES) {
    await ensureColumn(queryInterface, tableName, "company_id", {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "companies", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    });
  }

  const alreadyApplied = await migrationWasApplied(sequelize);
  const legacyCompanyId = alreadyApplied ? null : await resolveLegacyCompanyId(sequelize);

  if (!alreadyApplied && legacyCompanyId == null) {
    await sequelize.query(
      "INSERT INTO app_migrations (name, applied_at) VALUES (:name, NOW()) ON CONFLICT (name) DO NOTHING",
      { replacements: { name: MIGRATION_KEY } }
    );
    return { legacyCompanyId: null };
  }

  const has = {};
  for (const tableName of [
    "customers",
    "invoices",
    "audit_logs",
    "system_users",
    "user_companies",
    ...SCOPED_TABLES,
  ]) {
    has[tableName] = await tableExists(queryInterface, tableName);
  }

  if (!alreadyApplied && has.customers && has.invoices) {
    const ambiguousCustomers = await sequelize.query(
      `SELECT customer_id
         FROM invoices
        GROUP BY customer_id
       HAVING COUNT(DISTINCT company_id) > 1
        LIMIT 1`,
      { type: QueryTypes.SELECT }
    );
    if (ambiguousCustomers.length) {
      throw new Error(
        "Migração multiempresa interrompida: há cliente ligado a notas de mais de uma empresa."
      );
    }
  }

  if (!alreadyApplied) await sequelize.transaction(async (transaction) => {
    if (has.customers && has.invoices) {
      await sequelize.query(
        `UPDATE customers c
          SET company_id = COALESCE(
            (SELECT MIN(i.company_id)
               FROM invoices i
              WHERE i.customer_id = c.id
             HAVING COUNT(DISTINCT i.company_id) = 1),
            :legacyCompanyId
          )
         WHERE c.company_id IS NULL`,
        { replacements: { legacyCompanyId }, transaction }
      );
    } else if (has.customers) {
      await sequelize.query(
        "UPDATE customers SET company_id = :legacyCompanyId WHERE company_id IS NULL",
        { replacements: { legacyCompanyId }, transaction }
      );
    }

    if (has.pos_companies) {
      await sequelize.query(
        "UPDATE pos_companies SET company_id = :legacyCompanyId WHERE company_id IS NULL",
        { replacements: { legacyCompanyId }, transaction }
      );
    }
    if (has.pos_terminals && has.customers) {
      await sequelize.query(
        `UPDATE pos_terminals t
          SET company_id = COALESCE(
            (SELECT c.company_id FROM customers c WHERE c.id = t.customer_id),
            :legacyCompanyId
          )
         WHERE t.company_id IS NULL`,
        { replacements: { legacyCompanyId }, transaction }
      );
    } else if (has.pos_terminals) {
      await sequelize.query(
        "UPDATE pos_terminals SET company_id = :legacyCompanyId WHERE company_id IS NULL",
        { replacements: { legacyCompanyId }, transaction }
      );
    }
    if (has.pos_customer_rates && has.customers) {
      await sequelize.query(
        `UPDATE pos_customer_rates r
          SET company_id = COALESCE(
            (SELECT c.company_id FROM customers c WHERE c.id = r.customer_id),
            :legacyCompanyId
          )
         WHERE r.company_id IS NULL`,
        { replacements: { legacyCompanyId }, transaction }
      );
    } else if (has.pos_customer_rates) {
      await sequelize.query(
        "UPDATE pos_customer_rates SET company_id = :legacyCompanyId WHERE company_id IS NULL",
        { replacements: { legacyCompanyId }, transaction }
      );
    }
    if (has.pos_sales && has.customers) {
      await sequelize.query(
        `UPDATE pos_sales s
          SET company_id = COALESCE(
            (SELECT c.company_id FROM customers c WHERE c.id = s.customer_id),
            :legacyCompanyId
          )
         WHERE s.company_id IS NULL`,
        { replacements: { legacyCompanyId }, transaction }
      );
    } else if (has.pos_sales) {
      await sequelize.query(
        "UPDATE pos_sales SET company_id = :legacyCompanyId WHERE company_id IS NULL",
        { replacements: { legacyCompanyId }, transaction }
      );
    }
    if (has.system_users) {
      await sequelize.query(
        "UPDATE system_users SET default_company_id = :legacyCompanyId WHERE default_company_id IS NULL",
        { replacements: { legacyCompanyId }, transaction }
      );
    }
    if (has.system_users && has.user_companies) {
      await sequelize.query(
        `INSERT INTO user_companies (user_id, company_id, created_at)
       SELECT id, :legacyCompanyId, NOW()
         FROM system_users
        ON CONFLICT (user_id, company_id) DO NOTHING`,
        { replacements: { legacyCompanyId }, transaction }
      );
    }
    await sequelize.query(
      "INSERT INTO app_migrations (name, applied_at) VALUES (:name, NOW()) ON CONFLICT (name) DO NOTHING",
      { replacements: { name: MIGRATION_KEY }, transaction }
    );
  });

  for (const tableName of SCOPED_TABLES) {
    if (await columnExists(queryInterface, tableName, "company_id")) {
      await ensureNotNull(queryInterface, sequelize, tableName, "company_id");
      await ensureIndex(queryInterface, tableName, ["company_id"], {
        name: `${tableName}_company_id_idx`,
      });
    }
  }

  await removeSingleColumnUnique(queryInterface, sequelize, "customers", "whatsapp_number");
  await ensureIndex(queryInterface, "customers", ["company_id", "whatsapp_number"], {
    name: "customers_company_whatsapp_unique",
    unique: true,
  });
  await ensureIndex(queryInterface, "invoices", ["company_id"], {
    name: "invoices_company_id_idx",
  });
  await ensureIndex(queryInterface, "invoices", ["company_id", "issued_at"], {
    name: "invoices_company_issued_at_idx",
  });

  await removeSingleColumnUnique(queryInterface, sequelize, "pos_companies", "cnpj");
  await ensureIndex(queryInterface, "pos_companies", ["company_id", "cnpj"], {
    name: "pos_companies_company_cnpj_unique",
    unique: true,
  });

  return { legacyCompanyId };
}

module.exports = { runMultiCompanyMigration };
