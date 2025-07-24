const express = require('express');
const cors = require('cors');
const http = require('http'); // --- WEBSOCKET ---
const { Server } = require('socket.io'); // --- WEBSOCKET ---

const app = express();
const server = http.createServer(app); // --- WEBSOCKET ---
const io = new Server(server, {
  cors: {
    origin: '*'
  }
}); // --- WEBSOCKET ---

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Datos en memoria
const userLocations = {};  // { name: { latitude, longitude, speed, timestamp } }
let intersections = [];    // [{ id, latitude, longitude }]
let semaforos = [];        // [{ id, latitude, longitude }]
let trafficLights = [];    // [{ latitude, longitude }]

// --- WEBSOCKET: envío de advertencias ---
function detectarConflictos() {
  const usuarios = Object.entries(userLocations);
  const conflictos = [];

  for (let i = 0; i < usuarios.length; i++) {
    const [nombreA, locA] = usuarios[i];
    for (let j = i + 1; j < usuarios.length; j++) {
      const [nombreB, locB] = usuarios[j];
      const distancia = getDistance(locA.latitude, locA.longitude, locB.latitude, locB.longitude);
      if (distancia < 1000) {
        conflictos.push({ a: nombreA, b: nombreB, distancia });
        io.emit('conflicto', { a: nombreA, b: nombreB, distancia });
      }
    }
  }
}

// --- WebSocket: conexión ---
io.on('connection', (socket) => {
  console.log('🛜 Cliente conectado a WebSocket');

  socket.on('disconnect', () => {
    console.log('🔌 Cliente desconectado de WebSocket');
  });
});

// --- RUTA DE DIAGNÓSTICO ---
app.get('/api/ping', (req, res) => {
  res.json({ pong: true });
});

// --- API para usuarios y posiciones ---
app.post('/api/location', (req, res) => {
  const { name = 'Sin nombre', latitude, longitude, speed } = req.body;

  if (!name || typeof latitude !== 'number' || typeof longitude !== 'number') {
    return res.status(400).json({ error: 'Datos inválidos' });
  }

  const timestamp = Date.now();
  userLocations[name] = { latitude, longitude, speed, timestamp };
  detectarConflictos(); // --- WEBSOCKET ---
  res.json({ status: 'ok', timestamp });
});

app.get('/api/locations', (req, res) => {
  res.json(userLocations);
});

app.delete('/api/location/:name', (req, res) => {
  const { name } = req.params;
  if (userLocations[name]) {
    delete userLocations[name];
    return res.json({ status: 'deleted' });
  }
  res.status(404).json({ error: 'Usuario no encontrado' });
});

setInterval(() => {
  const now = Date.now();
  const INACTIVITY_LIMIT = 60000;
  for (const [name, loc] of Object.entries(userLocations)) {
    if (now - loc.timestamp > INACTIVITY_LIMIT) {
      delete userLocations[name];
    }
  }
}, 30000);

// --- CRUD Intersecciones ---
app.post('/api/intersections', (req, res) => {
  const { latitude, longitude } = req.body;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return res.status(400).json({ error: 'Latitude y longitude requeridos' });
  }
  const id = Date.now().toString();
  intersections.push({ id, latitude, longitude });
  res.json({ id, latitude, longitude });
});

app.get('/api/intersections', (req, res) => {
  res.json(intersections);
});

app.delete('/api/intersections/:id', (req, res) => {
  const { id } = req.params;
  const before = intersections.length;
  intersections = intersections.filter(i => i.id !== id);
  if (intersections.length === before) {
    return res.status(404).json({ error: 'No encontrada' });
  }
  res.json({ status: 'deleted' });
});

// --- CRUD Semáforos ---
app.post('/api/semaforos', (req, res) => {
  const { latitude, longitude } = req.body;
  const id = Date.now().toString();
  semaforos.push({ id, latitude, longitude });
  res.status(201).json({ id, latitude, longitude });
});

app.get('/api/semaforos', (req, res) => {
  res.json(semaforos);
});

app.get('/api/traffic-lights', (req, res) => {
  res.json(trafficLights);
});

app.post('/api/traffic-lights', (req, res) => {
  const { latitude, longitude } = req.body;
  trafficLights.push({ latitude, longitude });
  res.status(201).json({ status: 'ok' });
});

app.delete('/api/traffic-lights', (req, res) => {
  const { latitude, longitude } = req.body;
  const prevCount = trafficLights.length;
  trafficLights = trafficLights.filter(
    (light) =>
      Math.abs(light.latitude - latitude) > 0.00001 ||
      Math.abs(light.longitude - longitude) > 0.00001
  );
  if (trafficLights.length === prevCount) {
    return res.status(404).json({ error: 'Semáforo no encontrado' });
  }
  res.json({ status: 'deleted' });
});

// --- Semáforo lógica y herramientas ---
const PROXIMITY_RADIUS = 50;

function getDistance(lat1, lon1, lat2, lon2) {
  const toRad = d => d * Math.PI / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getBearing(lat1, lon1, lat2, lon2) {
  const toRad = d => (d * Math.PI) / 180;
  const toDeg = r => (r * 180) / Math.PI;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
            Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function trajectoriesCross(b1, b2) {
  const diff = Math.abs(b1 - b2);
  return (diff > 45 && diff < 135) || (diff > 225 && diff < 315);
}

function isNear(loc, inter) {
  return getDistance(loc.latitude, loc.longitude, inter.latitude, inter.longitude) <= PROXIMITY_RADIUS;
}

app.get('/api/semaphore/:name', (req, res) => {
  const userLoc = userLocations[req.params.name];
  if (!userLoc) return res.status(404).json({ error: 'Usuario no encontrado' });

  const nearby = intersections.filter(i => isNear(userLoc, i));
  if (!nearby.length) return res.json({ color: null });

  const inter = nearby[0];
  const others = Object.entries(userLocations).filter(([n, l]) =>
    n !== req.params.name && isNear(l, inter)
  );

  const userBr = getBearing(userLoc.latitude, userLoc.longitude, inter.latitude, inter.longitude);
  for (const [, oLoc] of others) {
    const oBr = getBearing(oLoc.latitude, oLoc.longitude, inter.latitude, inter.longitude);
    if (trajectoriesCross(userBr, oBr)) return res.json({ color: 'red' });
  }
  res.json({ color: 'green' });
});

app.get('/api/semaphores', (req, res) => {
  const result = {};
  for (const [name, loc] of Object.entries(userLocations)) {
    const nearby = intersections.filter(i => isNear(loc, i));
    if (!nearby.length) {
      result[name] = { color: null };
      continue;
    }

    const inter = nearby[0];
    const others = Object.entries(userLocations).filter(([n, l]) =>
      n !== name && isNear(l, inter)
    );

    let color = 'green';
    const userBr = getBearing(loc.latitude, loc.longitude, inter.latitude, inter.longitude);
    for (const [, oLoc] of others) {
      const oBr = getBearing(oLoc.latitude, oLoc.longitude, inter.latitude, inter.longitude);
      if (trajectoriesCross(userBr, oBr)) {
        color = 'red';
        break;
      }
    }
    result[name] = { color };
  }
  res.json(result);
});

app.get('/', (req, res) => {
  res.send('Backend funcionando correctamente 🚦✈️');
});

app.use((err, req, res, next) => {
  console.error('💥 Error inesperado:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// --- INICIO DEL SERVIDOR con WebSocket ---
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Servidor (con WebSocket) escuchando en http://0.0.0.0:${PORT}`);
});
