require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

require('./db'); // Initialize DB and seed on first run

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/accounts', require('./routes/accounts'));
app.use('/api/kfp-log', require('./routes/kfp-log'));
app.use('/api/talys-log', require('./routes/talys-log'));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Внутренняя ошибка сервера' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`DemoBank server running → http://localhost:${PORT}`);
});
