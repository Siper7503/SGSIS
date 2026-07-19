export interface SyncAction {
  id: string;
  url: string;
  method: string;
  body: any;
  headers: any;
  timestamp: number;
}

export function getQueuedActions(): SyncAction[] {
  try {
    return JSON.parse(localStorage.getItem('sgsied_sync_queue') || '[]');
  } catch {
    return [];
  }
}

export function queueAction(action: Omit<SyncAction, 'id' | 'timestamp'>) {
  const actions = getQueuedActions();
  const newAction = {
    ...action,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
  };
  actions.push(newAction);
  localStorage.setItem('sgsied_sync_queue', JSON.stringify(actions));
  
  // Dispatch custom event to notify UI
  window.dispatchEvent(new CustomEvent('sync_queue_updated'));
}

export function clearQueuedAction(id: string) {
  const actions = getQueuedActions();
  localStorage.setItem('sgsied_sync_queue', JSON.stringify(actions.filter(a => a.id !== id)));
  window.dispatchEvent(new CustomEvent('sync_queue_updated'));
}

export async function syncData() {
  if (!navigator.onLine) return;
  
  const actions = getQueuedActions();
  if (actions.length === 0) return;

  for (const action of actions) {
    try {
      const res = await fetch(action.url, {
        method: action.method,
        headers: action.headers,
        body: action.body
      });
      if (res.ok || res.status >= 400 && res.status < 500) {
        // If success or client error (bad request), remove from queue to avoid infinite retries
        clearQueuedAction(action.id);
      }
    } catch (e) {
      console.error("Sync failed for action", action.id, e);
      // Keep in queue if it's a network error
    }
  }
}

// Global listener for coming back online
if (typeof window !== 'undefined') {
  window.addEventListener('online', syncData);
}
