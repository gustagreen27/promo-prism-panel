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
      activity_logs: {
        Row: {
          action: string | null
          created_at: string
          description: string | null
          id: string
          ip_address: string | null
          module: string | null
          user_id: string | null
        }
        Insert: {
          action?: string | null
          created_at?: string
          description?: string | null
          id?: string
          ip_address?: string | null
          module?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string | null
          created_at?: string
          description?: string | null
          id?: string
          ip_address?: string | null
          module?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          client_id: string | null
          created_at: string
          description: string | null
          end_time: string | null
          event_type: string | null
          id: string
          project_id: string | null
          start_time: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          description?: string | null
          end_time?: string | null
          event_type?: string | null
          id?: string
          project_id?: string | null
          start_time: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          description?: string | null
          end_time?: string | null
          event_type?: string | null
          id?: string
          project_id?: string | null
          start_time?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_clicks: {
        Row: {
          as_name: string | null
          browser: string | null
          browser_version: string | null
          campaign_id: string
          city: string | null
          clicked_at: string
          country: string | null
          country_code: string | null
          device: string | null
          device_type: string | null
          final_url: string | null
          id: string
          ip: string | null
          isp: string | null
          language: string | null
          lat: number | null
          lon: number | null
          org: string | null
          os: string | null
          os_version: string | null
          referer: string | null
          region: string | null
          timezone: string | null
          user_agent: string | null
          zip: string | null
        }
        Insert: {
          as_name?: string | null
          browser?: string | null
          browser_version?: string | null
          campaign_id: string
          city?: string | null
          clicked_at?: string
          country?: string | null
          country_code?: string | null
          device?: string | null
          device_type?: string | null
          final_url?: string | null
          id?: string
          ip?: string | null
          isp?: string | null
          language?: string | null
          lat?: number | null
          lon?: number | null
          org?: string | null
          os?: string | null
          os_version?: string | null
          referer?: string | null
          region?: string | null
          timezone?: string | null
          user_agent?: string | null
          zip?: string | null
        }
        Update: {
          as_name?: string | null
          browser?: string | null
          browser_version?: string | null
          campaign_id?: string
          city?: string | null
          clicked_at?: string
          country?: string | null
          country_code?: string | null
          device?: string | null
          device_type?: string | null
          final_url?: string | null
          id?: string
          ip?: string | null
          isp?: string | null
          language?: string | null
          lat?: number | null
          lon?: number | null
          org?: string | null
          os?: string | null
          os_version?: string | null
          referer?: string | null
          region?: string | null
          timezone?: string | null
          user_agent?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_clicks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_events: {
        Row: {
          campaign_id: string
          click_id: string | null
          created_at: string
          event_type: Database["public"]["Enums"]["campaign_event_type"]
          id: string
          metadata: Json
        }
        Insert: {
          campaign_id: string
          click_id?: string | null
          created_at?: string
          event_type: Database["public"]["Enums"]["campaign_event_type"]
          id?: string
          metadata?: Json
        }
        Update: {
          campaign_id?: string
          click_id?: string | null
          created_at?: string
          event_type?: Database["public"]["Enums"]["campaign_event_type"]
          id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "campaign_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_events_click_id_fkey"
            columns: ["click_id"]
            isOneToOne: false
            referencedRelation: "campaign_clicks"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          campaign_type: string | null
          category: string | null
          created_at: string
          created_by: string | null
          cta_label: string | null
          destination_url: string
          favicon_url: string | null
          id: string
          iframe_checked_at: string | null
          iframe_compatible: boolean | null
          intent_checked_at: string | null
          intent_report: Json | null
          intent_score: number | null
          intermediate_text: string | null
          link_description: string | null
          link_intent: string | null
          link_title: string | null
          name: string
          og_description: string | null
          og_image_url: string | null
          og_title: string | null
          og_type: string | null
          open_mode: string
          page_category: string | null
          preview_image_url: string | null
          slug: string
          status: Database["public"]["Enums"]["campaign_status"]
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          campaign_type?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          destination_url: string
          favicon_url?: string | null
          id?: string
          iframe_checked_at?: string | null
          iframe_compatible?: boolean | null
          intent_checked_at?: string | null
          intent_report?: Json | null
          intent_score?: number | null
          intermediate_text?: string | null
          link_description?: string | null
          link_intent?: string | null
          link_title?: string | null
          name: string
          og_description?: string | null
          og_image_url?: string | null
          og_title?: string | null
          og_type?: string | null
          open_mode?: string
          page_category?: string | null
          preview_image_url?: string | null
          slug: string
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          campaign_type?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          destination_url?: string
          favicon_url?: string | null
          id?: string
          iframe_checked_at?: string | null
          iframe_compatible?: boolean | null
          intent_checked_at?: string | null
          intent_report?: Json | null
          intent_score?: number | null
          intermediate_text?: string | null
          link_description?: string | null
          link_intent?: string | null
          link_title?: string | null
          name?: string
          og_description?: string | null
          og_image_url?: string | null
          og_title?: string | null
          og_type?: string | null
          open_mode?: string
          page_category?: string | null
          preview_image_url?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          document: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          state: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          state?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          state?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      closings: {
        Row: {
          closed_at: string | null
          cost_per_message: number | null
          created_at: string
          delivered_messages: number | null
          failed_messages: number | null
          id: string
          margin: number | null
          month: number
          net_profit: number | null
          status: string
          total_cost: number | null
          total_messages: number | null
          total_revenue: number | null
          year: number
        }
        Insert: {
          closed_at?: string | null
          cost_per_message?: number | null
          created_at?: string
          delivered_messages?: number | null
          failed_messages?: number | null
          id?: string
          margin?: number | null
          month: number
          net_profit?: number | null
          status?: string
          total_cost?: number | null
          total_messages?: number | null
          total_revenue?: number | null
          year: number
        }
        Update: {
          closed_at?: string | null
          cost_per_message?: number | null
          created_at?: string
          delivered_messages?: number | null
          failed_messages?: number | null
          id?: string
          margin?: number | null
          month?: number
          net_profit?: number | null
          status?: string
          total_cost?: number | null
          total_messages?: number | null
          total_revenue?: number | null
          year?: number
        }
        Relationships: []
      }
      costs: {
        Row: {
          amount: number
          attachment_url: string | null
          category: string | null
          client_id: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          is_recurring: boolean
          notes: string | null
          paid_date: string | null
          project_id: string | null
          recurrence_type: string | null
          status: string
          supplier: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          attachment_url?: string | null
          category?: string | null
          client_id?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_recurring?: boolean
          notes?: string | null
          paid_date?: string | null
          project_id?: string | null
          recurrence_type?: string | null
          status?: string
          supplier?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          attachment_url?: string | null
          category?: string | null
          client_id?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_recurring?: boolean
          notes?: string | null
          paid_date?: string | null
          project_id?: string | null
          recurrence_type?: string | null
          status?: string
          supplier?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "costs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "costs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      message_stock: {
        Row: {
          amount: number | null
          created_at: string
          id: string
          notes: string | null
          quantity: number
          source: string | null
          supplier: string | null
          type: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          quantity?: number
          source?: string | null
          supplier?: string | null
          type: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          quantity?: number
          source?: string | null
          supplier?: string | null
          type?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          client_id: string | null
          contract_value: number | null
          created_at: string
          description: string | null
          end_date: string | null
          estimated_cost: number | null
          id: string
          name: string
          notes: string | null
          responsible: string | null
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          contract_value?: number | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          estimated_cost?: number | null
          id?: string
          name: string
          notes?: string | null
          responsible?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          contract_value?: number | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          estimated_cost?: number | null
          id?: string
          name?: string
          notes?: string | null
          responsible?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      revenues: {
        Row: {
          amount: number
          attachment_url: string | null
          client_id: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          issue_date: string | null
          notes: string | null
          paid_date: string | null
          payment_method: string | null
          project_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          attachment_url?: string | null
          client_id?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          issue_date?: string | null
          notes?: string | null
          paid_date?: string | null
          payment_method?: string | null
          project_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          attachment_url?: string | null
          client_id?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          issue_date?: string | null
          notes?: string | null
          paid_date?: string | null
          payment_method?: string | null
          project_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenues_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenues_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          created_at: string
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      upsell_campaigns: {
        Row: {
          campaign_id: string | null
          clicks: number | null
          client_id: string | null
          conversions: number | null
          created_at: string
          id: string
          name: string
          project_id: string | null
          revenue: number | null
          status: string
          updated_at: string
          url: string | null
        }
        Insert: {
          campaign_id?: string | null
          clicks?: number | null
          client_id?: string | null
          conversions?: number | null
          created_at?: string
          id?: string
          name: string
          project_id?: string | null
          revenue?: number | null
          status?: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          campaign_id?: string | null
          clicks?: number | null
          client_id?: string | null
          conversions?: number | null
          created_at?: string
          id?: string
          name?: string
          project_id?: string | null
          revenue?: number | null
          status?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "upsell_campaigns_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upsell_campaigns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upsell_campaigns_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
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
      whatsapp_connections: {
        Row: {
          api_key: string | null
          created_at: string
          id: string
          name: string
          phone: string | null
          provider: string | null
          status: string
          updated_at: string
        }
        Insert: {
          api_key?: string | null
          created_at?: string
          id?: string
          name: string
          phone?: string | null
          provider?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          api_key?: string | null
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          provider?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          client_id: string | null
          cost: number | null
          created_at: string
          delivered_at: string | null
          error_message: string | null
          id: string
          phone: string | null
          project_id: string | null
          read_at: string | null
          sent_at: string | null
          status: string
          template_name: string | null
        }
        Insert: {
          client_id?: string | null
          cost?: number | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          phone?: string | null
          project_id?: string | null
          read_at?: string | null
          sent_at?: string | null
          status?: string
          template_name?: string | null
        }
        Update: {
          client_id?: string | null
          cost?: number | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          phone?: string | null
          project_id?: string | null
          read_at?: string | null
          sent_at?: string | null
          status?: string
          template_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
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
    }
    Enums: {
      app_role: "admin"
      campaign_event_type:
        | "page_view"
        | "iframe_loaded"
        | "iframe_blocked"
        | "redirect_started"
        | "redirect_completed"
        | "cta_clicked"
        | "utm_detected"
        | "duplicate_click"
        | "returning_visitor"
        | "bot_detected"
      campaign_status: "draft" | "active" | "paused" | "archived"
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
      app_role: ["admin"],
      campaign_event_type: [
        "page_view",
        "iframe_loaded",
        "iframe_blocked",
        "redirect_started",
        "redirect_completed",
        "cta_clicked",
        "utm_detected",
        "duplicate_click",
        "returning_visitor",
        "bot_detected",
      ],
      campaign_status: ["draft", "active", "paused", "archived"],
    },
  },
} as const
