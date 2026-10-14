import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { encrypt, decrypt } from '../lib/crypto.js';
import { HttpError, asyncHandler, parse } from '../lib/http.js';

const router = Router();

const entrySchema = z.object({
  name: z.string().trim().min(1).max(200),
  username: z.string().trim().max(200).default(''),
  password: z.string().min(1).max(1000),
  site: z.string().trim().max(500).default(''),
  description: z.string().max(5000).default(''),
  groupId: z.string().uuid().nullable().or(z.literal('')).default(null).transform((v) => v || null),
});

const listSchema = z.object({
  groupId: z.string().uuid().optional(),
  // Por padrão, filtrar por grupo traz também as senhas dos subgrupos
  includeSubgroups: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  search: z.string().trim().max(200).optional(),
});

// Na listagem a senha não vem; use GET /entries/:id para pegá-la
const toEntry = (row, { withPassword = false } = {}) => ({
  id: row.id,
  groupId: row.group_id,
  name: row.name,
  username: row.username,
  ...(withPassword && { password: decrypt(row.password_encrypted) }),
  site: row.site,
  description: row.description,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

async function assertGroupOwner(groupId, userId) {
  if (!groupId) return;
  const { rowCount } = await query('SELECT 1 FROM groups WHERE id = $1 AND user_id = $2', [groupId, userId]);
  if (!rowCount) throw new HttpError(400, 'Grupo não encontrado');
}

router.get('/', asyncHandler(async (req, res) => {
  const { groupId, includeSubgroups, search } = parse(listSchema, req.query);
  const params = [req.userId];
  let where = 'user_id = $1';
  if (groupId) {
    params.push(groupId);
    const p = `$${params.length}`;
    where += includeSubgroups
      ? ` AND group_id IN (
            WITH RECURSIVE tree AS (
              SELECT id FROM groups WHERE id = ${p} AND user_id = $1
              UNION ALL
              SELECT g.id FROM groups g JOIN tree t ON g.parent_id = t.id
            ) SELECT id FROM tree)`
      : ` AND group_id = ${p}`;
  }
  if (search) {
    params.push(`%${search.replace(/[\\%_]/g, '\\$&')}%`);
    const p = `$${params.length}`;
    where += ` AND (name ILIKE ${p} OR username ILIKE ${p} OR site ILIKE ${p} OR description ILIKE ${p})`;
  }
  const { rows } = await query(`SELECT * FROM entries WHERE ${where} ORDER BY lower(name)`, params);
  res.json(rows.map((r) => toEntry(r)));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT * FROM entries WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  if (!rows[0]) throw new HttpError(404, 'Senha não encontrada');
  res.json(toEntry(rows[0], { withPassword: true }));
}));

router.post('/', asyncHandler(async (req, res) => {
  const e = parse(entrySchema, req.body);
  await assertGroupOwner(e.groupId, req.userId);
  const { rows } = await query(
    `INSERT INTO entries (user_id, group_id, name, username, password_encrypted, site, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [req.userId, e.groupId, e.name, e.username, encrypt(e.password), e.site, e.description]
  );
  res.status(201).json(toEntry(rows[0], { withPassword: true }));
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const e = parse(entrySchema, req.body);
  await assertGroupOwner(e.groupId, req.userId);
  const { rows } = await query(
    `UPDATE entries
        SET group_id = $1, name = $2, username = $3, password_encrypted = $4, site = $5, description = $6, updated_at = now()
      WHERE id = $7 AND user_id = $8
      RETURNING *`,
    [e.groupId, e.name, e.username, encrypt(e.password), e.site, e.description, req.params.id, req.userId]
  );
  if (!rows[0]) throw new HttpError(404, 'Senha não encontrada');
  res.json(toEntry(rows[0], { withPassword: true }));
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const { rowCount } = await query('DELETE FROM entries WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  if (!rowCount) throw new HttpError(404, 'Senha não encontrada');
  res.status(204).end();
}));

export default router;
