import net from 'net';
import { spawn } from 'child_process';

const port = 5173;

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
  console.log(`[Vite] Port ${port} đã chạy, dùng frontend hiện tại.`);
  setInterval(() => {}, 1 << 30);
} else {
  console.log(`[Vite] Port ${port} chưa chạy, khởi động Vite...`);
  const child = spawn('npm', ['run', 'dev'], {
    stdio: 'inherit',
    shell: true
  });

  child.on('exit', (code) => {
    process.exit(code || 0);
  });
}
