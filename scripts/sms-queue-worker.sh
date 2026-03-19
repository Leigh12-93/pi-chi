#!/bin/bash
# SMS Queue Worker — Polls pending_sms from CheapSkip Supabase and sends via modem outbox
# Runs via cron every minute

SUPABASE_URL="https://pocoystpkrdmobplazhd.supabase.co"
SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvY295c3Rwa3JkbW9icGxhemhkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDU3MDgyOSwiZXhwIjoyMDgwMTQ2ODI5fQ.BpcEHy46H52lWT8zojOAnF2mtkBej7imNT0wl0gOWOo"
OUTBOX_DIR="$HOME/.pi-chi/sms/outbox"
LOCKFILE="/tmp/sms-queue-worker.lock"

# Prevent concurrent runs
exec 200>"$LOCKFILE"
flock -n 200 || exit 0

mkdir -p "$OUTBOX_DIR"

# Fetch pending SMS
RESPONSE=$(curl -s \
  "${SUPABASE_URL}/rest/v1/pending_sms?status=eq.pending&order=created_at.asc&limit=10" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}")

# Check if we got any results
if [ -z "$RESPONSE" ] || [ "$RESPONSE" = "[]" ]; then
  exit 0
fi

# Process each pending SMS
echo "$RESPONSE" | python3 -c "
import json, sys, os, uuid
from datetime import datetime, timezone

data = json.load(sys.stdin)
if not isinstance(data, list):
    sys.exit(0)

outbox = os.environ.get('OUTBOX_DIR', os.path.expanduser('~/.pi-chi/sms/outbox'))
supabase_url = '${SUPABASE_URL}'
supabase_key = '${SUPABASE_KEY}'"

for sms in data:
    sms_id = sms.get('id', '')
    phone = sms.get('phone', '')
    message = sms.get('message', '')

    if not phone or not message:
        continue

    # Write to modem outbox
    outbox_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    payload = {
        'id': outbox_id,
        'to': phone,
        'body': message[:1600],
        'createdAt': now,
        'source': 'cheapskip-queue'
    }

    outbox_file = os.path.join(outbox, f'{outbox_id}.json')
    with open(outbox_file, 'w') as f:
        json.dump(payload, f, indent=2)

    # Mark as sent in Supabase
    import urllib.request
    req = urllib.request.Request(
        f'{supabase_url}/rest/v1/pending_sms?id=eq.{sms_id}',
        data=json.dumps({'status': 'sent', 'sent_at': now}).encode(),
        headers={
            'apikey': supabase_key,
            'Authorization': f'Bearer {supabase_key}',
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
        },
        method='PATCH'
    )
    try:
        urllib.request.urlopen(req)
        print(f'Queued SMS to {phone} ({outbox_id})')
    except Exception as e:
        print(f'Failed to update status for {sms_id}: {e}')
"
