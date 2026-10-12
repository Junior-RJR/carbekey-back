import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import request from 'supertest';
import app from '../src/app.js';
import { pool } from '../src/db.js';

const api = request(app);
let token;
const auth = () => ({ Authorization: `Bearer ${token}` });

before(async () => {
  await pool.query(await readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8'));
  await pool.query('TRUNCATE users CASCADE');
});

after(() => pool.end());

test('cadastro cria usuário com os grupos padrão', async () => {
  const res = await api.post('/auth/register').send({ name: 'Rogério', email: 'Eu@Teste.com', password: 'senha-forte-123' });
  assert.equal(res.status, 201);
  assert.equal(res.body.user.email, 'eu@teste.com');
  token = res.body.token;

  const groups = await api.get('/groups').set(auth());
  assert.deepEqual(groups.body.map((g) => g.name), ['Carbe', 'Pessoal', 'Gabi Carneiro']);
});

test('não deixa cadastrar o mesmo e-mail duas vezes', async () => {
  const res = await api.post('/auth/register').send({ name: 'X', email: 'eu@teste.com', password: 'outra-senha-123' });
  assert.equal(res.status, 409);
});

test('login', async () => {
  assert.equal((await api.post('/auth/login').send({ email: 'eu@teste.com', password: 'errada' })).status, 401);
  const res = await api.post('/auth/login').send({ email: 'eu@teste.com', password: 'senha-forte-123' });
  assert.equal(res.status, 200);
  assert.ok(res.body.token);
  assert.equal((await api.get('/auth/me').set({ Authorization: `Bearer ${res.body.token}` })).body.name, 'Rogério');
});

test('rotas protegidas exigem token', async () => {
  assert.equal((await api.get('/entries')).status, 401);
  assert.equal((await api.get('/groups').set({ Authorization: 'Bearer lixo' })).status, 401);
});

test('CRUD de senhas, com senha criptografada no banco', async () => {
  const groups = (await api.get('/groups').set(auth())).body;
  const carbe = groups.find((g) => g.name === 'Carbe');

  const created = await api.post('/entries').set(auth()).send({
    name: 'Gmail', username: 'eu@gmail.com', password: 'S3nh@!', site: 'gmail.com', groupId: carbe.id,
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.password, 'S3nh@!');

  const { rows } = await pool.query('SELECT password_encrypted FROM entries WHERE id = $1', [created.body.id]);
  assert.ok(!rows[0].password_encrypted.includes('S3nh@!'));

  const list = await api.get('/entries').set(auth()).query({ groupId: carbe.id });
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].password, undefined);

  assert.equal((await api.get('/entries').set(auth()).query({ search: 'gmail' })).body.length, 1);
  assert.equal((await api.get('/entries').set(auth()).query({ search: '%' })).body.length, 0);

  const one = await api.get(`/entries/${created.body.id}`).set(auth());
  assert.equal(one.body.password, 'S3nh@!');

  const updated = await api.put(`/entries/${created.body.id}`).set(auth()).send({ name: 'Gmail pessoal', password: 'nova', groupId: '' });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.groupId, null);
  assert.equal(updated.body.password, 'nova');

  assert.equal((await api.delete(`/entries/${created.body.id}`).set(auth())).status, 204);
  assert.equal((await api.get(`/entries/${created.body.id}`).set(auth())).status, 404);
});

test('validação e ids inválidos', async () => {
  const bad = await api.post('/entries').set(auth()).send({ name: '' });
  assert.equal(bad.status, 400);
  assert.ok(bad.body.details.name);
  assert.equal((await api.get('/entries/nao-e-uuid').set(auth())).status, 404);
});

test('excluir grupo mantém as senhas sem grupo', async () => {
  const group = (await api.post('/groups').set(auth()).send({ name: 'Temporário' })).body;
  assert.equal((await api.post('/groups').set(auth()).send({ name: 'Temporário' })).status, 409);
  const renamed = await api.put(`/groups/${group.id}`).set(auth()).send({ name: 'Trabalho' });
  assert.equal(renamed.body.name, 'Trabalho');

  const entry = (await api.post('/entries').set(auth()).send({ name: 'VPN', password: 'x', groupId: group.id })).body;
  assert.equal((await api.delete(`/groups/${group.id}`).set(auth())).status, 204);
  assert.equal((await api.get(`/entries/${entry.id}`).set(auth())).body.groupId, null);
});

test('um usuário não vê as senhas de outro', async () => {
  const other = (await api.post('/auth/register').send({ name: 'Outro', email: 'outro@teste.com', password: 'senha-forte-456' })).body;
  const mine = (await api.post('/entries').set(auth()).send({ name: 'Minha', password: 'x' })).body;
  const otherAuth = { Authorization: `Bearer ${other.token}` };

  assert.equal((await api.get(`/entries/${mine.id}`).set(otherAuth)).status, 404);
  assert.equal((await api.delete(`/entries/${mine.id}`).set(otherAuth)).status, 404);
  assert.equal((await api.get('/entries').set(otherAuth)).body.length, 0);

  const myGroup = (await api.get('/groups').set(auth())).body[0];
  const res = await api.post('/entries').set(otherAuth).send({ name: 'X', password: 'x', groupId: myGroup.id });
  assert.equal(res.status, 400);
});
