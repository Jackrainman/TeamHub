import { buildHubServer } from './server.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4177;

async function main(): Promise<void> {
  const app = buildHubServer();
  const host = process.env.HUB_HOST ?? DEFAULT_HOST;
  const port = Number.parseInt(process.env.HUB_PORT ?? String(DEFAULT_PORT), 10);

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('invalid HUB_PORT');
  }

  await app.listen({ host, port });
  app.log.info(`teamhub hub-server listening on http://${host}:${port}`);
}

main().catch((error) => {
  console.error(`[teamhub-hub-server] ${(error as Error).message}`);
  process.exit(1);
});
