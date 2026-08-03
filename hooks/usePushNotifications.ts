'use client'
/**
 * hooks/usePushNotifications.ts
 *
 * Handles the full FCM registration lifecycle:
 *   1. Check/request Notification permission
 *   2. Register the service worker
 *   3. Get the FCM token via getToken()
 *   4. POST to /api/push/register to save in user_push_tokens
 *   5. Persist registration in localStorage so we don't re-register on every load
 *
 * Usage:
 *   const { status, prompt } = usePushNotifications()
 *   // status: 'idle' | 'requesting' | 'registered' | 'denied' | 'unsupported'
 *   // prompt(): call on user gesture (button tap)
 */

import { useState, useEffect, useCallback } from 'react'

export type PushStatus = 'idle' | 'requesting' | 'registered' | 'denied' | 'unsupported' | 'error'

const STORAGE_KEY = 'bw_push_registered'

export function usePushNotifications() {
  const [status, setStatus] = useState<PushStatus>('idle')
  const [token,  setToken]  = useState<string | null>(null)

  // On mount: if already registered, skip straight to 'registered'
  useEffect(() => {
    if (typeof window === 'undefined') return

    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setStatus('unsupported')
      return
    }

    const cached = localStorage.getItem(STORAGE_KEY)
    if (cached === 'true' && Notification.permission === 'granted') {
      setStatus('registered')
    } else if (Notification.permission === 'denied') {
      setStatus('denied')
    }
  }, [])

  const prompt = useCallback(async () => {
    if (typeof window === 'undefined') return
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setStatus('unsupported')
      return
    }

    setStatus('requesting')

    try {
      // 1. Request permission
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setStatus('denied')
        return
      }

      // 2. Register service worker (firebase-messaging-sw.js must be in /public)
      const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
      await navigator.serviceWorker.ready

      // 3. Dynamically import Firebase to avoid SSR issues
      const { initializeApp, getApps }            = await import('firebase/app')
      const { getMessaging, getToken: getFCMToken } = await import('firebase/messaging')

      const firebaseConfig = {
        apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      }

      const app       = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
      const messaging = getMessaging(app)

      // 4. Get FCM token
      const fcmToken = await getFCMToken(messaging, {
        vapidKey:            process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
        serviceWorkerRegistration: registration,
      })

      if (!fcmToken) throw new Error('FCM token was empty')

      // 5. Register with backend
      const res = await fetch('/api/push/register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token: fcmToken, platform: 'web' }),
      })

      if (!res.ok) throw new Error('Backend registration failed')

      localStorage.setItem(STORAGE_KEY, 'true')
      setToken(fcmToken)
      setStatus('registered')

    } catch (e) {
      console.error('[usePushNotifications]', e)
      setStatus('error')
    }
  }, [])

  const reset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setStatus('idle')
    setToken(null)
  }, [])

  return { status, token, prompt, reset }
}
