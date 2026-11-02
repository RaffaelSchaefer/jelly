# Build from apps/server: docker build -t jelly-server .
FROM golang:1.27-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
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
