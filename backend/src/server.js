import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import SQLiteStoreFactory from 'better-sqlite3-session-store';
import path from 'path';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';
import { config } from './config.js';
import db from './db.js';
import { verifyGoogleToken, upsertUser, upsertLocalUser, ensureAdmin, createDemoRooms } from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SQLiteStore = SQLiteStoreFactory(session);

const app = express();
app.set('trust proxy', 1);

const sessionMiddleware = session({
  store: new SQLiteStore({
    client: db,
    expired: { clear: true, intervalMs: 900000 },
  }),
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7,
  },
});

app.use(helmet());
app.use(cors({ origin: config.baseUrl, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(sessionMiddleware);

createDemoRooms();

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not signed in' });
  }
  next();
}

app.post('/api/auth/google', async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ error: 'Missing idToken' });
    }
    const { email, name, sub } = await verifyGoogleToken(idToken);
    const user = upsertUser({ email, name, sub });
    req.session.user = { id: user.id, email: user.email, displayName: user.display_name, role: user.role };
    return res.json({ user: req.session.user });
  } catch (error) {
    console.error('Auth error', error);
    return res.status(401).json({ error: 'Unable to verify Google sign-in' });
  }
});

app.post('/api/auth/dev', (req, res) => {
  if (!config.devAuthEnabled) {
    return res.status(403).json({ error: 'Dev auth disabled' });
  }
  const { name } = req.body || {};
  const safeName = typeof name === 'string' && name.trim() ? name.trim().slice(0, 40) : 'Dev User';
  const id = `dev_${nanoid(10)}`;
  const email = `${id}@local.test`;
  const user = upsertLocalUser({ id, email, name: safeName });
  req.session.user = { id: user.id, email: user.email, displayName: user.display_name, role: user.role };
  return res.json({ user: req.session.user });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

app.get('/api/me', requireAuth, (req, res) => {
  return res.json({ user: req.session.user });
});

app.get('/api/config', (req, res) => {
  res.json({
    googleClientId: config.googleClientId || null,
    baseUrl: config.baseUrl,
    devAuthEnabled: config.devAuthEnabled,
  });
});

app.get('/api/rooms', requireAuth, (req, res) => {
  const rooms = db.prepare('SELECT * FROM rooms').all();
  res.json({ rooms });
});

app.post('/api/rooms', (req, res) => {
  try {
    ensureAdmin(req.session.user);
    const { name, type, description, minecraft_host, minecraft_port, minecraft_version, minecraft_web_url, resource_pack } = req.body;
    if (!name || !type) return res.status(400).json({ error: 'Missing fields' });
    const id = nanoid(12);
    db.prepare(
      `INSERT INTO rooms (id, name, type, description, minecraft_host, minecraft_port, minecraft_version, minecraft_web_url, resource_pack)
       VALUES (@id, @name, @type, @description, @minecraft_host, @minecraft_port, @minecraft_version, @minecraft_web_url, @resource_pack)`
    ).run({ id, name, type, description, minecraft_host, minecraft_port, minecraft_version, minecraft_web_url, resource_pack });
    res.status(201).json({ room: db.prepare('SELECT * FROM rooms WHERE id = ?').get(id) });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.put('/api/rooms/:id', (req, res) => {
  try {
    ensureAdmin(req.session.user);
    const { id } = req.params;
    const { name, type, description, minecraft_host, minecraft_port, minecraft_version, minecraft_web_url, resource_pack } = req.body;
    db.prepare(
      `UPDATE rooms SET name=@name, type=@type, description=@description, minecraft_host=@minecraft_host, minecraft_port=@minecraft_port, minecraft_version=@minecraft_version, minecraft_web_url=@minecraft_web_url, resource_pack=@resource_pack WHERE id=@id`
    ).run({ id, name, type, description, minecraft_host, minecraft_port, minecraft_version, minecraft_web_url, resource_pack });
    res.json({ room: db.prepare('SELECT * FROM rooms WHERE id = ?').get(id) });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.delete('/api/rooms/:id', (req, res) => {
  try {
    ensureAdmin(req.session.user);
    db.prepare('DELETE FROM rooms WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.get('/api/messages/:roomId', requireAuth, (req, res) => {
  const { roomId } = req.params;
  const messages = db
    .prepare(
      `SELECT messages.*, users.display_name as display_name FROM messages
       JOIN users ON users.id = messages.user_id WHERE room_id = ? AND deleted = 0 ORDER BY created_at DESC LIMIT 50`
    )
    .all(roomId);
  res.json({ messages });
});

app.post('/api/export/:roomId', requireAuth, (req, res) => {
  const { roomId } = req.params;
  const messages = db
    .prepare(
      `SELECT messages.*, users.display_name as display_name FROM messages
       JOIN users ON users.id = messages.user_id WHERE room_id = ? ORDER BY created_at ASC`
    )
    .all(roomId);
  const lines = messages.map((m) => `[${m.created_at}] ${m.display_name}: ${m.body}`).join('\n');
  res.setHeader('Content-Disposition', `attachment; filename="room-${roomId}-transcript.txt"`);
  res.type('text/plain').send(lines);
});

function adminGate(req, res, next) {
  try {
    ensureAdmin(req.session.user);
    next();
  } catch (error) {
    res.status(403).send('Admin access required');
  }
}

app.use('/admin', adminGate, express.static(path.join(__dirname, 'public/admin')));
app.use('/', express.static(path.join(__dirname, 'public/app')));

const server = app.listen(config.port, () => {
  console.log(`ChatterDocs Portal running at ${config.baseUrl}`);
});

// WebSocket handling
const wss = new WebSocketServer({ noServer: true });

const connections = new Map();

function authenticateSession(request) {
  return new Promise((resolve) => {
    sessionMiddleware(request, {}, () => {
      resolve(request.session && request.session.user ? request.session.user : null);
    });
  });
}

server.on('upgrade', async (request, socket, head) => {
  if (request.url.startsWith('/ws')) {
    const user = await authenticateSession(request);
    if (!user) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      ws.user = user;
      wss.emit('connection', ws, request);
    });
  }
});

wss.on('connection', (ws, request) => {
  const params = new URL(request.url, config.baseUrl).searchParams;
  const roomId = params.get('room');
  if (!roomId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room required' }));
    ws.close();
    return;
  }
  ws.roomId = roomId;
  ws.recentMessages = [];
  const group = connections.get(roomId) || new Set();
  group.add(ws);
  connections.set(roomId, group);

  ws.on('message', (data) => {
    try {
      const payload = JSON.parse(data.toString());
      if (payload.type === 'chat') {
        if (!payload.body || payload.body.length > 500) {
          ws.send(JSON.stringify({ type: 'error', message: 'Message too long' }));
          return;
        }
        const now = Date.now();
        ws.recentMessages = ws.recentMessages.filter((ts) => now - ts < 10_000);
        if (ws.recentMessages.length >= 5) {
          ws.send(JSON.stringify({ type: 'error', message: 'You are sending messages too quickly' }));
          return;
        }
        ws.recentMessages.push(now);
        db.prepare(
          'INSERT INTO messages (id, room_id, user_id, body) VALUES (@id, @room_id, @user_id, @body)'
        ).run({ id: nanoid(12), room_id: roomId, user_id: ws.user.id, body: payload.body });
        const message = {
          type: 'chat',
          id: nanoid(12),
          body: payload.body,
          roomId,
          user: { id: ws.user.id, displayName: ws.user.displayName },
          createdAt: new Date().toISOString(),
        };
        for (const client of group) {
          client.send(JSON.stringify(message));
        }
      }
    } catch (error) {
      console.error('WebSocket error', error);
    }
  });

  ws.on('close', () => {
    const set = connections.get(roomId);
    if (set) {
      set.delete(ws);
      if (set.size === 0) connections.delete(roomId);
    }
  });

  ws.send(JSON.stringify({ type: 'ready', roomId }));
});
