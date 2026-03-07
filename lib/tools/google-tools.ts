import { tool } from 'ai'
import { z } from 'zod'
import type { ToolContext } from './types'
import { getGoogleCredentials } from '@/lib/google-auth'

export function createGoogleTools(ctx: ToolContext) {
  const { githubUsername } = ctx

  async function getToken(): Promise<{ token: string; apiKey?: string } | { error: string }> {
    if (!githubUsername) return { error: 'No session — Google tools require authentication' }
    const result = await getGoogleCredentials(githubUsername)
    if (result.error || !result.credentials) return { error: result.error || 'No credentials' }
    return { token: result.credentials.accessToken, apiKey: result.credentials.apiKey }
  }

  async function getApiKey(): Promise<{ apiKey: string } | { error: string }> {
    if (!githubUsername) return { error: 'No session' }
    const result = await getGoogleCredentials(githubUsername)
    if (result.error || !result.credentials) return { error: result.error || 'No credentials' }
    if (!result.credentials.apiKey) return { error: 'No Google API key configured. Add one in the Google panel.' }
    return { apiKey: result.credentials.apiKey }
  }

  async function gFetch(url: string, init?: RequestInit): Promise<{ ok: boolean; data: unknown; error?: string }> {
    const auth = await getToken()
    if ('error' in auth) return { ok: false, data: null, error: auth.error }
    try {
      const res = await fetch(url, {
        ...init,
        headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json', ...init?.headers },
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) return { ok: false, data: null, error: `Google API: HTTP ${res.status}` }
      const data = await res.json().catch(() => ({}))
      return { ok: true, data }
    } catch (err: unknown) {
      return { ok: false, data: null, error: err instanceof Error ? err.message : String(err) }
    }
  }

  // API-key-based fetch (for Maps, YouTube, Translate)
  async function keyFetch(url: string): Promise<{ ok: boolean; data: unknown; error?: string }> {
    const auth = await getApiKey()
    if ('error' in auth) return { ok: false, data: null, error: auth.error }
    const separator = url.includes('?') ? '&' : '?'
    const fullUrl = `${url}${separator}key=${auth.apiKey}`
    try {
      const res = await fetch(fullUrl, { signal: AbortSignal.timeout(15000) })
      if (!res.ok) return { ok: false, data: null, error: `Google API: HTTP ${res.status}` }
      const data = await res.json().catch(() => ({}))
      return { ok: true, data }
    } catch (err: unknown) {
      return { ok: false, data: null, error: err instanceof Error ? err.message : String(err) }
    }
  }

  return {
    // ── Google Sheets ──────────────────────────────
    google_sheets_read: tool({
      description: 'Read data from a Google Sheets spreadsheet. Returns cell values as 2D array.',
      inputSchema: z.object({
        spreadsheetId: z.string().describe('The spreadsheet ID from the URL'),
        range: z.string().describe('A1 notation range (e.g., "Sheet1!A1:D10")'),
      }),
      execute: async ({ spreadsheetId, range }) => {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`
        const result = await gFetch(url)
        if (!result.ok) return { error: result.error }
        const d = result.data as Record<string, unknown>
        return { ok: true, values: d.values || [], range: d.range }
      },
    }),

    google_sheets_write: tool({
      description: 'Write data to a Google Sheets spreadsheet. Overwrites the specified range.',
      inputSchema: z.object({
        spreadsheetId: z.string(),
        range: z.string().describe('A1 notation range'),
        values: z.array(z.array(z.string())).describe('2D array of cell values'),
      }),
      execute: async ({ spreadsheetId, range, values }) => {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`
        const result = await gFetch(url, { method: 'PUT', body: JSON.stringify({ values }) })
        if (!result.ok) return { error: result.error }
        const d = result.data as Record<string, unknown>
        return { ok: true, updatedRange: d.updatedRange, updatedCells: d.updatedCells }
      },
    }),

    google_sheets_create: tool({
      description: 'Create a new Google Sheets spreadsheet.',
      inputSchema: z.object({
        title: z.string().describe('Spreadsheet title'),
        sheetNames: z.array(z.string()).optional().describe('Sheet tab names (default: ["Sheet1"])'),
      }),
      execute: async ({ title, sheetNames }) => {
        const sheets = (sheetNames || ['Sheet1']).map(name => ({ properties: { title: name } }))
        const result = await gFetch('https://sheets.googleapis.com/v4/spreadsheets', {
          method: 'POST',
          body: JSON.stringify({ properties: { title }, sheets }),
        })
        if (!result.ok) return { error: result.error }
        const d = result.data as Record<string, unknown>
        return { ok: true, spreadsheetId: d.spreadsheetId, spreadsheetUrl: d.spreadsheetUrl }
      },
    }),

    // ── Google Calendar ──────────────────────────────
    google_calendar_list_events: tool({
      description: 'List upcoming events from Google Calendar.',
      inputSchema: z.object({
        calendarId: z.string().default('primary').describe('Calendar ID (default: "primary")'),
        maxResults: z.number().default(10),
        timeMin: z.string().optional().describe('ISO datetime — only events after this time'),
        timeMax: z.string().optional().describe('ISO datetime — only events before this time'),
      }),
      execute: async ({ calendarId, maxResults, timeMin, timeMax }) => {
        const params = new URLSearchParams({
          maxResults: String(maxResults),
          singleEvents: 'true',
          orderBy: 'startTime',
        })
        if (timeMin) params.set('timeMin', timeMin)
        else params.set('timeMin', new Date().toISOString())
        if (timeMax) params.set('timeMax', timeMax)
        const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`
        const result = await gFetch(url)
        if (!result.ok) return { error: result.error }
        const d = result.data as Record<string, unknown>
        const items = (d.items as any[] || []).map((e: any) => ({
          id: e.id,
          summary: e.summary,
          start: e.start?.dateTime || e.start?.date,
          end: e.end?.dateTime || e.end?.date,
          location: e.location,
          description: e.description?.slice(0, 200),
        }))
        return { ok: true, events: items, count: items.length }
      },
    }),

    google_calendar_create_event: tool({
      description: 'Create a new Google Calendar event.',
      inputSchema: z.object({
        calendarId: z.string().default('primary'),
        summary: z.string().describe('Event title'),
        description: z.string().optional(),
        startDateTime: z.string().describe('ISO datetime for event start'),
        endDateTime: z.string().describe('ISO datetime for event end'),
        attendees: z.array(z.string()).optional().describe('Email addresses of attendees'),
        location: z.string().optional(),
      }),
      execute: async ({ calendarId, summary, description, startDateTime, endDateTime, attendees, location }) => {
        const event: Record<string, unknown> = {
          summary,
          description,
          start: { dateTime: startDateTime },
          end: { dateTime: endDateTime },
          location,
        }
        if (attendees?.length) event.attendees = attendees.map(email => ({ email }))
        const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
        const result = await gFetch(url, { method: 'POST', body: JSON.stringify(event) })
        if (!result.ok) return { error: result.error }
        const d = result.data as Record<string, unknown>
        return { ok: true, eventId: d.id, htmlLink: d.htmlLink }
      },
    }),

    // ── Gmail ──────────────────────────────
    google_gmail_send: tool({
      description: 'Send an email via Gmail. Requires gmail.send scope. This is a DESTRUCTIVE action — sends a real email.',
      inputSchema: z.object({
        to: z.string().describe('Recipient email address'),
        subject: z.string(),
        body: z.string().describe('Plain text email body'),
        cc: z.string().optional(),
        bcc: z.string().optional(),
      }),
      execute: async ({ to, subject, body, cc, bcc }) => {
        const headers = [
          `To: ${to}`,
          `Subject: ${subject}`,
          `Content-Type: text/plain; charset=utf-8`,
        ]
        if (cc) headers.push(`Cc: ${cc}`)
        if (bcc) headers.push(`Bcc: ${bcc}`)
        const raw = headers.join('\r\n') + '\r\n\r\n' + body
        const encoded = Buffer.from(raw).toString('base64url')
        const result = await gFetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          body: JSON.stringify({ raw: encoded }),
        })
        if (!result.ok) return { error: result.error }
        const d = result.data as Record<string, unknown>
        return { ok: true, messageId: d.id, threadId: d.threadId }
      },
    }),

    google_gmail_list: tool({
      description: 'List recent emails from Gmail inbox.',
      inputSchema: z.object({
        maxResults: z.number().default(10),
        query: z.string().optional().describe('Gmail search query (e.g., "from:user@example.com")'),
        labelIds: z.array(z.string()).optional().describe('Filter by label IDs'),
      }),
      execute: async ({ maxResults, query, labelIds }) => {
        const params = new URLSearchParams({ maxResults: String(maxResults) })
        if (query) params.set('q', query)
        if (labelIds?.length) labelIds.forEach(id => params.append('labelIds', id))
        const listResult = await gFetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`)
        if (!listResult.ok) return { error: listResult.error }
        const d = listResult.data as Record<string, unknown>
        const messages = d.messages as any[] || []
        // Fetch headers for each message (batch limited to 10)
        const details = await Promise.all(
          messages.slice(0, 10).map(async (m: any) => {
            const detail = await gFetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`)
            if (!detail.ok) return { id: m.id, error: detail.error }
            const msg = detail.data as any
            const headers = msg.payload?.headers || []
            const getHeader = (name: string) => headers.find((h: any) => h.name === name)?.value || ''
            return { id: m.id, from: getHeader('From'), subject: getHeader('Subject'), date: getHeader('Date'), snippet: msg.snippet }
          })
        )
        return { ok: true, messages: details, resultSizeEstimate: d.resultSizeEstimate }
      },
    }),

    google_gmail_read: tool({
      description: 'Read a specific Gmail message by ID.',
      inputSchema: z.object({
        messageId: z.string().describe('The Gmail message ID'),
      }),
      execute: async ({ messageId }) => {
        const result = await gFetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`)
        if (!result.ok) return { error: result.error }
        const msg = result.data as any
        const headers = msg.payload?.headers || []
        const getHeader = (name: string) => headers.find((h: any) => h.name === name)?.value || ''
        // Extract body text
        let bodyText = ''
        const extractText = (part: any): string => {
          if (part.mimeType === 'text/plain' && part.body?.data) {
            return Buffer.from(part.body.data, 'base64url').toString('utf-8')
          }
          if (part.parts) return part.parts.map(extractText).join('\n')
          return ''
        }
        bodyText = extractText(msg.payload)
        return {
          ok: true,
          id: msg.id,
          threadId: msg.threadId,
          from: getHeader('From'),
          to: getHeader('To'),
          subject: getHeader('Subject'),
          date: getHeader('Date'),
          body: bodyText.slice(0, 5000),
          labels: msg.labelIds,
        }
      },
    }),

    // ── Google Drive ──────────────────────────────
    google_drive_list: tool({
      description: 'List files in Google Drive.',
      inputSchema: z.object({
        query: z.string().optional().describe('Drive search query (e.g., "name contains \'report\'")'),
        maxResults: z.number().default(20),
        folderId: z.string().optional().describe('List files in a specific folder'),
      }),
      execute: async ({ query, maxResults, folderId }) => {
        const params = new URLSearchParams({
          pageSize: String(maxResults),
          fields: 'files(id,name,mimeType,size,modifiedTime,webViewLink)',
        })
        let q = query || ''
        if (folderId) q = `'${folderId}' in parents` + (q ? ` and ${q}` : '')
        if (q) params.set('q', q)
        const result = await gFetch(`https://www.googleapis.com/drive/v3/files?${params}`)
        if (!result.ok) return { error: result.error }
        const d = result.data as Record<string, unknown>
        return { ok: true, files: d.files || [] }
      },
    }),

    google_drive_read: tool({
      description: 'Read/download content from a Google Drive file. Supports Docs and Sheets export.',
      inputSchema: z.object({
        fileId: z.string().describe('The Drive file ID'),
        exportMimeType: z.string().optional().describe('For Google Docs/Sheets, export as this MIME type (e.g., "text/plain", "text/csv")'),
      }),
      execute: async ({ fileId, exportMimeType }) => {
        const auth = await getToken()
        if ('error' in auth) return { error: auth.error }
        try {
          const url = exportMimeType
            ? `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportMimeType)}`
            : `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${auth.token}` },
            signal: AbortSignal.timeout(15000),
          })
          if (!res.ok) return { error: `Drive API: HTTP ${res.status}` }
          const text = await res.text()
          return { ok: true, content: text.slice(0, 50000), truncated: text.length > 50000 }
        } catch (err: unknown) {
          return { error: err instanceof Error ? err.message : String(err) }
        }
      },
    }),

    // ── Google Maps (API Key) ──────────────────────────────
    google_maps_geocode: tool({
      description: 'Convert an address to latitude/longitude coordinates, or reverse geocode coordinates to an address. Uses Google Maps Geocoding API (requires API key).',
      inputSchema: z.object({
        address: z.string().optional().describe('Address to geocode (e.g., "1600 Amphitheatre Parkway, Mountain View, CA")'),
        latlng: z.string().optional().describe('Coordinates for reverse geocoding (e.g., "40.714224,-73.961452")'),
      }),
      execute: async ({ address, latlng }) => {
        if (!address && !latlng) return { error: 'Provide either address or latlng' }
        const params = new URLSearchParams()
        if (address) params.set('address', address)
        if (latlng) params.set('latlng', latlng)
        const result = await keyFetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`)
        if (!result.ok) return { error: result.error }
        const d = result.data as any
        if (d.status !== 'OK') return { error: `Geocoding: ${d.status} — ${d.error_message || 'No results'}` }
        const results = (d.results || []).slice(0, 3).map((r: any) => ({
          formattedAddress: r.formatted_address,
          lat: r.geometry?.location?.lat,
          lng: r.geometry?.location?.lng,
          placeId: r.place_id,
          types: r.types,
        }))
        return { ok: true, results }
      },
    }),

    google_maps_directions: tool({
      description: 'Get directions between two locations. Returns route steps, distance, and duration. Uses Google Maps Directions API (requires API key).',
      inputSchema: z.object({
        origin: z.string().describe('Starting location (address or lat,lng)'),
        destination: z.string().describe('Ending location (address or lat,lng)'),
        mode: z.enum(['driving', 'walking', 'bicycling', 'transit']).default('driving'),
        alternatives: z.boolean().default(false).describe('Return alternative routes'),
      }),
      execute: async ({ origin, destination, mode, alternatives }) => {
        const params = new URLSearchParams({
          origin,
          destination,
          mode,
          alternatives: String(alternatives),
        })
        const result = await keyFetch(`https://maps.googleapis.com/maps/api/directions/json?${params}`)
        if (!result.ok) return { error: result.error }
        const d = result.data as any
        if (d.status !== 'OK') return { error: `Directions: ${d.status} — ${d.error_message || 'No route'}` }
        const routes = (d.routes || []).slice(0, 3).map((r: any) => {
          const leg = r.legs?.[0]
          return {
            summary: r.summary,
            distance: leg?.distance?.text,
            duration: leg?.duration?.text,
            startAddress: leg?.start_address,
            endAddress: leg?.end_address,
            steps: (leg?.steps || []).slice(0, 20).map((s: any) => ({
              instruction: s.html_instructions?.replace(/<[^>]*>/g, ''),
              distance: s.distance?.text,
              duration: s.duration?.text,
              travelMode: s.travel_mode,
            })),
          }
        })
        return { ok: true, routes }
      },
    }),

    google_maps_places_search: tool({
      description: 'Search for places near a location. Returns business names, addresses, ratings. Uses Google Maps Places API (requires API key).',
      inputSchema: z.object({
        query: z.string().describe('Search query (e.g., "pizza near Times Square")'),
        location: z.string().optional().describe('Center point as lat,lng (e.g., "40.758,-73.9855")'),
        radius: z.number().optional().describe('Search radius in meters (max 50000)'),
        type: z.string().optional().describe('Place type filter (e.g., "restaurant", "hospital", "gas_station")'),
      }),
      execute: async ({ query, location, radius, type }) => {
        const params = new URLSearchParams({ query })
        if (location) params.set('location', location)
        if (radius) params.set('radius', String(Math.min(radius, 50000)))
        if (type) params.set('type', type)
        const result = await keyFetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`)
        if (!result.ok) return { error: result.error }
        const d = result.data as any
        if (d.status !== 'OK' && d.status !== 'ZERO_RESULTS') {
          return { error: `Places: ${d.status} — ${d.error_message || 'Error'}` }
        }
        const places = (d.results || []).slice(0, 10).map((p: any) => ({
          name: p.name,
          address: p.formatted_address,
          rating: p.rating,
          userRatingsTotal: p.user_ratings_total,
          priceLevel: p.price_level,
          types: p.types?.slice(0, 5),
          placeId: p.place_id,
          lat: p.geometry?.location?.lat,
          lng: p.geometry?.location?.lng,
          openNow: p.opening_hours?.open_now,
        }))
        return { ok: true, places, count: places.length }
      },
    }),

    // ── YouTube Data API (API Key) ──────────────────────────────
    google_youtube_search: tool({
      description: 'Search YouTube videos. Returns video titles, channels, view counts. Uses YouTube Data API v3 (requires API key).',
      inputSchema: z.object({
        query: z.string().describe('Search query'),
        maxResults: z.number().default(5).describe('Number of results (max 25)'),
        order: z.enum(['relevance', 'date', 'viewCount', 'rating']).default('relevance'),
        type: z.enum(['video', 'channel', 'playlist']).default('video'),
      }),
      execute: async ({ query, maxResults, order, type }) => {
        const params = new URLSearchParams({
          part: 'snippet',
          q: query,
          maxResults: String(Math.min(maxResults, 25)),
          order,
          type,
        })
        const result = await keyFetch(`https://www.googleapis.com/youtube/v3/search?${params}`)
        if (!result.ok) return { error: result.error }
        const d = result.data as any
        const items = (d.items || []).map((item: any) => ({
          title: item.snippet?.title,
          description: item.snippet?.description?.slice(0, 200),
          channelTitle: item.snippet?.channelTitle,
          publishedAt: item.snippet?.publishedAt,
          videoId: item.id?.videoId,
          channelId: item.id?.channelId || item.snippet?.channelId,
          playlistId: item.id?.playlistId,
          thumbnail: item.snippet?.thumbnails?.medium?.url,
        }))
        return { ok: true, items, totalResults: d.pageInfo?.totalResults }
      },
    }),

    google_youtube_video_info: tool({
      description: 'Get detailed information about a YouTube video by ID. Returns title, description, view count, likes, duration. Uses YouTube Data API v3 (requires API key).',
      inputSchema: z.object({
        videoId: z.string().describe('YouTube video ID (e.g., "dQw4w9WgXcQ")'),
      }),
      execute: async ({ videoId }) => {
        const params = new URLSearchParams({
          part: 'snippet,statistics,contentDetails',
          id: videoId,
        })
        const result = await keyFetch(`https://www.googleapis.com/youtube/v3/videos?${params}`)
        if (!result.ok) return { error: result.error }
        const d = result.data as any
        const video = d.items?.[0]
        if (!video) return { error: 'Video not found' }
        return {
          ok: true,
          title: video.snippet?.title,
          description: video.snippet?.description?.slice(0, 1000),
          channelTitle: video.snippet?.channelTitle,
          publishedAt: video.snippet?.publishedAt,
          duration: video.contentDetails?.duration,
          viewCount: video.statistics?.viewCount,
          likeCount: video.statistics?.likeCount,
          commentCount: video.statistics?.commentCount,
          tags: video.snippet?.tags?.slice(0, 15),
          categoryId: video.snippet?.categoryId,
        }
      },
    }),

    // ── Google Translate (API Key) ──────────────────────────────
    google_translate_text: tool({
      description: 'Translate text between languages using Google Cloud Translation API (requires API key). Supports 100+ languages.',
      inputSchema: z.object({
        text: z.string().describe('Text to translate'),
        target: z.string().describe('Target language code (e.g., "es", "fr", "ja", "de", "zh")'),
        source: z.string().optional().describe('Source language code (auto-detected if omitted)'),
      }),
      execute: async ({ text, target, source }) => {
        const params = new URLSearchParams({ q: text, target })
        if (source) params.set('source', source)
        const result = await keyFetch(`https://translation.googleapis.com/language/translate/v2?${params}`)
        if (!result.ok) return { error: result.error }
        const d = result.data as any
        const translation = d.data?.translations?.[0]
        if (!translation) return { error: 'No translation returned' }
        return {
          ok: true,
          translatedText: translation.translatedText,
          detectedSourceLanguage: translation.detectedSourceLanguage,
          targetLanguage: target,
        }
      },
    }),
  }
}
