import express from 'express';
import bcrypt from 'bcryptjs';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import { all, get, run, save, logAudit } from '../db/sqlite.js';
import { validatePassword, validateUsername, sanitizeInput } from '../utils/validation.js';

export function createAdminRoutes() {
  const router = express.Router();

  router.get('/admin/users', authMiddleware, adminMiddleware, (req, res) => {
    // Lógica para listar usuários
    const users = all('SELECT id, username, role FROM users');
    res.json({ message: 'Lista de usuários', users });
  });

  router.post('/admin/users', authMiddleware, adminMiddleware, (req, res) => {
    // Lógica para criar um novo usuário
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
    // Lógica para deletar um usuário
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

  router.get('/admin/audit', authMiddleware, adminMiddleware, (req, res) => {
    // Lógica para listar logs de auditoria
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const logs = all('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?', [limit, offset]);
    const total = get('SELECT COUNT(*) as total FROM audit_log');
    res.json({ logs, total: total.total, limit, offset });
  });

  router.get('/admin/stats', authMiddleware, adminMiddleware, (req, res) => {
    // Lógica para obter estatísticas do sistema
    const userCount = get('SELECT COUNT(*) as total FROM users');
    const logCount = get('SELECT COUNT(*) as total FROM audit_log');
    const activeTokens = get(
      'SELECT COUNT(*) as total FROM refresh_tokens WHERE revoked = 0 AND expires_at > datetime("now")',
    );
    res.json({
      users: userCount.total,
      audit_logs: logCount.total,
      active_sessions: activeTokens.total,
    });
  });

  return router;
}
