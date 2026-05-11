export interface WorkOrderItem {
  id: string
  shade_number: string
  blind_type: 'roller' | 'zebra'
  width: number
  height: number
  valence: number
  quantity: number
  material_type: string
  color: string
  pattern: string
}

export interface Sheet {
  sheet_number: number
  sheet_type: 'fresh_roll' | 'leftover'
  width: number
  length: number
  blinds: any[]
  waste_areas: any[]
  reusable_leftovers: any[]
  previous_blinds: any[]
  original_width: number
  original_length: number
  leftover_offset_x: number
  leftover_offset_y: number
  utilization: number
  waste: number
}

export interface OptimizeResponse {
  job_id: number
  work_order_number: string
  client_name: string
  roll_width: number
  total_pieces: number
  total_sheets: number
  total_leftovers_used: number
  waste_percent: number
  utilization_percent: number
  sheets: Sheet[]
}