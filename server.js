// Simple WebRTC signalling relay
const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: process.env.PORT || 3000 });

const rooms = {};

// Generate a random 4‑letter room code
function randomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

wss.on('connection', (ws) => {
  let myRoom = null;
  let myRole = null; // 'host' or 'client'

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      return;
    }

    switch (msg.type) {
      case 'create':
        // Create a new room and put this host in it
        const code = randomCode();
        rooms[code] = { host: ws, client: null };
        myRoom = code;
        myRole = 'host';
        ws.send(JSON.stringify({ type: 'created', code }));
        break;

      case 'join':
        // Join an existing room as client
        const room = rooms[msg.code];
        if (room && !room.client) {
          room.client = ws;
          myRoom = msg.code;
          myRole = 'client';
          // Notify both sides
          room.host.send(JSON.stringify({ type: 'joined' }));
          ws.send(JSON.stringify({ type: 'joined' }));
        } else {
          ws.send(JSON.stringify({ type: 'error', message: 'Room not found or full' }));
        }
        break;

      case 'relay':
        // Forward message to the other peer in the room
        if (!myRoom || !rooms[myRoom]) return;
        const target = myRole === 'host' ? rooms[myRoom].client : rooms[myRoom].host;
        if (target && target.readyState === WebSocket.OPEN) {
          target.send(JSON.stringify(msg));
        }
        break;
    }
  });

  ws.on('close', () => {
    // Clean up room on disconnect
    if (myRoom && rooms[myRoom]) {
      const room = rooms[myRoom];
      if (myRole === 'host') {
        if (room.client) {
          room.client.close();
        }
        delete rooms[myRoom];
      } else if (myRole === 'client') {
        room.client = null;
        // Optionally notify host
        if (room.host && room.host.readyState === WebSocket.OPEN) {
          room.host.send(JSON.stringify({ type: 'peer_disconnected' }));
        }
      }
    }
  });
});

console.log('Signalling server running');
