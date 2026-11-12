# syntax=docker/dockerfile:1

# Build on the builder's own architecture: there are no native modules, so the
# compiled output and node_modules are the same for every target platform.
FROM --platform=$BUILDPLATFORM node:26-trixie-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json index.ts feed.ts ./
RUN npm run build && npm prune --omit=dev --ignore-scripts

# Distroless: Node and its runtime libraries only. No shell, no package manager,
# no npm. The :nonroot tag runs as uid 65532. Keep the Node major version in
# step with the build stage above.
FROM gcr.io/distroless/nodejs26-debian13:nonroot
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json /app/index.js /app/feed.js ./

EXPOSE 3000

# The base image's entrypoint is node
CMD ["index.js"]
