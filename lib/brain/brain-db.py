#!/usr/bin/env python3
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path


def now_expr():
    return "strftime('%Y-%m-%dT%H:%M:%fZ','now')"


def connect(db_path: str) -> sqlite3.Connection:
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(
        f"""
        CREATE TABLE IF NOT EXISTS profile (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            name TEXT NOT NULL,
            owner_name TEXT,
            birth_timestamp TEXT,
            voice TEXT,
            temperament TEXT,
            updated_at TEXT NOT NULL DEFAULT ({now_expr()})
        );
        CREATE TABLE IF NOT EXISTS personality_traits (
            trait TEXT PRIMARY KEY,
            position INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS persona_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rule_type TEXT NOT NULL,
            content TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS operator_preferences (
            pref_key TEXT PRIMARY KEY,
            pref_value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS mission_snapshot (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            mission_id TEXT,
            title TEXT,
            rationale TEXT,
            progress_label TEXT,
            status TEXT,
            updated_at TEXT NOT NULL DEFAULT ({now_expr()})
        );
        CREATE TABLE IF NOT EXISTS goals (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            status TEXT NOT NULL,
            priority TEXT NOT NULL,
            priority_rank INTEGER NOT NULL,
            horizon TEXT,
            reasoning TEXT,
            success_metric TEXT,
            verification_method TEXT,
            created_at TEXT,
            completed_at TEXT,
            updated_at TEXT NOT NULL DEFAULT ({now_expr()})
        );
        CREATE TABLE IF NOT EXISTS goal_tasks (
            id TEXT PRIMARY KEY,
            goal_id TEXT NOT NULL,
            title TEXT NOT NULL,
            status TEXT NOT NULL,
            result TEXT,
            goal_priority_rank INTEGER NOT NULL DEFAULT 9,
            position INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL DEFAULT ({now_expr()}),
            FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS memories (
            id TEXT PRIMARY KEY,
            mem_key TEXT,
            content TEXT NOT NULL,
            importance TEXT NOT NULL,
            created_at TEXT,
            last_accessed_at TEXT,
            access_count INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS activity_events (
            id TEXT PRIMARY KEY,
            ts TEXT NOT NULL,
            event_type TEXT NOT NULL,
            message TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_activity_events_ts ON activity_events(ts DESC);
        CREATE TABLE IF NOT EXISTS reasoning_snapshots (
            id TEXT PRIMARY KEY,
            summary TEXT NOT NULL,
            why TEXT,
            next_step TEXT,
            mode TEXT,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_reasoning_snapshots_created_at
          ON reasoning_snapshots(created_at DESC);
        """
    )
    conn.commit()


def priority_rank(priority: str) -> int:
    return {"high": 0, "medium": 1, "low": 2}.get((priority or "").lower(), 9)


def replace_table(conn: sqlite3.Connection, table: str) -> None:
    conn.execute(f"DELETE FROM {table}")


