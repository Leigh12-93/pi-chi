'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Library, Music, Mic, Clock, Radio, MessageSquare,
  Zap, BarChart3, RefreshCw, Search, Filter,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

/* ─── Types ───────────────────────────────────── */

interface TrackStats { genre: string; count: number; hours: number }
interface ClipStats { clip_type: string; count: number }
interface RecentPlay { item_type: string; genre: string; played_at: string }
interface Track {
  id: number; genre: string; title: string; file_path: string
  duration_secs: number; bpm: number; play_count: number
  last_played_at: string; rating: number; created_at: string
}
interface Clip {
  id: number; clip_type: string; file_path: string; text_content: string
  duration_secs: number; voice: string; play_count: number; created_at: string
}
interface Schedule {
  id: number; hour_start: number; hour_end: number
  genre: string; day_of_week: string; priority: number
}
interface Question {
  id: number; name: string; question: string; status: string
  answer_text: string; submitted_at: string; answered_at: string
}
interface Injection {
  id: number; item_type: string; file_path: string; text_content: string
  source: string; priority: number; trigger_at: string
  inserted_at: string; played_at: string; status: string
}

type Tab = 'stats' | 'tracks' | 'clips' | 'schedule' | 'questions' | 'injections'

/* ─── API ─────────────────────────────────────── */

async function fetchLibrary(tab: Tab, params?: Record<string, string>) {
  const qs = new URLSearchParams({ tab, ...params })
  const res = await fetch(`/api/radio/library?${qs}`)
  return res.json()
}

/* ─── Helpers ─────────────────────────────────── */

function formatDuration(secs: number | null): string {
  if (!secs) return '--'
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatTimeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const GENRE_COLORS: Record<string, string> = {
  lofi: 'bg-purple-500/20 text-purple-300',
  jazz: 'bg-amber-500/20 text-amber-300',
  cafejazz: 'bg-orange-500/20 text-orange-300',
  ambient: 'bg-cyan-500/20 text-cyan-300',
  sleep: 'bg-indigo-500/20 text-indigo-300',
  darkacademia: 'bg-stone-500/20 text-stone-300',
  lovemusic: 'bg-pink-500/20 text-pink-300',
  focusnoise: 'bg-gray-500/20 text-gray-300',
  rainsounds: 'bg-blue-500/20 text-blue-300',
}

/* ─── Component ───────────────────────────────── */

export function RadioLibrary() {
  const [tab, setTab] = useState<Tab>('stats')
  const [data, setData] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(false)
  const [genreFilter, setGenreFilter] = useState<string>('')
  const [clipTypeFilter, setClipTypeFilter] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    const params: Record<string, string> = {}
    if (tab === 'tracks' && genreFilter) params.genre = genreFilter
    if (tab === 'clips' && clipTypeFilter) params.clipType = clipTypeFilter
    const result = await fetchLibrary(tab, params)
    setData(result)
    setLoading(false)
  }, [tab, genreFilter, clipTypeFilter])

  useEffect(() => { refresh() }, [refresh])

  const tabs: Array<{ id: Tab; icon: typeof BarChart3; label: string }> = [
    { id: 'stats', icon: BarChart3, label: 'Overview' },
    { id: 'tracks', icon: Music, label: 'Tracks' },
    { id: 'clips', icon: Mic, label: 'DJ Clips' },
    { id: 'schedule', icon: Clock, label: 'Schedule' },
    { id: 'questions', icon: MessageSquare, label: 'Q&A' },
    { id: 'injections', icon: Zap, label: 'Injections' },
  ]

  return (
    <div className="h-full flex flex-col bg-pi-bg">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-pi-border bg-pi-panel/80 backdrop-blur-sm px-6 py-3">
        <div className="flex items-center gap-3">
          <Library className="w-5 h-5 text-pi-accent" />
          <span className="text-base font-bold text-pi-text">Pi Frequency Library</span>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className={cn(
            'p-2 rounded-lg text-pi-text-dim hover:text-pi-text hover:bg-pi-surface transition-all',
            loading && 'animate-spin'
          )}
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-6 py-2 border-b border-pi-border/50 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap',
              tab === t.id
                ? 'bg-pi-accent/10 text-pi-accent border border-pi-accent/20'
                : 'text-pi-text-dim hover:text-pi-text hover:bg-pi-surface/50'
            )}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto">
          {tab === 'stats' && <StatsView data={data} />}
          {tab === 'tracks' && (
            <TracksView
              data={data}
              genreFilter={genreFilter}
              onGenreFilter={setGenreFilter}
              searchQuery={searchQuery}
              onSearch={setSearchQuery}
            />
          )}
          {tab === 'clips' && (
            <ClipsView
              data={data}
              clipTypeFilter={clipTypeFilter}
              onClipTypeFilter={setClipTypeFilter}
            />
          )}
          {tab === 'schedule' && <ScheduleView data={data} />}
          {tab === 'questions' && <QuestionsView data={data} />}
          {tab === 'injections' && <InjectionsView data={data} />}
        </div>
      </div>
    </div>
  )
}

