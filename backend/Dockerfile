FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/fairdrop ./cmd/fairdrop

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
COPY --from=build /out/fairdrop /usr/local/bin/fairdrop
EXPOSE 8080
ENTRYPOINT ["fairdrop"]
