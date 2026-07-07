import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { logAudit, get, run, save } from '../db/sqlite.js';
import { logger } from '../utils/logger.js';
import { validatePassword, validateUsername, sanitizeInput } from '../utils/validation.js';
import { loginLimiter, authMiddleware } from '../middleware/auth.js';

const JWT_SECRET = process.env.JWT_SECRET;
const ACCESS_EXPIRES = '15m';
const REFRESH_EXPIRES_HOURS = 4;

function generateAccessToken(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: ACCESS_EXPIRES });
}

function generateRefreshToken(userId) {
  const raw = crypto.randomBytes(40).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRES_HOURS * 60 * 60 * 1000).toISOString();

  run('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)', [userId, hash, expiresAt]);
  save();

  return raw;
}

function revokeRefreshToken(raw) {
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  run('UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?', [hash]);
  save();
}

export function createAuthRoutes() {
  const router = Router();

  const registerLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 3,
    message: { error: 'Muitas tentativas de registro. Tente novamente daqui um minuto.' },
  });

  router.post('/register', registerLimiter, (req, res) => {
    let { username, password, adminKey } = req.body;
    username = sanitizeInput(username);
    password = sanitizeInput(password);
    if (!username || !password) {
      return res.status(400).json({ error: 'username e password obrigatórios' });
    }
    const userError = validateUsername(username);
    if (userError) {
      return res.status(400).json({ error: userError });
    }
    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }
    if (adminKey !== process.env.ADMIN_KEY) {
      return res.status(403).json({ error: 'chave de admin inválida' });
    }

    const existing = get('SELECT id FROM users WHERE username = ?', [username]);
    if (existing) {
      return res.status(409).json({ error: 'usuário já existe' });
    }

    const password_hash = bcrypt.hashSync(password, 10);
    run('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', [
      username,
      password_hash,
      req.body.role || 'user',
    ]);
    save();

    logger.info(`Novo usuário registrado: ${username}`);
    res.status(201).json({ message: 'usuário criado' });
  });

  router.post('/login', loginLimiter, (req, res) => {
    let { username, password } = req.body;
    username = sanitizeInput(username);
    password = sanitizeInput(password);
    if (!username || !password) {
      return res.status(400).json({ error: 'username e password obrigatórios' });
    }
    const userError = validateUsername(username);
    if (userError) {
      return res.status(400).json({ error: 'credenciais inválidas' });
    }

    const user = get('SELECT * FROM users WHERE username = ?', [username]);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'credenciais inválidas' });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user.id);

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      sameSite: 'strict',
      secure: req.protocol === 'https',
      path: '/',
      maxAge: REFRESH_EXPIRES_HOURS * 60 * 60 * 1000,
    });

    logAudit({
      user_id: user.id,
      username: user.username,
      action: 'login',
      ip: req.ip,
    });

    logger.info(`Login: ${username}`);
    res.json({ access_token: accessToken, expires_in: 900 });
  });

  router.post('/refresh', (req, res) => {
    const raw = req.cookies?.refresh_token;
    if (!raw) return res.status(401).json({ error: 'refresh token ausente' });

    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    const stored = get(
      `SELECT rt.*, u.username, u.role FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = ? AND rt.revoked = 0 AND rt.expires_at > datetime('now')`,
      [hash],
    );

    if (!stored) return res.status(401).json({ error: 'refresh token inválido ou expirado' });

    revokeRefreshToken(raw);
    const user = { id: stored.user_id, username: stored.username, role: stored.role };
    const accessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user.id);

    res.cookie('refresh_token', newRefreshToken, {
      httpOnly: true,
      sameSite: 'strict',
      secure: req.protocol === 'https',
      path: '/',
      maxAge: REFRESH_EXPIRES_HOURS * 60 * 60 * 1000,
    });

    res.json({ access_token: accessToken, expires_in: 900 });
  });

  router.post('/logout', authMiddleware, (req, res) => {
    const raw = req.cookies?.refresh_token;
    if (raw) {
      revokeRefreshToken(raw);
      logger.info('Logout realizado');
    }

    logAudit({
      user_id: req.user.id,
      username: req.user.username,
      action: 'logout',
      ip: req.ip,
    });

    res.clearCookie('refresh_token', { path: '/' });
    res.json({ message: 'logout ok' });
  });

  router.get('/me', authMiddleware, (req, res) => {
    res.json({ id: req.user.id, username: req.user.username, role: req.user.role });
  });

  return router;
}
