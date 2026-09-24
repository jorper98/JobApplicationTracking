FROM node:20-alpine

WORKDIR /app

# Copy version.json first (from root context)
COPY version.json ./

# Read version from version.json at build time
ARG APP_VERSION
RUN if [ -f version.json ]; then \
      APP_VERSION=$(cat version.json | grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4); \
    fi
ENV NEXT_PUBLIC_APP_VERSION=${APP_VERSION}

COPY frontend/package*.json ./
RUN npm install

COPY frontend/. .

EXPOSE 8137
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0", "--port", "8137"]
