# ── Stage 1: Dependencies ─────────────────────────────────────────────────
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

# ── Stage 2: Final image ───────────────────────────────────────────────────
FROM node:20-slim

# Install Chromium and all dependencies Remotion needs for headless rendering
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    wget \
    ca-certificates \
    --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

# Tell Remotion where Chromium lives
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV REMOTION_CHROMIUM_PATH=/usr/bin/chromium

WORKDIR /app

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy all source files
COPY src/ ./src/

# Copy audio assets — baked into the image permanently
# These never change. Adding/changing files requires a rebuild.
COPY assets/ ./assets/

COPY package.json ./

# Pre-download Chrome Headless Shell at build time.
# Remotion uses its own Chrome binary separate from the system Chromium above.
# Baking it into the image prevents a 108MB download on every cold start.
RUN node -e "require('@remotion/renderer').ensureBrowser()"

# Railway assigns PORT dynamically
ENV PORT=3000
EXPOSE 3000
CMD ["node", "src/server.js"]
