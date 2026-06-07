ARG NODE_VERSION=24-bookworm-slim

FROM node:${NODE_VERSION} AS build
WORKDIR /workspace

COPY apps/hub-contracts/package*.json apps/hub-contracts/
COPY apps/hub-console/package*.json apps/hub-console/
COPY apps/hub-server/package*.json apps/hub-server/

RUN cd apps/hub-contracts && npm ci
RUN cd apps/hub-console && npm ci
RUN cd apps/hub-server && npm ci

COPY apps/hub-contracts apps/hub-contracts
COPY apps/hub-console apps/hub-console
COPY apps/hub-server apps/hub-server

RUN cd apps/hub-console && VITE_API_BASE=/ npm run build
RUN cd apps/hub-server && npm run build

FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production
ENV HUB_HOST=0.0.0.0
ENV HUB_PORT=4177
ENV TEAMHUB_CONSOLE_DIST_DIR=/opt/teamhub/console

WORKDIR /opt/teamhub

COPY apps/hub-contracts/package*.json apps/hub-contracts/
COPY apps/hub-server/package*.json apps/hub-server/
RUN cd apps/hub-contracts && npm ci --omit=dev \
  && cd ../hub-server && npm ci --omit=dev \
  && npm cache clean --force

COPY --from=build /workspace/apps/hub-contracts/dist apps/hub-contracts/dist
COPY --from=build /workspace/apps/hub-server/dist apps/hub-server/dist
COPY --from=build /workspace/apps/hub-console/dist console

EXPOSE 4177
WORKDIR /opt/teamhub/apps/hub-server
CMD ["node", "dist/main.js"]
