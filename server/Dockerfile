FROM node:20-alpine AS base
WORKDIR /app

# Install only production deps
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# Copy source
COPY index.js prompt.js adapters.js aggregate.js corpus.js auth.js stats.js features.js ./
COPY scripts/ ./scripts/

# Corpus is bind-mounted to a volume so it survives container restarts.
RUN mkdir -p /data/corpus && chown -R node:node /data
ENV CORPUS_DIR=/data/corpus
ENV PORT=8787
EXPOSE 8787

USER node
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:8787/v1/health || exit 1

CMD ["node", "index.js"]
