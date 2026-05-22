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
      ordens_servico: {
        Row: {
          id: string
          company_id: string
          store_id: string | null
          numero: number
          cliente_id: string | null
          bicicleta_id: string | null
          status: string
          problema_relatado: string
          diagnostico: string | null
          observacoes_internas: string | null
          opened_by: string | null
          created_at: string
          updated_at: string
          closed_at: string | null
        }
        Insert: {
          id?: string
          company_id: string
          store_id?: string | null
          numero?: number
          cliente_id?: string | null
          bicicleta_id?: string | null
          status?: string
          problema_relatado?: string
          diagnostico?: string | null
          observacoes_internas?: string | null
          opened_by?: string | null
          created_at?: string
          updated_at?: string
          closed_at?: string | null
        }
        Update: {
          company_id?: string
          store_id?: string | null
          numero?: number
          cliente_id?: string | null
          bicicleta_id?: string | null
          status?: string
          problema_relatado?: string
          diagnostico?: string | null
          observacoes_internas?: string | null
          opened_by?: string | null
          created_at?: string
          updated_at?: string
          closed_at?: string | null
        }
      }
      os_anexos: {
        Row: {
          id: string
          company_id: string
          os_id: string
          caminho_storage: string
          nome_arquivo: string
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          os_id: string
          caminho_storage: string
          nome_arquivo: string
          created_at?: string
        }
        Update: {
          company_id?: string
          os_id?: string
          caminho_storage?: string
          nome_arquivo?: string
          created_at?: string
        }
      }
      os_checklist_itens: {
        Row: {
          id: string
          company_id: string
          os_id: string
          rotulo: string
          concluido: boolean
          ordem: number
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          os_id: string
          rotulo: string
          concluido?: boolean
          ordem?: number
          created_at?: string
        }
        Update: {
          company_id?: string
          os_id?: string
          rotulo?: string
          concluido?: boolean
          ordem?: number
          created_at?: string
        }
      }
      os_itens: {
        Row: {
          id: string
          company_id: string
          os_id: string
          tipo: string
          estoque_item_id: string | null
          servico_catalogo_id: string | null
          descricao: string
          quantidade: number
          preco_unitario: number
          movimentacao_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          os_id: string
          tipo: string
          estoque_item_id?: string | null
          servico_catalogo_id?: string | null
          descricao: string
          quantidade?: number
          preco_unitario?: number
          movimentacao_id?: string | null
          created_at?: string
        }
        Update: {
          company_id?: string
          os_id?: string
          tipo?: string
          estoque_item_id?: string | null
          servico_catalogo_id?: string | null
          descricao?: string
          quantidade?: number
          preco_unitario?: number
          movimentacao_id?: string | null
          created_at?: string
        }
      }
      estoque_itens: {
        Row: {
          ativo: boolean
          categoria: string
          company_id: string
          created_at: string
          custo_medio: number
          descricao: string | null
          estoque_minimo: number
          fornecedor_id: string | null
          id: string
          imagem_url: string | null
          nome: string
          preco_atacado: number
          preco_varejo: number
          saldo_atual: number
          sku: string
          sku_fornecedor: string | null
          store_id: string | null
          unidade: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria?: string
          company_id: string
          created_at?: string
          custo_medio?: number
          descricao?: string | null
          estoque_minimo?: number
          fornecedor_id?: string | null
          id?: string
          imagem_url?: string | null
          nome: string
          preco_atacado?: number
          preco_varejo?: number
          saldo_atual?: number
          sku: string
          sku_fornecedor?: string | null
          store_id?: string | null
          unidade?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria?: string
          company_id?: string
          custo_medio?: number
          descricao?: string | null
          estoque_minimo?: number
          fornecedor_id?: string | null
          imagem_url?: string | null
          nome?: string
          preco_atacado?: number
          preco_varejo?: number
          saldo_atual?: number
          sku?: string
          sku_fornecedor?: string | null
          store_id?: string | null
          unidade?: string
          updated_at?: string
        }
      }
      estoque_movimentacoes: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          item_id: string
          observacao: string | null
          origem: string | null
          quantidade: number
          store_id: string | null
          tipo: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          item_id: string
          observacao?: string | null
          origem?: string | null
          quantidade: number
          store_id?: string | null
          tipo: string
        }
        Update: {
          company_id?: string
          created_by?: string | null
          item_id?: string
          observacao?: string | null
          origem?: string | null
          quantidade?: number
          store_id?: string | null
          tipo?: string
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
      catalogo_servicos: {
        Row: {
          id: string
          company_id: string
          store_id: string | null
          nome: string
          descricao: string | null
          preco_sugerido: number
          ordem: number
          ativo: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          store_id?: string | null
          nome: string
          descricao?: string | null
          preco_sugerido?: number
          ordem?: number
          ativo?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          store_id?: string | null
          nome?: string
          descricao?: string | null
          preco_sugerido?: number
          ordem?: number
          ativo?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      orcamentos: {
        Row: {
          id: string
          company_id: string
          store_id: string
          numero: number
          cliente_id: string | null
          bicicleta_id: string | null
          status: string
          resumo: string
          observacoes: string | null
          desconto: number
          valido_ate: string | null
          token_aprovacao: string | null
          convertido_os_id: string | null
          convertido_venda_id: string | null
          aprovado_cliente_em: string | null
          aprovacao_vista_em: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id: string
          store_id: string
          numero?: number
          cliente_id?: string | null
          bicicleta_id?: string | null
          status?: string
          resumo?: string
          observacoes?: string | null
          desconto?: number
          valido_ate?: string | null
          token_aprovacao?: string | null
          convertido_os_id?: string | null
          convertido_venda_id?: string | null
          aprovado_cliente_em?: string | null
          aprovacao_vista_em?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          store_id?: string
          numero?: number
          cliente_id?: string | null
          bicicleta_id?: string | null
          status?: string
          resumo?: string
          observacoes?: string | null
          desconto?: number
          valido_ate?: string | null
          token_aprovacao?: string | null
          convertido_os_id?: string | null
          convertido_venda_id?: string | null
          aprovado_cliente_em?: string | null
          aprovacao_vista_em?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      orcamento_itens: {
        Row: {
          id: string
          company_id: string
          orcamento_id: string
          tipo: string
          estoque_item_id: string | null
          servico_catalogo_id: string | null
          descricao: string
          quantidade: number
          preco_unitario: number
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          orcamento_id: string
          tipo: string
          estoque_item_id?: string | null
          servico_catalogo_id?: string | null
          descricao: string
          quantidade?: number
          preco_unitario?: number
          created_at?: string
        }
        Update: {
          company_id?: string
          orcamento_id?: string
          tipo?: string
          estoque_item_id?: string | null
          servico_catalogo_id?: string | null
          descricao?: string
          quantidade?: number
          preco_unitario?: number
          created_at?: string
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
          store_id: string | null
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
          store_id?: string | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          endereco?: string | null
          email?: string | null
          fone?: string | null
          nome?: string
          observacoes?: string | null
          store_id?: string | null
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
      fornecedores: {
        Row: {
          ativo: boolean
          company_id: string
          contato: string | null
          created_at: string
          email: string | null
          id: string
          nome: string
          prazo_medio_dias: number
          store_id: string | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          company_id: string
          contato?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nome: string
          prazo_medio_dias?: number
          store_id?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          company_id?: string
          contato?: string | null
          email?: string | null
          nome?: string
          prazo_medio_dias?: number
          store_id?: string | null
          telefone?: string | null
          updated_at?: string
        }
      }
      estoque_kit_componentes: {
        Row: {
          company_id: string
          componente_item_id: string
          created_at: string
          id: string
          kit_id: string
          quantidade: number
        }
        Insert: {
          company_id: string
          componente_item_id: string
          created_at?: string
          id?: string
          kit_id: string
          quantidade: number
        }
        Update: {
          company_id?: string
          componente_item_id?: string
          kit_id?: string
          quantidade?: number
        }
      }
      estoque_kits: {
        Row: {
          ativo: boolean
          company_id: string
          created_at: string
          id: string
          item_resultante_id: string | null
          nome: string
          sku: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          company_id: string
          created_at?: string
          id?: string
          item_resultante_id?: string | null
          nome: string
          sku: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          company_id?: string
          item_resultante_id?: string | null
          nome?: string
          sku?: string
          updated_at?: string
        }
      }
      vendas: {
        Row: {
          bicicleta_id: string | null
          cliente_id: string | null
          company_id: string
          created_at: string
          desconto: number
          forma_pagamento: string
          id: string
          numero: number
          observacao: string | null
          realizada_em: string
          status: string
          store_id: string
          subtotal: number
          total: number
          vendedor_id: string | null
        }
        Insert: {
          bicicleta_id?: string | null
          cliente_id?: string | null
          company_id: string
          created_at?: string
          desconto?: number
          forma_pagamento?: string
          id?: string
          numero?: number
          observacao?: string | null
          realizada_em?: string
          status?: string
          store_id: string
          subtotal?: number
          total?: number
          vendedor_id?: string | null
        }
        Update: {
          bicicleta_id?: string | null
          cliente_id?: string | null
          desconto?: number
          forma_pagamento?: string
          numero?: number
          observacao?: string | null
          realizada_em?: string
          status?: string
          store_id?: string
          subtotal?: number
          total?: number
          vendedor_id?: string | null
        }
      }
      venda_itens: {
        Row: {
          company_id: string
          created_at: string
          descricao: string
          estoque_item_id: string | null
          id: string
          movimentacao_id: string | null
          preco_unitario: number
          quantidade: number
          venda_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          descricao: string
          estoque_item_id?: string | null
          id?: string
          movimentacao_id?: string | null
          preco_unitario?: number
          quantidade?: number
          venda_id: string
        }
        Update: {
          descricao?: string
          estoque_item_id?: string | null
          movimentacao_id?: string | null
          preco_unitario?: number
          quantidade?: number
          venda_id?: string
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
