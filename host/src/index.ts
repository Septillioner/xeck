import { serve } from '@hono/node-server';
import { HOST_NAME, HOST_PORT } from './infra/server-config.ts';
import { resolveDataDir } from './infra/data-dir.ts';
import { createApp } from './http/app.ts';

import { recoverInterruptedSubagents } from './stores/sessions.ts';
import { migrationSnapshot } from './migrations/service.ts';

if (!(await migrationSnapshot()).startupRequired) await recoverInterruptedSubagents();
const app = createApp();

serve(
  {
    fetch: app.fetch,
    hostname: HOST_NAME,
    port: HOST_PORT,
  },
  (info) => {
    console.log(`xeck host http://${info.address}:${info.port}`);
    console.log(`data ${resolveDataDir()}`);
  },
);
