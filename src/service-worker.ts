/// <reference lib="webworker" />
/* eslint-disable no-restricted-globals */

import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute, PrecacheEntry, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { StaleWhileRevalidate } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<PrecacheEntry | string>;
};

clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

const appShellHandler = createHandlerBoundToURL(`${process.env.PUBLIC_URL}/index.html`);
const navigationRoute = new NavigationRoute(appShellHandler);
registerRoute(navigationRoute);

registerRoute(
  ({ request }) => ['style', 'script', 'worker'].includes(request.destination),
  new StaleWhileRevalidate({ cacheName: 'nastia-static-resources' })
);

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

const resolveAssetUrl = (path: string): string => new URL(path, self.registration.scope).toString();

interface NastiaNotificationPayload {
  title?: string;
  body?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  requireInteraction?: boolean;
  vibrate?: number[];
  url?: string;
  id?: string;
  type?: string;
  sentAt?: string;
}

self.addEventListener('push', event => {
  const defaultPayload: Required<NastiaNotificationPayload> = {
    title: 'Nastia Calendar',
    body: 'У вас новое уведомление',
    icon: resolveAssetUrl('logo192.png'),
    badge: resolveAssetUrl('favicon.ico'),
    tag: 'nastia-notification',
    requireInteraction: false,
    vibrate: [200, 100, 200],
    url: `${self.registration.scope}`,
    id: `${Date.now()}`,
    type: 'generic',
    sentAt: new Date().toISOString(),
  };

  let payload: NastiaNotificationPayload = { ...defaultPayload };

  if (event.data) {
    try {
      payload = { ...defaultPayload, ...event.data.json() };
    } catch (error) {
      payload = { ...defaultPayload, body: event.data.text() };
    }
  }

  // Android Chrome поддерживает vibrate, но TypeScript типы его не включают
  const options: NotificationOptions & { vibrate?: number[] } = {
    body: payload.body,
    icon: payload.icon,
    badge: payload.badge,
    tag: payload.tag,
    requireInteraction: payload.requireInteraction,
    vibrate: payload.vibrate,
    data: {
      url: payload.url ?? defaultPayload.url,
      dateOfArrival: Date.now(),
      id: payload.id ?? defaultPayload.id,
      type: payload.type ?? defaultPayload.type,
      sentAt: payload.sentAt ?? defaultPayload.sentAt,
    },
  };

  event.waitUntil((async () => {
    await self.registration.showNotification(payload.title ?? defaultPayload.title, options);
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      client.postMessage({
        type: 'nastia-notification',
        payload: {
          id: options.data?.id,
          title: payload.title ?? defaultPayload.title,
          body: payload.body ?? defaultPayload.body,
          type: options.data?.type,
          sentAt: options.data?.sentAt,
          url: options.data?.url,
        },
      });
    }
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = (() => {
    const raw = (event.notification.data && (event.notification.data as { url?: string }).url) || `${self.registration.scope}`;
    try {
      return new URL(raw, self.registration.scope).toString();
    } catch {
      return `${self.registration.scope}`;
    }
  })();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clientList => {
      for (const client of clientList) {
        if ('focus' in client) {
          try {
            const clientUrl = new URL(client.url);
            const target = new URL(targetUrl);
            if (clientUrl.origin === target.origin && clientUrl.pathname === target.pathname) {
              await client.focus();
              client.postMessage({
                type: 'nastia-open',
                payload: { url: targetUrl },
              });
              return;
            }
          } catch {
            // ignore parsing errors
          }
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});

export {};
