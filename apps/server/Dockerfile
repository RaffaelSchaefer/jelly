# Build from the repository root: docker build -f apps/server/Dockerfile -t jelly-server .
# The stage page bundles three.js, @jelly/scene and @jelly/stage, so pnpm installs them first.
FROM node:24-alpine AS packages
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /src
# The client manifest is only there so the frozen lockfile matches the workspace.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/client/package.json apps/client/
COPY apps/server/package.json apps/server/
COPY packages/jelly-scene/package.json packages/jelly-scene/
COPY packages/jelly-stage/package.json packages/jelly-stage/
RUN --mount=type=cache,id=pnpm,target=/var/cache/pnpm \
    pnpm install --store-dir /var/cache/pnpm --frozen-lockfile --filter @jelly/server...

FROM golang:1.27-alpine AS build
WORKDIR /src/apps/server
COPY apps/server/go.mod apps/server/go.sum ./
RUN go mod download
COPY --from=packages /src /src
COPY packages/jelly-scene /src/packages/jelly-scene
COPY packages/jelly-stage /src/packages/jelly-stage
COPY apps/server /src/apps/server
RUN go generate ./internal/web
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/jelly-server ./cmd/jelly-server
# The volume inherits owner and permissions of this directory on first start.
RUN mkdir -p /out/data

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build --chown=nonroot:nonroot /out/ /app/
ENV JELLY_DB=/app/data/jelly.db JELLY_ADDR=:8080
VOLUME /app/data
EXPOSE 8080
ENTRYPOINT ["/app/jelly-server"]
