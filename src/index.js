const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const env = require('./config/env');
const {connectDb} = require('./config/db');
const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');
const newsRoutes = require('./routes/news.routes');
const {ensureAdmin} = require('./utils/seedAdmin');

const app = express();

app.use(cors({origin: env.corsOrigin}));
app.use(express.json({limit: '1mb'}));
app.use(morgan('dev'));

app.get('/health', (_req, res) => {
  res.json({status: 'ok'});
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
