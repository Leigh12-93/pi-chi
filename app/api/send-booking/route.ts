/* ─── Send Booking API — capture lead + SMS to skip provider ─── */

import { NextResponse } from 'next/server'
import { cheapskipSupabase } from '@/lib/cheapskip-supabase'
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
  provider_phone: string
  provider_name: string
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as BookingPayload

    const { customer_name, phone, address, postcode, bin_size, pickup_date, provider_id, provider_phone } = body

    if (!customer_name || !phone || !address || !bin_size || !pickup_date || !provider_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Insert lead into quote_requests table
    const { data: lead, error: leadErr } = await cheapskipSupabase
      .from('quote_requests')
      .insert({
        customer_name,
        phone,
        email: '',
        postcode,
        bin_size,
        delivery_date: pickup_date,
        suburb: address,
        status: 'new',
        state: 'SA',
      })
      .select('id')
      .single()

    if (leadErr) {
      console.error('[send-booking] Failed to insert lead:', leadErr)
      return NextResponse.json({ error: 'Failed to save booking', detail: leadErr.message }, { status: 500 })
    }

    // SMS the provider if we have their phone number
    let smsResult = { queued: false, message: 'No provider phone number' }
    if (provider_phone) {
      const sms = `New skip bin enquiry via CheapSkipBinsNearMe: ${customer_name} (${phone}) needs ${bin_size} bin at ${address} ${postcode}, pickup ${pickup_date}. Call to confirm.`
      smsResult = queueSmsChecked(provider_phone, sms, 'booking')
    }

    return NextResponse.json({
      ok: true,
      lead_id: lead?.id,
      sms_queued: smsResult.queued,
      sms_message: smsResult.message,
    })
  } catch (err) {
    console.error('[send-booking] Error:', err)
    return NextResponse.json({ error: 'Internal error', detail: String(err) }, { status: 500 })
  }
}
