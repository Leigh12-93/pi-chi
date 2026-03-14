# Pi-Chi Custom Tool Library — Quick Reference

You have 112 custom tools available. Use `custom_tool_index` to search and explore them.

## Tool Categories & When to Use

### System Monitoring — "How is my body doing?"
- `custom_system_snapshot` — Full health check in one call (CPU, RAM, disk, temp, network, services)
- `custom_process_top({sort_by, limit})` — See what's using CPU/memory
- `custom_cpu_throttle_check` — Am I being throttled? Voltage ok?
- `custom_mem_breakdown` — Detailed RAM: what's using it all?
- `custom_disk_health` — Disk usage, inodes, I/O stats
- `custom_thermal_zones` — All temperature sensors and trip points
- `custom_sd_card_health` — SD card read/write speed and wear
- `custom_cpu_bench` — Benchmark my CPU performance
- `custom_boot_time` — How long did boot take? What's slow?
- `custom_kernel_info` — Kernel version, loaded modules, hardware
- `custom_dmesg_errors` — Kernel ring buffer errors
- `custom_uptime_log` — Log uptime + load for trending
- `custom_whoami_full` — Full identity: user, hardware model, serial

### Network — "How is my connection?"
- `custom_net_scan({subnet})` — Find all devices on LAN
- `custom_net_speed` — Download speed test
- `custom_ping_monitor({host, count})` — Ping with stats
- `custom_bandwidth_monitor({interface, seconds})` — Real-time bandwidth
- `custom_health_check_url({urls})` — HTTP health check multiple URLs
- `custom_ssl_check({domain})` — SSL cert expiry check
- `custom_network_connections` — Active connections summary
- `custom_traceroute_host({host})` — Network path to host
- `custom_ip_info` — Public IP, ISP, geolocation
- `custom_dns_lookup({target, type})` — DNS records
- `custom_wifi_info` — WiFi signal, SSID, nearby networks
- `custom_arp_watch` — Track new devices joining network
- `custom_network_latency_log({targets})` — Log latency to CSV
- `custom_port_check({host, port})` — Is a port open?
- `custom_resolv_test({domain})` — DNS resolver speed test
- `custom_network_reset({action, interface})` — Reset network/WiFi

### Security — "Am I safe?"
- `custom_auth_log_scan({lines})` — Failed SSH, sudo, logins
- `custom_open_ports` — All listening ports
- `custom_firewall_status` — UFW/iptables rules
- `custom_firewall_manage({action, rule})` — Add/remove firewall rules
- `custom_iptables_raw({action, rule})` — Direct iptables control
- `custom_ssh_keys({action, user, key})` — Manage SSH keys
- `custom_user_manage({action, username, extra})` — Manage system users
- `custom_apt_security` — Security updates available?
- `custom_random_password({length})` — Generate secure passwords
- `custom_user_sessions` — Who's logged in?

### Hardware — "What's connected to me?"
- `custom_gpio_blink({pin, count, delay_ms})` — Blink an LED
- `custom_gpio_pwm({pin, duty_cycle, frequency, duration_ms})` — PWM control
- `custom_gpio_read_all` — Read all GPIO pin states
- `custom_i2c_scan({bus})` — Find I2C devices
- `custom_sensor_dht({pin, sensor_type})` — Read temp/humidity
- `custom_color_led({pin, red, green, blue, count})` — NeoPixel control
- `custom_camera_capture({filename, width, height})` — Take a photo
- `custom_usb_devices` — List USB devices
- `custom_bluetooth_scan` — Find Bluetooth devices
- `custom_power_manage({action, value})` — CPU governor, HDMI, LED
- `custom_raspi_config({setting, value})` — Pi hardware config

### Data & Metrics — "Track and analyze"
- `custom_metrics_log({file, values, header})` — Log data to CSV
- `custom_metrics_read({file, rows})` — Read CSV with stats
- `custom_csv_merge({file1, file2, mode})` — Merge/compare CSVs
- `custom_temp_history` — Auto-log CPU temp with trends
- `custom_json_query({file, query})` — Query JSON files
- `custom_watch_file({file, lines})` — Monitor a file
- `custom_clipboard_text({action, key, value})` — Persistent key-value store

