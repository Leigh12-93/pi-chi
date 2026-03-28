#!/bin/bash
# Journal error scanner for Pi-Chi brain cycles.
# Called via execSync each cycle — edits here take effect immediately
# without requiring a brain service restart.

journalctl -u pi-chi-brain -n 200 --no-pager -o short-iso 2>/dev/null \
  | grep -iE "error|warn|crash|exception|oom|kill|fail|SEGV|panic|traceback|unhandled" \
  | grep -vE "0 errors|crash counter|Crash counter|[Ww]ake cycle|counter: 0|counter:0" \
  | grep -vE "CLAUDE cycle complete|journal errors|No .* errors|No .* failures" \
  | grep -vE "FIX audit found nothing|Auto-journal:|productive \(" \
  | grep -vE "Pipeline is clean|Pipeline is clear|nothing broken" \
  | grep -vE "false.positiv|filter.*false|properly filtering" \
  | grep -vE "No real errors|no real errors|No unresolved|No active errors" \
  | grep -vE "Response:.*errors.*logs" \
  | grep -vE "Response:.*no real err|Response:.*nothing broken|Response:.*pipeline.*clean" \
  | grep -vE "Response:.*0 (stuck|failed|error)|Response:.*expected\)" \
  | grep -vE "Journal scan.*0 real|Journal scan.*false.positiv" \
  | grep -vE "CLAUDE cycle complete.*Response:" \
  | tail -20
