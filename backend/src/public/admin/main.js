const roomsEl = document.getElementById('rooms');
const form = document.getElementById('roomForm');
const deleteBtn = document.getElementById('deleteBtn');
const refreshBtn = document.getElementById('refreshBtn');
let selectedRoom = null;

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
  roomsEl.innerHTML = 'Loading...';
  try {
    const { rooms } = await fetchJSON('/api/rooms');
    roomsEl.innerHTML = '';
    rooms.forEach((room) => {
      const card = document.createElement('div');
      card.className = 'channel';
      card.innerHTML = `<strong>${room.name}</strong><p>${room.type}</p>`;
      card.addEventListener('click', () => selectRoom(room));
      roomsEl.appendChild(card);
    });
  } catch (error) {
    roomsEl.textContent = 'Admin access required or not signed in.';
  }
}

function selectRoom(room) {
  selectedRoom = room;
  form.name.value = room.name;
  form.description.value = room.description || '';
  form.type.value = room.type;
  form.minecraft_host.value = room.minecraft_host || '';
  form.minecraft_port.value = room.minecraft_port || '';
  form.minecraft_version.value = room.minecraft_version || '';
  form.minecraft_web_url.value = room.minecraft_web_url || '';
  form.resource_pack.value = room.resource_pack || '';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = Object.fromEntries(new FormData(form).entries());
  payload.minecraft_port = payload.minecraft_port ? Number(payload.minecraft_port) : null;
  const method = selectedRoom ? 'PUT' : 'POST';
  const url = selectedRoom ? `/api/rooms/${selectedRoom.id}` : '/api/rooms';
  try {
    await fetchJSON(url, { method, body: JSON.stringify(payload) });
    selectedRoom = null;
    form.reset();
    await loadRooms();
  } catch (error) {
    alert('Save failed. Are you signed in as admin?');
  }
});

deleteBtn.addEventListener('click', async () => {
  if (!selectedRoom) return;
  try {
    await fetchJSON(`/api/rooms/${selectedRoom.id}`, { method: 'DELETE' });
    selectedRoom = null;
    form.reset();
    await loadRooms();
  } catch (error) {
    alert('Delete failed. Are you signed in as admin?');
  }
});

refreshBtn.addEventListener('click', loadRooms);

loadRooms();
