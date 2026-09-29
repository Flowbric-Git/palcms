import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { MultipartFile } from '@fastify/multipart';
import { config, uploadsDir } from '../config';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Types d'images acceptés, reconnus par leur signature binaire (pas de SVG : risque de XSS). */
function detectImage(buf: Buffer): string | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 6 && /^GIF8[79]a$/.test(buf.subarray(0, 6).toString('latin1'))) return 'gif';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP')
    return 'webp';
  return null;
}

/** Enregistre une image envoyée et renvoie son URL publique (relative au site). */
export async function saveImageUpload(file: MultipartFile, maxBytes = MAX_UPLOAD_BYTES): Promise<string> {
  let buf: Buffer;
  try {
    buf = await file.toBuffer();
  } catch {
    throw new Error(`Image trop lourde (${Math.round(maxBytes / 1024 / 1024)} Mo maximum)`);
  }
  if (file.file.truncated || buf.length > maxBytes) throw new Error(`Image trop lourde (${Math.round(maxBytes / 1024 / 1024)} Mo maximum)`);
  const ext = detectImage(buf);
  if (!ext) throw new Error('Format non supporté (PNG, JPG, GIF ou WebP uniquement)');
  fs.mkdirSync(uploadsDir, { recursive: true });
  const name = `${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(uploadsDir, name), buf);
  return `${config.basePath}uploads/${name}`;
}
