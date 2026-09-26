# Unified image: Vite frontend + Express API (same origin /api)
FROM node:22-alpine AS frontend-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts postcss.config.js tailwind.config.js tsconfig.json tsconfig.node.json ./
COPY public ./public
COPY src ./src
# Same-origin API — leave VITE_API_URL empty
RUN npm run build

FROM node:22-alpine AS server-build
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/tsconfig.json server/drizzle.config.ts ./
COPY server/src ./src
COPY server/drizzle ./drizzle
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV STATIC_DIR=/app/public
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=server-build /app/dist ./dist
COPY --from=server-build /app/drizzle ./drizzle
COPY --from=frontend-build /app/dist ./public
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
