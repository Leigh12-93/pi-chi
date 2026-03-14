#!/usr/bin/env python3
"""
Pi-Chi Tool Index — master catalog of all custom tools.
Provides search, categorization, and usage examples.
"""
import json
import os
import sys

TOOLS_DIR = os.path.expanduser("~/.pi-chi/tools")

# Category mappings
CATEGORIES = {
    "system": [
        "process_top", "cpu_throttle_check", "disk_health", "mem_breakdown",
        "service_status", "system_snapshot", "boot_time", "kernel_info",
        "thermal_zones", "whoami_full", "uptime_log", "cpu_bench",
        "sd_card_health", "dmesg_errors", "mount_info"
    ],
    "network": [
        "net_scan", "port_check", "net_speed", "dns_lookup", "wifi_info",
        "ping_monitor", "network_latency_log", "bandwidth_monitor",
        "health_check_url", "ssl_check", "traceroute_host", "ip_info",
        "network_connections", "arp_watch", "resolv_test", "network_reset"
    ],
    "security": [
        "auth_log_scan", "open_ports", "firewall_status", "firewall_manage",
        "iptables_raw", "random_password", "ssh_keys", "user_manage",
        "apt_security", "user_sessions"
    ],
    "data": [
        "metrics_log", "metrics_read", "csv_merge", "json_query",
        "watch_file", "log_rotate", "archive_extract", "clipboard_text",
        "temp_history"
    ],
    "hardware": [
        "gpio_blink", "i2c_scan", "gpio_pwm", "sensor_dht",
        "gpio_read_all", "color_led", "camera_capture", "usb_devices",
        "bluetooth_scan", "power_manage", "raspi_config"
    ],
    "external": [
        "weather", "astronomy", "fetch_url", "quote"
    ],
    "automation": [
        "cron_manage", "crontab_raw", "backup_state", "schedule_task",
        "screen_manage", "write_script", "run_script", "exec_raw"
    ],
    "admin": [
        "apt_manage", "pip_manage", "node_manage", "pkg_check",
        "systemd_manage", "systemd_timers", "config_edit",
        "hostname_set", "timezone_set", "locale_set",
        "permissions_fix", "sysctl_manage", "kernel_params",
        "swap_manage", "docker_ps", "git_clone", "git_info"
    ],
    "brain": [
        "brain_state", "brain_log", "self_restart", "auto_heal",
        "tool_index"
    ],
    "utility": [
        "calc", "countdown", "base64_tool", "hash_file", "regex_test",
        "qr_generate", "text_to_speech", "file_find", "filesystem_ops",
        "http_serve", "wake_on_lan", "env_dump", "ntp_check",
        "syslog_tail", "journal_errors", "disk_alert", "process_kill"
    ]
}

# Usage examples
EXAMPLES = {
    "process_top": "custom_process_top({sort_by: 'cpu', limit: 10})",
    "system_snapshot": "custom_system_snapshot()",
    "net_scan": "custom_net_scan({subnet: '192.168.8'})",
    "weather": "custom_weather({latitude: '-34.93', longitude: '138.60'})",
    "auto_heal": "custom_auto_heal({mode: 'diagnose'})",
    "metrics_log": "custom_metrics_log({file: 'temps.csv', values: '42.5,780', header: 'temp_c,mem_mb'})",
    "exec_raw": "custom_exec_raw({command: 'ls -la /home/pi'})",
    "apt_manage": "custom_apt_manage({action: 'install', packages: 'htop'})",
    "self_restart": "custom_self_restart({mode: 'brain'})",
    "brain_state": "custom_brain_state({action: 'goals', target: 'goals'})",
    "systemd_manage": "custom_systemd_manage({action: 'restart', service: 'pi-chi-brain'})",
    "write_script": "custom_write_script({filepath: '/home/pi/.pi-chi/data/test.sh', content: '#!/bin/bash\\necho hello', executable: 'yes'})",
    "gpio_blink": "custom_gpio_blink({pin: 17, count: 5, delay_ms: 200})",
    "ssl_check": "custom_ssl_check({domain: 'google.com'})",
    "health_check_url": "custom_health_check_url({urls: 'https://example.com,https://api.example.com'})",
    "firewall_manage": "custom_firewall_manage({action: 'allow', rule: '22/tcp'})",
    "config_edit": "custom_config_edit({action: 'read', file: '/home/pi/pi-chi/.env', key: 'none', value: 'none'})",
    "backup_state": "custom_backup_state({label: 'pre-update'})",
    "tool_index": "custom_tool_index({action: 'search', query: 'network'})",
}


