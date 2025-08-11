const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const CHIP_VALUES = { white:10, red:20, green:30, blue:50 };

async function ensureSchema() {
  const schema = `
  CREATE TABLE IF NOT EXISTS players (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    white INTEGER DEFAULT 0,
    red INTEGER DEFAULT 0,
    green INTEGER DEFAULT 0,
    blue INTEGER DEFAULT 0,
    type TEXT NOT NULL CHECK (type IN ('buy-in','return')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
  );

  CREATE OR REPLACE VIEW player_totals AS
  SELECT
    p.id,
    p.name,
    p.is_active,
    COALESCE(SUM((t.white*10 + t.red*20 + t.green*30 + t.blue*50) * CASE WHEN t.type='buy-in' THEN 1 ELSE -1 END),0) AS net_amount,
    COALESCE(SUM(CASE WHEN t.type='buy-in' THEN t.white ELSE -t.white END),0) AS white_total,
    COALESCE(SUM(CASE WHEN t.type='buy-in' THEN t.red ELSE -t.red END),0) AS red_total,
    COALESCE(SUM(CASE WHEN t.type='buy-in' THEN t.green ELSE -t.green END),0) AS green_total,
    COALESCE(SUM(CASE WHEN t.type='buy-in' THEN t.blue ELSE -t.blue END),0) AS blue_total
  FROM players p
  LEFT JOIN transactions t ON t.player_id = p.id
  GROUP BY p.id, p.name, p.is_active;
  `;
  try {
    await pool.query(schema);
    console.log('DB schema ensured');
  } catch (err) {
    console.error('Error ensuring schema', err);
    process.exit(1);
  }
}

// Call ensureSchema on start
ensureSchema();

// API routes
app.get('/api/players', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM player_totals ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/api/players', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const r = await pool.query('INSERT INTO players(name) VALUES($1) RETURNING *', [name]);
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/api/players/:id/toggle', async (req, res) => {
  const id = req.params.id;
  try {
    const cur = await pool.query('SELECT is_active FROM players WHERE id=$1', [id]);
    if (!cur.rowCount) return res.status(404).json({ error: 'player not found' });
    const newVal = !cur.rows[0].is_active;
    const r = await pool.query('UPDATE players SET is_active=$1 WHERE id=$2 RETURNING *', [newVal, id]);
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/api/transactions', async (req, res) => {
  const { player_id, white=0, red=0, green=0, blue=0, type } = req.body;
  if (!player_id || !type) return res.status(400).json({ error: 'player_id and type required' });
  try {
    const r = await pool.query(
      'INSERT INTO transactions(player_id, white, red, green, blue, type) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
      [player_id, white, red, green, blue, type]
    );
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.get('/api/totals', async (req, res) => {
  try {
    const q = `SELECT 
      COALESCE(SUM(CASE WHEN type='buy-in' THEN white ELSE -white END),0) as white,
      COALESCE(SUM(CASE WHEN type='buy-in' THEN red ELSE -red END),0) as red,
      COALESCE(SUM(CASE WHEN type='buy-in' THEN green ELSE -green END),0) as green,
      COALESCE(SUM(CASE WHEN type='buy-in' THEN blue ELSE -blue END),0) as blue
      FROM transactions`;
    const r = await pool.query(q);
    const row = r.rows[0];
    const money_in_play = (row.white*CHIP_VALUES.white) + (row.red*CHIP_VALUES.red) + (row.green*CHIP_VALUES.green) + (row.blue*CHIP_VALUES.blue);
    res.json({ chips: row, money_in_play });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/api/reset/round', async (req, res) => {
  try {
    await pool.query('TRUNCATE TABLE transactions RESTART IDENTITY');
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/api/reset/full', async (req, res) => {
  try {
    await pool.query('TRUNCATE TABLE transactions, players RESTART IDENTITY CASCADE');
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Server started on', port));
