import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSyncQueue, type SyncDependencies } from './sync.ts';

function createHarness(isOnline = true) {
  const storage = new Map<string, string>();
  const requests: Array<{ url: string; method: string }> = [];
  const notifications: number[] = [];
  const outcomes: Array<{ ok: boolean; status: number } | Error> = [];
  let nextId = 0;

  const dependencies: SyncDependencies = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => { storage.set(key, value); },
    isOnline: () => isOnline,
    fetch: async (url, options) => {
      requests.push({ url, method: options.method });
      const outcome = outcomes.shift() ?? { ok: true, status: 200 };
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
    createId: () => `action-${++nextId}`,
    now: () => 123,
    notifyQueueUpdated: () => { notifications.push(1); },
  };

  return {
    queue: createSyncQueue(dependencies),
    storage,
    requests,
    notifications,
    outcomes,
    dependencies,
  };
}

const action = (url: string) => ({
  url,
  method: 'POST',
  body: JSON.stringify({ saved: true }),
  headers: { 'Content-Type': 'application/json' },
});

test('queued actions persist and replay successfully', async () => {
  const harness = createHarness();
  harness.queue.queueAction(action('/save'));
  assert.equal(harness.queue.getQueuedActions().length, 1);

  await harness.queue.syncData();

  assert.deepEqual(harness.requests, [{ url: '/save', method: 'POST' }]);
  assert.deepEqual(harness.queue.getQueuedActions(), []);
  assert.equal(harness.notifications.length, 2);
});

test('offline queue remains persisted and is not replayed', async () => {
  const harness = createHarness(false);
  harness.queue.queueAction(action('/offline-save'));

  await harness.queue.syncData();

  assert.equal(harness.requests.length, 0);
  assert.equal(harness.queue.getQueuedActions().length, 1);
  const recreatedQueue = createSyncQueue(harness.dependencies);
  assert.equal(recreatedQueue.getQueuedActions()[0].url, '/offline-save');
});

test('network failures and server errors stay queued for retry', async () => {
  const harness = createHarness();
  harness.queue.queueAction(action('/network-error'));
  harness.queue.queueAction(action('/server-error'));
  harness.outcomes.push(new Error('Failed to fetch'), { ok: false, status: 503 });

  await harness.queue.syncData();

  assert.deepEqual(harness.queue.getQueuedActions().map(item => item.url), [
    '/network-error',
    '/server-error',
  ]);

  harness.outcomes.push({ ok: true, status: 200 }, { ok: true, status: 200 });
  await harness.queue.syncData();
  assert.deepEqual(harness.queue.getQueuedActions(), []);
});

test('client errors are dequeued to avoid retrying invalid requests', async () => {
  const harness = createHarness();
  harness.queue.queueAction(action('/invalid'));
  harness.outcomes.push({ ok: false, status: 422 });

  await harness.queue.syncData();

  assert.deepEqual(harness.queue.getQueuedActions(), []);
});
