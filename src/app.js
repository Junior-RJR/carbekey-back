import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config.js';
import { requireAuth } from './middleware/auth.js';
import { notFound, errorHandler } from './middleware/errors.js';
import authRoutes from './routes/auth.js';
import groupRoutes from './routes/groups.js';
import entryRoutes from './routes/entries.js';

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: config.corsOrigin.length ? config.corsOrigin : false }));
app.use(express.json({ limit: '100kb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/auth', authRoutes);
app.use('/groups', requireAuth, groupRoutes);
app.use('/entries', requireAuth, entryRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
