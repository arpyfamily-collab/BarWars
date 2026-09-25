'use client'

import { useEffect } from 'react'
import { initPushNotifications } from '@/lib/pushNotifications'

export function PushNotificationInit() {
  useEffect(() => {
    initPushNotifications()
  }, [])

  return null
}
