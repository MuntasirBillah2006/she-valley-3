import net from 'node:net';

const PRIVATE_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /^metadata\.google\.internal$/i,
];

function isPrivateIp(ip: string): boolean {
  if (ip === '::1' || ip === '::' || ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd')) {
    return true;
  }
  const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  const parts = normalized.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true; // Cloud metadata IP
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

/**
 * Validates outbound webhook URLs against SSRF (private IPs, cloud metadata, non-HTTP(S) protocols).
 */
export function validateSafePublicUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    if (!host) return false;
    if (PRIVATE_HOSTNAME_PATTERNS.some((rx) => rx.test(host))) {
      return false;
    }
    if (net.isIP(host) && isPrivateIp(host)) {
      return false;
    }
    if (host.startsWith('[') && host.endsWith(']')) {
      const inner = host.slice(1, -1);
      if (net.isIP(inner) && isPrivateIp(inner)) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitizes relative or external href / image URLs against javascript:/vbscript:/data:text/html XSS.
 */
export function sanitizeUrlHref(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return trimmed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Escapes CSV cells per RFC-4180 and neutralizes spreadsheet formula injection (=, +, -, @, tab, CR).
 */
export function sanitizeCsvCell(value: unknown): string {
  const str = String(value ?? '');
  const formulaSafe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  return `"${formulaSafe.replace(/"/g, '""')}"`;
}
