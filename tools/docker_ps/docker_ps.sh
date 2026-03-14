#!/bin/bash
FILTER="$1"

if ! command -v docker &>/dev/null; then
  echo "Docker is not installed"
  exit 0
fi

if [ "$FILTER" = "all" ]; then
  echo "=== All Containers ==="
  docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}\t{{.Image}}" 2>/dev/null
elif [ "$FILTER" = "running" ]; then
  echo "=== Running Containers ==="
  docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}\t{{.Image}}" 2>/dev/null
  echo ""
  echo "=== Resource Usage ==="
  docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" 2>/dev/null
else
  echo "=== Container: $FILTER ==="
  docker inspect "$FILTER" --format '
Name: {{.Name}}
Image: {{.Config.Image}}
Status: {{.State.Status}}
Started: {{.State.StartedAt}}
Restart Policy: {{.HostConfig.RestartPolicy.Name}}
Ports: {{range $p, $conf := .NetworkSettings.Ports}}{{$p}}->{{range $conf}}{{.HostPort}}{{end}} {{end}}
Env: {{range .Config.Env}}{{.}} {{end}}
' 2>/dev/null || echo "Container '$FILTER' not found"
  echo ""
  echo "--- Recent Logs ---"
  docker logs --tail 15 "$FILTER" 2>/dev/null
fi
