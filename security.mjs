// Text helpers, not an HTML sanitizer. Render untrusted HTML only in sandboxed frames.
export function markupText(value, omitTitle = false) {
  const blocks = omitTitle ? /<(script|style|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi
    : /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
  return String(value).replace(blocks, ' ')
    .replace(/<[^>]*>/g, ' ').replace(/[<>]/g, '');
}

export function markdownCell(value) {
  const escaped = { '\\': '\\\\', '|': '\\|', '&': '&amp;', '<': '&lt;', '>': '&gt;' };
  return String(value ?? '').replace(/[\\|&<>]/g, (c) => escaped[c]).replace(/\s+/g, ' ').trim();
}

// Provider errors can echo credentials. Redact before logging or storing a failed day.
export function redactCredentials(value) {
  let text = String(value);
  const secrets = ['OPENROUTER_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN']
    .flatMap((name) => [process.env[name], process.env[name]?.trim()])
    .filter(Boolean).sort((a, b) => b.length - a.length);
  for (const secret of secrets) text = text.replaceAll(secret, '[REDACTED]');
  return text;
}
