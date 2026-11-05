import { networkInterfaces, type NetworkInterfaceInfo } from "node:os";

const PRIVATE_IPV4 = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
// Skip adapters that are never the Wi-Fi/LAN a phone can reach. Filtering is by adapter name only:
// address ranges such as 192.168.56.x or 172.17.x.x are legitimate home/office networks.
const VIRTUAL_ADAPTER = /virtual|vbox|vmware|vpn|wsl|docker|hyper-v|vethernet|loopback|tailscale|zerotier|utun|^veth|^br-/i;
const WIFI_ADAPTER = /wi-?fi|wireless|wlan|^wlp|^en0$/i;
const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/i;

export type LanAddress = { name: string; address: string };
type Interfaces = Record<string, NetworkInterfaceInfo[] | undefined>;

export function isPrivateIPv4(address: string) {
  return PRIVATE_IPV4.test(address);
}

/** Private IPv4 addresses of real network adapters, Wi-Fi first. */
export function lanAddresses(interfaces: Interfaces = networkInterfaces()): LanAddress[] {
  const found: LanAddress[] = [];
  for (const [name, entries] of Object.entries(interfaces)) {
    if (VIRTUAL_ADAPTER.test(name)) continue;
    for (const entry of entries ?? []) {
      const isIPv4 = String(entry.family) === "IPv4" || String(entry.family) === "4";
      if (isIPv4 && !entry.internal && isPrivateIPv4(entry.address)) found.push({ name, address: entry.address });
    }
  }
  return found.sort((left, right) => Number(!WIFI_ADAPTER.test(left.name)) - Number(!WIFI_ADAPTER.test(right.name)));
}

/**
 * Origins a phone could use to reach this server. When the computer was opened through localhost the
 * request URL is useless to a phone, so offer each LAN address (the override first, then Wi-Fi first).
 */
export function lanOrigins(requestUrl: string, override = process.env.POCKETDECK_LAN_ADDRESS, interfaces?: Interfaces): string[] {
  const origin = new URL(requestUrl);
  if (!LOOPBACK_HOST.test(origin.hostname)) return [origin.origin];
  const addresses = lanAddresses(interfaces).map((entry) => entry.address);
  if (override && isPrivateIPv4(override.trim())) addresses.unshift(override.trim());
  const unique = [...new Set(addresses)];
  if (!unique.length) return [origin.origin];
  return unique.map((address) => `${origin.protocol}//${address}${origin.port ? `:${origin.port}` : ""}`);
}
