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
          color: string | null
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
          color?: string | null
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
          color?: string | null
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
      delivery_payments: {
        Row: {
          amount: number
          created_at: string
          delivery_id: string
          id: string
          method_id: string | null
          method_name: string
          notes: string | null
          received_by: string
          received_by_name: string | null
          route_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          delivery_id: string
          id?: string
          method_id?: string | null
          method_name: string
          notes?: string | null
          received_by: string
          received_by_name?: string | null
          route_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          delivery_id?: string
          id?: string
          method_id?: string | null
          method_name?: string
          notes?: string | null
          received_by?: string
          received_by_name?: string | null
          route_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_payments_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "scheduled_deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_payments_method_id_fkey"
            columns: ["method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_payments_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      imported_purchases: {
        Row: {
          created_at: string
          created_by: string
          error_message: string | null
          extracted_payload: Json | null
          final_payload: Json | null
          gestaoclick_invoice_number: string | null
          gestaoclick_purchase_id: string | null
          id: string
          image_path: string | null
          status: string
          supplier_document: string | null
          supplier_name: string | null
          total_value: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          error_message?: string | null
          extracted_payload?: Json | null
          final_payload?: Json | null
          gestaoclick_invoice_number?: string | null
          gestaoclick_purchase_id?: string | null
          id?: string
          image_path?: string | null
          status?: string
          supplier_document?: string | null
          supplier_name?: string | null
          total_value?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          error_message?: string | null
          extracted_payload?: Json | null
          final_payload?: Json | null
          gestaoclick_invoice_number?: string | null
          gestaoclick_purchase_id?: string | null
          id?: string
          image_path?: string | null
          status?: string
          supplier_document?: string | null
          supplier_name?: string | null
          total_value?: number
          updated_at?: string
        }
        Relationships: []
      }
      payment_methods: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
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
      route_cash_expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string
          created_by_name: string | null
          description: string
          id: string
          receipt_path: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          route_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          created_by: string
          created_by_name?: string | null
          description: string
          id?: string
          receipt_path: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          route_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string
          created_by_name?: string | null
          description?: string
          id?: string
          receipt_path?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          route_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_cash_expenses_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      route_corridor_stops: {
        Row: {
          city_label: string
          created_at: string
          id: string
          sequence: number
          template_id: string
          zip_prefix: string
        }
        Insert: {
          city_label: string
          created_at?: string
          id?: string
          sequence: number
          template_id: string
          zip_prefix: string
        }
        Update: {
          city_label?: string
          created_at?: string
          id?: string
          sequence?: number
          template_id?: string
          zip_prefix?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_corridor_stops_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "route_templates"
            referencedColumns: ["id"]
          },
        ]
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
      route_settlements: {
        Row: {
          cash_declared: number
          cash_expected: number
          created_at: string
          envelope_code: string
          expenses_total: number
          id: string
          methods: Json
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_name: string | null
          route_id: string
          status: string
          submitted_at: string | null
          submitted_by: string | null
          submitted_by_name: string | null
          updated_at: string
        }
        Insert: {
          cash_declared?: number
          cash_expected?: number
          created_at?: string
          envelope_code: string
          expenses_total?: number
          id?: string
          methods?: Json
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string | null
          route_id: string
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          submitted_by_name?: string | null
          updated_at?: string
        }
        Update: {
          cash_declared?: number
          cash_expected?: number
          created_at?: string
          envelope_code?: string
          expenses_total?: number
          id?: string
          methods?: Json
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string | null
          route_id?: string
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          submitted_by_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_settlements_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: true
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
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
          corridor: Json
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
          corridor?: Json
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
          corridor?: Json
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
      service_requests: {
        Row: {
          created_at: string
          customer_name: string | null
          delivery_id: string | null
          description: string
          id: string
          opened_by: string
          opened_by_name: string | null
          order_number: string
          photos: string[]
          product_name: string
          resolution_notes: string | null
          route_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_name?: string | null
          delivery_id?: string | null
          description: string
          id?: string
          opened_by: string
          opened_by_name?: string | null
          order_number: string
          photos?: string[]
          product_name: string
          resolution_notes?: string | null
          route_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_name?: string | null
          delivery_id?: string | null
          description?: string
          id?: string
          opened_by?: string
          opened_by_name?: string | null
          order_number?: string
          photos?: string[]
          product_name?: string
          resolution_notes?: string | null
          route_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_requests_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "scheduled_deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_route_id_fkey"
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
          user_id: string | null
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
          user_id?: string | null
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
          user_id?: string | null
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
      is_route_courier: {
        Args: { _route_id: string; _user_id: string }
        Returns: boolean
      }
      recompute_delivery_paid: {
        Args: { _delivery_id: string }
        Returns: undefined
      }
      recompute_route_counters: {
        Args: { _route_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "vendedor" | "logistico" | "entregador"
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
      app_role: ["admin", "vendedor", "logistico", "entregador"],
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
