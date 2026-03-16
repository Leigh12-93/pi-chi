/* ─── Send Booking API — SMS to skip provider ────────────────── */

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { queueSmsChecked } from '@/lib/brain/brain-sms'

export const dynamic = 'force-dynamic'

interface BookingPayload {
  customer_name: string
  phone: string
  address: string
  postcode: string
  bin_size: string
  pickup_date: string
  provider_id: string
  provider_mobile: string
  provider_name: string
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as BookingPayload

    const { customer_name, phone, address, bin_size, pickup_date, provider_id, provider_mobile, provider_name } = body

    if (!customer_name || !phone || !address || !bin_size || !pickup_date || !provider_id || !provider_mobile) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Insert lead into skip_leads
    const { data: lead, error: leadErr } = await supabase
      .from('skip_leads')
      .insert({
        customer_name,
        phone,
        address,
        postcode: body.postcode,
        bin_size,
        pickup_date,
        provider_id,
        provider_name: provider_name || '',
        status: 'pending',
      })
      .select('id')
      .single()

    if (leadErr) {
      console.error('[send-booking] Failed to insert lead:', leadErr)
      return NextResponse.json({ error: 'Failed to save booking', detail: leadErr.message }, { status: 500 })
    }

    // Format and send SMS to provider
    const sms = `New booking from ${customer_name} ${phone} ${address} - ${bin_size} bin pickup ${pickup_date}. Reply to confirm or call customer.`

    const result = queueSmsChecked(provider_mobile, sms, 'booking')

    return NextResponse.json({
      ok: true,
      lead_id: lead?.id,
      sms_queued: result.queued,
      sms_message: result.message,
    })
  } catch (err) {
    console.error('[send-booking] Error:', err)
    return NextResponse.json({ error: 'Internal error', detail: String(err) }, { status: 500 })
  }
}
