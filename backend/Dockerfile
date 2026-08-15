FROM node:20-alpine

WORKDIR /app

# Copy manifests first so Docker can cache the npm install layer
COPY package*.json ./
RUN npm ci --omit=dev

# Copy Prisma schema so the client generator can run
COPY prisma ./prisma
RUN npx prisma generate

# Copy source
COPY src ./src

EXPOSE 3000

# Run migrations then start the server
CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]
