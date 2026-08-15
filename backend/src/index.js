'use strict';

require('dotenv').config();

const app    = require('./app');
const prisma = require('./services/prisma');

const PORT = process.env.PORT || 3000;

async function main() {
  // Verify DB connectivity before accepting traffic
  await prisma.$connect();
  console.log('[DB] Prisma connected');

  const server = app.listen(PORT, () => {
    console.log(`[Server] QUIES backend listening on port ${PORT}`);
  });

  // Graceful shutdown: close DB connections before the process exits
  const shutdown = async (signal) => {
    console.log(`[Server] ${signal} received — shutting down`);
    server.close(async () => {
      await prisma.$disconnect();
      console.log('[DB] Prisma disconnected');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[Startup] Fatal error', err);
  process.exit(1);
});
