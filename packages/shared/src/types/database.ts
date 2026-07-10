export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_profile_id: string | null
          created_at: string
          id: string
          metadata: Json
          reason: string | null
          target_id: string | null
          target_table: string | null
        }
        Insert: {
          action: string
          actor_profile_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string | null
          target_id?: string | null
          target_table?: string | null
        }
        Update: {
          action?: string
          actor_profile_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string | null
          target_id?: string | null
          target_table?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_items: {
        Row: {
          cart_id: string
          created_at: string
          customization: Json
          id: string
          menu_item_id: string
          quantity: number
          unit_price_cents: number
          updated_at: string
          vendor_id: string
        }
        Insert: {
          cart_id: string
          created_at?: string
          customization?: Json
          id?: string
          menu_item_id: string
          quantity: number
          unit_price_cents: number
          updated_at?: string
          vendor_id: string
        }
        Update: {
          cart_id?: string
          created_at?: string
          customization?: Json
          id?: string
          menu_item_id?: string
          quantity?: number
          unit_price_cents?: number
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          created_at: string
          id: string
          profile_id: string | null
          session_id: string | null
          status: Database["public"]["Enums"]["cart_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id?: string | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["cart_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["cart_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "carts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_claims: {
        Row: {
          claimed_at: string
          cotto_delivery_fee_cents: number
          created_at: string
          customer_rating: number | null
          customer_rating_comment: string | null
          delivered_at: string | null
          driver_payout_cents: number
          driver_vendor_id: string
          en_route_to_customer_at: string | null
          en_route_to_pickup_at: string | null
          id: string
          picked_up_at: string | null
          release_reason: string | null
          released_at: string | null
          stripe_transfer_id: string | null
          updated_at: string
          vendor_suborder_id: string
        }
        Insert: {
          claimed_at?: string
          cotto_delivery_fee_cents: number
          created_at?: string
          customer_rating?: number | null
          customer_rating_comment?: string | null
          delivered_at?: string | null
          driver_payout_cents: number
          driver_vendor_id: string
          en_route_to_customer_at?: string | null
          en_route_to_pickup_at?: string | null
          id?: string
          picked_up_at?: string | null
          release_reason?: string | null
          released_at?: string | null
          stripe_transfer_id?: string | null
          updated_at?: string
          vendor_suborder_id: string
        }
        Update: {
          claimed_at?: string
          cotto_delivery_fee_cents?: number
          created_at?: string
          customer_rating?: number | null
          customer_rating_comment?: string | null
          delivered_at?: string | null
          driver_payout_cents?: number
          driver_vendor_id?: string
          en_route_to_customer_at?: string | null
          en_route_to_pickup_at?: string | null
          id?: string
          picked_up_at?: string | null
          release_reason?: string | null
          released_at?: string | null
          stripe_transfer_id?: string | null
          updated_at?: string
          vendor_suborder_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_claims_driver_vendor_id_fkey"
            columns: ["driver_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_claims_vendor_suborder_id_fkey"
            columns: ["vendor_suborder_id"]
            isOneToOne: false
            referencedRelation: "vendor_suborders"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_dispatch_events: {
        Row: {
          event_type: Database["public"]["Enums"]["delivery_dispatch_event_type"]
          id: string
          occurred_at: string
          payload: Json
          vendor_suborder_id: string
        }
        Insert: {
          event_type: Database["public"]["Enums"]["delivery_dispatch_event_type"]
          id?: string
          occurred_at?: string
          payload?: Json
          vendor_suborder_id: string
        }
        Update: {
          event_type?: Database["public"]["Enums"]["delivery_dispatch_event_type"]
          id?: string
          occurred_at?: string
          payload?: Json
          vendor_suborder_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_dispatch_events_vendor_suborder_id_fkey"
            columns: ["vendor_suborder_id"]
            isOneToOne: false
            referencedRelation: "vendor_suborders"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          id: string
          menu_item_id: string | null
          profile_id: string
          vendor_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          menu_item_id?: string | null
          profile_id: string
          vendor_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          menu_item_id?: string | null
          profile_id?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "favorites_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
          updated_at: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_categories_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          allergens: string[]
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          image_urls: string[]
          ingredients: string | null
          is_available: boolean
          is_sold_out: boolean
          menu_category_id: string | null
          name: string
          price_cents: number
          search_tsv: unknown
          sort_order: number
          updated_at: string
          vendor_id: string
        }
        Insert: {
          allergens?: string[]
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          image_urls?: string[]
          ingredients?: string | null
          is_available?: boolean
          is_sold_out?: boolean
          menu_category_id?: string | null
          name: string
          price_cents: number
          search_tsv?: unknown
          sort_order?: number
          updated_at?: string
          vendor_id: string
        }
        Update: {
          allergens?: string[]
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          image_urls?: string[]
          ingredients?: string | null
          is_available?: boolean
          is_sold_out?: boolean
          menu_category_id?: string | null
          name?: string
          price_cents?: number
          search_tsv?: unknown
          sort_order?: number
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_menu_category_id_fkey"
            columns: ["menu_category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          created_at: string
          from_profile_id: string
          id: string
          read_at: string | null
          to_profile_id: string
          vendor_suborder_id: string
        }
        Insert: {
          body: string
          created_at?: string
          from_profile_id: string
          id?: string
          read_at?: string | null
          to_profile_id: string
          vendor_suborder_id: string
        }
        Update: {
          body?: string
          created_at?: string
          from_profile_id?: string
          id?: string
          read_at?: string | null
          to_profile_id?: string
          vendor_suborder_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_from_profile_id_fkey"
            columns: ["from_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_to_profile_id_fkey"
            columns: ["to_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_vendor_suborder_id_fkey"
            columns: ["vendor_suborder_id"]
            isOneToOne: false
            referencedRelation: "vendor_suborders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          customization: Json
          id: string
          menu_item_id: string | null
          name_snapshot: string
          quantity: number
          unit_price_cents: number
          vendor_suborder_id: string
        }
        Insert: {
          created_at?: string
          customization?: Json
          id?: string
          menu_item_id?: string | null
          name_snapshot: string
          quantity: number
          unit_price_cents: number
          vendor_suborder_id: string
        }
        Update: {
          created_at?: string
          customization?: Json
          id?: string
          menu_item_id?: string | null
          name_snapshot?: string
          quantity?: number
          unit_price_cents?: number
          vendor_suborder_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_vendor_suborder_id_fkey"
            columns: ["vendor_suborder_id"]
            isOneToOne: false
            referencedRelation: "vendor_suborders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          currency: string
          customer_profile_id: string
          delivery_fee_cents: number
          id: string
          payment_intent_id: string | null
          platform_fee_cents: number
          region_id: string
          status: Database["public"]["Enums"]["order_payment_status"]
          subtotal_cents: number
          tax_cents: number
          total_cents: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          customer_profile_id: string
          delivery_fee_cents?: number
          id?: string
          payment_intent_id?: string | null
          platform_fee_cents?: number
          region_id: string
          status?: Database["public"]["Enums"]["order_payment_status"]
          subtotal_cents: number
          tax_cents?: number
          total_cents: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          customer_profile_id?: string
          delivery_fee_cents?: number
          id?: string
          payment_intent_id?: string | null
          platform_fee_cents?: number
          region_id?: string
          status?: Database["public"]["Enums"]["order_payment_status"]
          subtotal_cents?: number
          tax_cents?: number
          total_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_profile_id_fkey"
            columns: ["customer_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          allergen_preferences: string[]
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          username: string | null
        }
        Insert: {
          allergen_preferences?: string[]
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          username?: string | null
        }
        Update: {
          allergen_preferences?: string[]
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      regions: {
        Row: {
          base_delivery_fee_cents: number
          claim_window_t1_minutes: number
          claim_window_t2_minutes: number
          claim_window_t3_minutes: number
          created_at: string
          delivery_conflict_rule: Database["public"]["Enums"]["delivery_conflict_rule"]
          delivery_payout_split_pct: number
          dispatch_contact_name: string | null
          dispatch_email: string | null
          dispatch_phone: string | null
          health_regs_url: string | null
          id: string
          is_active: boolean
          name: string
          per_mile_fee_cents: number
          slug: string
          updated_at: string
          zip_codes: string[]
        }
        Insert: {
          base_delivery_fee_cents?: number
          claim_window_t1_minutes?: number
          claim_window_t2_minutes?: number
          claim_window_t3_minutes?: number
          created_at?: string
          delivery_conflict_rule?: Database["public"]["Enums"]["delivery_conflict_rule"]
          delivery_payout_split_pct?: number
          dispatch_contact_name?: string | null
          dispatch_email?: string | null
          dispatch_phone?: string | null
          health_regs_url?: string | null
          id?: string
          is_active?: boolean
          name: string
          per_mile_fee_cents?: number
          slug: string
          updated_at?: string
          zip_codes?: string[]
        }
        Update: {
          base_delivery_fee_cents?: number
          claim_window_t1_minutes?: number
          claim_window_t2_minutes?: number
          claim_window_t3_minutes?: number
          created_at?: string
          delivery_conflict_rule?: Database["public"]["Enums"]["delivery_conflict_rule"]
          delivery_payout_split_pct?: number
          dispatch_contact_name?: string | null
          dispatch_email?: string | null
          dispatch_phone?: string | null
          health_regs_url?: string | null
          id?: string
          is_active?: boolean
          name?: string
          per_mile_fee_cents?: number
          slug?: string
          updated_at?: string
          zip_codes?: string[]
        }
        Relationships: []
      }
      review_items: {
        Row: {
          body: string | null
          created_at: string
          id: string
          menu_item_id: string
          rating: number
          review_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          menu_item_id: string
          rating: number
          review_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          menu_item_id?: string
          rating?: number
          review_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_items_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          body: string | null
          created_at: string
          customer_profile_id: string
          flagged_reason: string | null
          id: string
          image_url: string | null
          is_flagged: boolean
          rating_overall: number
          updated_at: string
          vendor_id: string
          vendor_suborder_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          customer_profile_id: string
          flagged_reason?: string | null
          id?: string
          image_url?: string | null
          is_flagged?: boolean
          rating_overall: number
          updated_at?: string
          vendor_id: string
          vendor_suborder_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          customer_profile_id?: string
          flagged_reason?: string | null
          id?: string
          image_url?: string | null
          is_flagged?: boolean
          rating_overall?: number
          updated_at?: string
          vendor_id?: string
          vendor_suborder_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_customer_profile_id_fkey"
            columns: ["customer_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_vendor_suborder_id_fkey"
            columns: ["vendor_suborder_id"]
            isOneToOne: false
            referencedRelation: "vendor_suborders"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          admin_allow_list: string[]
          cottage_food_disclaimer_md: string
          created_at: string
          default_platform_fee_pct: number
          delivery_partner_agreement_md: string
          free_trial_default_days: number
          id: number
          support_email: string
          updated_at: string
        }
        Insert: {
          admin_allow_list?: string[]
          cottage_food_disclaimer_md?: string
          created_at?: string
          default_platform_fee_pct?: number
          delivery_partner_agreement_md?: string
          free_trial_default_days?: number
          id?: number
          support_email?: string
          updated_at?: string
        }
        Update: {
          admin_allow_list?: string[]
          cottage_food_disclaimer_md?: string
          created_at?: string
          default_platform_fee_pct?: number
          delivery_partner_agreement_md?: string
          free_trial_default_days?: number
          id?: number
          support_email?: string
          updated_at?: string
        }
        Relationships: []
      }
      vendor_delivery_profiles: {
        Row: {
          availability: Json
          created_at: string
          default_radius_miles: number | null
          delivery_agreement_accepted_at: string | null
          drivers_license_back_url: string | null
          drivers_license_expires_on: string | null
          drivers_license_front_url: string | null
          id: string
          insurance_attested_at: string | null
          on_duty: boolean
          rejected_reason: string | null
          status: Database["public"]["Enums"]["delivery_profile_status"]
          updated_at: string
          vehicle_type: Database["public"]["Enums"]["vehicle_type"] | null
          vendor_id: string
        }
        Insert: {
          availability?: Json
          created_at?: string
          default_radius_miles?: number | null
          delivery_agreement_accepted_at?: string | null
          drivers_license_back_url?: string | null
          drivers_license_expires_on?: string | null
          drivers_license_front_url?: string | null
          id?: string
          insurance_attested_at?: string | null
          on_duty?: boolean
          rejected_reason?: string | null
          status?: Database["public"]["Enums"]["delivery_profile_status"]
          updated_at?: string
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"] | null
          vendor_id: string
        }
        Update: {
          availability?: Json
          created_at?: string
          default_radius_miles?: number | null
          delivery_agreement_accepted_at?: string | null
          drivers_license_back_url?: string | null
          drivers_license_expires_on?: string | null
          drivers_license_front_url?: string | null
          id?: string
          insurance_attested_at?: string | null
          on_duty?: boolean
          rejected_reason?: string | null
          status?: Database["public"]["Enums"]["delivery_profile_status"]
          updated_at?: string
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"] | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_delivery_profiles_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: true
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_suborders: {
        Row: {
          created_at: string
          delivery_address: Json | null
          delivery_cycle: number
          delivery_fee_cents: number
          delivery_instructions: string | null
          delivery_lat: number | null
          delivery_lng: number | null
          fulfillment: Database["public"]["Enums"]["fulfillment_type"]
          id: string
          mapbox_eta_minutes: number | null
          order_id: string
          pickup_at: string | null
          platform_fee_cents: number
          ready_at: string | null
          status: Database["public"]["Enums"]["suborder_status"]
          stripe_transfer_id: string | null
          subtotal_cents: number
          updated_at: string
          vendor_id: string
          vendor_payout_cents: number
        }
        Insert: {
          created_at?: string
          delivery_address?: Json | null
          delivery_cycle?: number
          delivery_fee_cents?: number
          delivery_instructions?: string | null
          delivery_lat?: number | null
          delivery_lng?: number | null
          fulfillment: Database["public"]["Enums"]["fulfillment_type"]
          id?: string
          mapbox_eta_minutes?: number | null
          order_id: string
          pickup_at?: string | null
          platform_fee_cents?: number
          ready_at?: string | null
          status?: Database["public"]["Enums"]["suborder_status"]
          stripe_transfer_id?: string | null
          subtotal_cents: number
          updated_at?: string
          vendor_id: string
          vendor_payout_cents?: number
        }
        Update: {
          created_at?: string
          delivery_address?: Json | null
          delivery_cycle?: number
          delivery_fee_cents?: number
          delivery_instructions?: string | null
          delivery_lat?: number | null
          delivery_lng?: number | null
          fulfillment?: Database["public"]["Enums"]["fulfillment_type"]
          id?: string
          mapbox_eta_minutes?: number | null
          order_id?: string
          pickup_at?: string | null
          platform_fee_cents?: number
          ready_at?: string | null
          status?: Database["public"]["Enums"]["suborder_status"]
          stripe_transfer_id?: string | null
          subtotal_cents?: number
          updated_at?: string
          vendor_id?: string
          vendor_payout_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "vendor_suborders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_suborders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_team_members: {
        Row: {
          bio: string | null
          created_at: string
          display_name: string
          id: string
          photo_url: string | null
          profile_id: string | null
          role_title: string | null
          sort_order: number
          updated_at: string
          vendor_id: string
        }
        Insert: {
          bio?: string | null
          created_at?: string
          display_name: string
          id?: string
          photo_url?: string | null
          profile_id?: string | null
          role_title?: string | null
          sort_order?: number
          updated_at?: string
          vendor_id: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          display_name?: string
          id?: string
          photo_url?: string | null
          profile_id?: string | null
          role_title?: string | null
          sort_order?: number
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_team_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_team_members_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address_line1: string | null
          cfpm_cert_expires_on: string | null
          cfpm_cert_url: string | null
          city: string | null
          cottage_food_acknowledged_at: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          email: string | null
          free_trial_ends_at: string | null
          header_image_url: string | null
          hours: Json
          id: string
          lat: number | null
          layout_style: Database["public"]["Enums"]["layout_style"]
          lng: number | null
          owner_profile_id: string
          phone: string | null
          platform_fee_pct: number | null
          preorder_hours: Json
          published_at: string | null
          region_id: string
          rejected_reason: string | null
          search_tsv: unknown
          slug: string
          state: string | null
          status: Database["public"]["Enums"]["vendor_status"]
          storefront_name: string
          stripe_account_id: string | null
          tagline: string | null
          theme_palette: Json
          updated_at: string
          vendor_types: string[]
          website: string | null
          zip: string | null
        }
        Insert: {
          address_line1?: string | null
          cfpm_cert_expires_on?: string | null
          cfpm_cert_url?: string | null
          city?: string | null
          cottage_food_acknowledged_at?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          email?: string | null
          free_trial_ends_at?: string | null
          header_image_url?: string | null
          hours?: Json
          id?: string
          lat?: number | null
          layout_style?: Database["public"]["Enums"]["layout_style"]
          lng?: number | null
          owner_profile_id: string
          phone?: string | null
          platform_fee_pct?: number | null
          preorder_hours?: Json
          published_at?: string | null
          region_id: string
          rejected_reason?: string | null
          search_tsv?: unknown
          slug: string
          state?: string | null
          status?: Database["public"]["Enums"]["vendor_status"]
          storefront_name: string
          stripe_account_id?: string | null
          tagline?: string | null
          theme_palette?: Json
          updated_at?: string
          vendor_types?: string[]
          website?: string | null
          zip?: string | null
        }
        Update: {
          address_line1?: string | null
          cfpm_cert_expires_on?: string | null
          cfpm_cert_url?: string | null
          city?: string | null
          cottage_food_acknowledged_at?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          email?: string | null
          free_trial_ends_at?: string | null
          header_image_url?: string | null
          hours?: Json
          id?: string
          lat?: number | null
          layout_style?: Database["public"]["Enums"]["layout_style"]
          lng?: number | null
          owner_profile_id?: string
          phone?: string | null
          platform_fee_pct?: number | null
          preorder_hours?: Json
          published_at?: string | null
          region_id?: string
          rejected_reason?: string | null
          search_tsv?: unknown
          slug?: string
          state?: string | null
          status?: Database["public"]["Enums"]["vendor_status"]
          storefront_name?: string
          stripe_account_id?: string | null
          tagline?: string | null
          theme_palette?: Json
          updated_at?: string
          vendor_types?: string[]
          website?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist_entries: {
        Row: {
          created_at: string
          id: string
          menu_item_id: string
          notified_at: string | null
          profile_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          menu_item_id: string
          notified_at?: string | null
          profile_id: string
        }
        Update: {
          created_at?: string
          id?: string
          menu_item_id?: string
          notified_at?: string | null
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_entries_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_view_pool_suborder: { Args: { so_id: string }; Returns: boolean }
      is_active_driver_for_suborder: {
        Args: { so_id: string }
        Returns: boolean
      }
      is_customer_of_order: {
        Args: { target_order_id: string }
        Returns: boolean
      }
      is_ops_admin: { Args: never; Returns: boolean }
      owns_vendor: { Args: { target_vendor_id: string }; Returns: boolean }
    }
    Enums: {
      cart_status: "open" | "abandoned" | "checked_out"
      delivery_conflict_rule: "soft_warning" | "hard_block"
      delivery_dispatch_event_type:
        | "t1_sms_sent"
        | "t2_customer_offer_sent"
        | "customer_chose_pickup"
        | "customer_chose_refund"
        | "t3_auto_refunded"
        | "claim_cancelled_pending_offer"
      delivery_profile_status:
        | "not_started"
        | "delivery_pending_review"
        | "delivery_active"
        | "delivery_suspended"
      fulfillment_type: "pickup" | "delivery"
      layout_style:
        | "compact_list"
        | "detail_list"
        | "image_grid"
        | "detail_grid"
      order_payment_status:
        | "pending_payment"
        | "paid"
        | "refunded"
        | "partially_refunded"
        | "cancelled"
      suborder_status:
        | "received"
        | "confirmed"
        | "preparing"
        | "ready"
        | "claimed"
        | "en_route_to_pickup"
        | "picked_up"
        | "en_route_to_customer"
        | "delivered"
        | "completed"
        | "cancelled"
        | "refunded"
      user_role:
        | "customer"
        | "vendor_owner"
        | "vendor_member"
        | "ops_admin"
        | "ops_owner"
      vehicle_type:
        | "sedan"
        | "suv"
        | "truck"
        | "bike"
        | "ebike"
        | "scooter"
        | "on_foot"
      vendor_status: "pending_review" | "active" | "suspended" | "unpublished"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      cart_status: ["open", "abandoned", "checked_out"],
      delivery_conflict_rule: ["soft_warning", "hard_block"],
      delivery_dispatch_event_type: [
        "t1_sms_sent",
        "t2_customer_offer_sent",
        "customer_chose_pickup",
        "customer_chose_refund",
        "t3_auto_refunded",
        "claim_cancelled_pending_offer",
      ],
      delivery_profile_status: [
        "not_started",
        "delivery_pending_review",
        "delivery_active",
        "delivery_suspended",
      ],
      fulfillment_type: ["pickup", "delivery"],
      layout_style: [
        "compact_list",
        "detail_list",
        "image_grid",
        "detail_grid",
      ],
      order_payment_status: [
        "pending_payment",
        "paid",
        "refunded",
        "partially_refunded",
        "cancelled",
      ],
      suborder_status: [
        "received",
        "confirmed",
        "preparing",
        "ready",
        "claimed",
        "en_route_to_pickup",
        "picked_up",
        "en_route_to_customer",
        "delivered",
        "completed",
        "cancelled",
        "refunded",
      ],
      user_role: [
        "customer",
        "vendor_owner",
        "vendor_member",
        "ops_admin",
        "ops_owner",
      ],
      vehicle_type: [
        "sedan",
        "suv",
        "truck",
        "bike",
        "ebike",
        "scooter",
        "on_foot",
      ],
      vendor_status: ["pending_review", "active", "suspended", "unpublished"],
    },
  },
} as const

