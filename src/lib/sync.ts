export interface SyncAction {
  id: string;
  url: string;
  method: string;
  body: BodyInit | null | undefined;
  headers?: HeadersInit;
  timestamp: number;
}

interface SyncResponse {
  ok: boolean;
  status: number;
}

export interface SyncDependencies {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  isOnline(): boolean;
  fetch(url: string, options: {
    method: string;
    headers?: HeadersInit;
    body?: BodyInit | null;
  }): Promise<SyncResponse>;
  createId(): string;
  now(): number;
  notifyQueueUpdated(): void;
  logError?(message: string, actionId: string, error: unknown): void;
}

const QUEUE_KEY = 'sgsied_sync_queue';

export function createSyncQueue(dependencies: SyncDependencies) {
  function getQueuedActions(): SyncAction[] {
    try {
      const parsed: unknown = JSON.parse(dependencies.getItem(QUEUE_KEY) || '[]');
      return Array.isArray(parsed)
        ? parsed.filter((action): action is SyncAction => (
          Boolean(action) &&
          typeof action === 'object' &&
          typeof action.id === 'string' &&
          typeof action.url === 'string' &&
          typeof action.method === 'string' &&
          typeof action.timestamp === 'number'
        ))
        : [];
    } catch {
      return [];
    }
  }

  function queueAction(action: Omit<SyncAction, 'id' | 'timestamp'>) {
    const actions = getQueuedActions();
    actions.push({
      ...action,
      id: dependencies.createId(),
      timestamp: dependencies.now(),
    });
    dependencies.setItem(QUEUE_KEY, JSON.stringify(actions));
    dependencies.notifyQueueUpdated();
  }

  function clearQueuedAction(id: string) {
    const actions = getQueuedActions();
    dependencies.setItem(QUEUE_KEY, JSON.stringify(actions.filter(action => action.id !== id)));
    dependencies.notifyQueueUpdated();
  }

  async function syncData() {
    if (!dependencies.isOnline()) return;

    const actions = getQueuedActions();
    for (const action of actions) {
      try {
        const response = await dependencies.fetch(action.url, {
          method: action.method,
          headers: action.headers,
          body: action.body,
        });
        if (response.ok || (response.status >= 400 && response.status < 500)) {
          clearQueuedAction(action.id);
        }
      } catch (error) {
        dependencies.logError?.('Sync failed for action', action.id, error);
      }
    }
  }

  return { getQueuedActions, queueAction, clearQueuedAction, syncData };
}

const browserQueue = createSyncQueue({
  getItem: key => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
  isOnline: () => navigator.onLine,
  fetch: (url, options) => fetch(url, options),
  createId: () => crypto.randomUUID(),
  now: () => Date.now(),
  notifyQueueUpdated: () => window.dispatchEvent(new CustomEvent('sync_queue_updated')),
  logError: (message, actionId, error) => console.error(message, actionId, error),
});

export const getQueuedActions = browserQueue.getQueuedActions;
export const queueAction = browserQueue.queueAction;
export const clearQueuedAction = browserQueue.clearQueuedAction;
export const syncData = browserQueue.syncData;

if (typeof window !== 'undefined') {
  window.addEventListener('online', syncData);
}