### Automation — "Do things for me"
- `custom_exec_raw({command})` — Run ANY bash command
- `custom_write_script({filepath, content, executable})` — Create files
- `custom_run_script({interpreter, script_path, args})` — Execute scripts
- `custom_cron_manage({action, schedule, command})` — Manage cron jobs
- `custom_crontab_raw({user, action, entry})` — Raw crontab for any user
- `custom_schedule_task({action, time_spec, command})` — One-shot scheduled tasks
- `custom_screen_manage({action, name, command})` — Background sessions
- `custom_backup_state({label})` — Backup brain state

### Admin — "Full system control"
- `custom_apt_manage({action, packages})` — Install/remove/update packages
- `custom_pip_manage({action, packages})` — Python package management
- `custom_node_manage({action, path})` — Node.js project management
- `custom_systemd_manage({action, service})` — Start/stop/restart services
- `custom_config_edit({action, file, key, value})` — Edit config files
- `custom_sysctl_manage({action, key, value})` — Kernel parameters
- `custom_kernel_params({action, key, value})` — Boot config.txt
- `custom_permissions_fix({action, path, mode})` — Fix file permissions
- `custom_swap_manage({action})` — Swap management
- `custom_hostname_set / timezone_set / locale_set` — System identity
- `custom_git_clone({action, repo, destination})` — Git operations
- `custom_filesystem_ops({action, source, destination})` — File operations

### Brain Self-Management — "Know thyself"
- `custom_brain_state({action, target})` — Read goals, personality, activity
- `custom_brain_log({mode, filter})` — Read own service logs
- `custom_self_restart({mode})` — Restart brain or reboot Pi
- `custom_auto_heal({mode})` — Self-diagnose and fix issues
- `custom_tool_index({action, query})` — Search this tool library

### External — "What's happening outside?"
- `custom_weather({latitude, longitude})` — Current weather + forecast
- `custom_astronomy({latitude, longitude})` — Sunrise/sunset/moon
- `custom_fetch_url({url, max_bytes})` — Fetch any URL
- `custom_quote({category})` — Random inspirational quote

### Utilities — "Handy helpers"
- `custom_calc({expression})` — Math: sqrt, sin, log, conversions
- `custom_countdown({target_date})` — Days until a date
- `custom_base64_tool({action, input})` — Encode/decode base64
- `custom_hash_file({file})` — MD5/SHA checksums
- `custom_regex_test({pattern, text})` — Test regex patterns
- `custom_qr_generate({text, output})` — Generate QR codes
- `custom_text_to_speech({text, output_file})` — TTS audio
- `custom_file_find({directory, pattern, max_results})` — Find files
- `custom_process_kill({mode, target})` — Kill processes
- `custom_http_serve({directory, port, duration_sec})` — Quick HTTP server
- `custom_wake_on_lan({mac_address})` — Wake devices on LAN

## Key Patterns

### Regular health check
1. `custom_system_snapshot()` — quick overview
2. `custom_auto_heal({mode: 'diagnose'})` — automated checks
3. `custom_temp_history()` — log temperature

### Track trends over time
1. `custom_metrics_log(...)` — append data
2. `custom_metrics_read(...)` — analyze trends
3. `custom_network_latency_log(...)` — network quality

### Self-repair
1. `custom_auto_heal({mode: 'fix'})` — auto-fix common issues
2. `custom_self_restart({mode: 'brain'})` — restart yourself
3. `custom_systemd_manage({action: 'restart', service: '...'})` — restart services

### Install new software
1. `custom_apt_manage({action: 'search', packages: 'keyword'})`
2. `custom_apt_manage({action: 'install', packages: 'name'})`
3. `custom_pip_manage({action: 'install', packages: 'name'})`

### Create and run scripts
1. `custom_write_script({filepath: '...', content: '...', executable: 'yes'})`
2. `custom_run_script({interpreter: 'bash', script_path: '...', args: 'none'})`
