// Backers/index.js (ESM)

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import bcrypt from 'bcryptjs';
import { pool, bootstrap } from './db.js';


// ------- safety logs for silent crashes -------
process.on('unhandledRejection', (e) => {
  console.error('UNHANDLED REJECTION:', e);
});
process.on('uncaughtException', (e) => {
  console.error('UNCAUGHT EXCEPTION:', e);
});

const app = express();
const PORT = process.env.PORT || 3000;

// ---- CORS (allow your Vite host) ----
const ALLOWED =
  (process.env.ORIGIN_LIST ||
    'http://localhost:5173,http://127.0.0.1:5173').split(',');

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);     // curl / same-origin
      cb(null, ALLOWED.includes(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.options('*', cors());

app.use(express.json());

// ---- Sessions (Postgres store) ----
const PgStore = connectPgSimple(session);

app.use(
  session({
    store: new PgStore({ pool, tableName: 'session', createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET || 'mmcm-booking-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 8 * 60 * 60 * 1000, httpOnly: true, secure: false, sameSite: 'lax' }
  })
);


// --------------------------------------------------------
// Auth guard
function requireAuth(roles = ['ADMIN', 'STAFF']) {
  return (req, res, next) => {
    if (!req.session?.user)
      return res.status(401).json({ error: 'Unauthorized: Please login' });
    if (!roles.includes(req.session.user.role))
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    next();
  };
}
// --------------------------------------------------------

// Health
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// -------------------- AUTH -------------------------
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });

  try {
    const { rows } = await pool.query(
      'SELECT id, username, password_hash, role FROM admin_users WHERE username = $1',
      [username]
    );
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    req.session.user = { id: user.id, username: user.username, role: user.role };
    res.json({ user: req.session.user });
  } catch (e) {
    console.error('POST /api/auth/login', e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out successfully' });
  });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ user: req.session.user });
});

