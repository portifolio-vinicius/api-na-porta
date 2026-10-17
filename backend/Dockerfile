FROM node:24.21.0-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS build
WORKDIR /workspace/backend
RUN apk add --no-cache openssl
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --ignore-scripts
COPY backend/ ./
COPY database/prisma/schema.prisma /workspace/database/prisma/schema.prisma
RUN npm run build && npm prune --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:24.21.0-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS runtime
ENV NODE_ENV=production API_PORT=3000
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=build --chown=1000:1000 /workspace/backend/package.json /workspace/backend/package-lock.json ./
COPY --from=build --chown=1000:1000 /workspace/backend/node_modules ./node_modules
COPY --from=build --chown=1000:1000 /workspace/backend/dist ./dist
USER 1000:1000
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
