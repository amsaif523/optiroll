export interface WorkOrderItem {
  id: string
  shade_number: string
  blind_type: 'roller' | 'zebra'
  width: number     // meters
  height: number    // meters
  valence: number   // meters (entered in inches, converted on add)
  quantity: number
  material_type: string
  color: string
  pattern: string
  selected_widths: number[]  // roll widths (meters) this piece can be cut from
}

export interface BlindPlaced {
  blind_id: string
  shade_number: string
  piece_index: number
  x: number
  y: number
  width: number          // meters — dimension on roll
  height: number         // meters — final cut height (includes valence)
  valence: number        // meters
  original_height: number
  blind_type: 'roller' | 'zebra'
  rotated: boolean
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

export interface OptimizeResponse {
  job_id: number
  work_order_number: string
  client_name: string
  roll_width: number
  max_roll_length: number
  total_pieces: number
  total_sheets: number
  total_leftovers_used: number
  waste_percent: number
  utilization_percent: number
  roll_width_suggestions: RollWidthSuggestion[]
  sheets: Sheet[]
}

export interface AppSettings {
  roll_widths: number[]
  max_roll_length: number
}
