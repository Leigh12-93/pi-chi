/* ─── Provider Search API — find skip providers by postcode ──── */

import { NextRequest, NextResponse } from 'next/server'
import { cheapskipSupabase } from '@/lib/cheapskip-supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const postcode = req.nextUrl.searchParams.get('postcode')

  if (!postcode) {
    return NextResponse.json({ error: 'postcode required' }, { status: 400 })
  }

  // Find provider IDs that service this postcode
  const { data: postcodeRows, error: pcErr } = await cheapskipSupabase
    .from('provider_service_postcodes')
    .select('provider_id')
    .eq('postcode', postcode)

  if (pcErr) {
    console.error('[providers] Postcode query error:', pcErr)
    return NextResponse.json({ error: pcErr.message }, { status: 500 })
  }

  if (!postcodeRows || postcodeRows.length === 0) {
    return NextResponse.json({ providers: [] })
  }

  const providerIds = [...new Set(postcodeRows.map(r => r.provider_id))]

  // Fetch active provider details
  const { data: providers, error: provErr } = await cheapskipSupabase
    .from('providers')
    .select('id, name, phone, slug')
    .in('id', providerIds)
    .eq('active', true)

  if (provErr) {
    console.error('[providers] Provider query error:', provErr)
    return NextResponse.json({ error: provErr.message }, { status: 500 })
  }

  return NextResponse.json({ providers: providers || [] })
}
