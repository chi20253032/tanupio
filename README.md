# TANUPIO: NEON ARENA

## Online rooms and matchmaking

Online play supports creating a public room, joining an available room, six-character invite codes, and quick matchmaking. Room discovery and short invite codes are coordinated by the WebSocket matchmaking service; gameplay remains peer-to-peer through PeerJS.

### Automatic online matchmaking

The game uses PeerJS for direct player-to-player gameplay and a small WebSocket service to match two waiting players automatically.

### Deploy the matchmaking service

1. Open [Render](https://render.com/) and sign in.
2. Choose **New → Blueprint** and connect this repository.
3. Render reads `render.yaml` and creates `tanupio-matchmaking`.
4. Wait for the service health check to pass at `/health`.

The browser client connects to `wss://tanupio-matchmaking.onrender.com`. If the service name is unavailable, change `MATCHMAKING_URL` near the top of the game script to the WebSocket URL Render assigns.

The Render free service may sleep while idle; the first match after inactivity can take longer. PeerJS connectivity still depends on the public PeerJS signaling service and NAT traversal; a TURN relay may be required on restrictive networks.

### Local tests

```sh
npm install
npx playwright install --with-deps chromium
npm test
```

## 1.0 Beta candidate

The `main` branch is the 1.0 beta candidate. The browser build is a single-page game; the optional matchmaking service is deployed separately on Render. Run `npm test` before publishing a release. This beta still depends on the public PeerJS signaling service and the configured Render matchmaking service for online play.
