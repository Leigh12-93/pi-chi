const PROMPT_NOISE_PATTERNS = [
  /^#{1,6}\s/,
  /^-\s+\*\*/,
  /^\d+\.\s/,
  /^USE for:/i,
  /^SKIP for:/i,
  /^Deploy = /i,
  /^activity,\s*thought,\s*error,\s*success$/i,
  /^python3\s+~\/display_log\.py\s+error\b/i,
]

const RUNTIME_ERROR_PATTERNS = [
  /\berror:/i,
  /\bfailed:/i,
  /\bfailure:/i,
  /\bexception\b/i,
  /\btraceback\b/i,
  /\bsyntaxerror\b/i,
  /\btypeerror\b/i,
  /\breferenceerror\b/i,
  /\bmodule not found\b/i,
  /\bcannot find\b/i,
  /\bcommand not found\b/i,
  /\bpermission denied\b/i,
  /\baddress already in use\b/i,
  /\breturned non-zero\b/i,
  /\bexit code [1-9]\d*\b/i,
  /\bENOENT\b/i,
  /\bEACCES\b/i,
  /\bENOSPC\b/i,
  /\bOOM\b/i,
  /\bout of memory\b/i,
  /\bkilled\b/i,
  /\bERR!\b/i,
  /\bHTTP [45]\d{2}\b/i,
  /\btimed out\b/i,
  /\btimeout\b/i,
]

function isPromptNoise(line: string): boolean {
  return PROMPT_NOISE_PATTERNS.some((pattern) => pattern.test(line))
}

function isLikelyRuntimeErrorLine(line: string): boolean {
  if (!line) return false
  if (isPromptNoise(line)) return false
  return RUNTIME_ERROR_PATTERNS.some((pattern) => pattern.test(line))
}

export function extractJournalErrors(claudeOutput: string, limit = 5): string[] {
  return claudeOutput
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => isLikelyRuntimeErrorLine(line))
    .slice(0, limit)
    .map((line) => line.slice(0, 200))
}
