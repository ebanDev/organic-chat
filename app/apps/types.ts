import type { Component } from 'vue'

export interface AppDefinition {
  id: string
  name: string
  description: string
  icon: string
  path: string
  widget: Component
  order?: number
}
