export interface WorkOrderItem {
  id: string
  serial?: string        // Sr. No. from the Excel import (or auto-assigned) — shown on the plot
  shade_number: string
  product_id?: number | null
  product_code?: string | null
  blind_type: 'roller' | 'zebra'
  width: number     // meters (ordered width)
  cut: number       // meters — mechanism deduction; fabric width packed = width − cut
  height: number    // meters
  valence: number   // meters (entered in inches, converted on add)
  quantity: number
  selected_widths: number[]  // roll widths (meters) this piece can be cut from
  grain_locked?: boolean     // if true, this piece can't be rotated (striped/patterned fabric)
}

export interface BlindPlaced {
  blind_id: string
  serial?: string        // Sr. No. carried from the work-order item
  shade_number: string
  piece_index: number
  x: number
  y: number
  width: number          // meters — fabric width on roll (ordered width − cut)
  height: number         // meters — final cut height (includes valence)
  cut?: number           // meters — mechanism deduction (for display)
  ordered_width?: number // meters — original ordered width before the cut
  valence: number        // meters
  original_height: number
  blind_type: 'roller' | 'zebra'
  rotated: boolean
}

export interface CandidateLeftover {
  width: number          // meters
  length: number         // meters
  product_code?: string | null
  shades: string | null  // ", "-separated shade(s) the offcut came from
  sheet_number: number
  source: 'offcut' | 'tail'
}

export interface Sheet {
  sheet_number: number
  sheet_type: 'fresh_roll' | 'leftover'
  width: number
  length: number
  blinds: BlindPlaced[]
  waste_areas: { x: number; y: number; width: number; height: number; area: number }[]
  reusable_leftovers: { x: number; y: number; width: number; height: number; area: number }[]
  previous_blinds: BlindPlaced[]
  original_width: number
  original_length: number
  leftover_offset_x: number
  leftover_offset_y: number
  utilization: number
  waste: number
}

export interface RollWidthSuggestion {
  width: number
  utilization: number
  sheets: number
  all_fit: boolean
}

export interface RollWidthGroup {
  roll_width: number
  roll_widths?: number[]   // distinct widths actually used across this group's sheets
  shade_number: string | null
  product_code: string | null
  item_count: number
  sheets: number
}

export interface OptimizeResponse {
  job_id: number | null
  preview?: boolean
  work_order_number: string
  client_name: string
  roll_width: number
  roll_width_groups?: RollWidthGroup[]
  cut_mode?: 'free' | 'guillotine'
  mode?: 'quick' | 'deep'
  max_roll_length: number
  total_pieces: number
  total_sheets: number
  total_leftovers_used: number
  waste_percent: number
  utilization_percent: number
  roll_width_suggestions: RollWidthSuggestion[]
  leftovers?: CandidateLeftover[]
  leftovers_saved?: boolean
  sheets: Sheet[]
}

export interface AppSettings {
  roll_widths: number[]
  max_roll_length: number
  leftover_reuse_threshold?: number  // 0–1, fraction of effective roll width a leftover must reach to qualify
}
