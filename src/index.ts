import { createServer } from "./server.ts";
import { startServer } from "./transports/start.ts";

const server = createServer();
await startServer(server);
