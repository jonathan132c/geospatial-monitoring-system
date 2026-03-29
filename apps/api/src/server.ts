import { buildApp } from './app';

const { app, config } = buildApp();

const start = async (): Promise<void> => {
  try {
    await app.listen({ port: config.port, host: config.host });
  } catch (error) {
    app.log.error({ error }, 'Failed to start API');
    process.exit(1);
  }
};

void start();
