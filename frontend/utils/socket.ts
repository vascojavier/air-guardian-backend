import io from 'socket.io-client';

const BACKEND_URL = 'https://air-guardian-backend.onrender.com';

export const socket = io(BACKEND_URL, {
  transports: ['websocket'],
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
});
