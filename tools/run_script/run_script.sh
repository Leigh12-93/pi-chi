#!/bin/bash
INTERPRETER="$1"
SCRIPT="$2"
ARGS="$3"

if [ ! -f "$SCRIPT" ]; then
  echo "Script not found: $SCRIPT"
  exit 1
fi

if [ "$ARGS" = "none" ]; then
  ARGS=""
fi

echo "Running: $INTERPRETER $SCRIPT $ARGS"
echo "---"
$INTERPRETER "$SCRIPT" $ARGS 2>&1
EXIT=$?
echo "---"
echo "Exit code: $EXIT"