def load_all_tools():
    """Load all tool manifests."""
    tools = {}
    if not os.path.isdir(TOOLS_DIR):
        return tools
    for entry in sorted(os.listdir(TOOLS_DIR)):
        manifest_path = os.path.join(TOOLS_DIR, entry, "manifest.json")
        if os.path.isfile(manifest_path):
            try:
                with open(manifest_path) as f:
                    manifest = json.load(f)
                tools[manifest.get("name", entry)] = manifest
            except:
                pass
    return tools


def get_category(tool_name):
    """Find which category a tool belongs to."""
    for cat, members in CATEGORIES.items():
        if tool_name in members:
            return cat
    return "uncategorized"


def main():
    action = sys.argv[1]
    query = sys.argv[2] if len(sys.argv) > 2 else "all"
    tools = load_all_tools()

    if action == "count":
        print(f"=== Pi-Chi Tool Library ===")
        print(f"Total tools: {len(tools)}")
        print()
        for cat, members in sorted(CATEGORIES.items()):
            actual = [m for m in members if m in tools]
            print(f"  {cat:15s}: {len(actual)} tools")
        uncategorized = [t for t in tools if get_category(t) == "uncategorized"]
        if uncategorized:
            print(f"  {'uncategorized':15s}: {len(uncategorized)} tools")
            for t in uncategorized:
                print(f"    - {t}")

    elif action == "list":
        print(f"=== All {len(tools)} Custom Tools ===")
        for name, manifest in sorted(tools.items()):
            cat = get_category(name)
            desc = manifest.get("description", "No description")
            params = list(manifest.get("parameters", {}).keys())
            param_str = f"({', '.join(params)})" if params else "(no params)"
            print(f"  custom_{name:25s} [{cat:10s}] {desc[:60]}")

    elif action == "search":
        query_lower = query.lower()
        matches = []
        for name, manifest in tools.items():
            desc = manifest.get("description", "").lower()
            if query_lower in name.lower() or query_lower in desc:
                matches.append((name, manifest))

        if not matches:
            print(f"No tools matching '{query}'")
            return

        print(f"=== {len(matches)} tools matching '{query}' ===")
        for name, manifest in matches:
            cat = get_category(name)
            desc = manifest.get("description", "")
            params = manifest.get("parameters", {})
            print(f"\ncustom_{name} [{cat}]")
            print(f"  {desc}")
            if params:
                for pname, pdef in params.items():
                    print(f"    {pname} ({pdef.get('type','?')}): {pdef.get('description','')}")
            if name in EXAMPLES:
                print(f"  Example: {EXAMPLES[name]}")

    elif action == "category":
        if query in CATEGORIES:
            members = CATEGORIES[query]
            print(f"=== Category: {query} ({len(members)} tools) ===")
            for name in members:
                if name in tools:
                    desc = tools[name].get("description", "")
                    print(f"  custom_{name:25s} {desc[:60]}")
                else:
                    print(f"  custom_{name:25s} [NOT INSTALLED]")
        else:
            print(f"Available categories: {', '.join(sorted(CATEGORIES.keys()))}")

    elif action == "describe":
        if query in tools:
            m = tools[query]
            print(f"=== custom_{query} ===")
            print(f"Description: {m.get('description', 'N/A')}")
            print(f"Category: {get_category(query)}")
            print(f"Command: {m.get('command', 'N/A')[:100]}")
            params = m.get("parameters", {})
            if params:
                print(f"\nParameters:")
                for pname, pdef in params.items():
                    print(f"  {pname} ({pdef.get('type', '?')}): {pdef.get('description', '')}")
            if query in EXAMPLES:
                print(f"\nExample: {EXAMPLES[query]}")

            # Check if script exists
            tool_dir = os.path.join(TOOLS_DIR, query)
            scripts = [f for f in os.listdir(tool_dir) if f != "manifest.json"]
            if scripts:
                print(f"\nFiles: {', '.join(scripts)}")
        else:
            print(f"Tool '{query}' not found. Use action='search' to find tools.")

    else:
        print("Actions: list, search, category, describe, count")


if __name__ == "__main__":
    main()
