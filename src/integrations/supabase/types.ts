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
          metadata: Json
          module: string | null
          user_id: string | null
        }
        Insert: {
          action?: string | null
          created_at?: string
          description?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json
          module?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string | null
          created_at?: string
          description?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json
          module?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      app_cron_secret: {
        Row: {
          id: number
          updated_at: string
          value: string
        }
        Insert: {
          id?: number
          updated_at?: string
          value: string
        }
        Update: {
          id?: number
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      attendance_number_grants: {
        Row: {
          created_at: string
          id: string
          phone_number_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          phone_number_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          phone_number_id?: string
          user_id?: string
        }
        Relationships: []
      }
      billing_settings: {
        Row: {
          currency: string
          default_minimum_messages: number
          default_price_cents: number
          id: number
          minimum_deposit_cents: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          currency?: string
          default_minimum_messages?: number
          default_price_cents?: number
          id?: number
          minimum_deposit_cents?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          currency?: string
          default_minimum_messages?: number
          default_price_cents?: number
          id?: number
          minimum_deposit_cents?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          campaign_id: string | null
          client_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          end_time: string | null
          event_type: string | null
          google_calendar_id: string | null
          google_event_id: string | null
          google_synced_at: string | null
          id: string
          project_id: string | null
          start_time: string
          status: string
          title: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          campaign_id?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          event_type?: string | null
          google_calendar_id?: string | null
          google_event_id?: string | null
          google_synced_at?: string | null
          id?: string
          project_id?: string | null
          start_time: string
          status?: string
          title: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          campaign_id?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          event_type?: string | null
          google_calendar_id?: string | null
          google_event_id?: string | null
          google_synced_at?: string | null
          id?: string
          project_id?: string | null
          start_time?: string
          status?: string
          title?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "wa_campaigns"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "calendar_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          campaign_id: string
          created_at: string
          from_data: Json | null
          id: string
          message: string | null
          to_data: Json | null
          workspace_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          campaign_id: string
          created_at?: string
          from_data?: Json | null
          id?: string
          message?: string | null
          to_data?: Json | null
          workspace_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          campaign_id?: string
          created_at?: string
          from_data?: Json | null
          id?: string
          message?: string | null
          to_data?: Json | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_audit_log_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "wa_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_audit_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_clicks: {
        Row: {
          as_name: string | null
          as_number: string | null
          browser: string | null
          browser_version: string | null
          calling_code: string | null
          campaign_id: string
          city: string | null
          clicked_at: string
          continent: string | null
          continent_code: string | null
          country: string | null
          country_code: string | null
          country_code3: string | null
          currency: string | null
          device: string | null
          device_type: string | null
          district: string | null
          final_url: string | null
          hosting: boolean | null
          id: string
          ip: string | null
          isp: string | null
          language: string | null
          lat: number | null
          lon: number | null
          mobile: boolean | null
          org: string | null
          os: string | null
          os_version: string | null
          proxy: boolean | null
          recipient_id: string | null
          referer: string | null
          region: string | null
          region_code: string | null
          reverse_dns: string | null
          timezone: string | null
          user_agent: string | null
          utc_offset: number | null
          wa_campaign_id: string | null
          workspace_id: string | null
          zip: string | null
        }
        Insert: {
          as_name?: string | null
          as_number?: string | null
          browser?: string | null
          browser_version?: string | null
          calling_code?: string | null
          campaign_id: string
          city?: string | null
          clicked_at?: string
          continent?: string | null
          continent_code?: string | null
          country?: string | null
          country_code?: string | null
          country_code3?: string | null
          currency?: string | null
          device?: string | null
          device_type?: string | null
          district?: string | null
          final_url?: string | null
          hosting?: boolean | null
          id?: string
          ip?: string | null
          isp?: string | null
          language?: string | null
          lat?: number | null
          lon?: number | null
          mobile?: boolean | null
          org?: string | null
          os?: string | null
          os_version?: string | null
          proxy?: boolean | null
          recipient_id?: string | null
          referer?: string | null
          region?: string | null
          region_code?: string | null
          reverse_dns?: string | null
          timezone?: string | null
          user_agent?: string | null
          utc_offset?: number | null
          wa_campaign_id?: string | null
          workspace_id?: string | null
          zip?: string | null
        }
        Update: {
          as_name?: string | null
          as_number?: string | null
          browser?: string | null
          browser_version?: string | null
          calling_code?: string | null
          campaign_id?: string
          city?: string | null
          clicked_at?: string
          continent?: string | null
          continent_code?: string | null
          country?: string | null
          country_code?: string | null
          country_code3?: string | null
          currency?: string | null
          device?: string | null
          device_type?: string | null
          district?: string | null
          final_url?: string | null
          hosting?: boolean | null
          id?: string
          ip?: string | null
          isp?: string | null
          language?: string | null
          lat?: number | null
          lon?: number | null
          mobile?: boolean | null
          org?: string | null
          os?: string | null
          os_version?: string | null
          proxy?: boolean | null
          recipient_id?: string | null
          referer?: string | null
          region?: string | null
          region_code?: string | null
          reverse_dns?: string | null
          timezone?: string | null
          user_agent?: string | null
          utc_offset?: number | null
          wa_campaign_id?: string | null
          workspace_id?: string | null
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
          {
            foreignKeyName: "campaign_clicks_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "campaign_recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_clicks_wa_campaign_id_fkey"
            columns: ["wa_campaign_id"]
            isOneToOne: false
            referencedRelation: "wa_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_clicks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
          workspace_id: string | null
        }
        Insert: {
          campaign_id: string
          click_id?: string | null
          created_at?: string
          event_type: Database["public"]["Enums"]["campaign_event_type"]
          id?: string
          metadata?: Json
          workspace_id?: string | null
        }
        Update: {
          campaign_id?: string
          click_id?: string | null
          created_at?: string
          event_type?: Database["public"]["Enums"]["campaign_event_type"]
          id?: string
          metadata?: Json
          workspace_id?: string | null
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
          {
            foreignKeyName: "campaign_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_public_dispatches: {
        Row: {
          campaign_id: string | null
          created_at: string
          enabled: boolean
          fixed: Json
          mode: string
          public_name: string | null
          public_status: string | null
          status_map: Json
          updated_at: string
          updated_by: string | null
          wa_campaign_id: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          enabled?: boolean
          fixed?: Json
          mode?: string
          public_name?: string | null
          public_status?: string | null
          status_map?: Json
          updated_at?: string
          updated_by?: string | null
          wa_campaign_id: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          enabled?: boolean
          fixed?: Json
          mode?: string
          public_name?: string | null
          public_status?: string | null
          status_map?: Json
          updated_at?: string
          updated_by?: string | null
          wa_campaign_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_public_dispatches_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_public_dispatches_wa_campaign_id_fkey"
            columns: ["wa_campaign_id"]
            isOneToOne: true
            referencedRelation: "wa_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_public_settings: {
        Row: {
          campaign_id: string
          clicks_generator: Json
          clicks_series: Json
          created_at: string
          custom_totals: Json
          enabled: boolean
          hourly_series: Json
          metrics_mode: string
          status_map: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          campaign_id: string
          clicks_generator?: Json
          clicks_series?: Json
          created_at?: string
          custom_totals?: Json
          enabled?: boolean
          hourly_series?: Json
          metrics_mode?: string
          status_map?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          campaign_id?: string
          clicks_generator?: Json
          clicks_series?: Json
          created_at?: string
          custom_totals?: Json
          enabled?: boolean
          hourly_series?: Json
          metrics_mode?: string
          status_map?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_public_settings_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_recipients: {
        Row: {
          attempt: number
          campaign_id: string
          charged_at: string | null
          charged_cents: number
          contact_id: string | null
          contact_name: string | null
          created_at: string
          dedup_key: string | null
          delivered_at: string | null
          error_code: string | null
          failed_at: string | null
          failed_reason: string | null
          id: string
          last_attempt_at: string | null
          locked_route_id: string | null
          meta_message_id: string | null
          next_attempt_at: string | null
          permit_granted_at: string | null
          phone: string
          read_at: string | null
          replied_at: string | null
          request_started_at: string | null
          responded_at: string | null
          response_received_at: string | null
          route_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["wa_recipient_status"]
          updated_at: string
          variables: Json
          workspace_id: string | null
        }
        Insert: {
          attempt?: number
          campaign_id: string
          charged_at?: string | null
          charged_cents?: number
          contact_id?: string | null
          contact_name?: string | null
          created_at?: string
          dedup_key?: string | null
          delivered_at?: string | null
          error_code?: string | null
          failed_at?: string | null
          failed_reason?: string | null
          id?: string
          last_attempt_at?: string | null
          locked_route_id?: string | null
          meta_message_id?: string | null
          next_attempt_at?: string | null
          permit_granted_at?: string | null
          phone: string
          read_at?: string | null
          replied_at?: string | null
          request_started_at?: string | null
          responded_at?: string | null
          response_received_at?: string | null
          route_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["wa_recipient_status"]
          updated_at?: string
          variables?: Json
          workspace_id?: string | null
        }
        Update: {
          attempt?: number
          campaign_id?: string
          charged_at?: string | null
          charged_cents?: number
          contact_id?: string | null
          contact_name?: string | null
          created_at?: string
          dedup_key?: string | null
          delivered_at?: string | null
          error_code?: string | null
          failed_at?: string | null
          failed_reason?: string | null
          id?: string
          last_attempt_at?: string | null
          locked_route_id?: string | null
          meta_message_id?: string | null
          next_attempt_at?: string | null
          permit_granted_at?: string | null
          phone?: string
          read_at?: string | null
          replied_at?: string | null
          request_started_at?: string | null
          responded_at?: string | null
          response_received_at?: string | null
          route_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["wa_recipient_status"]
          updated_at?: string
          variables?: Json
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "wa_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_locked_route_id_fkey"
            columns: ["locked_route_id"]
            isOneToOne: false
            referencedRelation: "wa_campaign_routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "wa_campaign_routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_timeline: {
        Row: {
          actor_id: string | null
          campaign_id: string
          created_at: string
          event_type: string
          id: string
          message: string | null
          payload: Json
          workspace_id: string | null
        }
        Insert: {
          actor_id?: string | null
          campaign_id: string
          created_at?: string
          event_type: string
          id?: string
          message?: string | null
          payload?: Json
          workspace_id?: string | null
        }
        Update: {
          actor_id?: string | null
          campaign_id?: string
          created_at?: string
          event_type?: string
          id?: string
          message?: string | null
          payload?: Json
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_timeline_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "wa_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_timeline_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
          destination_cursor: number
          destination_rotation: string
          destination_url: string
          destination_urls: Json
          facebook_destination_url: string | null
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
          loading_bg_color: string | null
          loading_image_url: string | null
          name: string
          og_description: string | null
          og_image_url: string | null
          og_title: string | null
          og_type: string | null
          open_mode: string
          page_category: string | null
          participants: Database["public"]["Enums"]["partner_participant"][]
          preview_image_url: string | null
          public_overrides: Json
          slug: string
          status: Database["public"]["Enums"]["campaign_status"]
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          workspace_id: string | null
        }
        Insert: {
          campaign_type?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          destination_cursor?: number
          destination_rotation?: string
          destination_url: string
          destination_urls?: Json
          facebook_destination_url?: string | null
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
          loading_bg_color?: string | null
          loading_image_url?: string | null
          name: string
          og_description?: string | null
          og_image_url?: string | null
          og_title?: string | null
          og_type?: string | null
          open_mode?: string
          page_category?: string | null
          participants?: Database["public"]["Enums"]["partner_participant"][]
          preview_image_url?: string | null
          public_overrides?: Json
          slug: string
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          workspace_id?: string | null
        }
        Update: {
          campaign_type?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          destination_cursor?: number
          destination_rotation?: string
          destination_url?: string
          destination_urls?: Json
          facebook_destination_url?: string | null
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
          loading_bg_color?: string | null
          loading_image_url?: string | null
          name?: string
          og_description?: string | null
          og_image_url?: string | null
          og_title?: string | null
          og_type?: string | null
          open_mode?: string
          page_category?: string | null
          participants?: Database["public"]["Enums"]["partner_participant"][]
          preview_image_url?: string | null
          public_overrides?: Json
          slug?: string
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
          workspace_id: string | null
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
          workspace_id?: string | null
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
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
          participants: Database["public"]["Enums"]["partner_participant"][]
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
          participants?: Database["public"]["Enums"]["partner_participant"][]
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
          participants?: Database["public"]["Enums"]["partner_participant"][]
          status?: string
          total_cost?: number | null
          total_messages?: number | null
          total_revenue?: number | null
          year?: number
        }
        Relationships: []
      }
      contact_list_items: {
        Row: {
          added_at: string
          contact_id: string
          list_id: string
          workspace_id: string | null
        }
        Insert: {
          added_at?: string
          contact_id: string
          list_id: string
          workspace_id?: string | null
        }
        Update: {
          added_at?: string
          contact_id?: string
          list_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_list_items_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "contact_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_list_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_lists: {
        Row: {
          client_id: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_lists_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_lists_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_lists_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_tag_assignments: {
        Row: {
          contact_id: string
          tag_id: string
          workspace_id: string | null
        }
        Insert: {
          contact_id: string
          tag_id: string
          workspace_id?: string | null
        }
        Update: {
          contact_id?: string
          tag_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_tag_assignments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "contact_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tag_assignments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_tags: {
        Row: {
          client_id: string | null
          color: string | null
          created_at: string
          id: string
          name: string
          workspace_id: string | null
        }
        Insert: {
          client_id?: string | null
          color?: string | null
          created_at?: string
          id?: string
          name: string
          workspace_id?: string | null
        }
        Update: {
          client_id?: string | null
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_tags_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tags_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          client_id: string | null
          created_at: string
          email: string | null
          id: string
          invalid: boolean
          last_interaction_at: string | null
          metadata: Json
          name: string | null
          opt_in: boolean
          opt_in_at: string | null
          opt_out: boolean
          opt_out_at: string | null
          phone: string
          project_id: string | null
          source: string | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          invalid?: boolean
          last_interaction_at?: string | null
          metadata?: Json
          name?: string | null
          opt_in?: boolean
          opt_in_at?: string | null
          opt_out?: boolean
          opt_out_at?: string | null
          phone: string
          project_id?: string | null
          source?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          invalid?: boolean
          last_interaction_at?: string | null
          metadata?: Json
          name?: string | null
          opt_in?: boolean
          opt_in_at?: string | null
          opt_out?: boolean
          opt_out_at?: string | null
          phone?: string
          project_id?: string | null
          source?: string | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
          participants: Database["public"]["Enums"]["partner_participant"][]
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
          participants?: Database["public"]["Enums"]["partner_participant"][]
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
          participants?: Database["public"]["Enums"]["partner_participant"][]
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
      deposits: {
        Row: {
          amount_cents: number
          created_at: string
          created_by: string | null
          id: string
          paid_at: string | null
          payment_method: string | null
          provider: string
          receipt_url: string | null
          status: string
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          workspace_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          created_by?: string | null
          id?: string
          paid_at?: string | null
          payment_method?: string | null
          provider?: string
          receipt_url?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          workspace_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          created_by?: string | null
          id?: string
          paid_at?: string | null
          payment_method?: string | null
          provider?: string
          receipt_url?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deposits_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          created_at: string
          created_by: string | null
          duplicated: number
          filename: string | null
          id: string
          invalid: number
          report: Json
          status: string
          total: number
          valid: number
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          duplicated?: number
          filename?: string | null
          id?: string
          invalid?: number
          report?: Json
          status?: string
          total?: number
          valid?: number
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          duplicated?: number
          filename?: string | null
          id?: string
          invalid?: number
          report?: Json
          status?: string
          total?: number
          valid?: number
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      imported_dispatch_report_records: {
        Row: {
          boost_item_id: string | null
          created_at: string
          created_at_source: string | null
          email: string | null
          entered_at: string | null
          error_code: string | null
          error_message: string | null
          id: string
          is_pending: boolean | null
          last_received_at: string | null
          last_received_error_code: string | null
          last_received_message_id: string | null
          last_sent_at: string | null
          last_sent_error_code: string | null
          last_sent_message_id: string | null
          lead_id: string | null
          message_status: string | null
          name: string | null
          phone: string | null
          raw_data: Json | null
          report_id: string
          started_at: string | null
          status: string | null
          status_changed_at: string | null
          whatsapp_instance_id: string | null
        }
        Insert: {
          boost_item_id?: string | null
          created_at?: string
          created_at_source?: string | null
          email?: string | null
          entered_at?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          is_pending?: boolean | null
          last_received_at?: string | null
          last_received_error_code?: string | null
          last_received_message_id?: string | null
          last_sent_at?: string | null
          last_sent_error_code?: string | null
          last_sent_message_id?: string | null
          lead_id?: string | null
          message_status?: string | null
          name?: string | null
          phone?: string | null
          raw_data?: Json | null
          report_id: string
          started_at?: string | null
          status?: string | null
          status_changed_at?: string | null
          whatsapp_instance_id?: string | null
        }
        Update: {
          boost_item_id?: string | null
          created_at?: string
          created_at_source?: string | null
          email?: string | null
          entered_at?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          is_pending?: boolean | null
          last_received_at?: string | null
          last_received_error_code?: string | null
          last_received_message_id?: string | null
          last_sent_at?: string | null
          last_sent_error_code?: string | null
          last_sent_message_id?: string | null
          lead_id?: string | null
          message_status?: string | null
          name?: string | null
          phone?: string | null
          raw_data?: Json | null
          report_id?: string
          started_at?: string | null
          status?: string | null
          status_changed_at?: string | null
          whatsapp_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "imported_dispatch_report_records_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "imported_dispatch_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      imported_dispatch_reports: {
        Row: {
          boost_id: string | null
          completed: number
          completion_rate: number
          created_at: string
          created_by: string | null
          error_rate: number
          errors: number
          first_sent_at: string | null
          first_started_at: string | null
          id: string
          is_public: boolean
          last_sent_at: string | null
          metadata: Json
          name: string
          public_slug: string | null
          source: string
          total: number
          updated_at: string
        }
        Insert: {
          boost_id?: string | null
          completed?: number
          completion_rate?: number
          created_at?: string
          created_by?: string | null
          error_rate?: number
          errors?: number
          first_sent_at?: string | null
          first_started_at?: string | null
          id?: string
          is_public?: boolean
          last_sent_at?: string | null
          metadata?: Json
          name: string
          public_slug?: string | null
          source?: string
          total?: number
          updated_at?: string
        }
        Update: {
          boost_id?: string | null
          completed?: number
          completion_rate?: number
          created_at?: string
          created_by?: string | null
          error_rate?: number
          errors?: number
          first_sent_at?: string | null
          first_started_at?: string | null
          id?: string
          is_public?: boolean
          last_sent_at?: string | null
          metadata?: Json
          name?: string
          public_slug?: string | null
          source?: string
          total?: number
          updated_at?: string
        }
        Relationships: []
      }
      ip_geo_cache: {
        Row: {
          created_at: string
          data: Json
          ip: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data: Json
          ip: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          ip?: string
          updated_at?: string
        }
        Relationships: []
      }
      message_dead_letters: {
        Row: {
          attempts: number
          campaign_id: string | null
          category: string
          created_at: string
          error_code: string | null
          error_message: string | null
          error_title: string | null
          id: string
          last_attempt_at: string | null
          payload: Json
          phone: string
          phone_normalized: string | null
          phone_number_id: string | null
          recipient_id: string | null
          route_id: string | null
          workspace_id: string | null
        }
        Insert: {
          attempts?: number
          campaign_id?: string | null
          category?: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          error_title?: string | null
          id?: string
          last_attempt_at?: string | null
          payload?: Json
          phone: string
          phone_normalized?: string | null
          phone_number_id?: string | null
          recipient_id?: string | null
          route_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          attempts?: number
          campaign_id?: string | null
          category?: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          error_title?: string | null
          id?: string
          last_attempt_at?: string | null
          payload?: Json
          phone?: string
          phone_normalized?: string | null
          phone_number_id?: string | null
          recipient_id?: string | null
          route_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_dead_letters_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "wa_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      message_logs: {
        Row: {
          campaign_id: string | null
          connection_id: string | null
          created_at: string
          error_code: string | null
          failed_reason: string | null
          http_status: number | null
          id: string
          language_code: string | null
          message_status: string | null
          meta_message_id: string | null
          recipient_id: string | null
          request_payload: Json | null
          response_payload: Json | null
          sent_at: string | null
          template_name: string | null
          to_phone: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          campaign_id?: string | null
          connection_id?: string | null
          created_at?: string
          error_code?: string | null
          failed_reason?: string | null
          http_status?: number | null
          id?: string
          language_code?: string | null
          message_status?: string | null
          meta_message_id?: string | null
          recipient_id?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          sent_at?: string | null
          template_name?: string | null
          to_phone: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          campaign_id?: string | null
          connection_id?: string | null
          created_at?: string
          error_code?: string | null
          failed_reason?: string | null
          http_status?: number | null
          id?: string
          language_code?: string | null
          message_status?: string | null
          meta_message_id?: string | null
          recipient_id?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          sent_at?: string | null
          template_name?: string | null
          to_phone?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_logs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "wa_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_logs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "v_client_numbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_logs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_logs_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "campaign_recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      message_stock: {
        Row: {
          amount: number | null
          client_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          notes: string | null
          project_id: string | null
          purchased_at: string | null
          quantity: number
          quantity_used: number
          source: string | null
          status: string
          supplier: string | null
          type: string
          unit_cost: number | null
          unit_price: number | null
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          amount?: number | null
          client_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          notes?: string | null
          project_id?: string | null
          purchased_at?: string | null
          quantity?: number
          quantity_used?: number
          source?: string | null
          status?: string
          supplier?: string | null
          type: string
          unit_cost?: number | null
          unit_price?: number | null
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          amount?: number | null
          client_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          notes?: string | null
          project_id?: string | null
          purchased_at?: string | null
          quantity?: number
          quantity_used?: number
          source?: string | null
          status?: string
          supplier?: string | null
          type?: string
          unit_cost?: number | null
          unit_price?: number | null
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_stock_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_stock_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_stock_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      message_stock_reservations: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          qty_consumed: number
          qty_reserved: number
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          qty_consumed?: number
          qty_reserved?: number
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          qty_consumed?: number
          qty_reserved?: number
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_stock_reservations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "wa_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_stock_reservations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          kind: string
          link: string | null
          metadata: Json
          read_at: string | null
          severity: string
          title: string
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          kind: string
          link?: string | null
          metadata?: Json
          read_at?: string | null
          severity?: string
          title: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          kind?: string
          link?: string | null
          metadata?: Json
          read_at?: string | null
          severity?: string
          title?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_checklist: {
        Row: {
          created_at: string
          done: boolean
          done_at: string | null
          id: string
          key: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          done?: boolean
          done_at?: string | null
          id?: string
          key: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          done?: boolean
          done_at?: string | null
          id?: string
          key?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_checklist_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      opt_outs: {
        Row: {
          client_id: string | null
          id: string
          opted_out_at: string
          phone: string
          reason: string | null
          workspace_id: string | null
        }
        Insert: {
          client_id?: string | null
          id?: string
          opted_out_at?: string
          phone: string
          reason?: string | null
          workspace_id?: string | null
        }
        Update: {
          client_id?: string | null
          id?: string
          opted_out_at?: string
          phone?: string
          reason?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opt_outs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opt_outs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          cnpj: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          cnpj?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          cnpj?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
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
          workspace_id: string | null
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
          workspace_id?: string | null
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
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      public_metrics_override: {
        Row: {
          campaign_id: string
          count: number
          created_at: string
          id: string
          kind: string
          label: string
          percent: number | null
          position: number
          updated_at: string
        }
        Insert: {
          campaign_id: string
          count?: number
          created_at?: string
          id?: string
          kind: string
          label: string
          percent?: number | null
          position?: number
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          count?: number
          created_at?: string
          id?: string
          kind?: string
          label?: string
          percent?: number | null
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_metrics_override_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      public_progress_simulation: {
        Row: {
          campaign_id: string | null
          created_at: string
          delivered_end: number | null
          delivered_ratio: number | null
          delivered_start: number | null
          duration_sec: number | null
          end_at: string | null
          failed_end: number | null
          failed_ratio: number | null
          failed_start: number | null
          growth: string
          growth_params: Json
          pauses: Json
          percent_end: number | null
          percent_start: number | null
          refresh_interval_sec: number
          runtime: Json
          sent_end: number
          sent_start: number
          start_at: string | null
          status_label: string | null
          updated_at: string
          wa_campaign_id: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          delivered_end?: number | null
          delivered_ratio?: number | null
          delivered_start?: number | null
          duration_sec?: number | null
          end_at?: string | null
          failed_end?: number | null
          failed_ratio?: number | null
          failed_start?: number | null
          growth?: string
          growth_params?: Json
          pauses?: Json
          percent_end?: number | null
          percent_start?: number | null
          refresh_interval_sec?: number
          runtime?: Json
          sent_end?: number
          sent_start?: number
          start_at?: string | null
          status_label?: string | null
          updated_at?: string
          wa_campaign_id: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          delivered_end?: number | null
          delivered_ratio?: number | null
          delivered_start?: number | null
          duration_sec?: number | null
          end_at?: string | null
          failed_end?: number | null
          failed_ratio?: number | null
          failed_start?: number | null
          growth?: string
          growth_params?: Json
          pauses?: Json
          percent_end?: number | null
          percent_start?: number | null
          refresh_interval_sec?: number
          runtime?: Json
          sent_end?: number
          sent_start?: number
          start_at?: string | null
          status_label?: string | null
          updated_at?: string
          wa_campaign_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_progress_simulation_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_progress_simulation_wa_campaign_id_fkey"
            columns: ["wa_campaign_id"]
            isOneToOne: true
            referencedRelation: "wa_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      recipient_suppression: {
        Row: {
          created_at: string
          created_by: string | null
          error_code: string | null
          expires_at: string | null
          failure_count: number
          first_seen_at: string
          id: string
          last_seen_at: string
          note: string | null
          permanent: boolean
          phone_normalized: string
          reason: string
          scope: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error_code?: string | null
          expires_at?: string | null
          failure_count?: number
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          note?: string | null
          permanent?: boolean
          phone_normalized: string
          reason?: string
          scope?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error_code?: string | null
          expires_at?: string | null
          failure_count?: number
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          note?: string | null
          permanent?: boolean
          phone_normalized?: string
          reason?: string
          scope?: string
          updated_at?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          campaigns: Json
          client_name: string
          created_at: string
          final_value: number | null
          generated_at: string | null
          id: string
          project: string | null
          reference: string | null
          report_date: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          campaigns?: Json
          client_name: string
          created_at?: string
          final_value?: number | null
          generated_at?: string | null
          id?: string
          project?: string | null
          reference?: string | null
          report_date: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          campaigns?: Json
          client_name?: string
          created_at?: string
          final_value?: number | null
          generated_at?: string | null
          id?: string
          project?: string | null
          reference?: string | null
          report_date?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
          participants: Database["public"]["Enums"]["partner_participant"][]
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
          participants?: Database["public"]["Enums"]["partner_participant"][]
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
          participants?: Database["public"]["Enums"]["partner_participant"][]
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
      wa_attendance_settings: {
        Row: {
          agent_roles: Database["public"]["Enums"]["workspace_role"][]
          created_at: string
          keyword_rules: Json
          notify_on_new_conversation: boolean
          notify_on_sla_breach: boolean
          round_robin_enabled: boolean
          sla_first_response_minutes: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          agent_roles?: Database["public"]["Enums"]["workspace_role"][]
          created_at?: string
          keyword_rules?: Json
          notify_on_new_conversation?: boolean
          notify_on_sla_breach?: boolean
          round_robin_enabled?: boolean
          sla_first_response_minutes?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          agent_roles?: Database["public"]["Enums"]["workspace_role"][]
          created_at?: string
          keyword_rules?: Json
          notify_on_new_conversation?: boolean
          notify_on_sla_breach?: boolean
          round_robin_enabled?: boolean
          sla_first_response_minutes?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_attendance_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_campaign_attempts: {
        Row: {
          attempt_number: number
          attempted_at: string
          campaign_id: string
          error_code: string | null
          error_details: Json | null
          fbtrace_id: string | null
          http_status: number | null
          id: string
          message_status: string | null
          meta_message_id: string | null
          phone_number_id: string | null
          recipient_id: string
          route_id: string | null
          template_id: string | null
          template_name: string | null
          worker_id: string | null
          workspace_id: string | null
        }
        Insert: {
          attempt_number?: number
          attempted_at?: string
          campaign_id: string
          error_code?: string | null
          error_details?: Json | null
          fbtrace_id?: string | null
          http_status?: number | null
          id?: string
          message_status?: string | null
          meta_message_id?: string | null
          phone_number_id?: string | null
          recipient_id: string
          route_id?: string | null
          template_id?: string | null
          template_name?: string | null
          worker_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          attempt_number?: number
          attempted_at?: string
          campaign_id?: string
          error_code?: string | null
          error_details?: Json | null
          fbtrace_id?: string | null
          http_status?: number | null
          id?: string
          message_status?: string | null
          meta_message_id?: string | null
          phone_number_id?: string | null
          recipient_id?: string
          route_id?: string | null
          template_id?: string | null
          template_name?: string | null
          worker_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_campaign_attempts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "wa_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_campaign_attempts_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "campaign_recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_campaign_attempts_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "wa_campaign_routes"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_campaign_routes: {
        Row: {
          accepted_count: number
          button_url_mapping: Json | null
          campaign_id: string
          connection_id: string
          created_at: string
          disabled_reason: string | null
          failed_count: number
          id: string
          is_primary: boolean
          last_error_at: string | null
          last_error_code: string | null
          last_error_message: string | null
          max_concurrency: number | null
          phone_number_id: string
          priority: number
          rate_effective: number | null
          rate_requested: number | null
          status: Database["public"]["Enums"]["wa_route_status"]
          swrr_current_weight: number
          template_category: string | null
          template_id: string
          template_language: string
          template_name: string
          updated_at: string
          variables_mapping: Json | null
          waba_ref_id: string | null
          weight: number
          workspace_id: string | null
        }
        Insert: {
          accepted_count?: number
          button_url_mapping?: Json | null
          campaign_id: string
          connection_id: string
          created_at?: string
          disabled_reason?: string | null
          failed_count?: number
          id?: string
          is_primary?: boolean
          last_error_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          max_concurrency?: number | null
          phone_number_id: string
          priority?: number
          rate_effective?: number | null
          rate_requested?: number | null
          status?: Database["public"]["Enums"]["wa_route_status"]
          swrr_current_weight?: number
          template_category?: string | null
          template_id: string
          template_language: string
          template_name: string
          updated_at?: string
          variables_mapping?: Json | null
          waba_ref_id?: string | null
          weight?: number
          workspace_id?: string | null
        }
        Update: {
          accepted_count?: number
          button_url_mapping?: Json | null
          campaign_id?: string
          connection_id?: string
          created_at?: string
          disabled_reason?: string | null
          failed_count?: number
          id?: string
          is_primary?: boolean
          last_error_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          max_concurrency?: number | null
          phone_number_id?: string
          priority?: number
          rate_effective?: number | null
          rate_requested?: number | null
          status?: Database["public"]["Enums"]["wa_route_status"]
          swrr_current_weight?: number
          template_category?: string | null
          template_id?: string
          template_language?: string
          template_name?: string
          updated_at?: string
          variables_mapping?: Json | null
          waba_ref_id?: string | null
          weight?: number
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_campaign_routes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "wa_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_campaigns: {
        Row: {
          abort_on_failure_rate: number | null
          adaptive_last_step_at: string | null
          adaptive_rate_current: number | null
          adaptive_rate_enabled: boolean
          approval_mode: string
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          avg_speed_per_min: number | null
          batch_pause_ms: number | null
          batch_size: number
          bulk_id: string | null
          button_url_mapping: Json | null
          canceled_at: string | null
          canceled_by: string | null
          charged_cents: number
          client_id: string | null
          connection_id: string | null
          created_at: string
          created_by: string | null
          custom_fields: Json | null
          delivered_count: number
          distribution_strategy: string
          estimated_cost: number
          failed_count: number
          fatal_error_code: string | null
          fatal_error_message: string | null
          fatal_locked: boolean
          fatal_locked_at: string | null
          final_report: Json | null
          finished_at: string | null
          google_calendar_id: string | null
          google_event_id: string | null
          google_synced_at: string | null
          http_concurrency: number
          id: string
          jitter_ms: number
          last_error: string | null
          last_sent_at: string | null
          linked_campaign_id: string | null
          linked_revenue_id: string | null
          list_id: string | null
          max_concurrency: number | null
          max_per_day: number | null
          max_per_hour: number | null
          min_processed_for_abort: number
          name: string
          notes: string | null
          number_failover_mode: string
          parallelism: number | null
          participants: Database["public"]["Enums"]["partner_participant"][]
          pause_duration_seconds: number | null
          pause_every_messages: number | null
          pause_reason: string | null
          paused_at: string | null
          paused_by: string | null
          price_cents_at_start: number | null
          priority: number
          progress: Json
          project_id: string | null
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          rate_per_second: number | null
          read_count: number
          rejection_reason: string | null
          replied_count: number
          reservation_id: string | null
          responsavel_id: string | null
          response_flow_config: Json | null
          response_flow_enabled: boolean
          response_flow_id: string | null
          response_flow_version_id: string | null
          resumed_at: string | null
          scheduled_at: string | null
          scheduled_pause_enabled: boolean
          scheduled_pause_until: string | null
          send_rate_per_min: number
          sent_count: number
          split_group_id: string | null
          split_group_index: number | null
          split_group_name: string | null
          started_at: string | null
          started_by: string | null
          status: Database["public"]["Enums"]["wa_campaign_status"]
          submitted_at: string | null
          tag_filters: string[] | null
          target_per_hour: number | null
          template_failover_mode: string
          template_id: string | null
          template_variables: Json
          timezone: string
          total_recipients: number
          updated_at: string
          use_multi_route: boolean
          variables_mapping: Json | null
          waba_ref_id: string | null
          worker_lanes: number
          worker_lease_id: string | null
          worker_lease_until: string | null
          workspace_id: string | null
        }
        Insert: {
          abort_on_failure_rate?: number | null
          adaptive_last_step_at?: string | null
          adaptive_rate_current?: number | null
          adaptive_rate_enabled?: boolean
          approval_mode?: string
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          avg_speed_per_min?: number | null
          batch_pause_ms?: number | null
          batch_size?: number
          bulk_id?: string | null
          button_url_mapping?: Json | null
          canceled_at?: string | null
          canceled_by?: string | null
          charged_cents?: number
          client_id?: string | null
          connection_id?: string | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json | null
          delivered_count?: number
          distribution_strategy?: string
          estimated_cost?: number
          failed_count?: number
          fatal_error_code?: string | null
          fatal_error_message?: string | null
          fatal_locked?: boolean
          fatal_locked_at?: string | null
          final_report?: Json | null
          finished_at?: string | null
          google_calendar_id?: string | null
          google_event_id?: string | null
          google_synced_at?: string | null
          http_concurrency?: number
          id?: string
          jitter_ms?: number
          last_error?: string | null
          last_sent_at?: string | null
          linked_campaign_id?: string | null
          linked_revenue_id?: string | null
          list_id?: string | null
          max_concurrency?: number | null
          max_per_day?: number | null
          max_per_hour?: number | null
          min_processed_for_abort?: number
          name: string
          notes?: string | null
          number_failover_mode?: string
          parallelism?: number | null
          participants?: Database["public"]["Enums"]["partner_participant"][]
          pause_duration_seconds?: number | null
          pause_every_messages?: number | null
          pause_reason?: string | null
          paused_at?: string | null
          paused_by?: string | null
          price_cents_at_start?: number | null
          priority?: number
          progress?: Json
          project_id?: string | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          rate_per_second?: number | null
          read_count?: number
          rejection_reason?: string | null
          replied_count?: number
          reservation_id?: string | null
          responsavel_id?: string | null
          response_flow_config?: Json | null
          response_flow_enabled?: boolean
          response_flow_id?: string | null
          response_flow_version_id?: string | null
          resumed_at?: string | null
          scheduled_at?: string | null
          scheduled_pause_enabled?: boolean
          scheduled_pause_until?: string | null
          send_rate_per_min?: number
          sent_count?: number
          split_group_id?: string | null
          split_group_index?: number | null
          split_group_name?: string | null
          started_at?: string | null
          started_by?: string | null
          status?: Database["public"]["Enums"]["wa_campaign_status"]
          submitted_at?: string | null
          tag_filters?: string[] | null
          target_per_hour?: number | null
          template_failover_mode?: string
          template_id?: string | null
          template_variables?: Json
          timezone?: string
          total_recipients?: number
          updated_at?: string
          use_multi_route?: boolean
          variables_mapping?: Json | null
          waba_ref_id?: string | null
          worker_lanes?: number
          worker_lease_id?: string | null
          worker_lease_until?: string | null
          workspace_id?: string | null
        }
        Update: {
          abort_on_failure_rate?: number | null
          adaptive_last_step_at?: string | null
          adaptive_rate_current?: number | null
          adaptive_rate_enabled?: boolean
          approval_mode?: string
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          avg_speed_per_min?: number | null
          batch_pause_ms?: number | null
          batch_size?: number
          bulk_id?: string | null
          button_url_mapping?: Json | null
          canceled_at?: string | null
          canceled_by?: string | null
          charged_cents?: number
          client_id?: string | null
          connection_id?: string | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json | null
          delivered_count?: number
          distribution_strategy?: string
          estimated_cost?: number
          failed_count?: number
          fatal_error_code?: string | null
          fatal_error_message?: string | null
          fatal_locked?: boolean
          fatal_locked_at?: string | null
          final_report?: Json | null
          finished_at?: string | null
          google_calendar_id?: string | null
          google_event_id?: string | null
          google_synced_at?: string | null
          http_concurrency?: number
          id?: string
          jitter_ms?: number
          last_error?: string | null
          last_sent_at?: string | null
          linked_campaign_id?: string | null
          linked_revenue_id?: string | null
          list_id?: string | null
          max_concurrency?: number | null
          max_per_day?: number | null
          max_per_hour?: number | null
          min_processed_for_abort?: number
          name?: string
          notes?: string | null
          number_failover_mode?: string
          parallelism?: number | null
          participants?: Database["public"]["Enums"]["partner_participant"][]
          pause_duration_seconds?: number | null
          pause_every_messages?: number | null
          pause_reason?: string | null
          paused_at?: string | null
          paused_by?: string | null
          price_cents_at_start?: number | null
          priority?: number
          progress?: Json
          project_id?: string | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          rate_per_second?: number | null
          read_count?: number
          rejection_reason?: string | null
          replied_count?: number
          reservation_id?: string | null
          responsavel_id?: string | null
          response_flow_config?: Json | null
          response_flow_enabled?: boolean
          response_flow_id?: string | null
          response_flow_version_id?: string | null
          resumed_at?: string | null
          scheduled_at?: string | null
          scheduled_pause_enabled?: boolean
          scheduled_pause_until?: string | null
          send_rate_per_min?: number
          sent_count?: number
          split_group_id?: string | null
          split_group_index?: number | null
          split_group_name?: string | null
          started_at?: string | null
          started_by?: string | null
          status?: Database["public"]["Enums"]["wa_campaign_status"]
          submitted_at?: string | null
          tag_filters?: string[] | null
          target_per_hour?: number | null
          template_failover_mode?: string
          template_id?: string | null
          template_variables?: Json
          timezone?: string
          total_recipients?: number
          updated_at?: string
          use_multi_route?: boolean
          variables_mapping?: Json | null
          waba_ref_id?: string | null
          worker_lanes?: number
          worker_lease_id?: string | null
          worker_lease_until?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_campaigns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_campaigns_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "v_client_numbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_campaigns_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_campaigns_linked_campaign_id_fkey"
            columns: ["linked_campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_campaigns_linked_revenue_id_fkey"
            columns: ["linked_revenue_id"]
            isOneToOne: false
            referencedRelation: "revenues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_campaigns_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "contact_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_campaigns_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "v_client_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_campaigns_waba_ref_id_fkey"
            columns: ["waba_ref_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_wabas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_campaigns_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_conversation_events: {
        Row: {
          actor_user_id: string | null
          conversation_id: string
          created_at: string
          data: Json
          event_type: string
          id: string
          workspace_id: string
        }
        Insert: {
          actor_user_id?: string | null
          conversation_id: string
          created_at?: string
          data?: Json
          event_type: string
          id?: string
          workspace_id: string
        }
        Update: {
          actor_user_id?: string | null
          conversation_id?: string
          created_at?: string
          data?: Json
          event_type?: string
          id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_conversation_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "wa_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_conversation_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_conversation_messages: {
        Row: {
          body: string | null
          campaign_id: string | null
          campaign_recipient_id: string | null
          context_wamid: string | null
          conversation_id: string
          created_at: string
          delivered_at: string | null
          direction: string
          error_code: string | null
          error_message: string | null
          failed_at: string | null
          id: string
          interactive_button_id: string | null
          interactive_button_title: string | null
          interactive_list_id: string | null
          interactive_list_title: string | null
          interactive_type: string | null
          media_caption: string | null
          media_filename: string | null
          media_id: string | null
          media_mime: string | null
          media_url: string | null
          message_type: string
          origin: string
          payload: Json | null
          read_at: string | null
          received_at: string | null
          sent_at: string | null
          sent_by_user_id: string | null
          status: string
          template_id: string | null
          template_language: string | null
          template_name: string | null
          template_variables: Json | null
          updated_at: string
          wamid: string | null
          workspace_id: string
        }
        Insert: {
          body?: string | null
          campaign_id?: string | null
          campaign_recipient_id?: string | null
          context_wamid?: string | null
          conversation_id: string
          created_at?: string
          delivered_at?: string | null
          direction: string
          error_code?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          interactive_button_id?: string | null
          interactive_button_title?: string | null
          interactive_list_id?: string | null
          interactive_list_title?: string | null
          interactive_type?: string | null
          media_caption?: string | null
          media_filename?: string | null
          media_id?: string | null
          media_mime?: string | null
          media_url?: string | null
          message_type?: string
          origin?: string
          payload?: Json | null
          read_at?: string | null
          received_at?: string | null
          sent_at?: string | null
          sent_by_user_id?: string | null
          status?: string
          template_id?: string | null
          template_language?: string | null
          template_name?: string | null
          template_variables?: Json | null
          updated_at?: string
          wamid?: string | null
          workspace_id: string
        }
        Update: {
          body?: string | null
          campaign_id?: string | null
          campaign_recipient_id?: string | null
          context_wamid?: string | null
          conversation_id?: string
          created_at?: string
          delivered_at?: string | null
          direction?: string
          error_code?: string | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          interactive_button_id?: string | null
          interactive_button_title?: string | null
          interactive_list_id?: string | null
          interactive_list_title?: string | null
          interactive_type?: string | null
          media_caption?: string | null
          media_filename?: string | null
          media_id?: string | null
          media_mime?: string | null
          media_url?: string | null
          message_type?: string
          origin?: string
          payload?: Json | null
          read_at?: string | null
          received_at?: string | null
          sent_at?: string | null
          sent_by_user_id?: string | null
          status?: string
          template_id?: string | null
          template_language?: string | null
          template_name?: string | null
          template_variables?: Json | null
          updated_at?: string
          wamid?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_conversation_messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "wa_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_conversation_messages_campaign_recipient_id_fkey"
            columns: ["campaign_recipient_id"]
            isOneToOne: false
            referencedRelation: "campaign_recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_conversation_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "wa_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_conversation_messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_conversations: {
        Row: {
          assigned_at: string | null
          assigned_user_id: string | null
          campaign_id: string | null
          campaign_recipient_id: string | null
          campaign_route_id: string | null
          connection_id: string | null
          contact_id: string | null
          contact_name: string | null
          contact_phone: string
          conversation_status: string
          created_at: string
          first_response_at: string | null
          flow_id: string | null
          flow_version_id: string | null
          id: string
          last_inbound_at: string | null
          last_message_at: string | null
          last_message_preview: string | null
          last_outbound_at: string | null
          locked_route_id: string | null
          metadata: Json
          phone_number_id: string | null
          service_window_expires_at: string | null
          service_window_opened_at: string | null
          service_window_status: string
          sla_first_response_breached_at: string | null
          sla_first_response_deadline: string | null
          tags: string[]
          template_id: string | null
          template_name: string | null
          unread_count: number
          updated_at: string
          wa_id: string | null
          waba_id: string | null
          workspace_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_user_id?: string | null
          campaign_id?: string | null
          campaign_recipient_id?: string | null
          campaign_route_id?: string | null
          connection_id?: string | null
          contact_id?: string | null
          contact_name?: string | null
          contact_phone: string
          conversation_status?: string
          created_at?: string
          first_response_at?: string | null
          flow_id?: string | null
          flow_version_id?: string | null
          id?: string
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_preview?: string | null
          last_outbound_at?: string | null
          locked_route_id?: string | null
          metadata?: Json
          phone_number_id?: string | null
          service_window_expires_at?: string | null
          service_window_opened_at?: string | null
          service_window_status?: string
          sla_first_response_breached_at?: string | null
          sla_first_response_deadline?: string | null
          tags?: string[]
          template_id?: string | null
          template_name?: string | null
          unread_count?: number
          updated_at?: string
          wa_id?: string | null
          waba_id?: string | null
          workspace_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_user_id?: string | null
          campaign_id?: string | null
          campaign_recipient_id?: string | null
          campaign_route_id?: string | null
          connection_id?: string | null
          contact_id?: string | null
          contact_name?: string | null
          contact_phone?: string
          conversation_status?: string
          created_at?: string
          first_response_at?: string | null
          flow_id?: string | null
          flow_version_id?: string | null
          id?: string
          last_inbound_at?: string | null
          last_message_at?: string | null
          last_message_preview?: string | null
          last_outbound_at?: string | null
          locked_route_id?: string | null
          metadata?: Json
          phone_number_id?: string | null
          service_window_expires_at?: string | null
          service_window_opened_at?: string | null
          service_window_status?: string
          sla_first_response_breached_at?: string | null
          sla_first_response_deadline?: string | null
          tags?: string[]
          template_id?: string | null
          template_name?: string | null
          unread_count?: number
          updated_at?: string
          wa_id?: string | null
          waba_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_conversations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "wa_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_conversations_campaign_recipient_id_fkey"
            columns: ["campaign_recipient_id"]
            isOneToOne: false
            referencedRelation: "campaign_recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_conversations_campaign_route_id_fkey"
            columns: ["campaign_route_id"]
            isOneToOne: false
            referencedRelation: "wa_campaign_routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_conversations_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "v_client_numbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_conversations_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_conversations_locked_route_id_fkey"
            columns: ["locked_route_id"]
            isOneToOne: false
            referencedRelation: "wa_campaign_routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_health_events: {
        Row: {
          additional_info: Json
          connection_id: string | null
          created_at: string
          entity_type: string | null
          errors: Json
          id: string
          label: string | null
          new_status: string | null
          node_id: string
          node_kind: string
          previous_status: string | null
          workspace_id: string | null
        }
        Insert: {
          additional_info?: Json
          connection_id?: string | null
          created_at?: string
          entity_type?: string | null
          errors?: Json
          id?: string
          label?: string | null
          new_status?: string | null
          node_id: string
          node_kind: string
          previous_status?: string | null
          workspace_id?: string | null
        }
        Update: {
          additional_info?: Json
          connection_id?: string | null
          created_at?: string
          entity_type?: string | null
          errors?: Json
          id?: string
          label?: string | null
          new_status?: string | null
          node_id?: string
          node_kind?: string
          previous_status?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_health_events_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "v_client_numbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_health_events_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_health_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_health_status: {
        Row: {
          additional_info: Json
          can_send_message: string | null
          checked_at: string
          connection_id: string | null
          created_at: string
          entities: Json
          errors: Json
          fetch_error: string | null
          id: string
          label: string | null
          node_id: string
          node_kind: string
          ok: boolean
          template_ref_id: string | null
          updated_at: string
          waba_ref_id: string | null
          workspace_id: string | null
        }
        Insert: {
          additional_info?: Json
          can_send_message?: string | null
          checked_at?: string
          connection_id?: string | null
          created_at?: string
          entities?: Json
          errors?: Json
          fetch_error?: string | null
          id?: string
          label?: string | null
          node_id: string
          node_kind: string
          ok?: boolean
          template_ref_id?: string | null
          updated_at?: string
          waba_ref_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          additional_info?: Json
          can_send_message?: string | null
          checked_at?: string
          connection_id?: string | null
          created_at?: string
          entities?: Json
          errors?: Json
          fetch_error?: string | null
          id?: string
          label?: string | null
          node_id?: string
          node_kind?: string
          ok?: boolean
          template_ref_id?: string | null
          updated_at?: string
          waba_ref_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_health_status_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "v_client_numbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_health_status_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_health_status_template_ref_id_fkey"
            columns: ["template_ref_id"]
            isOneToOne: false
            referencedRelation: "v_client_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_health_status_template_ref_id_fkey"
            columns: ["template_ref_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_health_status_waba_ref_id_fkey"
            columns: ["waba_ref_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_wabas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_health_status_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_internal_notes: {
        Row: {
          author_user_id: string | null
          body: string
          conversation_id: string
          created_at: string
          id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          author_user_id?: string | null
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          author_user_id?: string | null
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_internal_notes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "wa_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_internal_notes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_queue_tick_logs: {
        Row: {
          created_at: string
          duration_ms: number
          id: string
          last_error: string | null
          processed_campaigns: number
          promoted_count: number
          ran_at: string
          results: Json
          total_failed: number
          total_sent: number
        }
        Insert: {
          created_at?: string
          duration_ms?: number
          id?: string
          last_error?: string | null
          processed_campaigns?: number
          promoted_count?: number
          ran_at?: string
          results?: Json
          total_failed?: number
          total_sent?: number
        }
        Update: {
          created_at?: string
          duration_ms?: number
          id?: string
          last_error?: string | null
          processed_campaigns?: number
          promoted_count?: number
          ran_at?: string
          results?: Json
          total_failed?: number
          total_sent?: number
        }
        Relationships: []
      }
      wa_rate_limits: {
        Row: {
          active_inflight: number
          global_max_concurrency: number
          last_refill_at: string
          max_concurrency: number
          phone_number_id: string
          rate_per_second: number
          slot_updated_at: string | null
          throttle_rate: number | null
          throttle_reason: string | null
          throttle_until: string | null
          throughput_level: string | null
          throughput_mps: number | null
          throughput_synced_at: string | null
          tokens: number
          updated_at: string
        }
        Insert: {
          active_inflight?: number
          global_max_concurrency?: number
          last_refill_at?: string
          max_concurrency?: number
          phone_number_id: string
          rate_per_second?: number
          slot_updated_at?: string | null
          throttle_rate?: number | null
          throttle_reason?: string | null
          throttle_until?: string | null
          throughput_level?: string | null
          throughput_mps?: number | null
          throughput_synced_at?: string | null
          tokens?: number
          updated_at?: string
        }
        Update: {
          active_inflight?: number
          global_max_concurrency?: number
          last_refill_at?: string
          max_concurrency?: number
          phone_number_id?: string
          rate_per_second?: number
          slot_updated_at?: string | null
          throttle_rate?: number | null
          throttle_reason?: string | null
          throttle_until?: string | null
          throughput_level?: string | null
          throughput_mps?: number | null
          throughput_synced_at?: string | null
          tokens?: number
          updated_at?: string
        }
        Relationships: []
      }
      wa_service_queue: {
        Row: {
          attempt: number
          connection_id: string | null
          contact_phone: string
          conversation_id: string
          created_at: string
          id: string
          idempotency_key: string
          last_attempt_at: string | null
          last_error: string | null
          max_attempts: number
          message_id: string | null
          next_attempt_at: string
          origin: string
          payload: Json
          phone_number_id: string
          priority: number
          requested_by: string | null
          scheduled_at: string
          status: string
          updated_at: string
          wamid: string | null
          workspace_id: string
        }
        Insert: {
          attempt?: number
          connection_id?: string | null
          contact_phone: string
          conversation_id: string
          created_at?: string
          id?: string
          idempotency_key: string
          last_attempt_at?: string | null
          last_error?: string | null
          max_attempts?: number
          message_id?: string | null
          next_attempt_at?: string
          origin?: string
          payload: Json
          phone_number_id: string
          priority?: number
          requested_by?: string | null
          scheduled_at?: string
          status?: string
          updated_at?: string
          wamid?: string | null
          workspace_id: string
        }
        Update: {
          attempt?: number
          connection_id?: string | null
          contact_phone?: string
          conversation_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          last_attempt_at?: string | null
          last_error?: string | null
          max_attempts?: number
          message_id?: string | null
          next_attempt_at?: string
          origin?: string
          payload?: Json
          phone_number_id?: string
          priority?: number
          requested_by?: string | null
          scheduled_at?: string
          status?: string
          updated_at?: string
          wamid?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_service_queue_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "v_client_numbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_service_queue_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_service_queue_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "wa_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_service_queue_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "wa_conversation_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_service_queue_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_template_references: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          payload: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          payload?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          payload?: Json
          updated_at?: string
        }
        Relationships: []
      }
      wa_tick_lease: {
        Row: {
          acquired_at: string | null
          chain_count: number
          chained_at: string | null
          expires_at: string | null
          holder: string | null
          id: number
          last_chain_request_id: number | null
        }
        Insert: {
          acquired_at?: string | null
          chain_count?: number
          chained_at?: string | null
          expires_at?: string | null
          holder?: string | null
          id?: number
          last_chain_request_id?: number | null
        }
        Update: {
          acquired_at?: string | null
          chain_count?: number
          chained_at?: string | null
          expires_at?: string | null
          holder?: string | null
          id?: number
          last_chain_request_id?: number | null
        }
        Relationships: []
      }
      wa_worker_lanes: {
        Row: {
          accepted_total: number
          avg_request_ms: number | null
          campaign_id: string
          completed_last_second: number
          created_at: string
          heartbeat_at: string | null
          holder: string | null
          http_concurrency_limit: number
          http_in_flight: number
          idle_ms: number
          idle_reason: string | null
          lane_index: number
          lease_started_at: string | null
          lease_until: string | null
          requests_completed: number
          requests_started: number
          reserved: number
          started_last_second: number
          time_between_requests_ms: number | null
          updated_at: string
        }
        Insert: {
          accepted_total?: number
          avg_request_ms?: number | null
          campaign_id: string
          completed_last_second?: number
          created_at?: string
          heartbeat_at?: string | null
          holder?: string | null
          http_concurrency_limit?: number
          http_in_flight?: number
          idle_ms?: number
          idle_reason?: string | null
          lane_index: number
          lease_started_at?: string | null
          lease_until?: string | null
          requests_completed?: number
          requests_started?: number
          reserved?: number
          started_last_second?: number
          time_between_requests_ms?: number | null
          updated_at?: string
        }
        Update: {
          accepted_total?: number
          avg_request_ms?: number | null
          campaign_id?: string
          completed_last_second?: number
          created_at?: string
          heartbeat_at?: string | null
          holder?: string | null
          http_concurrency_limit?: number
          http_in_flight?: number
          idle_ms?: number
          idle_reason?: string | null
          lane_index?: number
          lease_started_at?: string | null
          lease_until?: string | null
          requests_completed?: number
          requests_started?: number
          reserved?: number
          started_last_second?: number
          time_between_requests_ms?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_worker_lanes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "wa_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_reservations: {
        Row: {
          campaign_id: string | null
          created_at: string
          id: string
          qty_consumed: number
          qty_reserved: number
          status: string
          unit_price_cents: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          id?: string
          qty_consumed?: number
          qty_reserved: number
          status?: string
          unit_price_cents: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          id?: string
          qty_consumed?: number
          qty_reserved?: number
          status?: string
          unit_price_cents?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_reservations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount_cents: number
          balance_after_cents: number
          balance_before_cents: number
          campaign_id: string | null
          created_at: string
          created_by: string | null
          deposit_id: string | null
          description: string | null
          id: string
          recipient_id: string | null
          type: string
          workspace_id: string
        }
        Insert: {
          amount_cents: number
          balance_after_cents: number
          balance_before_cents: number
          campaign_id?: string | null
          created_at?: string
          created_by?: string | null
          deposit_id?: string | null
          description?: string | null
          id?: string
          recipient_id?: string | null
          type: string
          workspace_id: string
        }
        Update: {
          amount_cents?: number
          balance_after_cents?: number
          balance_before_cents?: number
          campaign_id?: string | null
          created_at?: string
          created_by?: string | null
          deposit_id?: string | null
          description?: string | null
          id?: string
          recipient_id?: string | null
          type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_connections: {
        Row: {
          access_token: string | null
          adaptive_rate_enabled: boolean
          api_key: string | null
          app_id: string | null
          app_secret: string | null
          blocked_at: string | null
          blocked_error_code: string | null
          blocked_reason: string | null
          business_id: string | null
          client_id: string | null
          code_verification_status: string | null
          coexistence_status: string | null
          created_at: string
          current_display_name: string | null
          daily_cap: number | null
          daily_limit: number | null
          display_name: string | null
          display_name_applied_at: string | null
          display_name_rejection_reason: string | null
          display_name_requested_at: string | null
          display_name_reviewed_at: string | null
          display_name_status: string | null
          display_phone: string | null
          embedded_signup_completed_at: string | null
          global_max_concurrency: number
          global_rate_per_second: number
          graph_api_version: string | null
          id: string
          last_meta_sync_at: string | null
          last_seen_at: string | null
          last_synced_at: string | null
          maximum_rate_per_second: number
          messaging_limit: string | null
          meta_sync_status: string
          name: string
          nome_interno: string | null
          notes: string | null
          onboarding_mode: string
          paused_at: string | null
          phone: string | null
          phone_number_id: string | null
          project_id: string | null
          provider: string | null
          quality_rating: string | null
          quality_visible_to_client: boolean
          requested_display_name: string | null
          status: string
          updated_at: string
          use_global_token: boolean
          verified_name: string | null
          verify_token: string | null
          visibility: string
          waba_id: string | null
          waba_ref_id: string | null
          webhook_url: string | null
          workspace_id: string | null
        }
        Insert: {
          access_token?: string | null
          adaptive_rate_enabled?: boolean
          api_key?: string | null
          app_id?: string | null
          app_secret?: string | null
          blocked_at?: string | null
          blocked_error_code?: string | null
          blocked_reason?: string | null
          business_id?: string | null
          client_id?: string | null
          code_verification_status?: string | null
          coexistence_status?: string | null
          created_at?: string
          current_display_name?: string | null
          daily_cap?: number | null
          daily_limit?: number | null
          display_name?: string | null
          display_name_applied_at?: string | null
          display_name_rejection_reason?: string | null
          display_name_requested_at?: string | null
          display_name_reviewed_at?: string | null
          display_name_status?: string | null
          display_phone?: string | null
          embedded_signup_completed_at?: string | null
          global_max_concurrency?: number
          global_rate_per_second?: number
          graph_api_version?: string | null
          id?: string
          last_meta_sync_at?: string | null
          last_seen_at?: string | null
          last_synced_at?: string | null
          maximum_rate_per_second?: number
          messaging_limit?: string | null
          meta_sync_status?: string
          name: string
          nome_interno?: string | null
          notes?: string | null
          onboarding_mode?: string
          paused_at?: string | null
          phone?: string | null
          phone_number_id?: string | null
          project_id?: string | null
          provider?: string | null
          quality_rating?: string | null
          quality_visible_to_client?: boolean
          requested_display_name?: string | null
          status?: string
          updated_at?: string
          use_global_token?: boolean
          verified_name?: string | null
          verify_token?: string | null
          visibility?: string
          waba_id?: string | null
          waba_ref_id?: string | null
          webhook_url?: string | null
          workspace_id?: string | null
        }
        Update: {
          access_token?: string | null
          adaptive_rate_enabled?: boolean
          api_key?: string | null
          app_id?: string | null
          app_secret?: string | null
          blocked_at?: string | null
          blocked_error_code?: string | null
          blocked_reason?: string | null
          business_id?: string | null
          client_id?: string | null
          code_verification_status?: string | null
          coexistence_status?: string | null
          created_at?: string
          current_display_name?: string | null
          daily_cap?: number | null
          daily_limit?: number | null
          display_name?: string | null
          display_name_applied_at?: string | null
          display_name_rejection_reason?: string | null
          display_name_requested_at?: string | null
          display_name_reviewed_at?: string | null
          display_name_status?: string | null
          display_phone?: string | null
          embedded_signup_completed_at?: string | null
          global_max_concurrency?: number
          global_rate_per_second?: number
          graph_api_version?: string | null
          id?: string
          last_meta_sync_at?: string | null
          last_seen_at?: string | null
          last_synced_at?: string | null
          maximum_rate_per_second?: number
          messaging_limit?: string | null
          meta_sync_status?: string
          name?: string
          nome_interno?: string | null
          notes?: string | null
          onboarding_mode?: string
          paused_at?: string | null
          phone?: string | null
          phone_number_id?: string | null
          project_id?: string | null
          provider?: string | null
          quality_rating?: string | null
          quality_visible_to_client?: boolean
          requested_display_name?: string | null
          status?: string
          updated_at?: string
          use_global_token?: boolean
          verified_name?: string | null
          verify_token?: string | null
          visibility?: string
          waba_id?: string | null
          waba_ref_id?: string | null
          webhook_url?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_connections_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_connections_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_connections_waba_ref_id_fkey"
            columns: ["waba_ref_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_wabas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_connections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_display_name_attempts: {
        Row: {
          connection_id: string
          created_at: string
          id: string
          success: boolean
          user_id: string | null
        }
        Insert: {
          connection_id: string
          created_at?: string
          id?: string
          success?: boolean
          user_id?: string | null
        }
        Update: {
          connection_id?: string
          created_at?: string
          id?: string
          success?: boolean
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_display_name_attempts_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "v_client_numbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_display_name_attempts_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_inbox: {
        Row: {
          body: string | null
          connection_id: string | null
          contact_id: string | null
          direction: string
          id: string
          message_type: string | null
          meta_message_id: string | null
          phone: string
          raw: Json | null
          received_at: string
          status: string | null
          workspace_id: string | null
        }
        Insert: {
          body?: string | null
          connection_id?: string | null
          contact_id?: string | null
          direction?: string
          id?: string
          message_type?: string | null
          meta_message_id?: string | null
          phone: string
          raw?: Json | null
          received_at?: string
          status?: string | null
          workspace_id?: string | null
        }
        Update: {
          body?: string | null
          connection_id?: string | null
          contact_id?: string | null
          direction?: string
          id?: string
          message_type?: string | null
          meta_message_id?: string | null
          phone?: string
          raw?: Json | null
          received_at?: string
          status?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_inbox_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "v_client_numbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_inbox_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_inbox_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_inbox_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
          workspace_id: string | null
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
          workspace_id?: string | null
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
          workspace_id?: string | null
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
          {
            foreignKeyName: "whatsapp_messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_number_grants: {
        Row: {
          connection_id: string
          created_at: string
          granted_by: string | null
          id: string
          project_id: string | null
          workspace_id: string
        }
        Insert: {
          connection_id: string
          created_at?: string
          granted_by?: string | null
          id?: string
          project_id?: string | null
          workspace_id: string
        }
        Update: {
          connection_id?: string
          created_at?: string
          granted_by?: string | null
          id?: string
          project_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_number_grants_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "v_client_numbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_number_grants_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_number_grants_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_number_grants_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_onboarding_logs: {
        Row: {
          client_id: string | null
          connection_id: string | null
          created_at: string
          error: string | null
          id: string
          payload: Json | null
          project_id: string | null
          status: string
          step: string
          waba_ref_id: string | null
        }
        Insert: {
          client_id?: string | null
          connection_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          payload?: Json | null
          project_id?: string | null
          status: string
          step: string
          waba_ref_id?: string | null
        }
        Update: {
          client_id?: string | null
          connection_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          payload?: Json | null
          project_id?: string | null
          status?: string
          step?: string
          waba_ref_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_onboarding_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_onboarding_logs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "v_client_numbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_onboarding_logs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_onboarding_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_onboarding_logs_waba_ref_id_fkey"
            columns: ["waba_ref_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_wabas"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_profile_audit_logs: {
        Row: {
          action: string
          connection_id: string | null
          created_at: string
          error_message: string | null
          id: string
          meta_error_code: string | null
          meta_error_subcode: string | null
          meta_error_type: string | null
          meta_fbtrace_id: string | null
          new_value: Json | null
          phone_number_id: string | null
          previous_value: Json | null
          status: string
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          action: string
          connection_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          meta_error_code?: string | null
          meta_error_subcode?: string | null
          meta_error_type?: string | null
          meta_fbtrace_id?: string | null
          new_value?: Json | null
          phone_number_id?: string | null
          previous_value?: Json | null
          status?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          action?: string
          connection_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          meta_error_code?: string | null
          meta_error_subcode?: string | null
          meta_error_type?: string | null
          meta_fbtrace_id?: string | null
          new_value?: Json | null
          phone_number_id?: string | null
          previous_value?: Json | null
          status?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_profile_audit_logs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "v_client_numbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_profile_audit_logs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_profile_audit_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_template_grants: {
        Row: {
          connection_id: string | null
          created_at: string
          granted_by: string | null
          id: string
          template_id: string
          workspace_id: string | null
        }
        Insert: {
          connection_id?: string | null
          created_at?: string
          granted_by?: string | null
          id?: string
          template_id: string
          workspace_id?: string | null
        }
        Update: {
          connection_id?: string | null
          created_at?: string
          granted_by?: string | null
          id?: string
          template_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_template_grants_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "v_client_numbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_template_grants_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_template_grants_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "v_client_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_template_grants_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_template_grants_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_template_requests: {
        Row: {
          admin_notes: string | null
          body: string
          buttons: Json
          category: string
          created_at: string
          created_template_id: string | null
          footer: string | null
          header_media_type: string | null
          header_type: string | null
          id: string
          language: string
          name: string
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string | null
          updated_at: string
          variables: Json
          workspace_id: string
        }
        Insert: {
          admin_notes?: string | null
          body: string
          buttons?: Json
          category: string
          created_at?: string
          created_template_id?: string | null
          footer?: string | null
          header_media_type?: string | null
          header_type?: string | null
          id?: string
          language?: string
          name: string
          requested_by: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          variables?: Json
          workspace_id: string
        }
        Update: {
          admin_notes?: string | null
          body?: string
          buttons?: Json
          category?: string
          created_at?: string
          created_template_id?: string | null
          footer?: string | null
          header_media_type?: string | null
          header_type?: string | null
          id?: string
          language?: string
          name?: string
          requested_by?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          variables?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_template_requests_created_template_id_fkey"
            columns: ["created_template_id"]
            isOneToOne: false
            referencedRelation: "v_client_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_template_requests_created_template_id_fkey"
            columns: ["created_template_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_template_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          body: string
          buttons: Json
          category: string | null
          connection_id: string | null
          created_at: string
          footer: string | null
          header_media_url: string | null
          header_text: string | null
          header_type: string | null
          history: Json | null
          id: string
          language: string
          last_synced_at: string | null
          meta_template_id: string | null
          name: string
          raw: Json | null
          rejection_reason: string | null
          reviewed_at: string | null
          status: Database["public"]["Enums"]["wa_template_status"]
          submitted_at: string | null
          updated_at: string
          variables: Json
          variables_examples: Json | null
          visibility: string
          waba_ref_id: string | null
          workspace_id: string | null
        }
        Insert: {
          body?: string
          buttons?: Json
          category?: string | null
          connection_id?: string | null
          created_at?: string
          footer?: string | null
          header_media_url?: string | null
          header_text?: string | null
          header_type?: string | null
          history?: Json | null
          id?: string
          language?: string
          last_synced_at?: string | null
          meta_template_id?: string | null
          name: string
          raw?: Json | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          status?: Database["public"]["Enums"]["wa_template_status"]
          submitted_at?: string | null
          updated_at?: string
          variables?: Json
          variables_examples?: Json | null
          visibility?: string
          waba_ref_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          body?: string
          buttons?: Json
          category?: string | null
          connection_id?: string | null
          created_at?: string
          footer?: string | null
          header_media_url?: string | null
          header_text?: string | null
          header_type?: string | null
          history?: Json | null
          id?: string
          language?: string
          last_synced_at?: string | null
          meta_template_id?: string | null
          name?: string
          raw?: Json | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          status?: Database["public"]["Enums"]["wa_template_status"]
          submitted_at?: string | null
          updated_at?: string
          variables?: Json
          variables_examples?: Json | null
          visibility?: string
          waba_ref_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "v_client_numbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_templates_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_templates_waba_ref_id_fkey"
            columns: ["waba_ref_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_wabas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_wabas: {
        Row: {
          access_token: string | null
          account_review_status: string | null
          ban_state: string | null
          business_id: string | null
          business_verification_status: string | null
          client_id: string | null
          created_at: string
          id: string
          last_sync_error: string | null
          last_synced_at: string | null
          meta_status: string | null
          nome_interno: string
          observacoes: string | null
          onboarded_at: string | null
          onboarded_via: string
          project_id: string | null
          restriction_checked_at: string | null
          restriction_level: string | null
          restriction_reason: string | null
          restrictions: Json
          status: string
          token_expires_at: string | null
          updated_at: string
          waba_id: string
          workspace_id: string | null
        }
        Insert: {
          access_token?: string | null
          account_review_status?: string | null
          ban_state?: string | null
          business_id?: string | null
          business_verification_status?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          last_sync_error?: string | null
          last_synced_at?: string | null
          meta_status?: string | null
          nome_interno: string
          observacoes?: string | null
          onboarded_at?: string | null
          onboarded_via?: string
          project_id?: string | null
          restriction_checked_at?: string | null
          restriction_level?: string | null
          restriction_reason?: string | null
          restrictions?: Json
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          waba_id: string
          workspace_id?: string | null
        }
        Update: {
          access_token?: string | null
          account_review_status?: string | null
          ban_state?: string | null
          business_id?: string | null
          business_verification_status?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          last_sync_error?: string | null
          last_synced_at?: string | null
          meta_status?: string | null
          nome_interno?: string
          observacoes?: string | null
          onboarded_at?: string | null
          onboarded_via?: string
          project_id?: string | null
          restriction_checked_at?: string | null
          restriction_level?: string | null
          restriction_reason?: string | null
          restrictions?: Json
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          waba_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_wabas_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_wabas_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_wabas_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_webhook_logs: {
        Row: {
          connection_id: string | null
          created_at: string
          error: string | null
          event_type: string | null
          id: string
          payload: Json
          processed: boolean
        }
        Insert: {
          connection_id?: string | null
          created_at?: string
          error?: string | null
          event_type?: string | null
          id?: string
          payload: Json
          processed?: boolean
        }
        Update: {
          connection_id?: string | null
          created_at?: string
          error?: string | null
          event_type?: string | null
          id?: string
          payload?: Json
          processed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_webhook_logs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "v_client_numbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_webhook_logs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_google_calendar: {
        Row: {
          access_token: string | null
          auto_sync: boolean
          calendar_id: string
          calendar_name: string | null
          connected_at: string
          connected_by: string | null
          google_email: string | null
          id: string
          refresh_token: string | null
          scopes: string | null
          token_expires_at: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          access_token?: string | null
          auto_sync?: boolean
          calendar_id?: string
          calendar_name?: string | null
          connected_at?: string
          connected_by?: string | null
          google_email?: string | null
          id?: string
          refresh_token?: string | null
          scopes?: string | null
          token_expires_at?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          access_token?: string | null
          auto_sync?: boolean
          calendar_id?: string
          calendar_name?: string | null
          connected_at?: string
          connected_by?: string | null
          google_email?: string | null
          id?: string
          refresh_token?: string | null
          scopes?: string | null
          token_expires_at?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_google_calendar_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_wallets: {
        Row: {
          balance_cents: number
          created_at: string
          custom_minimum_messages: number | null
          custom_price_cents: number | null
          low_balance_alert_at: string | null
          reserved_cents: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          balance_cents?: number
          created_at?: string
          custom_minimum_messages?: number | null
          custom_price_cents?: number | null
          low_balance_alert_at?: string | null
          reserved_cents?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          balance_cents?: number
          created_at?: string
          custom_minimum_messages?: number | null
          custom_price_cents?: number | null
          low_balance_alert_at?: string | null
          reserved_cents?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_wallets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          approval_mode: string
          block_reason: string | null
          blocked_at: string | null
          created_at: string
          default_connection_id: string | null
          id: string
          meta_business_id: string | null
          meta_business_name: string | null
          name: string
          owner_id: string | null
          plan: string
          settings: Json
          slug: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approval_mode?: string
          block_reason?: string | null
          blocked_at?: string | null
          created_at?: string
          default_connection_id?: string | null
          id?: string
          meta_business_id?: string | null
          meta_business_name?: string | null
          name: string
          owner_id?: string | null
          plan?: string
          settings?: Json
          slug?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approval_mode?: string
          block_reason?: string | null
          blocked_at?: string | null
          created_at?: string
          default_connection_id?: string | null
          id?: string
          meta_business_id?: string | null
          meta_business_name?: string | null
          name?: string
          owner_id?: string | null
          plan?: string
          settings?: Json
          slug?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_default_connection_id_fkey"
            columns: ["default_connection_id"]
            isOneToOne: false
            referencedRelation: "v_client_numbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspaces_default_connection_id_fkey"
            columns: ["default_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_client_numbers: {
        Row: {
          daily_cap: number | null
          display_name: string | null
          id: string | null
          paused_at: string | null
          phone_masked: string | null
          project_id: string | null
          quality_rating: string | null
          status: string | null
          visibility: string | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_number_grants_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_number_grants_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      v_client_templates: {
        Row: {
          body: string | null
          buttons: Json | null
          category: string | null
          connection_id: string | null
          footer: string | null
          header_text: string | null
          header_type: string | null
          id: string | null
          language: string | null
          name: string | null
          status: Database["public"]["Enums"]["wa_template_status"] | null
          variables: Json | null
          visibility: string | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_template_grants_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "v_client_numbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_template_grants_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_template_grants_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      backfill_contact_workspace_ids: { Args: never; Returns: Json }
      campaign_next_destination_cursor: {
        Args: { _campaign_id: string }
        Returns: number
      }
      campaigns_click_counts: {
        Args: never
        Returns: {
          campaign_id: string
          total: number
          uniques: number
        }[]
      }
      ci_path_is_public: { Args: { _path: string }; Returns: boolean }
      cron_headers: { Args: { _src?: string }; Returns: Json }
      get_my_context: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_workspace_role: {
        Args: {
          _roles: Database["public"]["Enums"]["workspace_role"][]
          _user: string
          _ws: string
        }
        Returns: boolean
      }
      is_internal_staff: { Args: { _user: string }; Returns: boolean }
      is_workspace_member: {
        Args: { _user: string; _ws: string }
        Returns: boolean
      }
      log_auth_event: {
        Args: { _metadata?: Json; _type: string }
        Returns: undefined
      }
      notify_workspace: {
        Args: {
          _body?: string
          _kind: string
          _link?: string
          _metadata?: Json
          _severity?: string
          _title: string
          _ws: string
        }
        Returns: string
      }
      seed_onboarding_checklist: { Args: { _ws: string }; Returns: undefined }
      user_workspace_ids: { Args: { _user: string }; Returns: string[] }
      wa_acquire_slots: {
        Args: {
          _max_conc?: number
          _phone_number_id: string
          _requested: number
        }
        Returns: {
          active_after: number
          granted: number
          max_concurrency: number
        }[]
      }
      wa_audience_preflight: { Args: { _list_id: string }; Returns: Json }
      wa_available_stock: {
        Args: { _client_id: string; _project_id: string }
        Returns: number
      }
      wa_build_recipients: {
        Args: { _campaign_id: string; _list_id: string }
        Returns: number
      }
      wa_campaign_active_routes: {
        Args: { _campaign_id: string }
        Returns: number
      }
      wa_campaign_failure_reasons: {
        Args: { _campaign_id: string }
        Returns: {
          error_code: string
          pct: number
          sample_reason: string
          total: number
        }[]
      }
      wa_check_scheduling_conflict: {
        Args: {
          _connection_id: string
          _duration_min?: number
          _exclude_id?: string
          _scheduled_at: string
        }
        Returns: {
          id: string
          name: string
          scheduled_at: string
          status: string
        }[]
      }
      wa_consume_stock: {
        Args: { _client_id: string; _project_id: string; _qty: number }
        Returns: boolean
      }
      wa_count_dispatch_clicks: {
        Args: { _campaign_ids: string[]; _from?: string; _to?: string }
        Returns: {
          clicks: number
          wa_campaign_id: string
        }[]
      }
      wa_daily_sends: {
        Args: { _campaign_id: string }
        Returns: {
          count: number
          day: string
        }[]
      }
      wa_dispatch_performance: { Args: { _campaign_id: string }; Returns: Json }
      wa_hourly_sends: {
        Args: { _campaign_id: string }
        Returns: {
          count: number
          hour: number
        }[]
      }
      wa_lane_acquire: {
        Args: {
          _campaign_id: string
          _holder: string
          _lane: number
          _seconds?: number
        }
        Returns: boolean
      }
      wa_lane_heartbeat: {
        Args: {
          _accepted_total: number
          _avg_request_ms: number
          _campaign_id: string
          _completed_last_second: number
          _holder: string
          _http_concurrency_limit: number
          _http_in_flight: number
          _idle_ms: number
          _idle_reason: string
          _lane: number
          _requests_completed: number
          _requests_started: number
          _reserved: number
          _started_last_second: number
          _time_between_requests_ms: number
        }
        Returns: undefined
      }
      wa_lane_release: {
        Args: { _campaign_id: string; _holder: string; _lane: number }
        Returns: boolean
      }
      wa_pick_next_agent: {
        Args: {
          _roles: Database["public"]["Enums"]["workspace_role"][]
          _ws: string
        }
        Returns: string
      }
      wa_recalc_campaign_progress: {
        Args: { _campaign_id: string }
        Returns: undefined
      }
      wa_release_slots: {
        Args: { _count: number; _phone_number_id: string }
        Returns: number
      }
      wa_reserve_campaign_recipients: {
        Args: { _campaign_id: string; _limit: number; _locked_at?: string }
        Returns: {
          attempt: number
          contact_id: string
          id: string
          phone: string
          variables: Json
        }[]
      }
      wa_simulate_rate_limiter: {
        Args: {
          _conc?: number
          _duration_ms?: number
          _phone: string
          _rate?: number
        }
        Returns: {
          avg_mps: number
          bucket_by_second: Json
          duration_ms: number
          p95_mps: number
          peak_mps: number
          total_allowed: number
        }[]
      }
      wa_sla_sweep: { Args: never; Returns: number }
      wa_split_build_recipients: {
        Args: { _campaign_ids: string[]; _list_id: string; _weights: number[] }
        Returns: Json
      }
      wa_suppression_add: {
        Args: {
          _created_by?: string
          _error_code?: string
          _note?: string
          _permanent?: boolean
          _phone: string
          _reason?: string
          _ttl_days?: number
        }
        Returns: {
          created_at: string
          created_by: string | null
          error_code: string | null
          expires_at: string | null
          failure_count: number
          first_seen_at: string
          id: string
          last_seen_at: string
          note: string | null
          permanent: boolean
          phone_normalized: string
          reason: string
          scope: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "recipient_suppression"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      wa_suppression_is_active: { Args: { _phone: string }; Returns: boolean }
      wa_suppression_register_failure: {
        Args: {
          _error_code: string
          _phone: string
          _threshold?: number
          _ttl_days?: number
        }
        Returns: boolean
      }
      wa_throttle_number: {
        Args: {
          _factor?: number
          _phone_number_id: string
          _reason?: string
          _seconds?: number
        }
        Returns: number
      }
      wa_tick_acquire_lease: {
        Args: { _duration_seconds?: number; _holder: string }
        Returns: boolean
      }
      wa_tick_chain: { Args: { _apikey: string; _url: string }; Returns: Json }
      wa_tick_release_lease: { Args: { _holder: string }; Returns: boolean }
      wa_touch_service_window: {
        Args: { _conversation_id: string; _inbound_at?: string }
        Returns: undefined
      }
      wa_try_consume_token: {
        Args: {
          _default_conc?: number
          _default_rate?: number
          _phone_number_id: string
        }
        Returns: {
          allowed: boolean
          max_concurrency: number
          rate_per_second: number
          wait_ms: number
        }[]
      }
      wa_try_consume_tokens: {
        Args: {
          _burst_cap_ms?: number
          _default_conc?: number
          _default_rate?: number
          _override_conc?: number
          _override_rate?: number
          _phone_number_id: string
          _requested: number
        }
        Returns: {
          granted: number
          max_concurrency: number
          rate_per_second: number
          tokens_after: number
          wait_ms: number
        }[]
      }
      wallet_available: { Args: { _ws: string }; Returns: number }
      wallet_consume_reservation: {
        Args: { _recipient_id?: string; _reservation_id: string }
        Returns: boolean
      }
      wallet_credit: {
        Args: {
          _amount_cents: number
          _campaign_id?: string
          _created_by?: string
          _deposit_id?: string
          _description: string
          _type: string
          _ws: string
        }
        Returns: {
          amount_cents: number
          balance_after_cents: number
          balance_before_cents: number
          campaign_id: string | null
          created_at: string
          created_by: string | null
          deposit_id: string | null
          description: string | null
          id: string
          recipient_id: string | null
          type: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "wallet_transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      wallet_debit: {
        Args: {
          _allow_negative?: boolean
          _amount_cents: number
          _campaign_id?: string
          _created_by?: string
          _description: string
          _recipient_id?: string
          _type: string
          _ws: string
        }
        Returns: {
          amount_cents: number
          balance_after_cents: number
          balance_before_cents: number
          campaign_id: string | null
          created_at: string
          created_by: string | null
          deposit_id: string | null
          description: string | null
          id: string
          recipient_id: string | null
          type: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "wallet_transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      wallet_effective_price: { Args: { _ws: string }; Returns: number }
      wallet_minimum_messages: { Args: { _ws: string }; Returns: number }
      wallet_release_reservation: {
        Args: { _qty?: number; _reservation_id: string }
        Returns: boolean
      }
      wallet_required_deposit_cents: { Args: { _ws: string }; Returns: number }
      wallet_reserve: {
        Args: {
          _campaign_id: string
          _qty: number
          _unit_price_cents: number
          _ws: string
        }
        Returns: {
          campaign_id: string | null
          created_at: string
          id: string
          qty_consumed: number
          qty_reserved: number
          status: string
          unit_price_cents: number
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "wallet_reservations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "admin" | "super_admin" | "support" | "finance" | "operations"
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
      partner_participant: "gustavo" | "cayo"
      wa_campaign_status:
        | "draft"
        | "scheduled"
        | "running"
        | "paused"
        | "completed"
        | "cancelled"
        | "error"
        | "partial"
        | "awaiting_approval"
        | "approved"
        | "rejected"
        | "blocked"
        | "queued"
      wa_recipient_status:
        | "pending"
        | "processing"
        | "sent"
        | "delivered"
        | "read"
        | "replied"
        | "failed"
        | "cancelled"
        | "opt_out"
        | "accepted"
        | "skipped"
      wa_route_status:
        | "active"
        | "paused"
        | "template_unavailable"
        | "number_unavailable"
        | "rate_limited"
        | "disabled"
        | "completed"
      wa_template_status:
        | "approved"
        | "pending"
        | "rejected"
        | "paused"
        | "disabled"
      workspace_role: "owner" | "admin" | "operator" | "viewer"
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
      app_role: ["admin", "super_admin", "support", "finance", "operations"],
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
      partner_participant: ["gustavo", "cayo"],
      wa_campaign_status: [
        "draft",
        "scheduled",
        "running",
        "paused",
        "completed",
        "cancelled",
        "error",
        "partial",
        "awaiting_approval",
        "approved",
        "rejected",
        "blocked",
        "queued",
      ],
      wa_recipient_status: [
        "pending",
        "processing",
        "sent",
        "delivered",
        "read",
        "replied",
        "failed",
        "cancelled",
        "opt_out",
        "accepted",
        "skipped",
      ],
      wa_route_status: [
        "active",
        "paused",
        "template_unavailable",
        "number_unavailable",
        "rate_limited",
        "disabled",
        "completed",
      ],
      wa_template_status: [
        "approved",
        "pending",
        "rejected",
        "paused",
        "disabled",
      ],
      workspace_role: ["owner", "admin", "operator", "viewer"],
    },
  },
} as const
