export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          wallet_address: string;
          display_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          wallet_address: string;
          display_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          wallet_address?: string;
          display_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      wallet_registry: {
        Row: {
          id: string;
          owner_id: string;
          agent_session_id: string | null;
          treasury_pda: string | null;
          wallet_kind:
            | "dwallet"
            | "owner_wallet"
            | "agent_fee_wallet"
            | "external_recipient";
          chain_id: number;
          chain_name: string;
          dwallet_id: string | null;
          dwallet_state_pda: string | null;
          chain_address: string;
          label: string | null;
          status: string;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          agent_session_id?: string | null;
          treasury_pda?: string | null;
          wallet_kind:
            | "dwallet"
            | "owner_wallet"
            | "agent_fee_wallet"
            | "external_recipient";
          chain_id: number;
          chain_name: string;
          dwallet_id?: string | null;
          dwallet_state_pda?: string | null;
          chain_address: string;
          label?: string | null;
          status?: string;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["wallet_registry"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "wallet_registry_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "wallet_registry_agent_session_id_fkey";
            columns: ["agent_session_id"];
            isOneToOne: false;
            referencedRelation: "agent_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      dwallet_sessions: {
        Row: {
          id: string;
          wallet_id: string;
          owner_id: string;
          agent_session_id: string | null;
          provider: "manual" | "ika" | "conduit";
          provider_session_id: string | null;
          status:
            | "metadata_only"
            | "provisioning"
            | "active"
            | "failed"
            | "revoked";
          session_ciphertext: Json | null;
          key_version: string | null;
          public_key_hex: string | null;
          authorized_user_pubkey: string | null;
          message_metadata_digest: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
          last_used_at: string | null;
          revoked_at: string | null;
        };
        Insert: {
          id?: string;
          wallet_id: string;
          owner_id: string;
          agent_session_id?: string | null;
          provider?: "manual" | "ika" | "conduit";
          provider_session_id?: string | null;
          status?:
            | "metadata_only"
            | "provisioning"
            | "active"
            | "failed"
            | "revoked";
          session_ciphertext?: Json | null;
          key_version?: string | null;
          public_key_hex?: string | null;
          authorized_user_pubkey?: string | null;
          message_metadata_digest?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
          last_used_at?: string | null;
          revoked_at?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["dwallet_sessions"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "dwallet_sessions_wallet_id_fkey";
            columns: ["wallet_id"];
            isOneToOne: false;
            referencedRelation: "wallet_registry";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dwallet_sessions_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "dwallet_sessions_agent_session_id_fkey";
            columns: ["agent_session_id"];
            isOneToOne: false;
            referencedRelation: "agent_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      wallet_assets: {
        Row: {
          id: string;
          wallet_id: string;
          network: string;
          token_program: string | null;
          mint: string | null;
          token_account: string | null;
          symbol: string | null;
          decimals: number | null;
          last_raw_amount: string | null;
          last_ui_amount: number | null;
          last_refreshed_at: string | null;
          metadata: Json;
        };
        Insert: {
          id?: string;
          wallet_id: string;
          network: string;
          token_program?: string | null;
          mint?: string | null;
          token_account?: string | null;
          symbol?: string | null;
          decimals?: number | null;
          last_raw_amount?: string | null;
          last_ui_amount?: number | null;
          last_refreshed_at?: string | null;
          metadata?: Json;
        };
        Update: Partial<
          Database["public"]["Tables"]["wallet_assets"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "wallet_assets_wallet_id_fkey";
            columns: ["wallet_id"];
            isOneToOne: false;
            referencedRelation: "wallet_registry";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_sessions: {
        Row: {
          id: string;
          owner_id: string;
          agent_id: string;
          agent_label: string | null;
          treasury_pda: string | null;
          scopes: string[];
          status: "active" | "expired" | "revoked" | "suspended";
          metadata: Json;
          created_at: string;
          updated_at: string;
          expires_at: string | null;
          revoked_at: string | null;
        };
        Insert: {
          id?: string;
          owner_id: string;
          agent_id: string;
          agent_label?: string | null;
          treasury_pda?: string | null;
          scopes?: string[];
          status?: "active" | "expired" | "revoked" | "suspended";
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
          expires_at?: string | null;
          revoked_at?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["agent_sessions"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "agent_sessions_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      agent_session_secrets: {
        Row: {
          session_id: string;
          token_hash: string;
          created_at: string;
          last_used_at: string | null;
        };
        Insert: {
          session_id: string;
          token_hash: string;
          created_at?: string;
          last_used_at?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["agent_session_secrets"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "agent_session_secrets_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: true;
            referencedRelation: "agent_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      sign_requests: {
        Row: {
          id: string;
          owner_id: string;
          agent_session_id: string | null;
          treasury_pda: string | null;
          request_kind: string;
          status: "pending" | "approved" | "rejected" | "expired" | "consumed";
          payload: Json;
          message: string | null;
          transaction_base64: string | null;
          signature: string | null;
          created_at: string;
          updated_at: string;
          expires_at: string | null;
          approved_at: string | null;
          rejected_at: string | null;
        };
        Insert: {
          id?: string;
          owner_id: string;
          agent_session_id?: string | null;
          treasury_pda?: string | null;
          request_kind: string;
          status?: "pending" | "approved" | "rejected" | "expired" | "consumed";
          payload: Json;
          message?: string | null;
          transaction_base64?: string | null;
          signature?: string | null;
          created_at?: string;
          updated_at?: string;
          expires_at?: string | null;
          approved_at?: string | null;
          rejected_at?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["sign_requests"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "sign_requests_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sign_requests_agent_session_id_fkey";
            columns: ["agent_session_id"];
            isOneToOne: false;
            referencedRelation: "agent_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      activity_events: {
        Row: {
          id: string;
          owner_id: string | null;
          agent_session_id: string | null;
          treasury_pda: string | null;
          wallet_id: string | null;
          event_kind: string;
          severity: "info" | "success" | "warning" | "error";
          title: string;
          summary: string | null;
          tx_signature: string | null;
          proposal_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string | null;
          agent_session_id?: string | null;
          treasury_pda?: string | null;
          wallet_id?: string | null;
          event_kind: string;
          severity?: "info" | "success" | "warning" | "error";
          title: string;
          summary?: string | null;
          tx_signature?: string | null;
          proposal_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["activity_events"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "activity_events_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activity_events_agent_session_id_fkey";
            columns: ["agent_session_id"];
            isOneToOne: false;
            referencedRelation: "agent_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activity_events_wallet_id_fkey";
            columns: ["wallet_id"];
            isOneToOne: false;
            referencedRelation: "wallet_registry";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type WalletRegistryRow =
  Database["public"]["Tables"]["wallet_registry"]["Row"];
export type DWalletSessionRow =
  Database["public"]["Tables"]["dwallet_sessions"]["Row"];
export type AgentSessionRow =
  Database["public"]["Tables"]["agent_sessions"]["Row"];
export type SignRequestRow =
  Database["public"]["Tables"]["sign_requests"]["Row"];
export type ActivityEventRow =
  Database["public"]["Tables"]["activity_events"]["Row"];
