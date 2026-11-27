import { UnauthorizedException } from '@nestjs/common';
import { BlockList, isIP } from 'node:net';

function normalizedIp(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let ip = value.trim();
  if (ip.toLowerCase().startsWith('::ffff:') && isIP(ip.slice(7)) === 4)
    ip = ip.slice(7);
  return isIP(ip) ? ip : null;
}

/** Serial numbers are public identifiers; only approved source addresses may use ADMS. */
export function assertEsslSource(
  serial: string,
  sourceIp: string | undefined,
  configuration = process.env.ESSL_DEVICE_IP_ALLOWLIST,
): void {
  const denied = () =>
    new UnauthorizedException('Attendance device source is not permitted');
  const ip = normalizedIp(sourceIp);
  if (!ip || !configuration) throw denied();
  let entries: unknown;
  try {
    const map = JSON.parse(configuration);
    entries =
      map && !Array.isArray(map) && Object.hasOwn(map, serial)
        ? map[serial]
        : null;
  } catch {
    throw denied();
  }
  if (!Array.isArray(entries) || entries.length === 0) throw denied();
  const approved = new BlockList();
  for (const entry of entries) {
    const address = normalizedIp(entry);
    if (!address) throw denied();
    approved.addAddress(address, isIP(address) === 4 ? 'ipv4' : 'ipv6');
  }
  if (!approved.check(ip, isIP(ip) === 4 ? 'ipv4' : 'ipv6')) throw denied();
}
