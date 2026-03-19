#!/usr/bin/env python3
"""
Provider Outreach v2 — Fetch pending providers from BinHireAU Supabase,
dedup against sms-audit.jsonl, send SMS via ~/sms-send.sh, update DB.

Usage:  python3 tools/provider_outreach/outreach_v2.py
Env:    CHEAPSKIP_SUPABASE_URL, CHEAPSKIP_SUPABASE_SERVICE_ROLE_KEY
"""

import json
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# ── Config ──────────────────────────────────────────────────────────
BATCH_SIZE = 15
COOLDOWN_DAYS = 7
MAX_CONTACTS = 3
PI_CHI_DIR = Path.home() / ".pi-chi"
SMS_AUDIT_FILE = PI_CHI_DIR / "sms-audit.jsonl"
DEDUP_LOG_FILE = PI_CHI_DIR / "outreach-dedup.jsonl"
SMS_SEND_SCRIPT = Path.home() / "sms-send.sh"

SUPABASE_URL = os.environ.get("CHEAPSKIP_SUPABASE_URL", "").strip()
SUPABASE_KEY = os.environ.get("CHEAPSKIP_SUPABASE_SERVICE_ROLE_KEY", "").strip()

OUTREACH_MESSAGE = (
    "Hi {name}, Bin Hire Australia.com.au here. "
    "We send verified skip bin leads to local providers for $2/lead. "
    "No upfront fees. Interested? Reply YES or call Leigh 0481274420."
)


def die(msg: str) -> None:
    print(f"[FATAL] {msg}", file=sys.stderr)
    sys.exit(1)


# ── Supabase via curl (PostgREST) ──────────────────────────────────
def supabase_get(table: str, params: str) -> list[dict]:
    """GET rows from Supabase PostgREST."""
    url = f"{SUPABASE_URL}/rest/v1/{table}?{params}"
    result = subprocess.run(
        ["curl", "-s", "-X", "GET", url,
         "-H", f"apikey: {SUPABASE_KEY}",
         "-H", f"Authorization: Bearer {SUPABASE_KEY}",
         "-H", "Accept: application/json"],
        capture_output=True, text=True, timeout=30,
    )
    if result.returncode != 0:
        die(f"curl GET failed: {result.stderr}")
    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError:
        die(f"Bad JSON from Supabase: {result.stdout[:200]}")
    if isinstance(data, dict) and "message" in data:
        die(f"Supabase error: {data}")
    return data


def supabase_patch(table: str, match_params: str, body: dict) -> bool:
    """PATCH (update) rows in Supabase PostgREST."""
    url = f"{SUPABASE_URL}/rest/v1/{table}?{match_params}"
    result = subprocess.run(
        ["curl", "-s", "-X", "PATCH", url,
         "-H", f"apikey: {SUPABASE_KEY}",
         "-H", f"Authorization: Bearer {SUPABASE_KEY}",
         "-H", "Content-Type: application/json",
         "-H", "Prefer: return=minimal",
         "-d", json.dumps(body)],
        capture_output=True, text=True, timeout=30,
    )
    return result.returncode == 0 and result.stderr == ""


# ── Phone normalization ─────────────────────────────────────────────
def normalize_phone(phone: str) -> str:
    phone = phone.strip().replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
    if phone.startswith("04") and len(phone) == 10:
        phone = "+61" + phone[1:]
    if not phone.startswith("+"):
        phone = "+" + phone
    return phone


# ── Dedup logic ─────────────────────────────────────────────────────
def load_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    entries = []
    for line in path.read_text().strip().splitlines():
        try:
            entries.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return entries


def check_dedup(phone: str) -> tuple[bool, str, int]:
    """Returns (clear_to_send, reason, outreach_count)."""
    norm = normalize_phone(phone)
    now = datetime.now(timezone.utc)
    cooldown = timedelta(days=COOLDOWN_DAYS)

    audit_entries = load_jsonl(SMS_AUDIT_FILE)
    dedup_entries = load_jsonl(DEDUP_LOG_FILE)

    # Gather all sent timestamps for this phone
    timestamps = []
    for e in audit_entries:
        if e.get("action") == "sent" and normalize_phone(e.get("to", "")) == norm:
            src = e.get("source", "")
            if "outreach" in src:
                try:
                    timestamps.append(datetime.fromisoformat(e["timestamp"]))
                except (ValueError, KeyError):
                    pass

    for e in dedup_entries:
        if e.get("decision") == "sent" and normalize_phone(e.get("phone", "")) == norm:
            try:
                timestamps.append(datetime.fromisoformat(e["timestamp"]))
            except (ValueError, KeyError):
                pass

    # Deduplicate timestamps within 5 min
    timestamps.sort()
    unique: list[datetime] = []
    for ts in timestamps:
        if not unique or (ts - unique[-1]).total_seconds() > 300:
            unique.append(ts)

    count = len(unique)

    if count >= MAX_CONTACTS:
        return False, f"contacted {count}x (max {MAX_CONTACTS})", count

    recent = [ts for ts in unique if now - ts < cooldown]
    if recent:
        days_ago = round((now - recent[-1]).total_seconds() / 86400, 1)
        return False, f"contacted {days_ago}d ago (cooldown {COOLDOWN_DAYS}d)", count

    return True, f"clear ({count} prior)", count


