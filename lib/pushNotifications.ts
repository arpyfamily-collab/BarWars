'use client'

import { Capacitor } from '@capacitor/core'
import { PushNotifications, Token } from '@capacitor/push-notifications'

export async function initPushNotifications() {
  if (!Capacitor.isNativePlatform()) {
    return null
  }

  try {
    const permission = await PushNotifications.requestPermissions()
    if (permission.receive !== 'granted') {
      return null
    }

    // Listeners first: the token can arrive as soon as register() is called
    await PushNotifications.addListener('registration', (token: Token) => {
      savePushToken(token.value)
    })

    await PushNotifications.addListener('registrationError', (err) => {
      console.error('[push] registration error', err)
    })

    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[push] received', notification)
    })

    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const data: any = action.notification.data ?? {}
      if (typeof data.url === 'string' && data.url.startsWith('/')) { window.location.href = data.url; return }
      if (data.type === 'rally') window.location.href = '/comms'
      else if (data.type === 'shots_fired') window.location.href = '/turf-wars'
      else if (data.type === 'bracelet_drop') window.location.href = '/bracelet-hunt'
      else if (data.type === 'flare') window.location.href = '/'
    })

    await PushNotifications.register()

    return true
  } catch (err) {
    console.error('[push] init error', err)
    return null
  }
}

// iPhone: an Apple device token (sent straight through Apple); Android: a Firebase token
async function savePushToken(token: string) {
  try {
    await fetch('/api/push/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ token, platform: Capacitor.getPlatform() }),
    })
  } catch (err) {
    console.error('[push] failed to save token', err)
  }
}
