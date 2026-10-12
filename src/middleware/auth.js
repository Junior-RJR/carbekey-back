import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { HttpError } from '../lib/http.js';

export function requireAuth(req, _res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) return next(new HttpError(401, 'Faça login para continuar'));
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.userId = payload.sub;
    next();
  } catch {
    next(new HttpError(401, 'Sessão expirada, faça login novamente'));
  }
}
