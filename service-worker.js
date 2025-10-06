/* eslint-disable no-restricted-globals */

// Service Worker для Nastia Calendar
// Обрабатывает push-уведомления о менструальном цикле

const CACHE_NAME = 'nastia-calendar-v1';
const urlsToCache = [
  '/nastia-calendar/',
  '/nastia-calendar/index.html',
  '/nastia-calendar/static/css/main.css',
  '/nastia-calendar/static/js/main.js'
];

// Установка Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .catch(err => console.log('[SW] Cache error:', err))
  );
  self.skipWaiting();
});

// Активация Service Worker
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Обработка fetch запросов
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        return response || fetch(event.request);
      })
  );
});

// Обработка push-уведомлений
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event);

  let data = {
    title: 'Nastia Calendar',
    body: 'У вас новое уведомление',
    icon: '/nastia-calendar/logo192.png',
    badge: '/nastia-calendar/favicon.ico',
    tag: 'nastia-notification',
    requireInteraction: false
  };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/nastia-calendar/logo192.png',
    badge: data.badge || '/nastia-calendar/favicon.ico',
    vibrate: [200, 100, 200],
    tag: data.tag || 'nastia-notification',
    requireInteraction: data.requireInteraction || false,
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1,
      url: data.url || '/nastia-calendar/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Обработка клика по уведомлению
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification click:', event);
  event.notification.close();

  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/nastia-calendar/')
  );
});
