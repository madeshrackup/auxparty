export const SEED_SEARCHES = [
  "billboard hot 100",
  "80s hits",
  "90s pop hits",
  "2000s pop",
  "indie rock anthems",
  "hip hop classics",
  "disco hits",
  "britney spears",
  "the weeknd",
  "queen greatest",
  "taylor swift",
  "kendrick lamar",
  "arctic monkeys",
  "beyonce",
  "nirvana",
  "drake",
  "adele",
  "daft punk",
  "rihanna",
  "radiohead",
  "lady gaga",
  "michael jackson",
  "bruno mars",
  "olivia rodrigo",
  "fleetwood mac",
];

export function pickSeeds(count: number): string[] {
  const pool = [...SEED_SEARCHES];
  const out: string[] = [];
  while (out.length < count && pool.length) {
    const i = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}
