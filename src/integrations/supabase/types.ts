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
      ai_analytics: {
        Row: {
          answered: boolean
          conversation_id: string | null
          created_at: string
          document_ids: string[] | null
          id: string
          intent: string | null
          latency_ms: number | null
          question: string
          source_type: string | null
          tokens_used: number | null
          user_id: string | null
        }
        Insert: {
          answered?: boolean
          conversation_id?: string | null
          created_at?: string
          document_ids?: string[] | null
          id?: string
          intent?: string | null
          latency_ms?: number | null
          question: string
          source_type?: string | null
          tokens_used?: number | null
          user_id?: string | null
        }
        Update: {
          answered?: boolean
          conversation_id?: string | null
          created_at?: string
          document_ids?: string[] | null
          id?: string
          intent?: string | null
          latency_ms?: number | null
          question?: string
          source_type?: string | null
          tokens_used?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_analytics_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversations: {
        Row: {
          created_at: string
          employee_id: string | null
          id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          employee_id?: string | null
          id?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          employee_id?: string | null
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_feedback: {
        Row: {
          comment: string | null
          created_at: string
          helpful: boolean
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          helpful: boolean
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          helpful?: boolean
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_feedback_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "ai_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          sources: Json | null
          tool_calls: Json | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          sources?: Json | null
          tool_calls?: Json | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          sources?: Json | null
          tool_calls?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_acknowledgements: {
        Row: {
          acknowledged_at: string
          announcement_id: string
          employee_id: string
          id: string
        }
        Insert: {
          acknowledged_at?: string
          announcement_id: string
          employee_id: string
          id?: string
        }
        Update: {
          acknowledged_at?: string
          announcement_id?: string
          employee_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_acknowledgements_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_acknowledgements_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          body: string
          centre_id: string | null
          created_at: string
          created_by: string | null
          department_id: string | null
          id: string
          priority: Database["public"]["Enums"]["announcement_priority"]
          requires_ack: boolean
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          centre_id?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["announcement_priority"]
          requires_ack?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          centre_id?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["announcement_priority"]
          requires_ack?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_centre_id_fkey"
            columns: ["centre_id"]
            isOneToOne: false
            referencedRelation: "centres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          after_data: Json | null
          attendance_id: string | null
          before_data: Json | null
          created_at: string
          employee_id: string | null
          id: string
          reason: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_data?: Json | null
          attendance_id?: string | null
          before_data?: Json | null
          created_at?: string
          employee_id?: string | null
          id?: string
          reason?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_data?: Json | null
          attendance_id?: string | null
          before_data?: Json | null
          created_at?: string
          employee_id?: string | null
          id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_audit_logs_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendance_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_audit_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_corrections: {
        Row: {
          attendance_id: string | null
          created_at: string
          employee_id: string
          id: string
          reason: string
          requested_by: string
          requested_login_at: string | null
          requested_logout_at: string | null
          requested_status:
            | Database["public"]["Enums"]["attendance_status"]
            | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["request_status"]
          updated_at: string
          work_date: string
        }
        Insert: {
          attendance_id?: string | null
          created_at?: string
          employee_id: string
          id?: string
          reason: string
          requested_by: string
          requested_login_at?: string | null
          requested_logout_at?: string | null
          requested_status?:
            | Database["public"]["Enums"]["attendance_status"]
            | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
          work_date: string
        }
        Update: {
          attendance_id?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          reason?: string
          requested_by?: string
          requested_login_at?: string | null
          requested_logout_at?: string | null
          requested_status?:
            | Database["public"]["Enums"]["attendance_status"]
            | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_corrections_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendance_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_corrections_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_corrections_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_corrections_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          created_at: string
          employee_id: string
          hours_worked: number | null
          id: string
          is_late: boolean
          login_at: string | null
          logout_at: string | null
          notes: string | null
          source: Database["public"]["Enums"]["attendance_source"]
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at: string
          work_date: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          hours_worked?: number | null
          id?: string
          is_late?: boolean
          login_at?: string | null
          logout_at?: string | null
          notes?: string | null
          source?: Database["public"]["Enums"]["attendance_source"]
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
          work_date: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          hours_worked?: number | null
          id?: string
          is_late?: boolean
          login_at?: string | null
          logout_at?: string | null
          notes?: string | null
          source?: Database["public"]["Enums"]["attendance_source"]
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
        }
        Relationships: []
      }
      break_audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          after_data: Json | null
          before_data: Json | null
          break_record_id: string | null
          created_at: string
          employee_id: string | null
          id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          break_record_id?: string | null
          created_at?: string
          employee_id?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          break_record_id?: string | null
          created_at?: string
          employee_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "break_audit_logs_break_record_id_fkey"
            columns: ["break_record_id"]
            isOneToOne: false
            referencedRelation: "break_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "break_audit_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      break_policies: {
        Row: {
          break_type_id: string
          centre_id: string | null
          created_at: string
          created_by: string | null
          department_id: string | null
          id: string
          is_active: boolean
          limit_minutes: number | null
          manager_alert_minutes: number | null
          tl_alert_minutes: number | null
          updated_at: string
        }
        Insert: {
          break_type_id: string
          centre_id?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          id?: string
          is_active?: boolean
          limit_minutes?: number | null
          manager_alert_minutes?: number | null
          tl_alert_minutes?: number | null
          updated_at?: string
        }
        Update: {
          break_type_id?: string
          centre_id?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          id?: string
          is_active?: boolean
          limit_minutes?: number | null
          manager_alert_minutes?: number | null
          tl_alert_minutes?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "break_policies_break_type_id_fkey"
            columns: ["break_type_id"]
            isOneToOne: false
            referencedRelation: "break_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "break_policies_centre_id_fkey"
            columns: ["centre_id"]
            isOneToOne: false
            referencedRelation: "centres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "break_policies_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      break_records: {
        Row: {
          break_type_id: string
          centre_id: string | null
          created_at: string
          department_id: string | null
          duration_minutes: number | null
          employee_id: string
          end_at: string | null
          id: string
          limit_minutes: number | null
          notes: string | null
          start_at: string
          status: Database["public"]["Enums"]["break_status"]
          updated_at: string
        }
        Insert: {
          break_type_id: string
          centre_id?: string | null
          created_at?: string
          department_id?: string | null
          duration_minutes?: number | null
          employee_id: string
          end_at?: string | null
          id?: string
          limit_minutes?: number | null
          notes?: string | null
          start_at?: string
          status?: Database["public"]["Enums"]["break_status"]
          updated_at?: string
        }
        Update: {
          break_type_id?: string
          centre_id?: string | null
          created_at?: string
          department_id?: string | null
          duration_minutes?: number | null
          employee_id?: string
          end_at?: string | null
          id?: string
          limit_minutes?: number | null
          notes?: string | null
          start_at?: string
          status?: Database["public"]["Enums"]["break_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "break_records_break_type_id_fkey"
            columns: ["break_type_id"]
            isOneToOne: false
            referencedRelation: "break_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "break_records_centre_id_fkey"
            columns: ["centre_id"]
            isOneToOne: false
            referencedRelation: "centres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "break_records_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "break_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      break_requests: {
        Row: {
          break_record_id: string | null
          break_type_id: string | null
          created_at: string
          employee_id: string
          id: string
          reason: string
          requested_minutes: number
          review_notes: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          status: Database["public"]["Enums"]["break_request_status"]
          updated_at: string
        }
        Insert: {
          break_record_id?: string | null
          break_type_id?: string | null
          created_at?: string
          employee_id: string
          id?: string
          reason: string
          requested_minutes: number
          review_notes?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["break_request_status"]
          updated_at?: string
        }
        Update: {
          break_record_id?: string | null
          break_type_id?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          reason?: string
          requested_minutes?: number
          review_notes?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["break_request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "break_requests_break_record_id_fkey"
            columns: ["break_record_id"]
            isOneToOne: false
            referencedRelation: "break_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "break_requests_break_type_id_fkey"
            columns: ["break_type_id"]
            isOneToOne: false
            referencedRelation: "break_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "break_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "break_requests_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      break_types: {
        Row: {
          created_at: string
          default_limit_minutes: number | null
          description: string | null
          id: string
          is_active: boolean
          key: string
          manager_alert_minutes: number | null
          name: string
          tl_alert_minutes: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_limit_minutes?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          key: string
          manager_alert_minutes?: number | null
          name: string
          tl_alert_minutes?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_limit_minutes?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          key?: string
          manager_alert_minutes?: number | null
          name?: string
          tl_alert_minutes?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      centres: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      channel_join_requests: {
        Row: {
          channel_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          employee_id: string
          id: string
          note: string | null
          requested_at: string
          status: Database["public"]["Enums"]["channel_join_status"]
          updated_at: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          employee_id: string
          id?: string
          note?: string | null
          requested_at?: string
          status?: Database["public"]["Enums"]["channel_join_status"]
          updated_at?: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          employee_id?: string
          id?: string
          note?: string | null
          requested_at?: string
          status?: Database["public"]["Enums"]["channel_join_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_join_requests_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_join_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_join_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_members: {
        Row: {
          channel_id: string
          employee_id: string
          id: string
          is_moderator: boolean
          joined_at: string
          last_read_at: string | null
        }
        Insert: {
          channel_id: string
          employee_id: string
          id?: string
          is_moderator?: boolean
          joined_at?: string
          last_read_at?: string | null
        }
        Update: {
          channel_id?: string
          employee_id?: string
          id?: string
          is_moderator?: boolean
          joined_at?: string
          last_read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_members_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_members_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          centre_id: string | null
          channel_type: Database["public"]["Enums"]["channel_type"]
          created_at: string
          created_by: string | null
          department_id: string | null
          description: string | null
          id: string
          is_announcement: boolean
          is_archived: boolean
          last_message_at: string | null
          name: string
          updated_at: string
        }
        Insert: {
          centre_id?: string | null
          channel_type?: Database["public"]["Enums"]["channel_type"]
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          id?: string
          is_announcement?: boolean
          is_archived?: boolean
          last_message_at?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          centre_id?: string | null
          channel_type?: Database["public"]["Enums"]["channel_type"]
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          id?: string
          is_announcement?: boolean
          is_archived?: boolean
          last_message_at?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channels_centre_id_fkey"
            columns: ["centre_id"]
            isOneToOne: false
            referencedRelation: "centres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      chargeback_entries: {
        Row: {
          amount_usd: number
          chargeback_date: string
          created_at: string
          employee_id: string
          entered_by: string | null
          id: string
          reason: string | null
          updated_at: string
        }
        Insert: {
          amount_usd: number
          chargeback_date: string
          created_at?: string
          employee_id: string
          entered_by?: string | null
          id?: string
          reason?: string | null
          updated_at?: string
        }
        Update: {
          amount_usd?: number
          chargeback_date?: string
          created_at?: string
          employee_id?: string
          entered_by?: string | null
          id?: string
          reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chargeback_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chargeback_entries_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          employee_id: string
          id: string
          joined_at: string
          last_read_at: string | null
        }
        Insert: {
          conversation_id: string
          employee_id: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
        }
        Update: {
          conversation_id?: string
          employee_id?: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          last_message_at: string | null
          title: string | null
          type: Database["public"]["Enums"]["conversation_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          last_message_at?: string | null
          title?: string | null
          type?: Database["public"]["Enums"]["conversation_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          last_message_at?: string | null
          title?: string | null
          type?: Database["public"]["Enums"]["conversation_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      document_audit_logs: {
        Row: {
          action: Database["public"]["Enums"]["document_audit_action"]
          actor_user_id: string | null
          created_at: string
          document_id: string | null
          employee_id: string | null
          id: string
          metadata: Json | null
        }
        Insert: {
          action: Database["public"]["Enums"]["document_audit_action"]
          actor_user_id?: string | null
          created_at?: string
          document_id?: string | null
          employee_id?: string | null
          id?: string
          metadata?: Json | null
        }
        Update: {
          action?: Database["public"]["Enums"]["document_audit_action"]
          actor_user_id?: string | null
          created_at?: string
          document_id?: string | null
          employee_id?: string | null
          id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "document_audit_logs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_audit_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      document_categories: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      document_downloads: {
        Row: {
          document_id: string
          downloaded_at: string
          employee_id: string
          id: string
          version_id: string | null
        }
        Insert: {
          document_id: string
          downloaded_at?: string
          employee_id: string
          id?: string
          version_id?: string | null
        }
        Update: {
          document_id?: string
          downloaded_at?: string
          employee_id?: string
          id?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_downloads_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_downloads_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_downloads_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      document_favorites: {
        Row: {
          created_at: string
          document_id: string
          employee_id: string
          id: string
        }
        Insert: {
          created_at?: string
          document_id: string
          employee_id: string
          id?: string
        }
        Update: {
          created_at?: string
          document_id?: string
          employee_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_favorites_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_favorites_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      document_permissions: {
        Row: {
          centre_id: string | null
          created_at: string
          department_id: string | null
          document_id: string
          employee_id: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"] | null
        }
        Insert: {
          centre_id?: string | null
          created_at?: string
          department_id?: string | null
          document_id: string
          employee_id?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"] | null
        }
        Update: {
          centre_id?: string | null
          created_at?: string
          department_id?: string | null
          document_id?: string
          employee_id?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"] | null
        }
        Relationships: [
          {
            foreignKeyName: "document_permissions_centre_id_fkey"
            columns: ["centre_id"]
            isOneToOne: false
            referencedRelation: "centres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_permissions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_permissions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_permissions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      document_versions: {
        Row: {
          change_notes: string | null
          created_at: string
          document_id: string
          file_name: string
          file_path: string
          file_size: number
          id: string
          mime_type: string | null
          uploaded_by: string | null
          version_label: string
        }
        Insert: {
          change_notes?: string | null
          created_at?: string
          document_id: string
          file_name: string
          file_path: string
          file_size: number
          id?: string
          mime_type?: string | null
          uploaded_by?: string | null
          version_label: string
        }
        Update: {
          change_notes?: string | null
          created_at?: string
          document_id?: string
          file_name?: string
          file_path?: string
          file_size?: number
          id?: string
          mime_type?: string | null
          uploaded_by?: string | null
          version_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      document_views: {
        Row: {
          document_id: string
          employee_id: string
          id: string
          viewed_at: string
        }
        Insert: {
          document_id: string
          employee_id: string
          id?: string
          viewed_at?: string
        }
        Update: {
          document_id?: string
          employee_id?: string
          id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_views_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_views_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          category_id: string | null
          created_at: string
          current_version_id: string | null
          department_id: string | null
          description: string | null
          download_allowed: boolean
          downloads_count: number
          id: string
          keywords: string[]
          search_count: number
          status: Database["public"]["Enums"]["document_status"]
          title: string
          updated_at: string
          uploaded_by: string | null
          views_count: number
          visibility: Database["public"]["Enums"]["document_visibility"]
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          current_version_id?: string | null
          department_id?: string | null
          description?: string | null
          download_allowed?: boolean
          downloads_count?: number
          id?: string
          keywords?: string[]
          search_count?: number
          status?: Database["public"]["Enums"]["document_status"]
          title: string
          updated_at?: string
          uploaded_by?: string | null
          views_count?: number
          visibility?: Database["public"]["Enums"]["document_visibility"]
        }
        Update: {
          category_id?: string | null
          created_at?: string
          current_version_id?: string | null
          department_id?: string | null
          description?: string | null
          download_allowed?: boolean
          downloads_count?: number
          id?: string
          keywords?: string[]
          search_count?: number
          status?: Database["public"]["Enums"]["document_status"]
          title?: string
          updated_at?: string
          uploaded_by?: string | null
          views_count?: number
          visibility?: Database["public"]["Enums"]["document_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "documents_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "document_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_current_version_fk"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_note_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          id: string
          mime_type: string | null
          note_id: string
          size_bytes: number | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          mime_type?: string | null
          note_id: string
          size_bytes?: number | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          note_id?: string
          size_bytes?: number | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_note_attachments_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "employee_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_notes: {
        Row: {
          category: Database["public"]["Enums"]["note_category"]
          content: string
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["note_category"]
          content: string
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["note_category"]
          content?: string
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_notes_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_presence: {
        Row: {
          employee_id: string
          last_seen_at: string
          status: Database["public"]["Enums"]["presence_status"]
          updated_at: string
        }
        Insert: {
          employee_id: string
          last_seen_at?: string
          status?: Database["public"]["Enums"]["presence_status"]
          updated_at?: string
        }
        Update: {
          employee_id?: string
          last_seen_at?: string
          status?: Database["public"]["Enums"]["presence_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_presence_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_promotions: {
        Row: {
          created_at: string
          created_by: string | null
          effective_date: string
          employee_id: string
          from_designation: string | null
          id: string
          notes: string | null
          to_designation: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_date: string
          employee_id: string
          from_designation?: string | null
          id?: string
          notes?: string | null
          to_designation: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_date?: string
          employee_id?: string
          from_designation?: string | null
          id?: string
          notes?: string | null
          to_designation?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_promotions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_reviews: {
        Row: {
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          rating: number | null
          review_period: string
          summary: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          rating?: number | null
          review_period: string
          summary?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          rating?: number | null
          review_period?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_reviews_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_sessions: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          last_seen_at: string
          session_token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          last_seen_at?: string
          session_token: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          last_seen_at?: string
          session_token?: string
          user_id?: string
        }
        Relationships: []
      }
      employees: {
        Row: {
          alias_name: string | null
          approval_status: string
          auth_user_id: string | null
          centre_id: string | null
          created_at: string
          department_id: string | null
          designation: string | null
          email: string
          employee_code: string
          employment_status: Database["public"]["Enums"]["employment_status"]
          full_name: string
          id: string
          joining_date: string | null
          manager_id: string | null
          mobile: string | null
          profile_completed: boolean
          profile_photo_url: string | null
          role_id: string | null
          shift_id: string | null
          team_leader_id: string | null
          updated_at: string
          username: string
        }
        Insert: {
          alias_name?: string | null
          approval_status?: string
          auth_user_id?: string | null
          centre_id?: string | null
          created_at?: string
          department_id?: string | null
          designation?: string | null
          email: string
          employee_code?: string
          employment_status?: Database["public"]["Enums"]["employment_status"]
          full_name: string
          id?: string
          joining_date?: string | null
          manager_id?: string | null
          mobile?: string | null
          profile_completed?: boolean
          profile_photo_url?: string | null
          role_id?: string | null
          shift_id?: string | null
          team_leader_id?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          alias_name?: string | null
          approval_status?: string
          auth_user_id?: string | null
          centre_id?: string | null
          created_at?: string
          department_id?: string | null
          designation?: string | null
          email?: string
          employee_code?: string
          employment_status?: Database["public"]["Enums"]["employment_status"]
          full_name?: string
          id?: string
          joining_date?: string | null
          manager_id?: string | null
          mobile?: string | null
          profile_completed?: boolean
          profile_photo_url?: string | null
          role_id?: string | null
          shift_id?: string | null
          team_leader_id?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_centre_id_fkey"
            columns: ["centre_id"]
            isOneToOne: false
            referencedRelation: "centres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_team_leader_id_fkey"
            columns: ["team_leader_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          centre_id: string | null
          created_at: string
          created_by: string | null
          holiday_date: string
          id: string
          is_recurring: boolean
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          centre_id?: string | null
          created_at?: string
          created_by?: string | null
          holiday_date: string
          id?: string
          is_recurring?: boolean
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          centre_id?: string | null
          created_at?: string
          created_by?: string | null
          holiday_date?: string
          id?: string
          is_recurring?: boolean
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "holidays_centre_id_fkey"
            columns: ["centre_id"]
            isOneToOne: false
            referencedRelation: "centres"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_embeddings: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          document_id: string
          embedding: string
          id: string
          token_count: number | null
          version_id: string | null
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string
          document_id: string
          embedding: string
          id?: string
          token_count?: number | null
          version_id?: string | null
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string
          id?: string
          token_count?: number | null
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_embeddings_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_embeddings_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          created_at: string
          employee_id: string
          end_date: string
          id: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          reason: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: Database["public"]["Enums"]["request_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          end_date: string
          id?: string
          leave_type?: Database["public"]["Enums"]["leave_type"]
          reason: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          end_date?: string
          id?: string
          leave_type?: Database["public"]["Enums"]["leave_type"]
          reason?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          employee_id: string
          id: string
          message_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          employee_id: string
          id?: string
          message_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          employee_id?: string
          id?: string
          message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachments: Json
          body: string
          channel_id: string | null
          conversation_id: string | null
          created_at: string
          delivered_at: string | null
          edited_at: string | null
          id: string
          is_pinned: boolean
          parent_message_id: string | null
          read_at: string | null
          sender_id: string
          status: Database["public"]["Enums"]["message_status"]
        }
        Insert: {
          attachments?: Json
          body: string
          channel_id?: string | null
          conversation_id?: string | null
          created_at?: string
          delivered_at?: string | null
          edited_at?: string | null
          id?: string
          is_pinned?: boolean
          parent_message_id?: string | null
          read_at?: string | null
          sender_id: string
          status?: Database["public"]["Enums"]["message_status"]
        }
        Update: {
          attachments?: Json
          body?: string
          channel_id?: string | null
          conversation_id?: string | null
          created_at?: string
          delivered_at?: string | null
          edited_at?: string | null
          id?: string
          is_pinned?: boolean
          parent_message_id?: string | null
          read_at?: string | null
          sender_id?: string
          status?: Database["public"]["Enums"]["message_status"]
        }
        Relationships: [
          {
            foreignKeyName: "messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_parent_message_id_fkey"
            columns: ["parent_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          employee_id: string
          id: string
          is_read: boolean
          link: string | null
          ref_id: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Insert: {
          body?: string | null
          created_at?: string
          employee_id: string
          id?: string
          is_read?: boolean
          link?: string | null
          ref_id?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Update: {
          body?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          is_read?: boolean
          link?: string | null
          ref_id?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
        }
        Relationships: [
          {
            foreignKeyName: "notifications_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_snapshots: {
        Row: {
          chargebacks: number
          created_at: string
          employee_id: string
          gross_revenue: number
          id: string
          net_revenue: number
          period_end: string
          period_start: string
          period_type: string
          refunds: number
          sales_count: number
        }
        Insert: {
          chargebacks?: number
          created_at?: string
          employee_id: string
          gross_revenue?: number
          id?: string
          net_revenue?: number
          period_end: string
          period_start: string
          period_type: string
          refunds?: number
          sales_count?: number
        }
        Update: {
          chargebacks?: number
          created_at?: string
          employee_id?: string
          gross_revenue?: number
          id?: string
          net_revenue?: number
          period_end?: string
          period_start?: string
          period_type?: string
          refunds?: number
          sales_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "performance_snapshots_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          action: string | null
          created_at: string
          description: string | null
          id: string
          is_dangerous: boolean
          key: string
          label: string | null
          module: string | null
          sort_order: number
        }
        Insert: {
          action?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_dangerous?: boolean
          key: string
          label?: string | null
          module?: string | null
          sort_order?: number
        }
        Update: {
          action?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_dangerous?: boolean
          key?: string
          label?: string | null
          module?: string | null
          sort_order?: number
        }
        Relationships: []
      }
      refund_entries: {
        Row: {
          amount_usd: number
          created_at: string
          employee_id: string
          entered_by: string | null
          id: string
          reason: string | null
          refund_date: string
          updated_at: string
        }
        Insert: {
          amount_usd: number
          created_at?: string
          employee_id: string
          entered_by?: string | null
          id?: string
          reason?: string | null
          refund_date: string
          updated_at?: string
        }
        Update: {
          amount_usd?: number
          created_at?: string
          employee_id?: string
          entered_by?: string | null
          id?: string
          reason?: string | null
          refund_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refund_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_entries_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission_id: string
          role_id: string
        }
        Insert: {
          permission_id: string
          role_id: string
        }
        Update: {
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          key: Database["public"]["Enums"]["app_role"] | null
          key_text: string | null
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          key?: Database["public"]["Enums"]["app_role"] | null
          key_text?: string | null
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          key?: Database["public"]["Enums"]["app_role"] | null
          key_text?: string | null
          name?: string
        }
        Relationships: []
      }
      sales_audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          employee_id: string | null
          entity: string
          entity_id: string
          id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          employee_id?: string | null
          entity: string
          entity_id: string
          id?: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          employee_id?: string | null
          entity?: string
          entity_id?: string
          id?: string
        }
        Relationships: []
      }
      sales_entries: {
        Row: {
          created_at: string
          employee_id: string
          entered_by: string | null
          id: string
          notes: string | null
          sale_date: string
          sales_amount_usd: number
          sales_count: number
          source_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          entered_by?: string | null
          id?: string
          notes?: string | null
          sale_date: string
          sales_amount_usd?: number
          sales_count?: number
          source_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          entered_by?: string | null
          id?: string
          notes?: string | null
          sale_date?: string
          sales_amount_usd?: number
          sales_count?: number
          source_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_entries_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_entries_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sales_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_sources: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      shifts: {
        Row: {
          created_at: string
          end_time: string
          grace_minutes: number
          id: string
          is_active: boolean
          name: string
          start_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_time: string
          grace_minutes?: number
          id?: string
          is_active?: boolean
          name: string
          start_time: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_time?: string
          grace_minutes?: number
          id?: string
          is_active?: boolean
          name?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          role_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          role_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          role_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_list_employee_contacts: {
        Args: never
        Returns: {
          email: string
          id: string
          mobile: string
        }[]
      }
      agent_performance: {
        Args: { _employee_id: string; _from: string; _to: string }
        Returns: {
          avg_sale: number
          chargebacks: number
          gross_revenue: number
          net_revenue: number
          refunds: number
          sales_count: number
        }[]
      }
      agent_rankings: {
        Args: {
          _centre_id?: string
          _from: string
          _limit?: number
          _to: string
        }
        Returns: {
          centre_code: string
          centre_id: string
          chargebacks: number
          employee_code: string
          employee_id: string
          full_name: string
          gross_revenue: number
          net_revenue: number
          rank_position: string
          refunds: number
          sales_count: number
        }[]
      }
      ai_accessible_document_ids: {
        Args: never
        Returns: {
          document_id: string
        }[]
      }
      ai_attendance_summary: {
        Args: { _from: string; _to: string }
        Returns: {
          absent: number
          absent_today: Json
          attendance_rate: number
          half_day: number
          on_leave: number
          present: number
          scope: string
          total_records: number
        }[]
      }
      ai_break_summary: {
        Args: { _from: string; _to: string }
        Returns: {
          currently_on_break: number
          exceeded: number
          exceeded_today: Json
          on_break_now: Json
          scope: string
          total_breaks: number
        }[]
      }
      ai_caller_scope: { Args: never; Returns: string }
      ai_sales_summary: {
        Args: { _from: string; _to: string }
        Returns: {
          chargebacks: number
          gross_revenue: number
          net_revenue: number
          refunds: number
          sales_count: number
          scope: string
          top_agents: Json
        }[]
      }
      ai_scope_employees: {
        Args: never
        Returns: {
          employee_id: string
        }[]
      }
      ai_workforce_summary: {
        Args: never
        Returns: {
          active_employees: number
          by_centre: Json
          by_department: Json
          by_role: Json
          scope: string
          total_employees: number
        }[]
      }
      approve_channel_join_request: {
        Args: { _id: string }
        Returns: undefined
      }
      approve_employee: { Args: { _employee_id: string }; Returns: undefined }
      assign_role_to_user: {
        Args: { _role_id: string; _user_id: string }
        Returns: undefined
      }
      can_access_document: { Args: { _document_id: string }; Returns: boolean }
      can_create_channel: { Args: never; Returns: boolean }
      can_enter_sales_for: { Args: { _employee_id: string }; Returns: boolean }
      can_manage_document: { Args: { _document_id: string }; Returns: boolean }
      can_manage_employee: { Args: { _employee_id: string }; Returns: boolean }
      can_post_announcement: { Args: never; Returns: boolean }
      can_view_employee_notes: {
        Args: { _employee_id: string }
        Returns: boolean
      }
      can_view_sales_for: { Args: { _employee_id: string }; Returns: boolean }
      centre_comparison: {
        Args: { _from: string; _to: string }
        Returns: {
          centre_code: string
          centre_id: string
          chargebacks: number
          gross_revenue: number
          net_revenue: number
          present_days: number
          refunds: number
          sales_count: number
        }[]
      }
      company_dashboard: {
        Args: { _from: string; _to: string }
        Returns: {
          absent_today: number
          chargebacks: number
          gross_revenue: number
          logged_in: number
          net_revenue: number
          on_break: number
          present_today: number
          refunds: number
        }[]
      }
      complete_self_profile: {
        Args: {
          _centre_id: string
          _department_id: string
          _joining_date: string
          _manager_id: string
          _mobile: string
          _shift_id: string
          _team_leader_id: string
        }
        Returns: {
          alias_name: string | null
          approval_status: string
          auth_user_id: string | null
          centre_id: string | null
          created_at: string
          department_id: string | null
          designation: string | null
          email: string
          employee_code: string
          employment_status: Database["public"]["Enums"]["employment_status"]
          full_name: string
          id: string
          joining_date: string | null
          manager_id: string | null
          mobile: string | null
          profile_completed: boolean
          profile_photo_url: string | null
          role_id: string | null
          shift_id: string | null
          team_leader_id: string | null
          updated_at: string
          username: string
        }
        SetofOptions: {
          from: "*"
          to: "employees"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_custom_role: {
        Args: { _description: string; _key_text: string; _name: string }
        Returns: string
      }
      current_employee_id: { Args: never; Returns: string }
      delete_custom_role: { Args: { _role_id: string }; Returns: undefined }
      effective_break_limit: {
        Args: {
          _break_type_id: string
          _centre_id: string
          _department_id: string
        }
        Returns: {
          limit_minutes: number
          manager_alert_minutes: number
          tl_alert_minutes: number
        }[]
      }
      email_for_employee_code: { Args: { _code: string }; Returns: string }
      get_employee_contact: {
        Args: { _id: string }
        Returns: {
          email: string
          mobile: string
        }[]
      }
      get_employee_public_profile: {
        Args: { _id: string }
        Returns: {
          alias_name: string
          centre_name: string
          department_name: string
          designation: string
          employee_code: string
          employment_status: string
          full_name: string
          id: string
          joining_date: string
          profile_photo_url: string
          role_name: string
          shift_name: string
        }[]
      }
      get_my_contact: {
        Args: never
        Returns: {
          email: string
          mobile: string
        }[]
      }
      has_permission: {
        Args: { _perm: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_channel_member: { Args: { _channel_id: string }; Returns: boolean }
      is_channel_moderator: { Args: { _channel_id: string }; Returns: boolean }
      is_conversation_participant: {
        Args: { _conversation_id: string }
        Returns: boolean
      }
      is_current_session: { Args: { _token: string }; Returns: boolean }
      is_hr: { Args: { _user_id: string }; Returns: boolean }
      knowledge_dashboard: {
        Args: never
        Returns: {
          active_documents: number
          archived_documents: number
          draft_documents: number
          total_documents: number
          total_storage_bytes: number
        }[]
      }
      leaderboard: {
        Args: { _from: string; _limit?: number; _to: string }
        Returns: {
          chargebacks: number
          employee_code: string
          employee_id: string
          full_name: string
          gross_revenue: number
          net_revenue: number
          refunds: number
          sales_count: number
        }[]
      }
      least_accessed_documents: {
        Args: { _limit?: number }
        Returns: {
          document_id: string
          downloads: number
          title: string
          views: number
        }[]
      }
      log_document_action: {
        Args: {
          _action: Database["public"]["Enums"]["document_audit_action"]
          _document_id: string
          _metadata?: Json
        }
        Returns: string
      }
      mark_channel_read: { Args: { _channel_id: string }; Returns: undefined }
      mark_conversation_read: {
        Args: { _conversation_id: string }
        Returns: undefined
      }
      match_knowledge: {
        Args: {
          match_count?: number
          min_similarity?: number
          query_embedding: string
        }
        Returns: {
          chunk_index: number
          content: string
          document_id: string
          document_title: string
          document_version: string
          id: string
          similarity: number
          version_id: string
        }[]
      }
      most_accessed_documents: {
        Args: { _limit?: number }
        Returns: {
          document_id: string
          downloads: number
          title: string
          views: number
        }[]
      }
      my_permissions: { Args: never; Returns: string[] }
      purge_old_messages: { Args: never; Returns: undefined }
      reject_channel_join_request: { Args: { _id: string }; Returns: undefined }
      reject_employee: { Args: { _employee_id: string }; Returns: undefined }
      rename_custom_role: {
        Args: { _description: string; _name: string; _role_id: string }
        Returns: undefined
      }
      revoke_role_from_user: {
        Args: { _role_id: string; _user_id: string }
        Returns: undefined
      }
      search_employee_directory: {
        Args: {
          _centre_id?: string
          _department_id?: string
          _limit?: number
          _q?: string
          _role_id?: string
          _status?: Database["public"]["Enums"]["employment_status"]
        }
        Returns: {
          centre_code: string
          centre_id: string
          department_id: string
          department_name: string
          designation: string
          employee_code: string
          employment_status: Database["public"]["Enums"]["employment_status"]
          full_name: string
          id: string
          profile_photo_url: string
          role_id: string
          role_name: string
        }[]
      }
      search_mention_candidates: {
        Args: { _limit?: number; _q: string }
        Returns: {
          alias_name: string
          full_name: string
          id: string
          username: string
        }[]
      }
      source_analytics: {
        Args: { _from: string; _to: string }
        Returns: {
          chargebacks: number
          gross_revenue: number
          net_revenue: number
          refunds: number
          sales_count: number
          source_id: string
          source_name: string
        }[]
      }
      start_direct_chat: { Args: { _other: string }; Returns: string }
      storage_by_department: {
        Args: never
        Returns: {
          bytes: number
          department_id: string
          department_name: string
          document_count: number
        }[]
      }
      team_performance: {
        Args: { _from: string; _team_leader_id: string; _to: string }
        Returns: {
          chargebacks: number
          employee_code: string
          employee_id: string
          full_name: string
          gross_revenue: number
          net_revenue: number
          refunds: number
          sales_count: number
        }[]
      }
      update_self_profile:
        | {
            Args: { _mobile?: string; _profile_photo_url?: string }
            Returns: {
              alias_name: string | null
              approval_status: string
              auth_user_id: string | null
              centre_id: string | null
              created_at: string
              department_id: string | null
              designation: string | null
              email: string
              employee_code: string
              employment_status: Database["public"]["Enums"]["employment_status"]
              full_name: string
              id: string
              joining_date: string | null
              manager_id: string | null
              mobile: string | null
              profile_completed: boolean
              profile_photo_url: string | null
              role_id: string | null
              shift_id: string | null
              team_leader_id: string | null
              updated_at: string
              username: string
            }
            SetofOptions: {
              from: "*"
              to: "employees"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              _alias_name?: string
              _centre_id?: string
              _department_id?: string
              _joining_date?: string
              _manager_id?: string
              _mobile?: string
              _profile_photo_url?: string
              _shift_id?: string
              _team_leader_id?: string
            }
            Returns: {
              alias_name: string | null
              approval_status: string
              auth_user_id: string | null
              centre_id: string | null
              created_at: string
              department_id: string | null
              designation: string | null
              email: string
              employee_code: string
              employment_status: Database["public"]["Enums"]["employment_status"]
              full_name: string
              id: string
              joining_date: string | null
              manager_id: string | null
              mobile: string | null
              profile_completed: boolean
              profile_photo_url: string | null
              role_id: string | null
              shift_id: string | null
              team_leader_id: string | null
              updated_at: string
              username: string
            }
            SetofOptions: {
              from: "*"
              to: "employees"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      workforce_monitor: {
        Args: never
        Returns: {
          available: number
          logged_in: number
          on_break: number
        }[]
      }
    }
    Enums: {
      announcement_priority: "normal" | "important" | "critical"
      app_role:
        | "super_admin"
        | "admin"
        | "manager"
        | "team_leader"
        | "employee"
        | "hr"
      attendance_source: "auto" | "manual" | "correction"
      attendance_status:
        | "present"
        | "half_day"
        | "absent"
        | "late"
        | "leave"
        | "weekly_off"
        | "holiday"
      break_request_status: "pending" | "approved" | "rejected" | "cancelled"
      break_status: "active" | "completed" | "exceeded" | "cancelled"
      channel_join_status: "pending" | "approved" | "rejected"
      channel_type: "department" | "team" | "custom" | "announcement"
      conversation_type: "direct" | "group"
      document_audit_action:
        | "upload"
        | "update"
        | "version"
        | "archive"
        | "restore"
        | "download"
        | "delete"
        | "view"
      document_status: "draft" | "active" | "archived"
      document_visibility: "all" | "department" | "centre" | "role" | "custom"
      employment_status: "active" | "suspended" | "resigned" | "terminated"
      leave_type: "casual" | "sick" | "earned" | "unpaid" | "comp_off" | "other"
      message_status: "sent" | "delivered" | "read"
      note_category:
        | "coaching"
        | "warning"
        | "appreciation"
        | "promotion_recommendation"
        | "performance_review"
        | "general"
      notification_type:
        | "direct_message"
        | "channel_mention"
        | "channel_message"
        | "announcement"
        | "critical_announcement"
        | "channel_invitation"
      presence_status: "online" | "offline" | "on_break" | "away"
      request_status: "pending" | "approved" | "rejected" | "cancelled"
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
      announcement_priority: ["normal", "important", "critical"],
      app_role: [
        "super_admin",
        "admin",
        "manager",
        "team_leader",
        "employee",
        "hr",
      ],
      attendance_source: ["auto", "manual", "correction"],
      attendance_status: [
        "present",
        "half_day",
        "absent",
        "late",
        "leave",
        "weekly_off",
        "holiday",
      ],
      break_request_status: ["pending", "approved", "rejected", "cancelled"],
      break_status: ["active", "completed", "exceeded", "cancelled"],
      channel_join_status: ["pending", "approved", "rejected"],
      channel_type: ["department", "team", "custom", "announcement"],
      conversation_type: ["direct", "group"],
      document_audit_action: [
        "upload",
        "update",
        "version",
        "archive",
        "restore",
        "download",
        "delete",
        "view",
      ],
      document_status: ["draft", "active", "archived"],
      document_visibility: ["all", "department", "centre", "role", "custom"],
      employment_status: ["active", "suspended", "resigned", "terminated"],
      leave_type: ["casual", "sick", "earned", "unpaid", "comp_off", "other"],
      message_status: ["sent", "delivered", "read"],
      note_category: [
        "coaching",
        "warning",
        "appreciation",
        "promotion_recommendation",
        "performance_review",
        "general",
      ],
      notification_type: [
        "direct_message",
        "channel_mention",
        "channel_message",
        "announcement",
        "critical_announcement",
        "channel_invitation",
      ],
      presence_status: ["online", "offline", "on_break", "away"],
      request_status: ["pending", "approved", "rejected", "cancelled"],
    },
  },
} as const