app.post('/api/auth/change-password', requireAuth(), async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword)
    return res.status(400).json({ error: 'Current and new password required' });
  if (newPassword.length < 6)
    return res.status(400).json({ error: 'New password must be at least 6 characters' });

  try {
    const { rows } = await pool.query(
      'SELECT password_hash FROM admin_users WHERE id = $1',
      [req.session.user.id]
    );
    const valid = await bcrypt.compare(currentPassword, rows[0]?.password_hash || '');
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE admin_users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newHash, req.session.user.id]
    );

    res.json({ message: 'Password changed successfully' });
  } catch (e) {
    console.error('POST /api/auth/change-password', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// -------------------- RESOURCES -------------------------
app.get('/api/resources', async (req, res) => {
  try {
    const { kind } = req.query;
    const q = kind
      ? `SELECT * FROM resources WHERE kind = $1 ORDER BY name`
      : `SELECT * FROM resources ORDER BY kind, name`;
    const params = kind ? [String(kind).toUpperCase()] : [];
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (e) {
    console.error('GET /api/resources', e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/resources', requireAuth(['ADMIN', 'STAFF']), async (req, res) => {
  try {
    const { kind, name, subcategory, type, quantity = 1, status = 'Available' } = req.body || {};
    if (!kind || !name) return res.status(400).json({ error: 'kind and name are required' });
    if (quantity < 0) return res.status(400).json({ error: 'quantity must be >= 0' });
    if (!['Available', 'Maintenance', 'Inactive'].includes(status))
      return res.status(400).json({ error: 'invalid status' });

    const { rows } = await pool.query(
      `INSERT INTO resources (kind, name, subcategory, type, quantity, status)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, kind, name, subcategory, type, quantity, status`,
      [String(kind).toUpperCase(), name, subcategory ?? null, type ?? null, quantity, status]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505')
      return res.status(409).json({ error: 'Duplicate resource name for this kind' });
    console.error('POST /api/resources', e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.patch('/api/resources/:id', requireAuth(['ADMIN', 'STAFF']), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });

    const allowed = ['name', 'subcategory', 'type', 'quantity', 'status'];
    const input = Object.fromEntries(
      Object.entries(req.body || {}).filter(([k]) => allowed.includes(k))
    );
    if (Object.keys(input).length === 0)
      return res.status(400).json({ error: 'no fields to update' });
    if ('quantity' in input && input.quantity < 0)
      return res.status(400).json({ error: 'quantity must be >= 0' });
    if ('status' in input && !['Available', 'Maintenance', 'Inactive'].includes(input.status))
      return res.status(400).json({ error: 'invalid status' });

    const fields = [];
    const vals = [];
    let i = 1;
    for (const [k, v] of Object.entries(input)) {
      fields.push(`${k} = $${i++}`);
      vals.push(v);
    }
    vals.push(id);

    const { rows } = await pool.query(
      `UPDATE resources SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${i}
       RETURNING id, kind, name, subcategory, type, quantity, status`,
      vals
    );
    if (!rows[0]) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (e) {
    if (e.code === '23505')
      return res.status(409).json({ error: 'Duplicate resource name for this kind' });
    console.error('PATCH /api/resources/:id', e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/resources/:id', requireAuth(['ADMIN', 'STAFF']), async (req, res) => {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });

    const hardQ = String(req.query.hard || req.query.mode || '').toLowerCase().trim();
    const isHard = hardQ === '1' || hardQ === 'true' || hardQ === 'hard';

    if (!isHard) {
      const { rowCount } = await pool.query(
        `UPDATE resources SET status = 'Inactive', updated_at = NOW() WHERE id = $1`,
        [id]
      );
      if (!rowCount) return res.status(404).json({ error: 'not found' });
      return res.status(204).end();
    }

    await client.query('BEGIN');
    const active = await client.query(
      `SELECT 1 FROM bookings 
       WHERE resource_id = $1 AND status IN ('REQUEST','ONGOING') LIMIT 1`,
      [id]
    );
    if (active.rowCount > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'in_use',
        message:
          'Cannot delete: there are active bookings (REQUEST/ONGOING) for this resource.',
      });
    }

    await client.query(
      `DELETE FROM bookings 
       WHERE resource_id = $1 AND status IN ('SUCCESS','CANCEL')`,
      [id]
    );

    const del = await client.query(`DELETE FROM resources WHERE id = $1`, [id]);
    if (del.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'not found' });
    }

    await client.query('COMMIT');
    return res.status(204).end();
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('DELETE /api/resources/:id', e);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// -------------------- BOOKINGS -------------------------
app.get('/api/bookings', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM bookings ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (e) {
    console.error('GET /api/bookings', e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/bookings', async (req, res) => {
  try {
    const {
      kind, resource_id, resource_name, start_dt, end_dt,
      quantity, requester_name, requester_role, purpose
    } = req.body || {};

    if (!kind || !resource_id || !resource_name || !start_dt || !end_dt)
      return res.status(400).json({ error: 'Missing required fields' });

    const start = new Date(start_dt);
    const end = new Date(end_dt);
    if (!(start instanceof Date && !isNaN(start)) || !(end instanceof Date && !isNaN(end)))
      return res.status(400).json({ error: 'Invalid datetime format' });
    if (end <= start)
      return res.status(400).json({ error: 'End time must be after start time' });

    const conflict = await pool.query(
      `
      SELECT 1
      FROM bookings
      WHERE kind = $1
        AND resource_id = $2
        AND status IN ('REQUEST', 'ONGOING')
        AND NOT ($4 <= start_dt OR $3 >= end_dt)
      LIMIT 1;
      `,
      [String(kind).toUpperCase(), Number(resource_id), start.toISOString(), end.toISOString()]
    );
    if (conflict.rowCount > 0) {
      return res.status(409).json({
        error: 'CONFLICT',
        message: 'That resource is already booked for this time window. Please choose another time.',
      });
    }

    const ins = await pool.query(
      `
      INSERT INTO bookings
       (kind, resource_id, resource_name, start_dt, end_dt, quantity, status,
        requester_name, requester_role, purpose, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,'REQUEST',$7,$8,$9,NOW(),NOW())
      RETURNING *;
      `,
      [
        String(kind).toUpperCase(),
        Number(resource_id),
        resource_name,
        start.toISOString(),
        end.toISOString(),
        quantity || null,
        requester_name || null,
        requester_role || null,
        purpose || null,
      ]
    );
    res.status(201).json(ins.rows[0]);
  } catch (e) {
    console.error('POST /api/bookings error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/bookings/:id/start', requireAuth(['ADMIN', 'STAFF']), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const upd = await pool.query(
      `UPDATE bookings
       SET status='ONGOING', started_at=NOW(), updated_at=NOW()
       WHERE id=$1
       RETURNING *`,
      [id]
    );
    if (upd.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json(upd.rows[0]);
  } catch (e) {
    console.error('POST /api/bookings/:id/start', e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/bookings/:id/finish', requireAuth(['ADMIN', 'STAFF']), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const upd = await pool.query(
      `UPDATE bookings
       SET status='SUCCESS', ended_at=NOW(), updated_at=NOW()
       WHERE id=$1
       RETURNING *`,
      [id]
    );
    if (upd.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json(upd.rows[0]);
  } catch (e) {
    console.error('POST /api/bookings/:id/finish', e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/bookings/:id/cancel', requireAuth(['ADMIN', 'STAFF']), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const upd = await pool.query(
      `UPDATE bookings
       SET status='CANCEL', canceled_at=NOW(), updated_at=NOW()
       WHERE id=$1
       RETURNING *`,
      [id]
    );
    if (upd.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json(upd.rows[0]);
  } catch (e) {
    console.error('POST /api/bookings/:id/cancel', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// -------------------- STARTUP -------------------------
async function start() {
  try {
    await bootstrap(); // your DB/schema setup
    app.listen(PORT, () => {
      console.log(`API listening on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    // do NOT call process.exit here while debugging; you want to see the error
  }
}

start();

