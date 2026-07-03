// server/src/index.js

require('dotenv').config(); // Load .env variables

const express = require('express');
const cors = require('cors');

const { connectDB } = require('./utils/db');
const authRouter = require('./routes/auth');
const { requireAuth } = require('./middleware/auth');
const projectsRouter = require('./routes/projects');
const tasksRouter = require('./routes/tasks');

const notificationsRouter = require('./routes/notifications');

const app = express();

connectDB();

app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

const PORT = process.env.PORT || 5000;

app.use('/api/auth', authRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/notifications', notificationsRouter);


app.listen(PORT, () => {
  console.log(` Server listening on port ${PORT}`);
});