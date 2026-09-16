import net from 'net';

const port = parseInt(process.env.PORT, 10) || 3001;

function canConnect(host) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });

    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.setTimeout(700, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function isPortOpen() {
  const hosts = ['127.0.0.1', '::1', 'localhost'];
  for (const host of hosts) {
    if (await canConnect(host)) return true;
  }
  return false;
}

if (await isPortOpen()) {
  console.log(`[Backend] Port ${port} đã chạy, dùng backend hiện tại.`);
  setInterval(() => {}, 1 << 30);
} else {
  console.log(`[Backend] Port ${port} chưa chạy, khởi động cron-service.js...`);
  await import('../cron-service.js');
}
