# Web ban ten mien MienTay Media. Chay sau Traefik cua Coolify (xem deploy/vps).
FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

# better-sqlite3 13 tu bien dich bang node-gyp khi cai, can python3 va trinh bien dich C++
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
# Can devDependencies de build (tsc) va chay cong cu kiem tra (tsx: migrate, seed, kiem-tra, pa:probe)
RUN npm ci --include=dev --no-audit --no-fund

COPY . .
RUN npm run build

ENV PORT=3000 \
    DATABASE_FILE=/data/app.sqlite
# Thu muc du lieu thuoc user node de volume moi tao cung ghi duoc
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
EXPOSE 3000

USER node
CMD ["node", "dist/server.js"]
