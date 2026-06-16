export type VisibilityLevel =
  | 'confidential'
  | 'private'
  | 'family'
  | 'circle'
  | 'public'
  | 'testament'

export type CaptureFormat = 'text' | 'voice' | 'vlog' | 'photo'
export type EmotionTag = 'joy' | 'pride' | 'nostalgia' | 'sadness' | 'gratitude'
export type ThematicCategory = 'places' | 'people' | 'moments' | 'transitions' | 'objects' | 'values'

type ProfileRow = {
  id: string
  email: string
  display_name: string | null
  avatar_url: string | null
  onboarding_completed: boolean
  tier: 'discovery' | 'memory'
  created_at: string
}

export type ConversationMessage = { role: 'user' | 'assistant'; content: string }

type AlineaRow = {
  id: string
  user_id: string
  title: string | null
  content: string | null
  format: CaptureFormat
  media_url: string | null
  visibility: VisibilityLevel
  emotion: EmotionTag | null
  category: ThematicCategory | null
  approximate_date: string | null
  event_year: number | null
  event_month: number | null
  event_day: number | null
  location: string | null
  conversation_history: ConversationMessage[] | null
  created_at: string
  updated_at: string
}

type CircleRow = {
  id: string
  owner_id: string
  name: string
  created_at: string
}

type CircleMemberRow = {
  circle_id: string
  user_id: string
  added_at: string
}

type AlineaCircleRow = {
  alinea_id: string
  circle_id: string
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow
        Insert: Omit<ProfileRow, 'created_at'>
        Update: Partial<Omit<ProfileRow, 'id' | 'created_at'>>
        Relationships: []
      }
      alineas: {
        Row: AlineaRow
        Insert: Omit<AlineaRow, 'id' | 'created_at' | 'updated_at' | 'title' | 'content' | 'media_url' | 'emotion' | 'category' | 'approximate_date' | 'location'> & {
          title?: string | null
          content?: string | null
          media_url?: string | null
          emotion?: EmotionTag | null
          category?: ThematicCategory | null
          approximate_date?: string | null
          event_year?: number | null
          event_month?: number | null
          event_day?: number | null
          location?: string | null
        }
        Update: Partial<Omit<AlineaRow, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
        Relationships: []
      }
      circles: {
        Row: CircleRow
        Insert: Omit<CircleRow, 'id' | 'created_at'>
        Update: Partial<Omit<CircleRow, 'id' | 'owner_id' | 'created_at'>>
        Relationships: []
      }
      circle_members: {
        Row: CircleMemberRow
        Insert: Omit<CircleMemberRow, 'added_at'>
        Update: Record<string, unknown>
        Relationships: []
      }
      alinea_circles: {
        Row: AlineaCircleRow
        Insert: AlineaCircleRow
        Update: Record<string, unknown>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
  }
}
