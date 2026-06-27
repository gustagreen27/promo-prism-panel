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
