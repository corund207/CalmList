# One image: builds the site (landing page, app at /app/, endpoints) and serves it with the sync API on a single port.
# Base images are pinned by digest (node 24.22.2, Alpine).
FROM node:24-alpine@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85 AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY web/package.json web/
COPY server/package.json server/
RUN npm ci --no-audit --no-fund
COPY . .
# Build-time settings baked into the app; all optional, and public by design (the anon key is not a secret).
ARG VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= VITE_GOOGLE_CLIENT_ID= VITE_WEB_APP_URL=
RUN npm run build:site

FROM node:24-alpine@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85
WORKDIR /app
ENV NODE_ENV=production PORT=8787 DATABASE_PATH=/data/calmlist.db STATIC_DIR=../../_site FUNCTIONS_DIR=../../_functions
COPY package.json package-lock.json ./
COPY server/package.json server/
RUN npm ci --omit=dev --no-audit --no-fund --workspace server --include-workspace-root=false
COPY server/src server/src
# The server shares the task <-> calendar mapping with the app.
COPY web/package.json web/
COPY web/src/lib web/src/lib
COPY --from=build /app/_site _site
COPY --from=build /app/_functions _functions
# The SQLite file lives on a volume; a new volume takes this directory's owner, so the app can write it as non-root.
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8787/api/health || exit 1
CMD ["node", "server/src/main.ts"]
