import net from 'node:net';

/**
 * Client RCON (protocole Source, utilisé par le serveur dédié Palworld).
 * Paquet : taille (int32 LE) | id (int32) | type (int32) | corps (ASCII) \0 \0
 */
const AUTH = 3;
const EXEC = 2;

export function encodePacket(id: number, type: number, body: string): Buffer {
  const payload = Buffer.from(body, 'utf8');
  const buf = Buffer.alloc(14 + payload.length);
  buf.writeInt32LE(10 + payload.length, 0);
  buf.writeInt32LE(id, 4);
  buf.writeInt32LE(type, 8);
  payload.copy(buf, 12);
  // les deux derniers octets restent à 0 (fin de chaîne + paquet)
  return buf;
}

export function decodePackets(buf: Buffer): { packets: { id: number; type: number; body: string }[]; rest: Buffer } {
  const packets: { id: number; type: number; body: string }[] = [];
  let offset = 0;
  while (buf.length - offset >= 4) {
    const size = buf.readInt32LE(offset);
    if (size < 10 || size > 1024 * 1024) throw new Error('Réponse RCON invalide');
    if (buf.length - offset < size + 4) break;
    packets.push({
      id: buf.readInt32LE(offset + 4),
      type: buf.readInt32LE(offset + 8),
      body: buf.subarray(offset + 12, offset + 4 + size - 2).toString('utf8'),
    });
    offset += size + 4;
  }
  return { packets, rest: buf.subarray(offset) };
}

/** Se connecte, s'authentifie, envoie une commande et renvoie la réponse. */
export function rconCommand(host: string, port: number, password: string, command: string, timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let buffer: Buffer = Buffer.alloc(0);
    let authed = false;
    let output = '';
    let settle: NodeJS.Timeout | null = null;

    const finish = (err: Error | null) => {
      clearTimeout(timer);
      if (settle) clearTimeout(settle);
      socket.destroy();
      if (err) reject(err);
      else resolve(output.trim());
    };
    const timer = setTimeout(() => (authed ? finish(null) : finish(new Error('RCON : pas de réponse du serveur'))), timeoutMs);

    socket.on('connect', () => socket.write(encodePacket(1, AUTH, password)));
    socket.on('error', (e) => finish(new Error(`RCON injoignable : ${e.message}`)));
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      let decoded;
      try {
        decoded = decodePackets(buffer);
      } catch (e) {
        return finish(e as Error);
      }
      buffer = decoded.rest;
      for (const p of decoded.packets) {
        if (!authed) {
          if (p.id === -1) return finish(new Error('RCON : mot de passe admin refusé'));
          if (p.type === 2 && p.id === 1) {
            authed = true;
            socket.write(encodePacket(2, EXEC, command));
          }
          continue;
        }
        if (p.id === 2) {
          output += p.body;
          // Palworld répond en un seul paquet : on attend un court instant au cas où d'autres suivraient.
          if (settle) clearTimeout(settle);
          settle = setTimeout(() => finish(null), 150);
        }
      }
    });
  });
}
