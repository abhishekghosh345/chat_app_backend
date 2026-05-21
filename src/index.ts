import dotenv from 'dotenv';

dotenv.config();

import express from 'express';
import http from 'http';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import { runMigrations } from './db/migrations/001_initial_schema';
import authRoutes from './routes/auth';
import chatsRoutes from './routes/chats';
import messagesRoutes from './routes/messages';
import usersRoutes from './routes/users';
import callsRoutes from './routes/calls';
import { attachSocketHandlers } from './sockets';
import { closePool } from './db/connection';
import { MessageService } from './services/MessageService';
import { SessionService } from './services/SessionService';
import cron from 'node-cron';


const app = express();

app.use(helmet());
app.set('trust proxy', 1);
app.use(
  cors({
    origin: process.env.CLIENT_URL || process.env.CORS_ORIGIN || true,
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.use('/auth', authRoutes);
app.use('/api/chats', chatsRoutes);
app.use('/api', messagesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/calls', callsRoutes);

const server = http.createServer(app);
attachSocketHandlers(server);

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Bootstrap
(async () => {
  try {
    if (process.env.RUN_MIGRATIONS_ON_STARTUP === 'true') {
      await runMigrations();
    }
    setupBackgroundJobs();
  } catch (err) {
    console.error('Failed to initialize server:', err);
    process.exit(1);
  }

  server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
})();

function setupBackgroundJobs() {
  const cleanupInterval = process.env.CLEANUP_CRON || '0 * * * *';

  cron.schedule(cleanupInterval, async () => {
    try {
      const deletedMessages = await MessageService.deleteExpiredMessages();
      const permanentlyDeleted = await MessageService.permanentlyDeleteExpiredMessages();
      const cleanedMedia = await MessageService.cleanupExpiredMedia();
      const expiredSessions = await SessionService.deleteExpiredSessions();

      console.log(`Background cleanup: deleted ${deletedMessages} expired messages, permanently removed ${permanentlyDeleted}, cleaned ${cleanedMedia} media urls, removed ${expiredSessions} expired sessions`);
    } catch (error) {
      console.error('Background cleanup error:', error);
    }
  });
}

function shutdown() {
  console.log('Shutting down...');
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

