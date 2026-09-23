# One image: builds the web app and serves it with the sync API on a single port.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY web/package.json web/
COPY server/package.json server/
RUN npm ci
COPY . .
RUN npm run build --workspace web

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8787 DATABASE_PATH=/data/calmlist.db
COPY package.json package-lock.json ./
COPY server/package.json server/
RUN npm ci --omit=dev --workspace server --include-workspace-root=false
COPY server/src server/src
COPY --from=build /app/web/dist web/dist
VOLUME /data
EXPOSE 8787
CMD ["node", "server/src/main.ts"]
