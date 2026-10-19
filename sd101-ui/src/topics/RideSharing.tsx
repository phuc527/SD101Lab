import { useState } from 'react'
import type { MouseEvent } from 'react'
import type { PlaygroundProps } from '../labs'
import { errorMessage } from '../lib/api'
import { usePoll } from '../lib/hooks'
import './RideSharing.css'

type Status = 'available' | 'on_trip' | 'offline'
type Driver = { id: string; lat: number; lng: number; status: Status }
type Box = { lat0: number; lng0: number; lat1: number; lng1: number }
type Bbox = { minLat: number; maxLat: number; minLng: number; maxLng: number }
type DriversRes = { drivers: Driver[]; bbox: Bbox; fleet: number; surge?: (Box & { multiplier: number })[]; shards?: (Box & { load: number })[] }
type TripStatus = 'requested' | 'accepted' | 'in_progress' | 'completed' | 'cancelled'
type Trip = { id: number; riderId: string; driverId: string; status: TripStatus; pickup: { lat: number; lng: number }; km: number; surge: number; fare: number }
type Scanned = { drivers: number; of: number; cells?: number }
type Match = { trip: Trip; driver: Driver; km: number; scanned: Scanned; ms: number }
type Burst = { results: { riderId: string; driverId?: string; tripId?: number; error?: string }[]; doubleBookings: number }

const SIZE = 1000 // SVG units; the map scales with its container via viewBox
const NEXT: Partial<Record<TripStatus, TripStatus>> = { requested: 'accepted', accepted: 'in_progress', in_progress: 'completed' }
const ACTIVE: TripStatus[] = ['requested', 'accepted', 'in_progress']
const DEFAULT_PICKUP = { lat: 10.776, lng: 106.7 } // District 1

function Marker({ status, x, y }: { status: Status; x: number; y: number }) {
  // shape encodes status too, so the map does not rely on color alone
  if (status === 'on_trip') return <rect className="rs-on_trip" x={x - 6} y={y - 6} width={12} height={12} />
  return <circle className={`rs-${status}`} cx={x} cy={y} r={status === 'offline' ? 5 : 6} />
}

