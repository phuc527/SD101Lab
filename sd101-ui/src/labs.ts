import type { Api } from './lib/api'

export const LEVELS = ['fresher', 'junior', 'middle', 'senior'] as const
export type Level = (typeof LEVELS)[number]

export type TopicId = 'newsfeed' | 'url-shortener' | 'rate-limiter' | 'chat-app' | 'ride-sharing' | 'autocomplete' | 'notification' | 'flash-sale'

export const TOPICS: { id: TopicId; label: string; profile: string; summary: string }[] = [
  { id: 'newsfeed', label: 'News Feed', profile: 'Read-heavy', summary: 'Fan-out push/pull/hybrid, cache, ranking' },
  { id: 'url-shortener', label: 'URL Shortener', profile: 'Read-heavy', summary: 'ID generation, base62, redirect cache' },
  { id: 'rate-limiter', label: 'Rate Limiter', profile: 'Write-heavy', summary: 'Algorithms, races, distributed limits' },
  { id: 'chat-app', label: 'Chat App', profile: 'Write-heavy', summary: 'Real-time push, ordering, delivery' },
  { id: 'ride-sharing', label: 'Ride Sharing', profile: 'Write-heavy', summary: 'Geo index, matching, locks, hot spots' },
  { id: 'autocomplete', label: 'Autocomplete', profile: 'Read-heavy', summary: 'Trie, top-K, async aggregation, sharding' },
  { id: 'notification', label: 'Notification System', profile: 'Write-heavy', summary: 'Queues, retries, idempotency, failover' },
  { id: 'flash-sale', label: 'Flash Sale', profile: 'Write-heavy', summary: 'Oversell, row locks, hot row, Redis + queue' },
]

export type Control = {
  id: string
  label: string
  type: 'toggle' | 'number' | 'select'
  value: boolean | number | string
  options?: string[]
  min?: number
  max?: number
  step?: number
}

/** GET /meta: every level describes its own backend architecture */
export type Meta = {
  topic: TopicId
  level: Level
  title: string
  profile: string
  architecture: string
  ideas: string[]
  tradeoffs: string[]
  controls: Control[]
}

/** Every topic playground gets the same props; the UI is identical across levels. */
export type PlaygroundProps = {
  api: Api
  level: Level
  meta: Meta
  /** increments after "Reset data", so the playground reloads */
  resetKey: number
}
