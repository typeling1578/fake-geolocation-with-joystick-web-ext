export default async function fetchCore(url: string, options: RequestInit & { timeout?: number } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => { controller.abort() }, options.timeout || 15000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      ...options,
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    return response;
  } finally {
    clearTimeout(timeout);
  }
}