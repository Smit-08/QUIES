'use strict';

const { PrismaClient } = require('@prisma/client');

// Single PrismaClient instance shared across the whole process.
// Instantiating multiple clients in the same process wastes connection-pool slots.
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
});

module.exports = prisma;