def sync_from_snapshot(conn: sqlite3.Connection, snapshot_path: str) -> None:
    payload = json.loads(Path(snapshot_path).read_text(encoding="utf-8"))

    profile = payload.get("profile") or {}
    conn.execute(
        """
        INSERT INTO profile (id, name, owner_name, birth_timestamp, voice, temperament, updated_at)
        VALUES (1, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        ON CONFLICT(id) DO UPDATE SET
            name=excluded.name,
            owner_name=excluded.owner_name,
            birth_timestamp=excluded.birth_timestamp,
            voice=excluded.voice,
            temperament=excluded.temperament,
            updated_at=excluded.updated_at
        """,
        (
            profile.get("name") or "Pi-Chi",
            profile.get("ownerName"),
            profile.get("birthTimestamp"),
            profile.get("voice") or "direct, first-person, concise",
            profile.get("temperament") or "curious and pragmatic",
        ),
    )

    replace_table(conn, "personality_traits")
    for index, trait in enumerate(payload.get("traits") or []):
        conn.execute(
            "INSERT INTO personality_traits (trait, position) VALUES (?, ?)",
            (str(trait), index),
        )

    replace_table(conn, "persona_rules")
    for rule_type, rows in {
        "value": payload.get("values") or [],
        "style": payload.get("styleRules") or [],
    }.items():
        for row in rows:
            conn.execute(
                "INSERT INTO persona_rules (rule_type, content) VALUES (?, ?)",
                (rule_type, str(row)),
            )

    replace_table(conn, "operator_preferences")
    for key, value in (payload.get("operatorPreferences") or {}).items():
        conn.execute(
            "INSERT INTO operator_preferences (pref_key, pref_value) VALUES (?, ?)",
            (str(key), json.dumps(value, ensure_ascii=False)),
        )

    mission = payload.get("mission") or {}
    conn.execute(
        """
        INSERT INTO mission_snapshot (id, mission_id, title, rationale, progress_label, status, updated_at)
        VALUES (1, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        ON CONFLICT(id) DO UPDATE SET
            mission_id=excluded.mission_id,
            title=excluded.title,
            rationale=excluded.rationale,
            progress_label=excluded.progress_label,
            status=excluded.status,
            updated_at=excluded.updated_at
        """,
        (
            mission.get("id"),
            mission.get("title"),
            mission.get("rationale"),
            mission.get("progressLabel"),
            mission.get("status"),
        ),
    )

    replace_table(conn, "goals")
    replace_table(conn, "goal_tasks")
    for goal in payload.get("goals") or []:
        rank = priority_rank(goal.get("priority"))
        conn.execute(
            """
            INSERT INTO goals (
                id, title, status, priority, priority_rank, horizon,
                reasoning, success_metric, verification_method,
                created_at, completed_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
            """,
            (
                goal.get("id"),
                goal.get("title"),
                goal.get("status"),
                goal.get("priority"),
                rank,
                goal.get("horizon"),
                goal.get("reasoning"),
                goal.get("successMetric"),
                goal.get("verificationMethod"),
                goal.get("createdAt"),
                goal.get("completedAt"),
            ),
        )
        for position, task in enumerate(goal.get("tasks") or []):
            task_title = task.get("title") or task.get("description")
            if not task_title:
                continue  # skip tasks with no title or description
            conn.execute(
                """
                INSERT INTO goal_tasks (
                    id, goal_id, title, status, result, goal_priority_rank, position, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
                """,
                (
                    task.get("id"),
                    goal.get("id"),
                    task_title,
                    task.get("status") or "pending",
                    task.get("result") or "",
                    rank,
                    position,
                ),
            )

    replace_table(conn, "memories")
    for mem in payload.get("memories") or []:
        if not mem.get("content"):
            continue  # skip memories with null/empty content
        conn.execute(
            """
            INSERT INTO memories (
                id, mem_key, content, importance, created_at, last_accessed_at, access_count
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                mem.get("id"),
                mem.get("key"),
                mem.get("content"),
                mem.get("importance"),
                mem.get("createdAt"),
                mem.get("lastAccessedAt"),
                int(mem.get("accessCount") or 0),
            ),
        )

    replace_table(conn, "activity_events")
    for event in payload.get("activityEvents") or []:
        ts = event.get("time") or event.get("timestamp")
        if not ts:
            ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
        event_type = event.get("type") or "unknown"
        message = event.get("message") or ""
        event_id = event.get("id")
        if not event_id:
            continue  # skip events with no id
        conn.execute(
            "INSERT INTO activity_events (id, ts, event_type, message) VALUES (?, ?, ?, ?)",
            (event_id, ts, event_type, message),
        )

    snapshot = payload.get("reasoningSnapshot") or {}
    if snapshot.get("summary"):
        conn.execute(
            """
            INSERT OR REPLACE INTO reasoning_snapshots (id, summary, why, next_step, mode, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                snapshot.get("id"),
                snapshot.get("summary"),
                snapshot.get("why"),
                snapshot.get("nextStep"),
                snapshot.get("mode"),
                snapshot.get("createdAt"),
            ),
        )
        conn.execute(
            """
            DELETE FROM reasoning_snapshots
            WHERE id NOT IN (
              SELECT id FROM reasoning_snapshots
              ORDER BY created_at DESC
              LIMIT 120
            )
            """
        )

    conn.commit()


def blurb(conn: sqlite3.Connection, kind: str) -> str:
    latest = conn.execute(
        "SELECT summary, why, next_step, mode FROM reasoning_snapshots ORDER BY created_at DESC LIMIT 1"
    ).fetchone()
    mission = conn.execute(
        "SELECT title, rationale, progress_label FROM mission_snapshot WHERE id = 1"
    ).fetchone()
    goal = conn.execute(
        """
        SELECT title, reasoning FROM goals
        WHERE status = 'active'
        ORDER BY priority_rank, updated_at DESC
        LIMIT 1
        """
    ).fetchone()
    task = conn.execute(
        """
        SELECT title FROM goal_tasks
        WHERE status IN ('pending', 'running')
        ORDER BY goal_priority_rank, position, updated_at DESC
        LIMIT 1
        """
    ).fetchone()

    if kind == "why":
        return (latest["why"] if latest and latest["why"] else None) or (
            mission["rationale"] if mission and mission["rationale"] else None
        ) or (goal["reasoning"] if goal and goal["reasoning"] else "") or ""
    if kind == "next":
        return (latest["next_step"] if latest and latest["next_step"] else None) or (
            task["title"] if task else ""
        )
    if kind == "mode":
        return (latest["mode"] if latest and latest["mode"] else "") or ""

    return (latest["summary"] if latest and latest["summary"] else None) or (
        mission["title"] if mission and mission["title"] else None
    ) or (goal["title"] if goal else "") or ""


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        print("usage: brain-db.py <init|sync|blurb> <db_path> [snapshot_path|kind]", file=sys.stderr)
        return 1

    cmd = argv[1]
    db_path = argv[2]
    conn = connect(db_path)
    init_db(conn)

    if cmd == "init":
        return 0
    if cmd == "sync":
        if len(argv) < 4:
            print("sync requires snapshot path", file=sys.stderr)
            return 1
        sync_from_snapshot(conn, argv[3])
        return 0
    if cmd == "blurb":
        kind = argv[3] if len(argv) > 3 else "idle"
        print(blurb(conn, kind))
        return 0

    print(f"unknown command: {cmd}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
