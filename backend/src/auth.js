import { OAuth2Client } from 'google-auth-library';
import { config } from './config.js';
import db from './db.js';
import { nanoid } from 'nanoid';

const googleClient = new OAuth2Client(config.googleClientId);

export async function verifyGoogleToken(idToken) {
  if (!config.googleClientId) {
    throw new Error('GOOGLE_CLIENT_ID is not configured');
  }
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: config.googleClientId,
  });
  const payload = ticket.getPayload();
  return {
    email: payload.email,
    name: payload.name || payload.email,
    sub: payload.sub,
  };
}

export function upsertUser({ email, name, sub }) {
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(sub);
  const adminExists = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get().count > 0;
  if (!existing) {
    db.prepare(
      'INSERT INTO users (id, email, display_name, role) VALUES (@id, @email, @name, @role)'
    ).run({
      id: sub,
      email,
      name,
      role: adminExists ? 'user' : 'admin',
    });
  } else if (existing.display_name !== name) {
    db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(name, sub);
  }
  return db.prepare('SELECT * FROM users WHERE id = ?').get(sub);
}

export function upsertLocalUser({ id, email, name }) {
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  const adminExists = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get().count > 0;
  if (!existing) {
    db.prepare(
      'INSERT INTO users (id, email, display_name, role) VALUES (@id, @email, @name, @role)'
    ).run({
      id,
      email,
      name,
      role: adminExists ? 'user' : 'admin',
    });
  } else if (existing.display_name !== name || existing.email !== email) {
    db.prepare('UPDATE users SET display_name = ?, email = ? WHERE id = ?').run(name, email, id);
  }
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function ensureAdmin(user) {
  if (!user || user.role !== 'admin') {
    const error = new Error('Forbidden');
    error.status = 403;
    throw error;
  }
}

export function createDemoRooms() {
  const roomCount = db.prepare('SELECT COUNT(*) as count FROM rooms').get().count;
  if (roomCount === 0) {
    const insert = db.prepare(
      'INSERT INTO rooms (id, name, type, description, minecraft_host, minecraft_port, minecraft_version, minecraft_web_url) VALUES (@id, @name, @type, @description, @minecraft_host, @minecraft_port, @minecraft_version, @minecraft_web_url)'
    );
    insert.run({
      id: nanoid(12),
      name: 'Lobby',
      type: 'chat',
      description: 'Welcome to ChatterDocs Portal',
      minecraft_host: null,
      minecraft_port: null,
      minecraft_version: null,
      minecraft_web_url: null,
    });
    insert.run({
      id: nanoid(12),
      name: 'Minecraft Hub',
      type: 'minecraft',
      description: 'Play with friends directly from this room',
      minecraft_host: 'wss://example-mc-host',
      minecraft_port: 443,
      minecraft_version: '1.20.x',
      minecraft_web_url: 'https://example-minecraft-web-client.example',
    });
  }
}
