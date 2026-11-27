# eSSL source-network deployment gate

Do not deploy source-network enforcement until the approved public source IPs of every enabled eSSL device have been confirmed by the site owner and configured on the backend. Device serial numbers alone are not credentials. Do not derive trusted addresses automatically from unauthenticated punch logs.

Set `ESSL_DEVICE_IP_ALLOWLIST` to a JSON object mapping each registered serial to an array of exact IPv4/IPv6 addresses. Documentation-only example (not real device configuration):

```json
{"TEST-SERIAL":["192.0.2.10","2001:db8::10"]}
```

The enforcement rejects missing/invalid configuration, unknown serial mappings, empty lists and nonmatching source addresses before telemetry or attendance changes. CIDRs, wildcard rules, hostnames and comma-separated header strings are not accepted. IPv4-mapped IPv6 addresses are normalized. Device enrollment/enabled checks remain mandatory.

The controller supplies Express `req.ip`, using the application's existing trusted-proxy configuration; it never parses a caller-supplied `X-Forwarded-For` header directly. Confirm the ingress/proxy chain presents the site's actual egress IP before cutover. Shared NAT addresses identify an approved network, not an individual device; a trusted VPN or device gateway is preferable where addresses change or the network is shared with untrusted users.

Rollout: inventory enabled serials; obtain approved addresses; stage the configuration on the existing backend revision; verify the JSON and every enabled serial's mapping; deploy enforcement; verify an approved device handshake/poll and an unapproved test source rejection. Do not create production punches for the rejection test. Keep this PR in draft until the network configuration is ready.

No IP addresses were guessed and no production device configuration was changed while preparing this patch. Network enforcement does not affect the separately token-authenticated FaceDesk kiosk APIs.
