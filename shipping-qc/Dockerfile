# On-prem image: docker build -t shipping-qc . && docker run -d -p 4100:4100 -v qcdata:/data shipping-qc
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production QC_DATA_DIR=/data PORT=4100
COPY --from=build /app /app
VOLUME /data
EXPOSE 4100
CMD ["node", "server/dist/index.js"]
