// HORA service worker: receives pushes from the push worker and shows them as notifications,
// even when no HORA tab is open.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }

  // The same tag the open app uses, so one alert never shows twice on a device
  event.waitUntil(
    self.registration.showNotification(data.title || 'HORA', {
      body: data.body || '',
      tag: data.tag,
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if ('focus' in client) {
          await client.focus();
          client.postMessage({ type: 'hora:open-execution' });
          return;
        }
      }
      await self.clients.openWindow(`${self.registration.scope}?view=execution`);
    })()
  );
});
