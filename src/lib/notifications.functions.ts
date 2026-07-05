import { createServerFn } from '@tanstack/react-start'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'
import { z } from 'zod'

export const listMyNotifications = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspace_id?: string | null; limit?: number; unread_only?: boolean }) =>
    z.object({
      workspace_id: z.string().uuid().nullish(),
      limit: z.number().int().min(1).max(200).default(30),
      unread_only: z.boolean().default(false),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any
    let q = supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(data.limit)
    if (data.workspace_id) q = q.eq('workspace_id', data.workspace_id)
    if (data.unread_only) q = q.eq('is_read', false)
    const { data: rows, error } = await q
    if (error) throw error
    return rows ?? []
  })

export const countUnreadNotifications = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspace_id?: string | null }) =>
    z.object({ workspace_id: z.string().uuid().nullish() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any
    let q = supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('is_read', false)
    if (data.workspace_id) q = q.eq('workspace_id', data.workspace_id)
    const { count, error } = await q
    if (error) throw error
    return count ?? 0
  })

export const markNotificationRead = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', data.id)
    if (error) throw error
    return { ok: true }
  })

export const markAllNotificationsRead = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { workspace_id?: string | null }) =>
    z.object({ workspace_id: z.string().uuid().nullish() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as any
    let q = supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('is_read', false)
    if (data.workspace_id) q = q.eq('workspace_id', data.workspace_id)
    const { error } = await q
    if (error) throw error
    return { ok: true }
  })
