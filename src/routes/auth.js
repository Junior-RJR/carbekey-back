import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { pool, query } from '../db.js';
import { HttpError, asyncHandler, parse } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';

const DEFAULT_GROUPS = ['Carbe', 'Pessoal', 'Gabi Carneiro'];

const router = Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas, tente de novo em alguns minutos' },
});

const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres').max(200),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

const toUser = (row) => ({ id: row.id, name: row.name, email: row.email, createdAt: row.created_at });
const signToken = (userId) => jwt.sign({}, config.jwtSecret, { subject: userId, expiresIn: config.jwtExpiresIn });

router.post('/register', limiter, asyncHandler(async (req, res) => {
  const { name, email, password } = parse(registerSchema, req.body);
  const hash = await bcrypt.hash(password, 12);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING *',
      [name, email, hash]
    );
    const user = rows[0];
    await client.query(
      // created_at escalonado para manter a ordem dos grupos padrão
      `INSERT INTO groups (user_id, name, created_at)
       SELECT $1, n, now() + i * interval '1 millisecond' FROM unnest($2::text[]) WITH ORDINALITY AS t(n, i)`,
      [user.id, DEFAULT_GROUPS]
    );
    await client.query('COMMIT');
    res.status(201).json({ token: signToken(user.id), user: toUser(user) });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') throw new HttpError(409, 'Este e-mail já está cadastrado');
    throw err;
  } finally {
    client.release();
  }
}));

router.post('/login', limiter, asyncHandler(async (req, res) => {
  const { email, password } = parse(loginSchema, req.body);
  const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw new HttpError(401, 'E-mail ou senha incorretos');
  }
  res.json({ token: signToken(user.id), user: toUser(user) });
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [req.userId]);
  if (!rows[0]) throw new HttpError(401, 'Usuário não encontrado');
  res.json(toUser(rows[0]));
}));

export default router;
