
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "attempts": {
                  Row: {
                    "attempt_number": number,"client_version": string | null,"completion_time_ms": number | null,"end_reason": string | null,"ended_at": string | null,"errors_total": number,"id": string,"level": number | null,"objectives_completed": number,"objectives_total": number | null,"outcome": string | null,"points_total": number,"scenario_id": string,"scenario_version": string,"sequence_respected": boolean | null,"session_id": string,"started_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempt_number": number,"client_version"?: string | null,"completion_time_ms"?: number | null,"end_reason"?: string | null,"ended_at"?: string | null,"errors_total"?: number,"id": string,"level"?: number | null,"objectives_completed"?: number,"objectives_total"?: number | null,"outcome"?: string | null,"points_total"?: number,"scenario_id": string,"scenario_version": string,"sequence_respected"?: boolean | null,"session_id": string,"started_at": string
                  }
                  Update: {
                    "attempt_number"?: number,"client_version"?: string | null,"completion_time_ms"?: number | null,"end_reason"?: string | null,"ended_at"?: string | null,"errors_total"?: number,"id"?: string,"level"?: number | null,"objectives_completed"?: number,"objectives_total"?: number | null,"outcome"?: string | null,"points_total"?: number,"scenario_id"?: string,"scenario_version"?: string,"sequence_respected"?: boolean | null,"session_id"?: string,"started_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "attempts_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"events": {
                  Row: {
                    "attempt_id": string | null,"event_id": string,"occurred_at": string,"payload": NonNullable<Json>,"received_at": string,"scenario_id": string,"scenario_version": string,"schema_version": number,"seq": number,"session_id": string,"type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempt_id"?: string | null,"event_id": string,"occurred_at": string,"payload"?: NonNullable<Json>,"received_at"?: string,"scenario_id": string,"scenario_version": string,"schema_version": number,"seq": number,"session_id": string,"type": string
                  }
                  Update: {
                    "attempt_id"?: string | null,"event_id"?: string,"occurred_at"?: string,"payload"?: NonNullable<Json>,"received_at"?: string,"scenario_id"?: string,"scenario_version"?: string,"schema_version"?: number,"seq"?: number,"session_id"?: string,"type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"pairing_failures": {
                  Row: {
                    "failed_at": string,"id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "failed_at"?: string,"id"?: never
                  }
                  Update: {
                    "failed_at"?: string,"id"?: never
                  }
                  Relationships: [
                    
                  ]
                },"privacy_acceptances": {
                  Row: {
                    "accepted_at": string,"notice_version": string,"participant_id": string,"source": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string,"notice_version": string,"participant_id": string,"source": string
                  }
                  Update: {
                    "accepted_at"?: string,"notice_version"?: string,"participant_id"?: string,"source"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "privacy_acceptances_notice_version_fkey"
      columns: ["notice_version"]
isOneToOne: false
      referencedRelation: "privacy_notices"
      referencedColumns: ["version"]
    },{
      foreignKeyName: "privacy_acceptances_participant_id_fkey"
      columns: ["participant_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"privacy_notices": {
                  Row: {
                    "content": string,"published_at": string,"version": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content": string,"published_at"?: string,"version": string
                  }
                  Update: {
                    "content"?: string,"published_at"?: string,"version"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"id": string,"participant_code": string | null,"role": Database["public"]['Enums']["user_role"],"trainer_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id": string,"participant_code"?: string | null,"role": Database["public"]['Enums']["user_role"],"trainer_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"participant_code"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"trainer_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_trainer_id_fkey"
      columns: ["trainer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"scenarios": {
                  Row: {
                    "catalog": NonNullable<Json>,"name": string | null,"published_at": string,"scenario_id": string,"version": string
                  }
                  ComputedFields: never
                  Insert: {
                    "catalog": NonNullable<Json>,"name"?: never,"published_at"?: string,"scenario_id": string,"version": string
                  }
                  Update: {
                    "catalog"?: NonNullable<Json>,"name"?: never,"published_at"?: string,"scenario_id"?: string,"version"?: string
                  }
                  Relationships: [
                    
                  ]
                },"session_pairings": {
                  Row: {
                    "code_hash": string,"created_at": string,"expires_at": string,"id": number,"session_id": string,"used_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "code_hash": string,"created_at"?: string,"expires_at": string,"id"?: never,"session_id": string,"used_at"?: string | null
                  }
                  Update: {
                    "code_hash"?: string,"created_at"?: string,"expires_at"?: string,"id"?: never,"session_id"?: string,"used_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "session_pairings_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"session_tokens": {
                  Row: {
                    "created_at": string,"expires_at": string,"session_id": string,"token_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"expires_at"?: string,"session_id": string,"token_hash": string
                  }
                  Update: {
                    "created_at"?: string,"expires_at"?: string,"session_id"?: string,"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "session_tokens_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"sessions": {
                  Row: {
                    "close_reason": string | null,"closed_at": string | null,"created_at": string,"id": string,"last_activity_at": string,"participant_id": string,"scenario_id": string,"started_at": string | null,"status": Database["public"]['Enums']["session_status"],"trainer_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "close_reason"?: string | null,"closed_at"?: string | null,"created_at"?: string,"id"?: string,"last_activity_at"?: string,"participant_id": string,"scenario_id": string,"started_at"?: string | null,"status"?: Database["public"]['Enums']["session_status"],"trainer_id": string
                  }
                  Update: {
                    "close_reason"?: string | null,"closed_at"?: string | null,"created_at"?: string,"id"?: string,"last_activity_at"?: string,"participant_id"?: string,"scenario_id"?: string,"started_at"?: string | null,"status"?: Database["public"]['Enums']["session_status"],"trainer_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sessions_participant_id_fkey"
      columns: ["participant_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sessions_trainer_id_fkey"
      columns: ["trainer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"xapi_outbox": {
                  Row: {
                    "created_at": string,"event_id": string,"id": number,"last_error": string | null,"next_attempt_at": string,"send_attempts": number,"sent_at": string | null,"statement": NonNullable<Json>,"statement_id": string,"status": Database["public"]['Enums']["xapi_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"event_id": string,"id"?: never,"last_error"?: string | null,"next_attempt_at"?: string,"send_attempts"?: number,"sent_at"?: string | null,"statement": NonNullable<Json>,"statement_id"?: string,"status"?: Database["public"]['Enums']["xapi_status"]
                  }
                  Update: {
                    "created_at"?: string,"event_id"?: string,"id"?: never,"last_error"?: string | null,"next_attempt_at"?: string,"send_attempts"?: number,"sent_at"?: string | null,"statement"?: NonNullable<Json>,"statement_id"?: string,"status"?: Database["public"]['Enums']["xapi_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "xapi_outbox_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "attempt_errors"
      referencedColumns: ["event_id"]
    },{
      foreignKeyName: "xapi_outbox_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["event_id"]
    }
                  ]
                }
          }
          Views: {
            "attempt_errors": {
                  Row: {
                    "attempt_id": string | null,"code": string | null,"event_id": string,"kind": string | null,"label": string | null,"occurred_at": string,"related_choice_id": string | null,"session_id": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "events_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"attempt_overview": {
                  Row: {
                    "attempt_id": string,"attempt_number": number,"completion_time_ms": number | null,"end_reason": string | null,"ended_at": string | null,"errors_total": number,"level": number | null,"objectives_completed": number,"objectives_total": number | null,"outcome": string | null,"participant_code": string | null,"participant_id": string,"points_total": number,"scenario_id": string,"scenario_name": string | null,"scenario_version": string,"sequence_respected": boolean | null,"session_id": string,"started_at": string,"trainer_id": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "attempts_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sessions_participant_id_fkey"
      columns: ["participant_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sessions_trainer_id_fkey"
      columns: ["trainer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"scenarios_latest": {
                  Row: {
                    "catalog": NonNullable<Json>,"name": string | null,"published_at": string,"scenario_id": string,"version": string
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "app_role":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["user_role"]
                           },
"can_see_session":
{ Args: { "p_session_id": string }; Returns: boolean
                           },
"catalog_label":
{ Args: { "p_code": string,"p_kind": string,"p_scenario_id": string,"p_version": string }; Returns: string
                           },
"claim_xapi_batch":
{ Args: { "p_limit"?: number }; Returns: {
              "id": number,"statement": Json,"statement_id": string
            }[]
                           },
"close_inactive_sessions":
{ Args: { "p_minutes"?: number }; Returns: number
                           },
"create_pairing_code":
{ Args: { "p_session_id": string }; Returns: {
              "pairing_code": string,"pairing_expires_at": string
            }[]
                           },
"current_privacy_notice_version":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"frequent_errors":
{ Args: { "p_scenario_id": string }; Returns: {
              "code": string,"kind": string,"label": string,"occurrences": number,"sessions": number
            }[]
                           },
"ingest_events":
{ Args: { "p_items": Json,"p_session_id": string }; Returns: Json
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_my_student":
{ Args: { "student_id": string }; Returns: boolean
                           },
"is_trainer":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"mark_xapi_failed":
{ Args: { "p_error": string,"p_id": number }; Returns: undefined
                           },
"mark_xapi_sent":
{ Args: { "p_ids": (number)[] }; Returns: number
                           },
"pair_device":
{ Args: { "p_code": string }; Returns: Json
                           },
"privacy_required":
{ Args: { "student_id": string }; Returns: boolean
                           },
"session_for_token":
{ Args: { "p_token": string }; Returns: string
                           },
"sha256_hex":
{ Args: { "value": string }; Returns: string
                           },
"trigger_xapi_sender":
{ Args: Record<PropertyKey, never>; Returns: number
                           }
          }
          Enums: {
            "session_status": "waiting"|"active"|"closed","user_role": "participant"|"trainer"|"admin","xapi_status": "pending"|"sent"|"failed"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "session_status": ["waiting", "active", "closed"],"user_role": ["participant", "trainer", "admin"],"xapi_status": ["pending", "sent", "failed"]
          }
        }
} as const
