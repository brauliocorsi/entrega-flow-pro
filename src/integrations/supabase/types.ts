export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      delivery_fee_ranges: {
        Row: {
          active: boolean
          created_at: string
          fee: number
          id: string
          label: string | null
          notes: string | null
          priority: number
          updated_at: string
          zip_end: string
          zip_start: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          fee?: number
          id?: string
          label?: string | null
          notes?: string | null
          priority?: number
          updated_at?: string
          zip_end: string
          zip_start: string
        }
        Update: {
          active?: boolean
          created_at?: string
          fee?: number
          id?: string
          label?: string | null
          notes?: string | null
          priority?: number
          updated_at?: string
          zip_end?: string
          zip_start?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      route_payment_forecasts: {
        Row: {
          created_at: string
          generated_by: string
          generated_by_name: string | null
          id: string
          items: Json
          route_id: string
          route_snapshot: Json | null
          total_forecast: number
          total_gross: number
          total_orders: number
          total_services: number
        }
        Insert: {
          created_at?: string
          generated_by: string
          generated_by_name?: string | null
          id?: string
          items?: Json
          route_id: string
          route_snapshot?: Json | null
          total_forecast?: number
          total_gross?: number
          total_orders?: number
          total_services?: number
        }
        Update: {
          created_at?: string
          generated_by?: string
          generated_by_name?: string | null
          id?: string
          items?: Json
          route_id?: string
          route_snapshot?: Json | null
          total_forecast?: number
          total_gross?: number
          total_orders?: number
          total_services?: number
        }
        Relationships: []
      }
      route_templates: {
        Row: {
          active: boolean
          color: string
          created_at: string
          default_driver: string | null
          id: string
          max_capacity_m3: number
          max_minutes: number
          name: string
          notes: string | null
          updated_at: string
          weekday: number
          zip_prefixes: string[]
          zone: string
        }
        Insert: {
          active?: boolean
          color?: string
          created_at?: string
          default_driver?: string | null
          id?: string
          max_capacity_m3?: number
          max_minutes?: number
          name: string
          notes?: string | null
          updated_at?: string
          weekday: number
          zip_prefixes?: string[]
          zone: string
        }
        Update: {
          active?: boolean
          color?: string
          created_at?: string
          default_driver?: string | null
          id?: string
          max_capacity_m3?: number
          max_minutes?: number
          name?: string
          notes?: string | null
          updated_at?: string
          weekday?: number
          zip_prefixes?: string[]
          zone?: string
        }
        Relationships: []
      }
      routes: {
        Row: {
          assistant: string | null
          color: string
          created_at: string
          current_volume_m3: number
          deliveries_count: number
          driver: string | null
          id: string
          max_capacity_m3: number
          max_minutes: number
          notes: string | null
          route_date: string
          status: Database["public"]["Enums"]["route_status"]
          template_id: string | null
          updated_at: string
          vehicle: string | null
          zip_prefixes: string[]
          zone: string
        }
        Insert: {
          assistant?: string | null
          color?: string
          created_at?: string
          current_volume_m3?: number
          deliveries_count?: number
          driver?: string | null
          id?: string
          max_capacity_m3?: number
          max_minutes?: number
          notes?: string | null
          route_date: string
          status?: Database["public"]["Enums"]["route_status"]
          template_id?: string | null
          updated_at?: string
          vehicle?: string | null
          zip_prefixes?: string[]
          zone: string
        }
        Update: {
          assistant?: string | null
          color?: string
          created_at?: string
          current_volume_m3?: number
          deliveries_count?: number
          driver?: string | null
          id?: string
          max_capacity_m3?: number
          max_minutes?: number
          notes?: string | null
          route_date?: string
          status?: Database["public"]["Enums"]["route_status"]
          template_id?: string | null
          updated_at?: string
          vehicle?: string | null
          zip_prefixes?: string[]
          zone?: string
        }
        Relationships: [
          {
            foreignKeyName: "routes_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "route_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_deliveries: {
        Row: {
          address: string
          city: string | null
          created_at: string
          customer_name: string
          delivery_type: Database["public"]["Enums"]["delivery_type"]
          estimated_minutes: number
          id: string
          notes: string | null
          order_number: string
          order_payload: Json | null
          outcome: Database["public"]["Enums"]["delivery_outcome"] | null
          outcome_at: string | null
          outcome_notes: string | null
          paid_value: number
          phone: string | null
          remaining_value: number
          rescheduled_from_id: string | null
          route_id: string
          seller_id: string | null
          seller_name: string | null
          status: Database["public"]["Enums"]["delivery_status"]
          total_value: number
          updated_at: string
          volume_m3: number
          zip_code: string | null
        }
        Insert: {
          address: string
          city?: string | null
          created_at?: string
          customer_name: string
          delivery_type?: Database["public"]["Enums"]["delivery_type"]
          estimated_minutes?: number
          id?: string
          notes?: string | null
          order_number: string
          order_payload?: Json | null
          outcome?: Database["public"]["Enums"]["delivery_outcome"] | null
          outcome_at?: string | null
          outcome_notes?: string | null
          paid_value?: number
          phone?: string | null
          remaining_value?: number
          rescheduled_from_id?: string | null
          route_id: string
          seller_id?: string | null
          seller_name?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          total_value?: number
          updated_at?: string
          volume_m3?: number
          zip_code?: string | null
        }
        Update: {
          address?: string
          city?: string | null
          created_at?: string
          customer_name?: string
          delivery_type?: Database["public"]["Enums"]["delivery_type"]
          estimated_minutes?: number
          id?: string
          notes?: string | null
          order_number?: string
          order_payload?: Json | null
          outcome?: Database["public"]["Enums"]["delivery_outcome"] | null
          outcome_at?: string | null
          outcome_notes?: string | null
          paid_value?: number
          phone?: string | null
          remaining_value?: number
          rescheduled_from_id?: string | null
          route_id?: string
          seller_id?: string | null
          seller_name?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          total_value?: number
          updated_at?: string
          volume_m3?: number
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_deliveries_rescheduled_from_id_fkey"
            columns: ["rescheduled_from_id"]
            isOneToOne: false
            referencedRelation: "scheduled_deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_deliveries_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          active: boolean
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["staff_kind"]
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["staff_kind"]
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["staff_kind"]
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          notes: string | null
          plate: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          plate?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          plate?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      recompute_route_counters: {
        Args: { _route_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "vendedor" | "logistico"
      delivery_outcome: "entregue" | "nao_entregue" | "entregue_parcial"
      delivery_status:
        | "agendado"
        | "confirmado"
        | "entregue"
        | "cancelado"
        | "reagendado"
      delivery_type: "entrega" | "levantamento" | "recolha" | "troca"
      route_status:
        | "disponivel"
        | "quase_cheia"
        | "cheia"
        | "fechada"
        | "concluida"
      staff_kind: "motorista" | "auxiliar"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "vendedor", "logistico"],
      delivery_outcome: ["entregue", "nao_entregue", "entregue_parcial"],
      delivery_status: [
        "agendado",
        "confirmado",
        "entregue",
        "cancelado",
        "reagendado",
      ],
      delivery_type: ["entrega", "levantamento", "recolha", "troca"],
      route_status: [
        "disponivel",
        "quase_cheia",
        "cheia",
        "fechada",
        "concluida",
      ],
      staff_kind: ["motorista", "auxiliar"],
    },
  },
} as const
