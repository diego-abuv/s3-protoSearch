import express from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import { all, get, run, save, logAudit } from '../db/sqlite.js';
import { validatePassword, validateUsername, sanitizeInput } from '../utils/validation.js';

const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente.' },
});

export function createAdminRoutes() {
  const router = express.Router();
  router.use(adminLimiter);

  router.get('/admin/users', authMiddleware, adminMiddleware, (req, res) => {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;

    const total = get('SELECT COUNT(*) as total FROM users');
    const users = all(
      `SELECT u.id, u.username, u.role, u.blocked,
        (SELECT MAX(created_at) FROM audit_log WHERE user_id = u.id AND action = 'login') as last_login,
        (SELECT COUNT(*) FROM refresh_tokens WHERE user_id = u.id AND revoked = 0 AND expires_at > datetime('now')) > 0 as is_online
      FROM users u
      ORDER BY u.id ASC
      LIMIT ? OFFSET ?`,
      [limit, offset],
    );

    res.json({ message: 'Lista de usuários', users, total: total.total, page, limit });
  });

  router.post('/admin/users', authMiddleware, adminMiddleware, (req, res) => {
    let { username, password, role } = req.body;
    username = sanitizeInput(username);
    password = sanitizeInput(password);
    if (!username || !password) {
      return res.status(400).json({ error: 'username e password são obrigatórios' });
    }
    const userError = validateUsername(username);
    if (userError) return res.status(400).json({ error: userError });
    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }
    const existing = get('SELECT id FROM users WHERE username = ?', [username]);
    if (existing) {
      return res.status(409).json({ error: 'usuário já existe' });
    }
    const password_hash = bcrypt.hashSync(password, 10);
    run('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', [
      username,
      password_hash,
      role || 'user',
    ]);
    save();

    logAudit({
      user_id: req.user.id,
      username: req.user.username,
      action: 'admin_create_user',
      target: username,
      details: `role=${role || 'user'}`,
      ip: req.ip,
    });

    res.status(201).json({ message: 'Usuário criado com sucesso' });
  });

  router.patch('/admin/users/:id', authMiddleware, adminMiddleware, (req, res) => {
    const { username, password, role } = req.body;
    const user = get('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const updates = [];
    const params = [];

    if (username) {
      const sanitized = sanitizeInput(username);
      const userError = validateUsername(sanitized);
      if (userError) return res.status(400).json({ error: userError });
      updates.push('username = ?');
      params.push(sanitized);
    }
    if (role) {
      updates.push('role = ?');
      params.push(role);
    }
    if (password) {
      const passwordError = validatePassword(password);
      if (passwordError) return res.status(400).json({ error: passwordError });
      updates.push('password_hash = ?');
      params.push(bcrypt.hashSync(password, 10));
    }

    if (updates.length > 0) {
      params.push(req.params.id);
      run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
      save();
    }

    logAudit({
      user_id: req.user.id,
      username: req.user.username,
      action: 'admin_update_user',
      target: user.username,
      details: `username=${username || user.username}, role=${role || user.role}${password ? ', password=changed' : ''}`,
      ip: req.ip,
    });

    res.status(200).json({ message: 'Usuário atualizado com sucesso' });
  });

  router.delete('/admin/users/:id', authMiddleware, adminMiddleware, (req, res) => {
    const user = get('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    run('DELETE FROM users WHERE id = ?', [req.params.id]);
    run('DELETE FROM refresh_tokens WHERE user_id = ?', [req.params.id]);
    save();
    logAudit({
      user_id: req.user.id,
      username: req.user.username,
      action: 'admin_delete_user',
      target: user.username,
      details: `old_username=${user.username}, old_role=${user.role}`,
      ip: req.ip,
    });

    res.status(200).json({ message: 'Usuário excluído com sucesso' });
  });

  router.patch('/admin/users/:id/block', authMiddleware, adminMiddleware, (req, res) => {
    const user = get('SELECT id, username, blocked FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const newBlocked = user.blocked ? 0 : 1;
    run('UPDATE users SET blocked = ? WHERE id = ?', [newBlocked, String(req.params.id)]);

    if (newBlocked === 1) {
      run('DELETE FROM refresh_tokens WHERE user_id = ?', [String(req.params.id)]);
    }

    save();

    logAudit({
      user_id: req.user.id,
      username: req.user.username,
      action: newBlocked ? 'admin_block_user' : 'admin_unblock_user',
      target: user.username,
      details: `blocked=${newBlocked}`,
      ip: req.ip,
    });

    res.json({ message: newBlocked ? 'Usuário bloqueado' : 'Usuário desbloqueado' });
  });

  router.post('/admin/users/:id/force-logout', authMiddleware, adminMiddleware, (req, res) => {
    const user = get('SELECT id, username FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    run('DELETE FROM refresh_tokens WHERE user_id = ?', [String(req.params.id)]);
    save();

    logAudit({
      user_id: req.user.id,
      username: req.user.username,
      action: 'admin_force_logout',
      target: user.username,
      ip: req.ip,
    });

    res.json({ message: 'Sessões revogadas com sucesso' });
  });

  router.post('/admin/users/:id/reset-password', authMiddleware, adminMiddleware, (req, res) => {
    const user = get('SELECT id, username FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'password é obrigatório' });
    }

    const passwordError = validatePassword(password);
    if (passwordError) return res.status(400).json({ error: passwordError });

    const password_hash = bcrypt.hashSync(password, 10);
    run('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash, String(req.params.id)]);
    save();

    logAudit({
      user_id: req.user.id,
      username: req.user.username,
      action: 'admin_reset_password',
      target: user.username,
      ip: req.ip,
    });

    res.json({ message: 'Senha redefinida com sucesso' });
  });

  router.get('/admin/audit', authMiddleware, adminMiddleware, (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;

    let whereClause = '';
    const params = [];

    if (req.query.user) {
      whereClause += ' AND username = ?';
      params.push(req.query.user);
    }
    if (req.query.action) {
      whereClause += ' AND action = ?';
      params.push(req.query.action);
    }
    if (req.query.from) {
      whereClause += ' AND date(created_at) >= ?';
      params.push(req.query.from);
    }
    if (req.query.to) {
      whereClause += ' AND date(created_at) <= ?';
      params.push(req.query.to);
    }

    if (req.query.resultado && req.query.action === 'search') {
      const resultExpr = `(CASE
        WHEN details LIKE '%cancelado=1%' THEN 'cancelado'
        WHEN details LIKE 'encontrados=%' AND CAST(SUBSTR(details, 13, INSTR(SUBSTR(details, 13), ',') - 1) AS INTEGER) > 0 THEN 'encontrado'
        WHEN details LIKE '%interrompida=true%' THEN 'erro'
        WHEN details LIKE 'encontrados=%' THEN 'nao_encontrado'
        WHEN details LIKE 'erro=%' THEN 'erro'
        ELSE 'outro'
      END)`;
      whereClause += ` AND ${resultExpr} = ?`;
      params.push(req.query.resultado);
    }

    const logs = all(`SELECT * FROM audit_log WHERE 1=1 ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [
      ...params,
      limit,
      offset,
    ]);
    const total = get(`SELECT COUNT(*) as total FROM audit_log WHERE 1=1 ${whereClause}`, params);
    res.json({ logs, total: total.total, limit, offset });
  });

  router.get('/admin/audit/export', authMiddleware, adminMiddleware, (req, res) => {
    let whereClause = '';
    const params = [];

    if (req.query.user) {
      whereClause += ' AND username = ?';
      params.push(req.query.user);
    }
    if (req.query.action) {
      whereClause += ' AND action = ?';
      params.push(req.query.action);
    }
    if (req.query.from) {
      whereClause += ' AND date(created_at) >= ?';
      params.push(req.query.from);
    }
    if (req.query.to) {
      whereClause += ' AND date(created_at) <= ?';
      params.push(req.query.to);
    }

    if (req.query.resultado && req.query.action === 'search') {
      const resultExpr = `(CASE
        WHEN details LIKE '%cancelado=1%' THEN 'cancelado'
        WHEN details LIKE 'encontrados=%' AND CAST(SUBSTR(details, 13, INSTR(SUBSTR(details, 13), ',') - 1) AS INTEGER) > 0 THEN 'encontrado'
        WHEN details LIKE '%interrompida=true%' THEN 'erro'
        WHEN details LIKE 'encontrados=%' THEN 'nao_encontrado'
        WHEN details LIKE 'erro=%' THEN 'erro'
        ELSE 'outro'
      END)`;
      whereClause += ` AND ${resultExpr} = ?`;
      params.push(req.query.resultado);
    }

    const logs = all(`SELECT * FROM audit_log WHERE 1=1 ${whereClause} ORDER BY created_at DESC LIMIT 10000`, params);

    const header = 'id,user_id,username,action,target,details,ip,created_at';
    const rows = logs.map((l) =>
      [l.id, l.user_id, l.username, l.action, l.target, l.details, l.ip, l.created_at]
        .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
        .join(','),
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="audit_log.csv"');
    res.send(header + '\n' + rows.join('\n'));
  });

  router.get('/admin/stats', authMiddleware, adminMiddleware, (req, res) => {
    const userCount = get('SELECT COUNT(*) as total FROM users');
    const logCount = get('SELECT COUNT(*) as total FROM audit_log');
    const activeUsers = get(
      'SELECT COUNT(DISTINCT user_id) as total FROM refresh_tokens WHERE revoked = 0 AND expires_at > datetime("now")',
    );

    const searchesToday = get(
      "SELECT COUNT(*) as total FROM audit_log WHERE action = 'search' AND date(created_at) = date('now')",
    );
    const errorsToday = get(
      `SELECT COUNT(*) as total FROM audit_log
       WHERE action = 'search' AND date(created_at) = date('now')
       AND (details LIKE 'erro=%' OR details LIKE '%interrompida=true%')`,
    );

    const totalSearches7d = get(
      "SELECT COUNT(*) as total FROM audit_log WHERE action = 'search' AND created_at > datetime('now', '-7 days')",
    );
    const okSearches7d = get(
      `SELECT COUNT(*) as total FROM audit_log
       WHERE action = 'search' AND created_at > datetime('now', '-7 days')
       AND details NOT LIKE 'erro=%' AND details NOT LIKE '%interrompida=true%'`,
    );

    const avgDuration = get(
      `SELECT AVG(
         CAST(SUBSTR(details, INSTR(details, 'tempo=') + 6,
           INSTR(SUBSTR(details, INSTR(details, 'tempo=')), ',') - 6
         ) AS REAL)
       ) as avg_s
       FROM audit_log
       WHERE action = 'search' AND details LIKE '%tempo=%'
       AND created_at > datetime('now', '-7 days')`,
    );

    const successRate = totalSearches7d.total > 0 ? Math.round((okSearches7d.total / totalSearches7d.total) * 100) : 0;

    res.json({
      users: userCount.total,
      audit_logs: logCount.total,
      searches_today: searchesToday.total,
      active_users: activeUsers.total,
      success_rate: successRate,
      avg_duration_s: avgDuration.avg_s ? Math.round(avgDuration.avg_s * 10) / 10 : 0,
      errors_today: errorsToday.total,
    });
  });

  router.get('/admin/stats/chart', authMiddleware, adminMiddleware, (req, res) => {
    const data = all(
      `SELECT date(created_at) as day,
              COUNT(*) as total,
              SUM(CASE WHEN details NOT LIKE 'erro=%' AND details NOT LIKE '%interrompida=true%' THEN 1 ELSE 0 END) as ok,
              SUM(CASE WHEN details LIKE 'erro=%' OR details LIKE '%interrompida=true%' THEN 1 ELSE 0 END) as errors
       FROM audit_log
       WHERE action = 'search' AND created_at > datetime('now', '-7 days')
       GROUP BY day ORDER BY day`,
    );
    res.json({ data });
  });

  return router;
}
