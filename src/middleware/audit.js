const { AuditLog } = require('../models');

/**
 * Registra ação de auditoria
 */
async function audit(userId, action, resourceType, resourceId, details, req) {
  try {
    await AuditLog.create({
      user_id: userId || null,
      action,
      resource_type: resourceType || null,
      resource_id: resourceId || null,
      details: details || null,
      ip_address: req?.ip || req?.connection?.remoteAddress || null,
    });
  } catch (err) {
    console.error('[AUDIT] Falha ao registrar auditoria:', err.message);
  }
}

module.exports = { audit };
