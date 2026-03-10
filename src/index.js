const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const env = require('./config/env');
const {connectDb} = require('./config/db');
const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');
const newsRoutes = require('./routes/news.routes');
const {ensureAdmin} = require('./utils/seedAdmin');
const mongoose = require('mongoose');

const app = express();

app.use(cors({origin: env.corsOrigin}));
app.use(express.json({limit: '1mb'}));
app.use(morgan('dev'));

const DB_STATE = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

const buildHealthPayload = () => {
  const readyState = mongoose.connection.readyState;
  const db = DB_STATE[readyState] || 'unknown';
  const healthy = db === 'connected' || db === 'connecting';

  return {
    status: healthy ? 'ok' : 'degraded',
    service: 'cricbuzz-admin-server',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    database: {
      state: db,
      readyState,
    },
  };
};

app.get('/health', (_req, res) => {
  const payload = buildHealthPayload();
  const statusCode = payload.status === 'ok' ? 200 : 503;
  return res.status(statusCode).json(payload);
});

app.get('/api/health', (_req, res) => {
  const payload = buildHealthPayload();
  const statusCode = payload.status === 'ok' ? 200 : 503;
  return res.status(statusCode).json(payload);
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/news', newsRoutes);

const start = async () => {
  try {
    await connectDb();
    await ensureAdmin();

    app.listen(env.port, () => {
      // eslint-disable-next-line no-console
      console.log(`Server running on http://localhost:${env.port}`);
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to start server', error);
    process.exit(1);
  }
};

start();
