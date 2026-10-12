import { HttpError } from '../lib/http.js';

export function notFound(_req, _res, next) {
  next(new HttpError(404, 'Rota não encontrada'));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...(err.details && { details: err.details }) });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON inválido' });
  }
  // uuid inválido no Postgres
  if (err.code === '22P02') return res.status(404).json({ error: 'Não encontrado' });
  console.error(err);
  res.status(500).json({ error: 'Erro interno' });
}
