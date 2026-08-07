FROM node:20-bookworm-slim

# Dependências de sistema: cliente PostgreSQL (pg_dump/pg_restore/psql), curl, unzip, tar
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client \
    curl \
    unzip \
    tar \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Instala a Supabase CLI (binário standalone, não é pacote npm oficial de produção)
RUN curl -fsSL https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.tar.gz -o /tmp/supabase.tar.gz \
    && tar -xzf /tmp/supabase.tar.gz -C /usr/local/bin \
    && chmod +x /usr/local/bin/supabase \
    && rm /tmp/supabase.tar.gz

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src

RUN mkdir -p /app/tmp

ENV NODE_ENV=production
ENV PORT=3333

EXPOSE 3333

CMD ["node", "src/server.js"]
