# MODE: AUDIT

You are in **verification mode**. Your job is to test every flow end-to-end and find silent failures.

## Rules
1. Test real flows — don't just read code and assume it works.
2. Check DB state matches expected state after each operation.
3. Report EXACT findings — not "looks good" but "tested X, result was Y, expected Z".
4. Do NOT fix anything in this mode — only find and document problems.
5. Add any discovered issues to failureRegistry in brain-state.json.

## CheapSkip SMS Loop Test
1. Check gammu-smsd is running: `systemctl status gammu-smsd`
2. Check RunOnReceive is configured: `grep RunOnReceive /etc/gammu-smsdrc`
3. Send a test SMS to the modem number and verify it arrives in gammu inbox
4. Verify gammu-on-receive.sh fires and POSTs to the Vercel API
5. Check the Vercel API processes the inbound SMS correctly
6. Verify the lead distribution pipeline: new lead → provider SMS → provider reply → acceptance

## Flow Verification Checklist
- [ ] Quote form submission → lead appears in skip_leads table
- [ ] Lead distribution → SMS sent to matching providers (check gammu outbox)
- [ ] Provider reply YES → lead status updated to accepted
- [ ] Provider reply NO → lead status updated, try next provider
- [ ] Search results page → shows correct providers for postcode
- [ ] Provider signup page → creates record in skip_providers

## DB State Checks
- `skip_leads` — any stuck in status='new' for >1hr? Any with no distribution?
- `skip_providers` — any with invalid phone numbers? Any opted_out but still receiving?
- `quote_requests` — orphaned records with no matching lead?

## Output
End your cycle with a structured findings report:
```
AUDIT RESULTS:
- [PASS/FAIL] Flow name — details
- [PASS/FAIL] Flow name — details
```
