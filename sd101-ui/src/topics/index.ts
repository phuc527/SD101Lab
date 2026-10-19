import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { PlaygroundProps, TopicId } from '../labs'

// One playground per topic. The same component is used for all 4 levels.
export const PLAYGROUNDS: Record<TopicId, LazyExoticComponent<ComponentType<PlaygroundProps>>> = {
  newsfeed: lazy(() => import('./Newsfeed')),
  'url-shortener': lazy(() => import('./UrlShortener')),
  'rate-limiter': lazy(() => import('./RateLimiter')),
  'chat-app': lazy(() => import('./ChatApp')),
  'ride-sharing': lazy(() => import('./RideSharing')),
  autocomplete: lazy(() => import('./Autocomplete')),
  notification: lazy(() => import('./Notification')),
  'flash-sale': lazy(() => import('./FlashSale')),
}
