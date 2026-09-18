# Aux Party

A localhost draft of **Aux Party**: a real-time multiplayer music quiz. Private rooms of up to 10, iTunes song search + 30-second previews, guest name or a registered account.

> Turns your favorite playlists into a real-time multiplayer music quiz. Jump into private rooms with up to 10 friends to race for fast-finger points, vote on who brought the best tracks, and expose your friends' guilty-pleasure songs in custom party modes. Built entirely around shared music taste, it's half pub trivia, half DJ draft.

## Run locally

Needs Node 18+.

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The API/socket server is `http://localhost:3001` and is proxied by Vite.

Use two browser profiles (or a window + a private window) to play as two people.

## How to play

Aux Party takes traditional "name that tune" trivia and turns it into a social party game built around your friend group's actual music taste.

### Classic

Everyone has 30 seconds to pick a song from iTunes. Then the room plays each pick, one by one, with 30 seconds to guess the title. Whoever guesses correctly scores **however many seconds are left** (14 seconds left = 14 points). Wrong guesses don't lock you out — keep trying until the clock hits zero.

If the host sets 5 rounds, everyone gets to choose 5 songs over the game.

### Buzzer Beater

A high-speed race to identify the song before anyone else beats you to the buzz. The room hears a 30-second iTunes preview. First to buzz gets a short window to type the title. Correct answers score fast-finger points; a miss burns you for that clip.

If nobody queues songs in the lobby, the host still starts a mixed seed catalogue (80s/90s/pop/hip-hop/indie, etc.) from iTunes.

### Who Added This? (Impostor)

Secretly submit your guilty pleasures, middle school throwbacks, or hype tracks. Each clip is anonymous. Points go to whoever guesses the song **and** correctly calls out which friend added it. The submitter sits that clip out — and scores a small bonus if fewer than half the room spots them.

Needs at least 2 players.

### Pass the Aux (DJ Draft)

One player picks a theme, everyone submits a track to match it, and the room votes on who actually earned the aux cord for that round. The winner sets the next theme.

Needs at least 2 players.

## Accounts

- **Guest:** type a display name on the home screen and jump in.
- **Sign up / log in:** username + password, stored in a local SQLite file at `server/data/auxparty.db` (Node's built-in `node:sqlite`). No email, no OAuth.

## Draft limits

- Song catalogue is the public iTunes Search API (no Spotify playlist import).
- Rooms live in memory; they vanish when the server restarts.
- Localhost only.
