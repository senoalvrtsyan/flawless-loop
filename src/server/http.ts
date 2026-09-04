// The HTTP layer. D42: `node:http` plus a hand-rolled router — no framework, so the server's
// runtime dependency count stays zero (`node:http` + `node:sqlite` + nothing).
//
// Three things live here and nothing else: a method+pathname switch, a request body reader, and
// an SSE helper. Handlers are `(req, res)` shaped, so Express remains a drop-in if this ever
// becomes a burden (D42 consequence 4).

import type { IncomingMessage, ServerResponse } from 'node:http';

export type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
) => void | Promise<void>;

export type Route = { method: string; path: string; handler: Handler };

/** Send a JSON response. The only response shape this server has, other than SSE. */
export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
  });
  res.end(text);
}

/**
 * Read the request body as TEXT, not as parsed JSON.
 *
 * Deliberate: DESIGN.md §5.1 requires the ingest boundary to persist what it REJECTS, raw body
 * retained (`signal_deliveries.payload_json`, disposition `rejected_invalid`). A helper that
 * parsed and threw would destroy the bytes we are required to keep — which is the same reason
 * D42 ruled out a framework's parse-and-400. Parsing is the handler's job.
 *
 * `limit` guards against an unbounded body; exceeding it destroys the socket rather than
 * buffering on.
 */
export async function readBody(req: IncomingMessage, limit = 8 * 1024 * 1024): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > limit) {
      req.destroy();
      throw new Error(`request body exceeds ${limit} bytes`);
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export type SseConnection = {
  /** Returns false when the socket buffer is full — backpressure point 2 (DESIGN §11). */
  send: (event: string, data: unknown, id?: number) => boolean;
  close: () => void;
};

/**
 * Take over a response as an SSE stream. Written here at B04 because D42 scopes the router to
 * this chunk; the first caller is B09 (`GET /api/stream`).
 *
 * `no-transform` and `x-accel-buffering` stop an intermediary coalescing the flush tick, which
 * would silently turn a 250 ms live number into a stuttering one.
 */
export function openSse(res: ServerResponse): SseConnection {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  res.flushHeaders();

  return {
    send(event, data, id) {
      if (res.writableEnded) return false;
      const frame =
        (id === undefined ? '' : `id: ${id}\n`) +
        `event: ${event}\n` +
        `data: ${JSON.stringify(data)}\n\n`;
      return res.write(frame);
    },
    close() {
      if (!res.writableEnded) res.end();
    },
  };
}

/**
 * Build the request listener. Exact method + pathname match, in registration order; anything
 * else is a 404. An exception out of a handler is a 500 — logged server-side, and the message is
 * returned because the only client is a strategist on localhost with the terminal in view.
 */
export function createRouter(routes: readonly Route[]) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const route = routes.find((r) => r.method === req.method && r.path === url.pathname);

    if (!route) {
      sendJson(res, 404, { error: 'not_found', method: req.method, path: url.pathname });
      return;
    }
    try {
      await route.handler(req, res, url);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[server] ${req.method} ${url.pathname} failed:`, err);
      if (!res.headersSent) sendJson(res, 500, { error: 'internal', message });
      else res.end();
    }
  };
}
