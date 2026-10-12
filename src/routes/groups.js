import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { HttpError, asyncHandler, parse } from '../lib/http.js';

const router = Router();

const groupSchema = z.object({ name: z.string().trim().min(1).max(60) });

const toGroup = (row) => ({
  id: row.id,
  name: row.name,
  entryCount: row.entry_count !== undefined ? Number(row.entry_count) : undefined,
  createdAt: row.created_at,
});

function handleUnique(err) {
  if (err.code === '23505') throw new HttpError(409, 'Já existe um grupo com esse nome');
  throw err;
}

router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT g.*, count(e.id) AS entry_count
       FROM groups g LEFT JOIN entries e ON e.group_id = g.id
      WHERE g.user_id = $1
      GROUP BY g.id
      ORDER BY g.created_at, g.name`,
    [req.userId]
  );
  res.json(rows.map(toGroup));
}));

router.post('/', asyncHandler(async (req, res) => {
  const { name } = parse(groupSchema, req.body);
  const { rows } = await query(
    'INSERT INTO groups (user_id, name) VALUES ($1, $2) RETURNING *',
    [req.userId, name]
  ).catch(handleUnique);
  res.status(201).json(toGroup(rows[0]));
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const { name } = parse(groupSchema, req.body);
  const { rows } = await query(
    'UPDATE groups SET name = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
    [name, req.params.id, req.userId]
  ).catch(handleUnique);
  if (!rows[0]) throw new HttpError(404, 'Grupo não encontrado');
  res.json(toGroup(rows[0]));
}));

// As senhas do grupo não são apagadas: ficam sem grupo (ON DELETE SET NULL)
router.delete('/:id', asyncHandler(async (req, res) => {
  const { rowCount } = await query('DELETE FROM groups WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  if (!rowCount) throw new HttpError(404, 'Grupo não encontrado');
  res.status(204).end();
}));

export default router;
