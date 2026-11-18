import { McpServer, ProtocolError } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

const notes = new Map<string, string>();

export function buildServer(): McpServer {
  const server = new McpServer({ name: 'notes', version: '1.4.0' });

  server.registerTool(
    'add-note',
    { description: 'Save a note under an id', inputSchema: z.object({ id: z.string(), text: z.string() }) },
    async ({ id, text }) => {
      notes.set(id, text);
      return { content: [{ type: 'text', text: `Saved note ${id}` }] };
    },
  );

  server.registerTool(
    'read-note',
    { description: 'Read a note by id', inputSchema: z.object({ id: z.string() }) },
    async ({ id }) => {
      const text = notes.get(id);
      if (text === undefined) throw new ProtocolError(-32002, `Note ${id} not found`);
      return { content: [{ type: 'text', text }] };
    },
  );

  return server;
}
