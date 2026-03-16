/* ─── Provider Search API — find skip providers by postcode ──── */

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const postcode = req.nextUrl.searchParams.get('postcode')

  if (!postcode) {
    return NextResponse.json({ error: 'postcode required' }, { status: 400 })
  }

  // Query skip_providers where postcodes array contains this postcode
  const { data, error } = await supabase
    .from('skip_providers')
    .select('id, name, mobile_number, postcodes')
    .contains('postcodes', [postcode])

  if (error) {
    console.error('[providers] Query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ providers: data || [] })
}