/* ─── Stats Overview ──────────────────────────── */

function StatsView({ data }: { data: Record<string, unknown> }) {
  const trackStats = (data.trackStats || []) as TrackStats[]
  const clipStats = (data.clipStats || []) as ClipStats[]
  const recentPlays = (data.recentPlays || []) as RecentPlay[]
  const totalTracks = ((data.totalTracks as Array<{ total: number }>)?.[0]?.total) || 0
  const totalClips = ((data.totalClips as Array<{ total: number }>)?.[0]?.total) || 0
  const schedule = (data.schedule || []) as Schedule[]

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Music} label="Tracks" value={totalTracks} color="text-emerald-400" />
        <StatCard icon={Mic} label="DJ Clips" value={totalClips} color="text-blue-400" />
        <StatCard icon={Radio} label="Genres" value={trackStats.length} color="text-purple-400" />
        <StatCard icon={Clock} label="Schedules" value={schedule.length} color="text-amber-400" />
      </div>

      {/* Genre breakdown */}
      <div className="rounded-xl border border-pi-border bg-pi-surface/30 p-5">
        <h3 className="text-sm font-bold text-pi-text mb-3">Music Library by Genre</h3>
        <div className="space-y-2">
          {trackStats.map(g => {
            const max = Math.max(...trackStats.map(s => s.count))
            const pct = max > 0 ? (g.count / max) * 100 : 0
            return (
              <div key={g.genre} className="flex items-center gap-3">
                <span className={cn('text-xs font-mono w-24 shrink-0 px-2 py-0.5 rounded', GENRE_COLORS[g.genre] || 'text-pi-text-dim')}>
                  {g.genre}
                </span>
                <div className="flex-1 h-2 bg-pi-bg rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.5 }}
                    className="h-full bg-pi-accent/60 rounded-full"
                  />
                </div>
                <span className="text-xs text-pi-text-dim w-20 text-right">{g.count} tracks</span>
                <span className="text-xs text-pi-text-dim/70 w-16 text-right">{g.hours}h</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Clip types */}
      <div className="rounded-xl border border-pi-border bg-pi-surface/30 p-5">
        <h3 className="text-sm font-bold text-pi-text mb-3">DJ Clip Types</h3>
        <div className="flex flex-wrap gap-2">
          {clipStats.map(c => (
            <span key={c.clip_type} className="px-2.5 py-1 rounded-lg bg-pi-bg border border-pi-border text-xs text-pi-text-dim">
              {c.clip_type} <span className="text-pi-accent font-bold">{c.count}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Recent plays */}
      <div className="rounded-xl border border-pi-border bg-pi-surface/30 p-5">
        <h3 className="text-sm font-bold text-pi-text mb-3">Recent Playback</h3>
        <div className="space-y-1">
          {recentPlays.map((p, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="text-pi-text-dim/70 w-16">{formatTimeAgo(p.played_at)}</span>
              <span className={cn('px-1.5 py-0.5 rounded text-[10px]', GENRE_COLORS[p.genre] || 'text-pi-text-dim')}>
                {p.genre || p.item_type}
              </span>
              <span className="text-pi-text-dim">{p.item_type}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color }: { icon: typeof Music; label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-pi-border bg-pi-surface/30 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn('w-4 h-4', color)} />
        <span className="text-xs text-pi-text-dim">{label}</span>
      </div>
      <span className="text-2xl font-bold text-pi-text">{value}</span>
    </div>
  )
}

/* ─── Tracks View ─────────────────────────────── */

function TracksView({ data, genreFilter, onGenreFilter, searchQuery, onSearch }: {
  data: Record<string, unknown>
  genreFilter: string
  onGenreFilter: (g: string) => void
  searchQuery: string
  onSearch: (q: string) => void
}) {
  const tracks = (data.tracks || []) as Track[]
  const genres = (data.genres || []) as Array<{ genre: string }>

  const filtered = searchQuery
    ? tracks.filter(t => t.title?.toLowerCase().includes(searchQuery.toLowerCase()) || t.genre.includes(searchQuery.toLowerCase()))
    : tracks

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 flex-1 bg-pi-surface/50 rounded-lg border border-pi-border px-3 py-2">
          <Search className="w-4 h-4 text-pi-text-dim" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => onSearch(e.target.value)}
            placeholder="Search tracks..."
            className="flex-1 bg-transparent text-sm text-pi-text placeholder:text-pi-text-dim/60 outline-none"
          />
        </div>
        <div className="flex items-center gap-1">
          <Filter className="w-4 h-4 text-pi-text-dim" />
          <select
            value={genreFilter}
            onChange={e => onGenreFilter(e.target.value)}
            className="bg-pi-surface border border-pi-border text-pi-text text-xs rounded-lg px-2 py-1.5"
          >
            <option value="">All genres</option>
            {genres.map(g => (
              <option key={g.genre} value={g.genre}>{g.genre}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-xl border border-pi-border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-pi-surface/50 text-pi-text-dim">
              <th className="text-left px-3 py-2 font-medium">Genre</th>
              <th className="text-left px-3 py-2 font-medium">Title</th>
              <th className="text-right px-3 py-2 font-medium">Duration</th>
              <th className="text-right px-3 py-2 font-medium">BPM</th>
              <th className="text-right px-3 py-2 font-medium">Plays</th>
              <th className="text-right px-3 py-2 font-medium">Last Played</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(t => (
              <tr key={t.id} className="border-t border-pi-border/30 hover:bg-pi-surface/30 transition-colors">
                <td className="px-3 py-2">
                  <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', GENRE_COLORS[t.genre] || 'text-pi-text-dim')}>
                    {t.genre}
                  </span>
                </td>
                <td className="px-3 py-2 text-pi-text truncate max-w-[300px]">
                  {t.title || t.file_path.split('/').pop()}
                </td>
                <td className="px-3 py-2 text-right text-pi-text-dim font-mono">{formatDuration(t.duration_secs)}</td>
                <td className="px-3 py-2 text-right text-pi-text-dim font-mono">{t.bpm || '--'}</td>
                <td className="px-3 py-2 text-right text-pi-text-dim">{t.play_count}</td>
                <td className="px-3 py-2 text-right text-pi-text-dim/60">{formatTimeAgo(t.last_played_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-8 text-pi-text-dim text-sm">No tracks found</div>
        )}
      </div>
    </div>
  )
}

/* ─── Clips View ──────────────────────────────── */

function ClipsView({ data, clipTypeFilter, onClipTypeFilter }: {
  data: Record<string, unknown>
  clipTypeFilter: string
  onClipTypeFilter: (t: string) => void
}) {
  const clips = (data.clips || []) as Clip[]
  const types = (data.types || []) as Array<{ clip_type: string }>

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-pi-text-dim" />
        <select
          value={clipTypeFilter}
          onChange={e => onClipTypeFilter(e.target.value)}
          className="bg-pi-surface border border-pi-border text-pi-text text-xs rounded-lg px-2 py-1.5"
        >
          <option value="">All types</option>
          {types.map(t => (
            <option key={t.clip_type} value={t.clip_type}>{t.clip_type}</option>
          ))}
        </select>
        <span className="text-xs text-pi-text-dim">{clips.length} clips</span>
      </div>

      <div className="space-y-2">
        {clips.map(c => (
          <div key={c.id} className="rounded-lg border border-pi-border bg-pi-surface/30 p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded bg-pi-accent/10 text-pi-accent text-[10px] font-medium">
                {c.clip_type}
              </span>
              <span className="text-[10px] text-pi-text-dim font-mono">{formatDuration(c.duration_secs)}</span>
              <span className="text-[10px] text-pi-text-dim">plays: {c.play_count}</span>
              <span className="ml-auto text-[10px] text-pi-text-dim/60">{c.voice}</span>
            </div>
            {c.text_content && (
              <p className="text-xs text-pi-text/80 line-clamp-2">{c.text_content}</p>
            )}
          </div>
        ))}
        {clips.length === 0 && (
          <div className="text-center py-8 text-pi-text-dim text-sm">No clips found</div>
        )}
      </div>
    </div>
  )
}

/* ─── Schedule View ───────────────────────────── */

function ScheduleView({ data }: { data: Record<string, unknown> }) {
  const schedule = (data.schedule || []) as Schedule[]
  const now = new Date()
  const currentHour = now.getHours()

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-pi-text">24-Hour Genre Schedule</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {schedule.map(s => {
          const isCurrent = currentHour >= s.hour_start && (s.hour_end === 0 ? currentHour >= 23 : currentHour < s.hour_end)
          return (
            <div
              key={s.id}
              className={cn(
                'rounded-lg border p-3 transition-all',
                isCurrent
                  ? 'border-pi-accent/40 bg-pi-accent/5 ring-1 ring-pi-accent/20'
                  : 'border-pi-border bg-pi-surface/30'
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-mono text-pi-text">
                  {s.hour_start.toString().padStart(2, '0')}:00 – {(s.hour_end || 24).toString().padStart(2, '0')}:00
                </span>
                {isCurrent && <span className="text-[10px] text-pi-accent font-bold">NOW</span>}
              </div>
              <span className={cn('inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium', GENRE_COLORS[s.genre] || 'text-pi-text-dim')}>
                {s.genre}
              </span>
            </div>
          )
        })}
      </div>

      {/* Visual timeline */}
      <div className="rounded-xl border border-pi-border bg-pi-surface/30 p-5">
        <h3 className="text-sm font-bold text-pi-text mb-3">Timeline</h3>
        <div className="flex h-8 rounded-lg overflow-hidden">
          {schedule.map(s => {
            const span = ((s.hour_end || 24) - s.hour_start) / 24 * 100
            const colors: Record<string, string> = {
              lofi: 'bg-purple-500/60', jazz: 'bg-amber-500/60', cafejazz: 'bg-orange-500/60',
              ambient: 'bg-cyan-500/60', sleep: 'bg-indigo-500/60', darkacademia: 'bg-stone-500/60',
              lovemusic: 'bg-pink-500/60', focusnoise: 'bg-gray-500/60', rainsounds: 'bg-blue-500/60',
            }
            return (
              <div
                key={s.id}
                style={{ width: `${span}%` }}
                className={cn('flex items-center justify-center text-[9px] font-medium text-white/80', colors[s.genre] || 'bg-pi-surface')}
                title={`${s.hour_start}:00-${s.hour_end || 24}:00 ${s.genre}`}
              >
                {span > 5 && s.genre}
              </div>
            )
          })}
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[9px] text-pi-text-dim/60">00:00</span>
          <span className="text-[9px] text-pi-text-dim/60">06:00</span>
          <span className="text-[9px] text-pi-text-dim/60">12:00</span>
          <span className="text-[9px] text-pi-text-dim/60">18:00</span>
          <span className="text-[9px] text-pi-text-dim/60">24:00</span>
        </div>
      </div>
    </div>
  )
}

/* ─── Questions View ──────────────────────────── */

function QuestionsView({ data }: { data: Record<string, unknown> }) {
  const questions = (data.questions || []) as Question[]
  const pendingCount = ((data.pending as Array<{ count: number }>)?.[0]?.count) || 0

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-bold text-pi-text">Listener Questions</h3>
        {pendingCount > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold">
            {pendingCount} pending
          </span>
        )}
      </div>

      <div className="space-y-2">
        {questions.map(q => (
          <div key={q.id} className="rounded-lg border border-pi-border bg-pi-surface/30 p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-pi-text">{q.name}</span>
              <span className={cn(
                'px-1.5 py-0.5 rounded text-[10px] font-medium',
                q.status === 'pending' ? 'bg-amber-500/20 text-amber-400' :
                q.status === 'answered' ? 'bg-emerald-500/20 text-emerald-400' :
                'bg-red-500/20 text-red-400'
              )}>
                {q.status}
              </span>
              <span className="ml-auto text-[10px] text-pi-text-dim/60">{formatTimeAgo(q.submitted_at)}</span>
            </div>
            <p className="text-xs text-pi-text/80">{q.question}</p>
            {q.answer_text && q.answer_text !== '[filtered]' && (
              <p className="text-xs text-pi-accent/70 mt-1 pl-3 border-l-2 border-pi-accent/20">{q.answer_text}</p>
            )}
          </div>
        ))}
        {questions.length === 0 && (
          <div className="text-center py-8 text-pi-text-dim text-sm">No questions yet</div>
        )}
      </div>
    </div>
  )
}

/* ─── Injections View ─────────────────────────── */

function InjectionsView({ data }: { data: Record<string, unknown> }) {
  const injections = (data.injections || []) as Injection[]
  const pendingCount = ((data.pending as Array<{ count: number }>)?.[0]?.count) || 0

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-bold text-pi-text">Injection Queue</h3>
        {pendingCount > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">
            {pendingCount} pending
          </span>
        )}
      </div>

      <div className="rounded-xl border border-pi-border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-pi-surface/50 text-pi-text-dim">
              <th className="text-left px-3 py-2 font-medium">Type</th>
              <th className="text-left px-3 py-2 font-medium">Source</th>
              <th className="text-right px-3 py-2 font-medium">Priority</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-right px-3 py-2 font-medium">Inserted</th>
              <th className="text-right px-3 py-2 font-medium">Played</th>
            </tr>
          </thead>
          <tbody>
            {injections.map(inj => (
              <tr key={inj.id} className="border-t border-pi-border/30 hover:bg-pi-surface/30">
                <td className="px-3 py-2">
                  <span className="px-1.5 py-0.5 rounded bg-pi-accent/10 text-pi-accent text-[10px]">
                    {inj.item_type}
                  </span>
                </td>
                <td className="px-3 py-2 text-pi-text-dim">{inj.source}</td>
                <td className="px-3 py-2 text-right font-mono text-pi-text-dim">{inj.priority}</td>
                <td className="px-3 py-2">
                  <span className={cn(
                    'px-1.5 py-0.5 rounded text-[10px]',
                    inj.status === 'pending' ? 'bg-amber-500/20 text-amber-400' :
                    inj.status === 'played' ? 'bg-emerald-500/20 text-emerald-400' :
                    'bg-red-500/20 text-red-400'
                  )}>
                    {inj.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-pi-text-dim/60">{formatTimeAgo(inj.inserted_at)}</td>
                <td className="px-3 py-2 text-right text-pi-text-dim/60">{formatTimeAgo(inj.played_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {injections.length === 0 && (
          <div className="text-center py-8 text-pi-text-dim text-sm">No injections</div>
        )}
      </div>
    </div>
  )
}
