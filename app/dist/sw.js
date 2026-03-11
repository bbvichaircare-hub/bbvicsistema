// Service Worker para BBVIC Gestão Premium
const CACHE_NAME = 'bbvic-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/logo-bbvic.jpg',
  '/manifest.json'
];

// Instalação - cachear assets estáticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Ativação - limpar caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch - estratégia Network First com fallback para cache
self.addEventListener('fetch', (event) => {
  // Ignorar requisições para o Firebase
  if (event.request.url.includes('firebase')) {
    return;
  }
  
  // Ignorar requisições POST/PUT/DELETE
  if (event.request.method !== 'GET') {
    return;
  }
  
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Se a resposta for válida, atualizar o cache
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Se falhar, tentar buscar do cache
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Se não estiver no cache, retornar página offline
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});

// Push Notifications
self.addEventListener('push', (event) => {
  const options = {
    body: event.data?.text() || 'Nova notificação do BBVIC',
    icon: '/logo-bbvic-192.png',
    badge: '/logo-bbvic-72.png',
    vibrate: [100, 50, 100],
    data: {
      url: self.location.origin
    },
    actions: [
      {
        action: 'open',
        title: 'Abrir'
      },
      {
        action: 'close',
        title: 'Fechar'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification('BBVIC Gestão', options)
  );
});

// Clique na notificação
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      clients.openWindow(event.notification.data?.url || '/')
    );
  }
});
