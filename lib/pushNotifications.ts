'use client'

import { Capacitor } from '@capacitor/core'
import { PushNotifications, Token } from '@capacitor/push-notifications'
import { createClient } from '@/lib/supabase-client'

export async function initPushNotifications() {
  if (!Capacitor.isNativePlatform()) {
    return null
  }

  try {
    const permission = await PushNotifications.requestPermissions()
    if (permission.receive !== 'granted') {
      return null
    }

    await PushNotifications.register()

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
      const data = action.notification.data
      if (data?.type === 'rally') window.location.href = '/comms'
      else if (data?.type === 'shots_fired') window.location.href = '/turf-wars'
      else if (data?.type === 'bracelet_drop') window.location.href = '/bracelet-hunt'
      else if (data?.type === 'flare') window.location.href = '/'
    })

    return true
  } catch (err) {
    console.error('[push] init error', err)
    return null
  }
}

async function savePushToken(token: string) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('user_push_tokens').upsert({
      user_id: user.id,
      token,
      platform: Capacitor.getPlatform(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,platform' })
  } catch (err) {
    console.error('[push] failed to save token', err)
  }
}
