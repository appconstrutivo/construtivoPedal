import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url?.trim() && anonKey?.trim())

let client: SupabaseClient | null = null

if (isSupabaseConfigured) {
  client = createClient(url!, anonKey!)
}

export const supabase = client
