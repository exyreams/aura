FROM oven/bun:1-alpine AS build

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build && \
    bun x esbuild dist/index.js \
      --bundle \
      --platform=node \
      --target=node24 \
      --outfile=bundle.js \
      --external:bufferutil \
      --external:utf-8-validate

FROM gcr.io/distroless/nodejs24-debian12:nonroot AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/bundle.js ./bundle.js

EXPOSE 8787

CMD ["--no-deprecation", "bundle.js"]
