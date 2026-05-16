export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      atividades: {
        Row: {
          bicicleta_id: string | null
          cliente_id: string
          company_id: string
          created_at: string
          data_registro: string
          descricao: string
          id: string
          tipo: string
          valor: number | null
        }
        Insert: {
          bicicleta_id?: string | null
          cliente_id: string
          company_id: string
          created_at?: string
          data_registro?: string
          descricao: string
          id?: string
          tipo: string
          valor?: number | null
        }
        Update: {
          bicicleta_id?: string | null
          cliente_id?: string
          company_id?: string
          created_at?: string
          data_registro?: string
          descricao?: string
          id?: string
          tipo?: string
          valor?: number | null
        }
      }
      bicicletas: {
        Row: {
          aro: string | null
          cliente_id: string
          company_id: string
          cor: string | null
          created_at: string
          foto_url: string | null
          id: string
          marca: string
          modelo: string
          numero_serie: string | null
          observacoes: string | null
          quilometragem: number | null
          updated_at: string
        }
        Insert: {
          aro?: string | null
          cliente_id: string
          company_id: string
          cor?: string | null
          created_at?: string
          foto_url?: string | null
          id?: string
          marca: string
          modelo: string
          numero_serie?: string | null
          observacoes?: string | null
          quilometragem?: number | null
          updated_at?: string
        }
        Update: {
          aro?: string | null
          cliente_id?: string
          company_id?: string
          cor?: string | null
          foto_url?: string | null
          marca?: string
          modelo?: string
          numero_serie?: string | null
          observacoes?: string | null
          quilometragem?: number | null
        }
      }
      clientes: {
        Row: {
          company_id: string
          created_at: string
          endereco: string | null
          email: string | null
          fone: string | null
          id: string
          nome: string
          observacoes: string | null
          tags: string[]
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          endereco?: string | null
          email?: string | null
          fone?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          endereco?: string | null
          email?: string | null
          fone?: string | null
          nome?: string
          observacoes?: string | null
          tags?: string[]
        }
      }
      companies: {
        Row: {
          active: boolean
          created_at: string
          id: string
          logo_url: string | null
          name: string
          plan: string
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          id?: string
          logo_url?: string | null
          name: string
          plan?: string
          slug: string
        }
        Update: {
          active?: boolean
          logo_url?: string | null
          name?: string
          plan?: string
        }
      }
      company_memberships: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          is_active?: boolean
          role?: string
          updated_at?: string
          user_id?: string
        }
      }
      stores: {
        Row: {
          active: boolean
          address: string | null
          company_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          company_id: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          address?: string | null
          name?: string
        }
      }
      user_profiles: {
        Row: {
          company_id: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_active: boolean
          role: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean
          role?: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          email?: string
          full_name?: string | null
          is_active?: boolean
          role?: string
          updated_at?: string
        }
      }
    }
    Views: {
      v_clientes_ultima_visita: {
        Row: {
          cliente_id: string | null
          company_id: string | null
          ultima_visita: string | null
        }
      }
    }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']

export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
