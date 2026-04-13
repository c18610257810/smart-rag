/**
 * requestUrlFetchAdapter - Use Obsidian's requestUrl as a drop-in replacement for fetch()
 * 
 * Solves: Electron CSP blocking external fetch() calls in Obsidian
 */

import { requestUrl, RequestUrlParam } from 'obsidian';

/**
 * Fetch-like wrapper using Obsidian's requestUrl (bypasses Electron CSP)
 */
export async function requestUrlFetch(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {}
): Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  json: () => Promise<any>;
  text: () => Promise<string>;
}> {
  const params: RequestUrlParam = {
    url,
    method: options.method || 'GET',
    headers: options.headers,
    body: options.body,
    throw: false, // Don't throw on non-200, we handle status manually
  };

  const response = await requestUrl(params);

  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    statusText: response.status.toString(),
    json: async () => {
      if (typeof response.json === 'object' && response.json !== null) {
        return response.json;
      }
      return JSON.parse(response.text);
    },
    text: async () => response.text,
  };
}
