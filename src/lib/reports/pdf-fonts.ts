/**
 * Loads Poppins (Regular + Bold) TTF from Google Fonts CDN at runtime.
 * Results are module-level cached so subsequent calls are instant.
 * Falls back gracefully to null — callers should fall back to Helvetica.
 */

interface PoppinsFonts {
  regular: string; // base64 TTF
  bold: string;    // base64 TTF
}

let _cache: PoppinsFonts | null = null;
let _pending: Promise<PoppinsFonts | null> | null = null;

function extractTtfUrl(css: string): string | null {
  const m = css.match(/url\((https:\/\/fonts\.gstatic\.com[^)]+\.ttf)\)/);
  return m ? m[1] : null;
}

async function fetchFonts(): Promise<PoppinsFonts | null> {
  // Older UA causes Google Fonts to return TTF instead of woff2
  const ua = 'Mozilla/4.0 (compatible; MSIE 5.0; Windows NT)';
  const headers = { 'User-Agent': ua };

  const [regCss, boldCss] = await Promise.all([
    fetch('https://fonts.googleapis.com/css?family=Poppins:400', { headers }).then(r => r.text()),
    fetch('https://fonts.googleapis.com/css?family=Poppins:700', { headers }).then(r => r.text()),
  ]);

  const regUrl = extractTtfUrl(regCss);
  const boldUrl = extractTtfUrl(boldCss);
  if (!regUrl || !boldUrl) return null;

  const [regBuf, boldBuf] = await Promise.all([
    fetch(regUrl).then(r => r.arrayBuffer()),
    fetch(boldUrl).then(r => r.arrayBuffer()),
  ]);

  return {
    regular: Buffer.from(regBuf).toString('base64'),
    bold: Buffer.from(boldBuf).toString('base64'),
  };
}

export async function loadPoppins(): Promise<PoppinsFonts | null> {
  if (_cache) return _cache;
  if (!_pending) {
    _pending = fetchFonts()
      .then(result => { _cache = result; return result; })
      .catch(() => { _pending = null; return null; });
  }
  return _pending;
}
