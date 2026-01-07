const roomsEl = document.getElementById('rooms');
const serversEl = document.getElementById('servers');
const messagesEl = document.getElementById('messages');
const roomTitleEl = document.getElementById('roomTitle');
const roomSubtitleEl = document.getElementById('roomSubtitle');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const exportBtn = document.getElementById('exportBtn');
const copyBtn = document.getElementById('copyBtn');
const copyChatGPTBtn = document.getElementById('copyChatGPTBtn');
const profanityToggle = document.getElementById('profanityToggle');
const blurImagesToggle = document.getElementById('blurImagesToggle');
const userInfo = document.getElementById('userInfo');
const logoutBtn = document.getElementById('logoutBtn');
const themeToggle = document.getElementById('themeToggle');
const gamePanel = document.getElementById('gamePanel');
const gameEmbed = document.getElementById('gameEmbed');
const gameInfo = document.getElementById('gameInfo');
const launchGameBtn = document.getElementById('launchGameBtn');
const googleSignIn = document.getElementById('googleSignIn');
const devSignInBtn = document.getElementById('devSignInBtn');

let currentRoom = null;
let ws = null;
let transcript = [];
let portalConfig = null;

const profanityList = ['badword', 'curse'];

function censor(text) {
  if (!profanityToggle.checked) return text;
  let result = text;
  profanityList.forEach((word) => {
    const regex = new RegExp(word, 'gi');
    result = result.replace(regex, '***');
  });
  return result;
}

