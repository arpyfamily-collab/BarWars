// public/firebase-messaging-sw.js
// Firebase Cloud Messaging service worker.
// Receives background push notifications when the app is not in focus.
//
// IMPORTANT: This file must be at /public/firebase-messaging-sw.js
// The Firebase config values here are public — safe to include in SW.

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey:            self.__FIREBASE_API_KEY__            || 'REPLACE_ME',
  authDomain:        self.__FIREBASE_AUTH_DOMAIN__        || 'REPLACE_ME',
  projectId:         self.__FIREBASE_PROJECT_ID__         || 'REPLACE_ME',
  storageBucket:     self.__FIREBASE_STORAGE_BUCKET__     || 'REPLACE_ME',
  messagingSenderId: self.__FIREBASE_MESSAGING_SENDER_ID__ || 'REPLACE_ME',
  appId:             self.__FIREBASE_APP_ID__             || 'REPLACE_ME',
})

const messaging = firebase.messaging()

// Background message handler — shows notification when app is not focused
messaging.onBackgroundMessage(payload => {
  const { title, body } = payload.notification ?? {}
  const deepLink = payload.data?.deep_link ?? '/'

  self.registration.showNotification(title ?? 'BarWars', {
    body:    body    ?? '',
    icon:    '/icon-192.png',
    badge:   '/badge-72.png',
    data:    { deep_link: deepLink },
    actions: [{ action: 'open', title: 'Open BarWars' }],
    tag:     payload.data?.source ?? 'barwars',  // deduplicates same-topic notifications
    renotify: true,
  })
})

// Notification click — navigate to deep link
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const deepLink = event.notification.data?.deep_link ?? '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      const existing = windowClients.find(c => c.url.includes(self.location.origin))
      if (existing) {
        existing.focus()
        existing.navigate(self.location.origin + deepLink)
      } else {
        clients.openWindow(self.location.origin + deepLink)
      }
    })
  )
})
