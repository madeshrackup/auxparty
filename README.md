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

Needs at least 2 players.

### Buzzer Beater

A high-speed race to identify the song before anyone else beats you to the buzz. The room hears a 30-second iTunes preview. First to buzz gets a short window to type the title. Correct answers score fast-finger points; a miss burns you for that clip only.

By default the mix is **today's top hits** (iTunes Top 100). The host can pick another chart (pop, hip-hop, rock, dance, and more) or paste public Spotify / Apple Music playlist links before starting.

Needs at least 2 players.

### Who Added This? (Impostor)

Everyone secretly picks one song. Each clip plays for up to 30 seconds while everyone else taps a name — you only guess who added it, not the title. The person whose song it is sits that clip out. A correct guess scores **20 + seconds left**. A wrong guess scores **0 for that clip**. Who added each song stays hidden until every song in the round has played.

One round = everyone has put a song down. 5 rounds in a 5-player lobby means 25 songs.

Needs at least 3 players.

### Pass the Aux (DJ Draft)

One designated DJ sets the prompt each round. Everyone — including the DJ — submits a track to match it, then everyone votes (you just can't vote for your own). The winner becomes DJ and sets the next theme.

Needs at least 3 players.

## Accounts

- **Guest:** type a display name on the home screen and jump in.
- **Sign up / log in:** username + email + password, stored in Supabase. Friends, DMs, and invites need an account.

## Friends

Logged-in players can add each other by username, message, invite someone into a lobby, or join a friend who is already in a **public** party (private lobbies still need the code or an invite). Tick **Private lobby** in the room if you don't want friends dropping in from the friends list.

Run `supabase/schema-friends.sql` in the Supabase SQL editor once so friend requests and DMs persist.

## Draft limits

- Song previews come from the public iTunes Search / RSS APIs.
- Spotify and Apple Music playlist import reads public playlist pages, then matches tracks on iTunes so the 30-second preview can play.
- Rooms live in memory; they vanish when the server restarts.
