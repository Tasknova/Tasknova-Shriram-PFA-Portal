'use client'

import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Subscribes to Supabase Realtime changes on ai_calls, ai_evaluations,
 * and ai_transcripts. Invokes onChange (debounced) when any row is inserted or updated.
 */
export function useAiCallingRealtime(onChange: () => void, enabled = true) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!enabled) {
      return
    }

    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const scheduleRefresh = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }
      debounceTimer = setTimeout(() => {
        onChangeRef.current()
      }, 300)
    }

    const channel = supabase
      .channel('ai-calling-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ai_calls' },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ai_evaluations' },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ai_transcripts' },
        scheduleRefresh
      )
      .subscribe()

    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }
      void supabase.removeChannel(channel)
    }
  }, [enabled])
}
