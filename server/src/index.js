// server/src/index.js

require('dotenv').config(); // Load .env variables

const express = require('express');
const cors = require('cors');

const { connectDB } = require('./utils/db');

const app = express();

// 1. Connect to MongoDB
connectDB();

// 2. Global middlewares
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);

app.use(express.json());

// 3. Simple health check route
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 4. Start the server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(` Server listening on port ${PORT}`);
});