FROM rust:alpine3.18 as builder

WORKDIR /app
RUN apk add musl-dev

COPY . .

RUN cargo install --path proxy --target=x86_64-unknown-linux-musl

FROM alpine:3.18
WORKDIR /app

COPY --from=builder /usr/local/cargo/bin/proxy /usr/local/bin/
COPY --from=builder /app/www ./www/

CMD /usr/local/bin/proxy