function renderMessage(message) {
  const container = document.createElement('div');
  container.className = 'message';
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `${message.user.displayName} • ${new Date(message.createdAt).toLocaleTimeString()}`;
  const body = document.createElement('div');
  body.className = 'body';

  if (message.body.match(/^https?:\/\/.*\.(png|jpg|jpeg|gif)$/i)) {
    const img = document.createElement('img');
    img.src = message.body;
    img.classList.toggle('blur', blurImagesToggle.checked);
    blurImagesToggle.addEventListener('change', () => {
      img.classList.toggle('blur', blurImagesToggle.checked);
    });
    body.appendChild(img);
  } else {
    body.textContent = censor(message.body);
  }

  container.append(meta, body);
  messagesEl.appendChild(container);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

async function loadRooms() {
  const { rooms } = await fetchJSON('/api/rooms');
  roomsEl.innerHTML = '';
  serversEl.innerHTML = '';
  rooms.forEach((room) => {
    const channel = document.createElement('div');
    channel.className = 'channel';
    channel.dataset.id = room.id;
    channel.innerHTML = `<strong>${room.name}</strong><p>${room.type === 'minecraft' ? 'Minecraft enabled' : 'Chat-only'}</p>`;
    channel.addEventListener('click', () => selectRoom(room));
    roomsEl.appendChild(channel);

    const serverIcon = document.createElement('div');
    serverIcon.className = 'server-icon';
    serverIcon.textContent = room.name[0].toUpperCase();
    serverIcon.title = room.name;
    serverIcon.addEventListener('click', () => selectRoom(room));
    serversEl.appendChild(serverIcon);
  });
  if (!currentRoom && rooms.length > 0) {
    await selectRoom(rooms[0]);
  }
}

function bindWebSocket(room) {
  if (ws) ws.close();
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?room=${room.id}`);
  ws.addEventListener('message', (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type === 'chat') {
      transcript.push(payload);
      renderMessage(payload);
    }
  });
}

async function selectRoom(room) {
  currentRoom = room;
  roomTitleEl.textContent = room.name;
  roomSubtitleEl.textContent = room.description || '';
  document.querySelectorAll('.channel').forEach((c) => c.classList.toggle('active', c.dataset.id === room.id));
  gamePanel.hidden = room.type !== 'minecraft';
  if (room.type === 'minecraft') {
    const parts = [];
    if (room.minecraft_host) parts.push(`Server: ${room.minecraft_host}${room.minecraft_port ? `:${room.minecraft_port}` : ''}`);
    if (room.minecraft_version) parts.push(`Version: ${room.minecraft_version}`);
    if (room.resource_pack) parts.push(`Resource pack/modpack: ${room.resource_pack}`);
    gameInfo.textContent = parts.join(' • ') || 'Configure a Minecraft server and web client URL in admin.';
    launchGameBtn.disabled = !room.minecraft_web_url;
    gameEmbed.textContent = room.minecraft_web_url
      ? 'Ready to launch web client.'
      : 'No web client URL configured.';
  }
  messagesEl.innerHTML = '';
  transcript = [];
  const { messages } = await fetchJSON(`/api/messages/${room.id}`);
  messages.reverse().forEach((m) => {
    const entry = {
      id: m.id,
      body: m.body,
      roomId: m.room_id,
      user: { id: m.user_id, displayName: m.display_name },
      createdAt: m.created_at,
    };
    transcript.push(entry);
    renderMessage(entry);
  });
  bindWebSocket(room);
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
  if (!currentRoom || !ws) return;
  const body = messageInput.value.trim();
  if (!body) return;
  ws.send(JSON.stringify({ type: 'chat', body }));
  messageInput.value = '';
}

exportBtn.addEventListener('click', () => {
  if (!currentRoom) return;
  window.location.href = `/api/export/${currentRoom.id}`;
});

copyBtn.addEventListener('click', () => copyTranscript(transcript));
copyChatGPTBtn.addEventListener('click', () => copyTranscript(transcript, true));

function copyTranscript(entries, forChatGPT = false) {
  const content = entries
    .map((m) => `[${new Date(m.createdAt).toLocaleString()}] ${m.user.displayName}: ${m.body}`)
    .join('\n');
  const formatted = forChatGPT ? `Chat transcript from ChatterDocs:\n\n${content}` : content;
  navigator.clipboard.writeText(formatted);
}

logoutBtn.addEventListener('click', async () => {
  await fetchJSON('/api/logout', { method: 'POST' });
  location.reload();
});

themeToggle.addEventListener('click', () => {
  const isLight = document.body.dataset.theme === 'light';
  document.body.dataset.theme = isLight ? '' : 'light';
});

launchGameBtn.addEventListener('click', () => {
  if (!currentRoom || !currentRoom.minecraft_web_url) return;
  const frame = document.createElement('iframe');
  frame.src = currentRoom.minecraft_web_url;
  frame.title = `Minecraft Web Client - ${currentRoom.name}`;
  frame.loading = 'lazy';
  frame.allow = 'fullscreen; clipboard-read; clipboard-write; gamepad; autoplay';
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-pointer-lock allow-forms allow-popups');
  frame.className = 'game-frame';
  gameEmbed.innerHTML = '';
  gameEmbed.appendChild(frame);
});

async function bootstrap() {
  try {
    portalConfig = await fetchJSON('/api/config');
  } catch (error) {
    console.error('Config load failed', error);
    userInfo.textContent = 'Unable to load config';
    return;
  }
  try {
    const me = await fetchJSON('/api/me');
    userInfo.textContent = me.user.displayName || me.user.email;
    await loadRooms();
  } catch (error) {
    userInfo.textContent = 'Sign in required (Google)';
    initGoogleSignIn();
  }
}

function initGoogleSignIn() {
  const clientId = portalConfig?.googleClientId;
  if (!clientId || !window.google || !google.accounts) {
    googleSignIn.textContent = 'Configure GOOGLE_CLIENT_ID to enable sign-in.';
  } else {
    google.accounts.id.initialize({
      client_id: clientId,
      callback: async (response) => {
        try {
          const result = await fetchJSON('/api/auth/google', {
            method: 'POST',
            body: JSON.stringify({ idToken: response.credential }),
          });
          userInfo.textContent = result.user.displayName || result.user.email;
          googleSignIn.innerHTML = '';
          await loadRooms();
        } catch (error) {
          googleSignIn.textContent = 'Unable to sign in, check console.';
        }
      },
    });
    google.accounts.id.renderButton(googleSignIn, { theme: 'outline', size: 'medium' });
  }
  if (portalConfig?.devAuthEnabled) {
    devSignInBtn.hidden = false;
  }
}

devSignInBtn.addEventListener('click', async () => {
  try {
    const result = await fetchJSON('/api/auth/dev', {
      method: 'POST',
      body: JSON.stringify({ name: 'Local Dev' }),
    });
    userInfo.textContent = result.user.displayName || result.user.email;
    devSignInBtn.hidden = true;
    await loadRooms();
  } catch (error) {
    devSignInBtn.textContent = 'Dev login unavailable';
  }
});

bootstrap();