export default function RideSharing({ api }: PlaygroundProps) {
  const drivers = usePoll(() => api.get<DriversRes>('/drivers', { silent: true }), 1000, api.base)
  const trips = usePoll(() => api.get<{ trips: Trip[] }>('/trips', { silent: true }), 2000, api.base)
  const [pickup, setPickup] = useState(DEFAULT_PICKUP)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [match, setMatch] = useState<Match>()
  const [burst, setBurst] = useState<Burst>()
  const [showOverlays, setShowOverlays] = useState(true)

  const bbox = drivers.data?.bbox ?? { minLat: 10.7, maxLat: 10.9, minLng: 106.6, maxLng: 106.8 }
  const x = (lng: number) => ((lng - bbox.minLng) / (bbox.maxLng - bbox.minLng)) * SIZE
  const y = (lat: number) => ((bbox.maxLat - lat) / (bbox.maxLat - bbox.minLat)) * SIZE

  function pick(e: MouseEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    const fx = (e.clientX - r.left) / r.width
    const fy = (e.clientY - r.top) / r.height
    setPickup({
      lat: +(bbox.maxLat - fy * (bbox.maxLat - bbox.minLat)).toFixed(5),
      lng: +(bbox.minLng + fx * (bbox.maxLng - bbox.minLng)).toFixed(5),
    })
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(undefined)
    try {
      await fn()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
      trips.refresh()
      drivers.refresh()
    }
  }
  const requestRide = () =>
    run(async () => {
      setMatch(await api.post<Match>('/request', { riderId: `rider-${Date.now() % 100000}`, ...pickup }))
      setBurst(undefined)
    })
  const requestBurst = () =>
    run(async () => {
      setBurst(await api.post<Burst>('/request-burst', { count: 5, ...pickup }))
      setMatch(undefined)
    })
  const advance = (id: number, to: TripStatus) => run(async () => void (await api.post(`/trips/${id}/advance`, { to })))

  const list = drivers.data?.drivers ?? []
  const count = (s: Status) => list.filter((d) => d.status === s).length
  const summary = drivers.data
    ? `${count('available')} available, ${count('on_trip')} on trip, ${count('offline')} offline drivers shown (fleet ${drivers.data.fleet.toLocaleString()} incl. hidden). Pickup at ${pickup.lat}, ${pickup.lng}.`
    : 'Loading drivers'
  const activeTrips = (trips.data?.trips ?? []).filter((t) => ACTIVE.includes(t.status))
  const hasOverlays = !!(drivers.data?.surge || drivers.data?.shards)

  return (
    <div className="stack">
      <div className="stack-sm">
        <div className="row wrap between">
          <p className="muted" aria-live="polite">{drivers.data ? summary : drivers.error ? '' : 'Loading drivers…'}</p>
          {hasOverlays && (
            <label className="toggle">
              <input type="checkbox" checked={showOverlays} onChange={(e) => setShowOverlays(e.target.checked)} />
              <span>Show {drivers.data?.shards ? 'surge + shards' : 'surge zones'}</span>
            </label>
          )}
        </div>
        {drivers.error && <p className="error-text" role="alert">{drivers.error}</p>}
        <svg className="rs-map" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`City map. ${summary} Click to set pickup, or use the inputs below.`} onClick={pick}>
          {showOverlays && drivers.data?.shards?.map((s, i) => (
            <g key={`s${i}`}>
              <rect className="rs-shard" x={x(s.lng0)} y={y(s.lat1)} width={x(s.lng1) - x(s.lng0)} height={y(s.lat0) - y(s.lat1)} />
              {x(s.lng1) - x(s.lng0) > 60 && <text className="rs-shard-label" x={x(s.lng0) + 4} y={y(s.lat1) + 16}>{s.load}</text>}
            </g>
          ))}
          {showOverlays && drivers.data?.surge?.map((s, i) => (
            <g key={`z${i}`}>
              <rect className="rs-surge" opacity={0.1 + (s.multiplier - 1) * 0.12} x={x(s.lng0)} y={y(s.lat1)} width={x(s.lng1) - x(s.lng0)} height={y(s.lat0) - y(s.lat1)} />
              <text className="rs-surge-label" x={x(s.lng0) + 6} y={y(s.lat0) - 8}>{s.multiplier}x</text>
            </g>
          ))}
          {activeTrips.map((t) => {
            const d = list.find((dr) => dr.id === t.driverId)
            return d && <line key={t.id} className="rs-trip-line" x1={x(d.lng)} y1={y(d.lat)} x2={x(t.pickup.lng)} y2={y(t.pickup.lat)} />
          })}
          {list.map((d) => <Marker key={d.id} status={d.status} x={x(d.lng)} y={y(d.lat)} />)}
          <circle className="rs-pickup" cx={x(pickup.lng)} cy={y(pickup.lat)} r={12} />
        </svg>
        <div className="rs-legend" aria-hidden="true">
          <span><svg width="14" height="14"><circle className="rs-available" cx="7" cy="7" r="5" /></svg>available (filled circle)</span>
          <span><svg width="14" height="14"><rect className="rs-on_trip" x="2" y="2" width="10" height="10" /></svg>on trip (square)</span>
          <span><svg width="14" height="14"><circle className="rs-offline" cx="7" cy="7" r="4" /></svg>offline (ring)</span>
          <span><svg width="14" height="14"><circle className="rs-pickup" cx="7" cy="7" r="5" /></svg>pickup</span>
          {drivers.data?.surge && <span>shaded zone + "1.5x" = surge</span>}
          {drivers.data?.shards && <span>dashed box + number = shard load</span>}
        </div>
        <div className="rs-coords">
          <label className="field">
            <span>Pickup lat</span>
            <input type="number" step="0.001" min={bbox.minLat} max={bbox.maxLat} value={pickup.lat} onChange={(e) => setPickup((p) => ({ ...p, lat: Number(e.target.value) }))} />
          </label>
          <label className="field">
            <span>Pickup lng</span>
            <input type="number" step="0.001" min={bbox.minLng} max={bbox.maxLng} value={pickup.lng} onChange={(e) => setPickup((p) => ({ ...p, lng: Number(e.target.value) }))} />
          </label>
        </div>
        <div className="row wrap">
          <button className="btn" onClick={requestRide} disabled={busy}>{busy ? 'Matching…' : 'Request ride'}</button>
          <button className="btn btn-ghost" onClick={requestBurst} disabled={busy}>5 riders at once here</button>
        </div>
        {error && <p className="error-text" role="alert">{error}</p>}
      </div>

      {match && (
        <div>
          <h3>Last match <span className="muted">· {match.ms} ms</span></h3>
          <p>
            Trip #{match.trip.id}: <strong>{match.driver.id}</strong> is {match.km} km away
            {match.trip.surge > 1 && ` · surge ${match.trip.surge}x`} · fare {match.trip.fare.toLocaleString()} VND
          </p>
          <p className="muted">
            Scanned {match.scanned.drivers.toLocaleString()} of {match.scanned.of.toLocaleString()} drivers
            {match.scanned.cells !== undefined && ` in ${match.scanned.cells} grid cells`}
          </p>
        </div>
      )}
      {burst && (
        <div>
          <h3>Burst result</h3>
          <p>
            {burst.doubleBookings > 0
              ? <span className="badge badge-write">{burst.doubleBookings} double booking(s)</span>
              : <span className="badge badge-read">no double booking</span>}
          </p>
          <ul className="list">
            {burst.results.map((r) => (
              <li key={r.riderId} className="list-row">
                <span>{r.riderId}</span>
                {r.error ? <span className="error-text">{r.error}</span> : <span>{r.driverId} · trip #{r.tripId}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3>Trips</h3>
        {trips.error && <p className="error-text">{trips.error}</p>}
        {trips.loading ? (
          <p className="muted">Loading trips…</p>
        ) : !trips.data?.trips.length ? (
          <p className="muted">No trips yet. Pick a spot on the map and request a ride.</p>
        ) : (
          <ul className="list">
            {trips.data.trips.slice(0, 15).map((t) => {
              const next = NEXT[t.status]
              return (
                <li key={t.id} className="list-row">
                  <span>
                    <strong>#{t.id}</strong> {t.riderId} → {t.driverId}{' '}
                    <span className={`badge ${ACTIVE.includes(t.status) ? 'badge-write' : 'badge-read'}`}>{t.status.replace('_', ' ')}</span>
                    <span className="muted"> · {t.km} km · {t.fare.toLocaleString()} VND</span>
                  </span>
                  <span className="row wrap">
                    {next && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => advance(t.id, next)}>Advance → {next.replace('_', ' ')}</button>}
                    {ACTIVE.includes(t.status) && (
                      // shown for in_progress too, so the 409 "illegal transition" is visible
                      <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => advance(t.id, 'cancelled')}>Cancel</button>
                    )}
                    {t.status === 'completed' && (
                      <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => advance(t.id, 'completed')}>Retry complete (payment)</button>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
