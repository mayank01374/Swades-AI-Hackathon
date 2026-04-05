FROM oven/bun:1 AS base

WORKDIR /app

COPY package.json package-lock.json turbo.json tsconfig.json ./
COPY apps ./apps
COPY packages ./packages

RUN bun install --frozen-lockfile

WORKDIR /app/apps/server

RUN bun run build

EXPOSE 3000

CMD ["bun", "run", "dist/index.mjs"]