def log_dedup(phone: str, name: str, decision: str, reason: str, count: int) -> None:
    PI_CHI_DIR.mkdir(parents=True, exist_ok=True)
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "phone": phone,
        "provider_name": name,
        "decision": decision,
        "reason": reason,
        "outreach_count": count,
    }
    with open(DEDUP_LOG_FILE, "a") as f:
        f.write(json.dumps(entry) + "\n")


def log_audit(phone: str, message: str, action: str, reason: str) -> None:
    PI_CHI_DIR.mkdir(parents=True, exist_ok=True)
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "to": phone,
        "message": message,
        "action": action,
        "reason": reason,
        "source": "cron-outreach-v2",
    }
    with open(SMS_AUDIT_FILE, "a") as f:
        f.write(json.dumps(entry) + "\n")


# ── SMS sending ─────────────────────────────────────────────────────
def send_sms(phone: str, body: str) -> tuple[bool, str]:
    """Send SMS via ~/sms-send.sh. Returns (success, detail)."""
    if not SMS_SEND_SCRIPT.exists():
        return False, f"sms-send.sh not found at {SMS_SEND_SCRIPT}"
    try:
        result = subprocess.run(
            ["bash", str(SMS_SEND_SCRIPT), phone, body],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode == 0:
            return True, result.stdout.strip()
        else:
            return False, result.stderr.strip() or result.stdout.strip() or "exit code " + str(result.returncode)
    except subprocess.TimeoutExpired:
        return False, "sms-send.sh timed out (30s)"
    except Exception as e:
        return False, str(e)


# ── Main ────────────────────────────────────────────────────────────
def main() -> None:
    if not SUPABASE_URL or not SUPABASE_KEY:
        die("Missing CHEAPSKIP_SUPABASE_URL or CHEAPSKIP_SUPABASE_SERVICE_ROLE_KEY")

    # Fetch pending providers with phone numbers
    params = (
        "select=id,name,phone,outreach_status,outreach_count,outreach_date"
        "&outreach_status=eq.pending"
        "&phone=not.is.null"
        f"&limit={BATCH_SIZE}"
        "&order=created_at.asc"
    )
    providers = supabase_get("providers", params)

    if not providers:
        print("[outreach_v2] No pending providers found.")
        sys.exit(1)

    print(f"[outreach_v2] Fetched {len(providers)} pending providers")

    sent = 0
    skipped = 0
    errors = 0
    skip_reasons: dict[str, int] = {}

    for p in providers:
        pid = p.get("id")
        name = p.get("name", "there")
        phone = p.get("phone", "")

        if not phone:
            skipped += 1
            skip_reasons["no_phone"] = skip_reasons.get("no_phone", 0) + 1
            continue

        norm_phone = normalize_phone(phone)

        # Dedup check
        clear, reason, count = check_dedup(norm_phone)
        if not clear:
            log_dedup(norm_phone, name, "blocked", reason, count)
            print(f"  SKIP  {name} ({norm_phone}): {reason}")
            skipped += 1
            skip_reasons[reason.split("(")[0].strip()] = skip_reasons.get(reason.split("(")[0].strip(), 0) + 1
            continue

        # Build message
        display_name = name.split(" ")[0] if name and name != "there" else "there"
        message = OUTREACH_MESSAGE.format(name=display_name)

        # Send SMS
        ok, detail = send_sms(norm_phone, message)
        if ok:
            print(f"  SENT  {name} ({norm_phone}): {detail}")
            log_dedup(norm_phone, name, "sent", "outreach_v2", count + 1)
            log_audit(norm_phone, message, "sent", "outreach_v2")

            # Update Supabase
            now_iso = datetime.now(timezone.utc).isoformat()
            current_count = p.get("outreach_count") or 0
            patch_ok = supabase_patch(
                "providers",
                f"id=eq.{pid}",
                {
                    "outreach_status": "contacted",
                    "outreach_count": current_count + 1,
                    "outreach_date": now_iso,
                },
            )
            if not patch_ok:
                print(f"  WARN  DB update failed for {name} (id={pid}), SMS was sent")
            sent += 1
        else:
            print(f"  ERR   {name} ({norm_phone}): {detail}")
            log_audit(norm_phone, message, "blocked", f"send_failed: {detail}")
            errors += 1

    # Summary
    print()
    print("=" * 50)
    print(f"[outreach_v2] SUMMARY")
    print(f"  Sent:    {sent}")
    print(f"  Skipped: {skipped}")
    if skip_reasons:
        for reason, count in skip_reasons.items():
            print(f"    - {reason}: {count}")
    print(f"  Errors:  {errors}")
    print("=" * 50)

    sys.exit(0 if sent >= 1 else 1)


if __name__ == "__main__":
    main()
