ARG NODE_VERSION=24-bookworm-slim

FROM node:${NODE_VERSION} AS build
WORKDIR /workspace

COPY package.json package-lock.json ./
COPY apps/hub-contracts/package.json apps/hub-contracts/package.json
COPY apps/hub-console/package.json apps/hub-console/package.json
COPY apps/hub-server/package.json apps/hub-server/package.json

RUN npm ci

COPY apps/hub-contracts apps/hub-contracts
COPY apps/hub-console apps/hub-console
COPY apps/hub-server apps/hub-server

RUN VITE_API_BASE=/ npm run build

# 同一依赖图在构建后裁成运行时依赖；全 Dockerfile 只执行一次 npm ci。
RUN npm prune --omit=dev \
  --workspace @teamhub/hub-contracts \
  --workspace @teamhub/hub-server

FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production
ENV HUB_HOST=0.0.0.0
ENV HUB_PORT=4177
ENV TEAMHUB_CONSOLE_DIST_DIR=/opt/teamhub/console

WORKDIR /opt/teamhub

COPY --from=build /workspace/package.json /workspace/package-lock.json ./
COPY --from=build /workspace/node_modules node_modules
COPY --from=build /workspace/apps/hub-contracts/package.json apps/hub-contracts/package.json
COPY --from=build /workspace/apps/hub-contracts/node_modules apps/hub-contracts/node_modules
COPY --from=build /workspace/apps/hub-contracts/dist apps/hub-contracts/dist
COPY --from=build /workspace/apps/hub-server/package.json apps/hub-server/package.json
COPY --from=build /workspace/apps/hub-server/node_modules apps/hub-server/node_modules
COPY --from=build /workspace/apps/hub-server/dist apps/hub-server/dist
COPY --from=build /workspace/apps/hub-console/dist console

EXPOSE 4177
WORKDIR /opt/teamhub/apps/hub-server
CMD ["node", "dist/main.js"]
