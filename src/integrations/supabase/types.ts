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
      campaign_recipients: {
        Row: {
          attempt: number
          campaign_id: string
          contact_id: string | null
          created_at: string
          delivered_at: string | null
          error_code: string | null
          failed_at: string | null
          failed_reason: string | null
          id: string
          meta_message_id: string | null
          phone: string
          read_at: string | null
          replied_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["wa_recipient_status"]
          updated_at: string
          variables: Json
        }
        Insert: {
          attempt?: number
          campaign_id: string
          contact_id?: string | null
          created_at?: string
          delivered_at?: string | null
          error_code?: string | null
          failed_at?: string | null
          failed_reason?: string | null
          id?: string
          meta_message_id?: string | null
          phone: string
          read_at?: string | null
          replied_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["wa_recipient_status"]
          updated_at?: string
          variables?: Json
        }
        Update: {
          attempt?: number
          campaign_id?: string
          contact_id?: string | null
          created_at?: string
          delivered_at?: string | null
          error_code?: string | null
          failed_at?: string | null
          failed_reason?: string | null
          id?: string
          meta_message_id?: string | null
          phone?: string
          read_at?: string | null
          replied_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["wa_recipient_status"]
          updated_at?: string
          variables?: Json
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
          participants: Database["public"]["Enums"]["partner_participant"][]
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
          participants?: Database["public"]["Enums"]["partner_participant"][]
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
          participants?: Database["public"]["Enums"]["partner_participant"][]
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
        }
        Insert: {
          added_at?: string
          contact_id: string
          list_id: string
        }
        Update: {
          added_at?: string
          contact_id?: string
          list_id?: string
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
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string | null
          updated_at?: string
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
        ]
      }
      contact_tag_assignments: {
        Row: {
          contact_id: string
          tag_id: string
        }
        Insert: {
          contact_id: string
          tag_id: string
        }
        Update: {
          contact_id?: string
          tag_id?: string
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
        ]
      }
      contact_tags: {
        Row: {
          client_id: string | null
          color: string | null
          created_at: string
          id: string
          name: string
        }
        Insert: {
          client_id?: string | null
          color?: string | null
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          client_id?: string | null
          color?: string | null
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_tags_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
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
        }
        Relationships: []
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
        ]
      }
      opt_outs: {
        Row: {
          client_id: string | null
          id: string
          opted_out_at: string
          phone: string
          reason: string | null
        }
        Insert: {
          client_id?: string | null
          id?: string
          opted_out_at?: string
          phone: string
          reason?: string | null
        }
        Update: {
          client_id?: string | null
          id?: string
          opted_out_at?: string
          phone?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opt_outs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
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
      reports: {
        Row: {
          campaigns: Json
          client_name: string
          created_at: string
          final_value: number | null
          id: string
          project: string | null
          reference: string | null
          report_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          campaigns?: Json
          client_name: string
          created_at?: string
          final_value?: number | null
          id?: string
          project?: string | null
          reference?: string | null
          report_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          campaigns?: Json
          client_name?: string
          created_at?: string
          final_value?: number | null
          id?: string
          project?: string | null
          reference?: string | null
          report_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      wa_campaigns: {
        Row: {
          client_id: string | null
          connection_id: string | null
          created_at: string
          created_by: string | null
          delivered_count: number
          estimated_cost: number
          failed_count: number
          finished_at: string | null
          id: string
          linked_revenue_id: string | null
          list_id: string | null
          name: string
          notes: string | null
          participants: Database["public"]["Enums"]["partner_participant"][]
          project_id: string | null
          read_count: number
          replied_count: number
          scheduled_at: string | null
          send_rate_per_min: number
          sent_count: number
          started_at: string | null
          status: Database["public"]["Enums"]["wa_campaign_status"]
          tag_filters: string[] | null
          template_id: string | null
          template_variables: Json
          total_recipients: number
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          connection_id?: string | null
          created_at?: string
          created_by?: string | null
          delivered_count?: number
          estimated_cost?: number
          failed_count?: number
          finished_at?: string | null
          id?: string
          linked_revenue_id?: string | null
          list_id?: string | null
          name: string
          notes?: string | null
          participants?: Database["public"]["Enums"]["partner_participant"][]
          project_id?: string | null
          read_count?: number
          replied_count?: number
          scheduled_at?: string | null
          send_rate_per_min?: number
          sent_count?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["wa_campaign_status"]
          tag_filters?: string[] | null
          template_id?: string | null
          template_variables?: Json
          total_recipients?: number
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          connection_id?: string | null
          created_at?: string
          created_by?: string | null
          delivered_count?: number
          estimated_cost?: number
          failed_count?: number
          finished_at?: string | null
          id?: string
          linked_revenue_id?: string | null
          list_id?: string | null
          name?: string
          notes?: string | null
          participants?: Database["public"]["Enums"]["partner_participant"][]
          project_id?: string | null
          read_count?: number
          replied_count?: number
          scheduled_at?: string | null
          send_rate_per_min?: number
          sent_count?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["wa_campaign_status"]
          tag_filters?: string[] | null
          template_id?: string | null
          template_variables?: Json
          total_recipients?: number
          updated_at?: string
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
            referencedRelation: "whatsapp_connections"
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
            referencedRelation: "whatsapp_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_connections: {
        Row: {
          access_token: string | null
          api_key: string | null
          business_id: string | null
          client_id: string | null
          created_at: string
          daily_limit: number | null
          display_phone: string | null
          graph_api_version: string | null
          id: string
          name: string
          phone: string | null
          phone_number_id: string | null
          project_id: string | null
          provider: string | null
          quality_rating: string | null
          status: string
          updated_at: string
          verify_token: string | null
          waba_id: string | null
          webhook_url: string | null
        }
        Insert: {
          access_token?: string | null
          api_key?: string | null
          business_id?: string | null
          client_id?: string | null
          created_at?: string
          daily_limit?: number | null
          display_phone?: string | null
          graph_api_version?: string | null
          id?: string
          name: string
          phone?: string | null
          phone_number_id?: string | null
          project_id?: string | null
          provider?: string | null
          quality_rating?: string | null
          status?: string
          updated_at?: string
          verify_token?: string | null
          waba_id?: string | null
          webhook_url?: string | null
        }
        Update: {
          access_token?: string | null
          api_key?: string | null
          business_id?: string | null
          client_id?: string | null
          created_at?: string
          daily_limit?: number | null
          display_phone?: string | null
          graph_api_version?: string | null
          id?: string
          name?: string
          phone?: string | null
          phone_number_id?: string | null
          project_id?: string | null
          provider?: string | null
          quality_rating?: string | null
          status?: string
          updated_at?: string
          verify_token?: string | null
          waba_id?: string | null
          webhook_url?: string | null
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
        }
        Relationships: [
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
      whatsapp_templates: {
        Row: {
          body: string
          buttons: Json
          category: string | null
          connection_id: string | null
          created_at: string
          footer: string | null
          header_text: string | null
          header_type: string | null
          id: string
          language: string
          meta_template_id: string | null
          name: string
          raw: Json | null
          status: Database["public"]["Enums"]["wa_template_status"]
          updated_at: string
          variables: Json
        }
        Insert: {
          body?: string
          buttons?: Json
          category?: string | null
          connection_id?: string | null
          created_at?: string
          footer?: string | null
          header_text?: string | null
          header_type?: string | null
          id?: string
          language?: string
          meta_template_id?: string | null
          name: string
          raw?: Json | null
          status?: Database["public"]["Enums"]["wa_template_status"]
          updated_at?: string
          variables?: Json
        }
        Update: {
          body?: string
          buttons?: Json
          category?: string | null
          connection_id?: string | null
          created_at?: string
          footer?: string | null
          header_text?: string | null
          header_type?: string | null
          id?: string
          language?: string
          meta_template_id?: string | null
          name?: string
          raw?: Json | null
          status?: Database["public"]["Enums"]["wa_template_status"]
          updated_at?: string
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
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
            referencedRelation: "whatsapp_connections"
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
      wa_available_stock: {
        Args: { _client_id: string; _project_id: string }
        Returns: number
      }
      wa_consume_stock: {
        Args: { _client_id: string; _project_id: string; _qty: number }
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
      partner_participant: "gustavo" | "cayo"
      wa_campaign_status:
        | "draft"
        | "scheduled"
        | "running"
        | "paused"
        | "completed"
        | "cancelled"
        | "error"
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
      wa_template_status:
        | "approved"
        | "pending"
        | "rejected"
        | "paused"
        | "disabled"
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
      partner_participant: ["gustavo", "cayo"],
      wa_campaign_status: [
        "draft",
        "scheduled",
        "running",
        "paused",
        "completed",
        "cancelled",
        "error",
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
      ],
      wa_template_status: [
        "approved",
        "pending",
        "rejected",
        "paused",
        "disabled",
      ],
    },
  },
} as const
