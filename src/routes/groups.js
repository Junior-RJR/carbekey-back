import { Router } from 'express';
import { z } from 'zod';
import { pool, query } from '../db.js';
import { HttpError, asyncHandler, parse } from '../lib/http.js';

const router = Router();

const parentId = z.string().uuid().nullable().or(z.literal('')).transform((v) => v || null);
const createSchema = z.object({ name: z.string().trim().min(1).max(60), parentId: parentId.default(null) });
// No PUT, parentId é opcional: se não vier, o grupo continua onde está
const updateSchema = z.object({ name: z.string().trim().min(1).max(60).optional(), parentId: parentId.optional() });

const toGroup = (row) => ({
  id: row.id,
  name: row.name,
  parentId: row.parent_id,
  entryCount: row.entry_count !== undefined ? Number(row.entry_count) : undefined,
  createdAt: row.created_at,
});

function handleUnique(err) {
  if (err.code === '23505') throw new HttpError(409, 'Já existe um grupo com esse nome aqui');
  throw err;
}

async function assertParent(parent, userId) {
  if (!parent) return;
  const { rowCount } = await query('SELECT 1 FROM groups WHERE id = $1 AND user_id = $2', [parent, userId]);
  if (!rowCount) throw new HttpError(400, 'Grupo pai não encontrado');
}

// entryCount conta só as senhas diretamente no grupo (o front soma os subgrupos)
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
  const { name, parentId: parent } = parse(createSchema, req.body);
  await assertParent(parent, req.userId);
  const { rows } = await query(
    'INSERT INTO groups (user_id, name, parent_id) VALUES ($1, $2, $3) RETURNING *',
    [req.userId, name, parent]
  ).catch(handleUnique);
  res.status(201).json(toGroup(rows[0]));
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const body = parse(updateSchema, req.body);
  const { rows: current } = await query('SELECT * FROM groups WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
  if (!current[0]) throw new HttpError(404, 'Grupo não encontrado');

  const name = body.name ?? current[0].name;
  const parent = body.parentId === undefined ? current[0].parent_id : body.parentId;

  if (parent && parent !== current[0].parent_id) {
    await assertParent(parent, req.userId);
    // Não pode mover um grupo para dentro dele mesmo ou de um subgrupo dele
    const { rowCount } = await query(
      `WITH RECURSIVE tree AS (
         SELECT id FROM groups WHERE id = $1
         UNION ALL
         SELECT g.id FROM groups g JOIN tree t ON g.parent_id = t.id
       )
       SELECT 1 FROM tree WHERE id = $2`,
      [req.params.id, parent]
    );
    if (rowCount) throw new HttpError(400, 'Não dá para mover um grupo para dentro dele mesmo');
  }

  const { rows } = await query(
    'UPDATE groups SET name = $1, parent_id = $2 WHERE id = $3 AND user_id = $4 RETURNING *',
    [name, parent, req.params.id, req.userId]
  ).catch(handleUnique);
  res.json(toGroup(rows[0]));
}));

// Senhas e subgrupos do grupo excluído sobem para o grupo de cima
router.delete('/:id', asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT parent_id FROM groups WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [req.params.id, req.userId]
    );
    if (!rows[0]) throw new HttpError(404, 'Grupo não encontrado');
    const parent = rows[0].parent_id;

    await client.query('UPDATE entries SET group_id = $1 WHERE group_id = $2', [parent, req.params.id]);
    await client.query('UPDATE groups SET parent_id = $1 WHERE parent_id = $2', [parent, req.params.id])
      .catch((err) => {
        if (err.code === '23505') throw new HttpError(409, 'Um subgrupo tem o mesmo nome de um grupo no nível de cima; renomeie antes de excluir');
        throw err;
      });
    await client.query('DELETE FROM groups WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
    res.status(204).end();
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

export default router;
