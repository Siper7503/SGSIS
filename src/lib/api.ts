import { queueAction } from './sync.ts';

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const isRead = !options.method || options.method === 'GET' || options.method === 'HEAD';
  
  if (!navigator.onLine && !isRead) {
    queueAction({
      url,
      method: options.method as string,
      headers: options.headers,
      body: options.body
    });
    
    return {
      ok: true,
      json: async () => ({ status: 'queued', offline: true })
    } as Response;
  }
  
  if (!navigator.onLine && isRead) {
    const cached = localStorage.getItem(`cache_${url}`);
    if (cached) {
      return {
        ok: true,
        json: async () => JSON.parse(cached)
      } as Response;
    }
    throw new Error('Offline and no cache available');
  }
  
  try {
    const response = await fetch(url, options);
    
    if (isRead && response.ok) {
      const cloned = response.clone();
      cloned.json().then(data => {
        localStorage.setItem(`cache_${url}`, JSON.stringify(data));
      }).catch(() => {});
    }
    
    return response;
  } catch (error: any) {
    if (!isRead && (error.name === 'TypeError' || error.message.includes('Failed to fetch'))) {
       queueAction({
        url,
        method: options.method as string,
        headers: options.headers,
        body: options.body
      });
      return {
        ok: true,
        json: async () => ({ status: 'queued', offline: true })
      } as Response;
    }
    throw error;
  }
}
