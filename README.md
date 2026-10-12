# CarbeKey API

Back-end do [CarbeKey](https://github.com/Junior-RJR/carbekey), o gerenciador de senhas.
Node 24 + Express + PostgreSQL.

## Segurança

- Senha de login guardada com **bcrypt**.
- Senhas salvas criptografadas com **AES-256-GCM** usando a `ENCRYPTION_KEY` do servidor.
  **Se perder ou trocar essa chave, as senhas salvas não podem mais ser lidas.** Guarde uma cópia em lugar seguro.
- Login com token **JWT** (`Authorization: Bearer <token>`).
- Limite de tentativas em `/auth/login` e `/auth/register`.
- Cada usuário só acessa os próprios grupos e senhas.

## Rodando

```bash
cp .env.example .env     # preencha DATABASE_URL, JWT_SECRET e ENCRYPTION_KEY
npm install
npm run db:migrate       # cria as tabelas
npm run dev              # http://localhost:8080
npm test                 # testes (usa .env.test, precisa de um Postgres local)
```

## Rotas

Todas recebem e devolvem JSON. Fora `/health` e `/auth/register|login`, todas exigem o token.

### Auth

| Método | Rota | Corpo | Resposta |
| --- | --- | --- | --- |
| POST | `/auth/register` | `{ name, email, password }` | `201 { token, user }` (já cria os grupos Carbe, Pessoal e Gabi Carneiro) |
| POST | `/auth/login` | `{ email, password }` | `{ token, user }` |
| GET | `/auth/me` | | `{ id, name, email, createdAt }` |

### Grupos

| Método | Rota | Corpo | Resposta |
| --- | --- | --- | --- |
| GET | `/groups` | | `[{ id, name, entryCount, createdAt }]` |
| POST | `/groups` | `{ name }` | `201 { id, name, ... }` |
| PUT | `/groups/:id` | `{ name }` | grupo atualizado |
| DELETE | `/groups/:id` | | `204` (as senhas do grupo ficam sem grupo) |

### Senhas

| Método | Rota | Corpo | Resposta |
| --- | --- | --- | --- |
| GET | `/entries?groupId=&search=` | | lista **sem** o campo `password` |
| GET | `/entries/:id` | | senha completa, **com** `password` |
| POST | `/entries` | `{ name, username?, password, site?, description?, groupId? }` | `201` senha criada |
| PUT | `/entries/:id` | mesmo corpo do POST | senha atualizada |
| DELETE | `/entries/:id` | | `204` |

Erros: `{ "error": "mensagem" }` e, em validação (`400`), `details` com os campos inválidos.

## Deploy no Vercel

O `api/index.js` exporta o app e o `vercel.json` manda todas as rotas para ele.
Crie um projeto no Vercel apontando para este repositório e configure as variáveis do `.env.example`
(para um Postgres na nuvem, como Neon ou Supabase, use `DATABASE_SSL=true`).
Rode `npm run db:migrate` uma vez apontando para o banco de produção.
