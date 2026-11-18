import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { buildServer } from './build-server.js';

await buildServer().connect(new StdioServerTransport());
console.error('notes MCP server running on stdio');
