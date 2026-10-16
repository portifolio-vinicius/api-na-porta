FROM node:24-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --ignore-scripts
COPY backend/ ./
COPY database/prisma/schema.prisma /database/prisma/schema.prisma
RUN npm run build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production API_PORT=3000
WORKDIR /app
RUN apk add --no-cache openssl \
  && addgroup -S -g 1000 naporta \
  && adduser -S -u 1000 -G naporta naporta
COPY --from=build --chown=1000:1000 /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build --chown=1000:1000 /app/dist ./dist
COPY --from=build --chown=1000:1000 /app/node_modules/.prisma ./node_modules/.prisma
USER 1000:1000
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
