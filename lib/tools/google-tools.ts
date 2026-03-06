import { tool } from 'ai'
import { z } from 'zod'
import type { ToolContext } from './types'
import { getGoogleCredentials } from '@/lib/google-auth'

export function createGoogleTools(ctx: ToolContext) {
  const { githubUsername } = ctx

  async function getToken(): Promise<{ token: string } | { error: string }> {
    if (!githubUsername) return { error: 'No session — Google tools require authentication' }
    const result = await getGoogleCredentials(githubUsername)
    if (result.error || !result.credentials) return { error: result.error || 'No credentials' }
    return { token: result.credentials.accessToken }
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
  }
}
