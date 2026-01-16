# OracleMint

MTG play advisor that helps plan Magic: The Gathering plays by grounding all LLM reasoning in Scryfall Oracle text and rulings.

## Features

- **Grounded in Truth**: Never trusts LLM memory for card text. Always uses Scryfall-sourced Oracle text.
- **Three-Pass Analysis**:
  1. **Rules Clerk**: Enumerates all legal actions at current priority
  2. **Strategist**: Ranks enumerated lines with EV-based outcomes and risk analysis
  3. **Referee**: Validates timing, triggers, and rules compliance
- **Paper & Arena Support**: Context presets for different play environments
- **Persistent Card Cache**: Postgres database with bulk sync from Scryfall

## Tech Stack

- **Framework**: Next.js 14+ (App Router) + TypeScript
- **Database**: PostgreSQL via Prisma
- **LLM**: OpenAI GPT-4o with structured outputs
- **Validation**: Zod schemas throughout
- **Styling**: Tailwind CSS
- **Hosting**: Vercel

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database (Vercel Postgres, Neon, or local)
- OpenAI API key

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/OracleMint.git
cd OracleMint
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your actual values
```

4. Generate Prisma client:
```bash
npx prisma generate
```

5. Run database migrations:
```bash
npx prisma migrate dev
```

6. Start the development server:
```bash
npm run dev
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `DIRECT_URL` | Direct PostgreSQL connection (for migrations) |
| `OPENAI_API_KEY` | OpenAI API key for LLM calls |
| `ADMIN_TOKEN` | Token for admin endpoints (sync) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token (optional) |
| `CRON_SECRET` | Vercel Cron secret (production) |

## API Endpoints

### Card Resolution
- `POST /api/cards/resolve` - Resolve card names to Oracle data
- `GET /api/cards/autocomplete?q=query` - Autocomplete card names

### Grounding
- `POST /api/grounding` - Build grounding packet from game state

### LLM Pipeline
- `POST /api/llm/rules-clerk` - Enumerate legal actions
- `POST /api/llm/strategist` - Rank actions by EV
- `POST /api/llm/referee` - Validate proposed play
- `POST /api/llm/pipeline` - Run full 3-pass pipeline

### Admin
- `POST /api/admin/sync` - Trigger Scryfall bulk sync
- `GET /api/admin/sync` - Get sync status

## Context Presets

### Paper Magic
- **Casual**: Kitchen table, learning environment
- **FNM**: Friday Night Magic, competitive but friendly
- **Competitive**: Tournament play, strict rules

### MTG Arena
- **BO1**: Best-of-One ladder (aggressive, tempo-focused)
- **BO3**: Best-of-Three traditional

## Game State Schema

```json
{
  "turn": 5,
  "phase": "precombat_main",
  "priority": "you",
  "activePlayer": "you",
  "life": { "you": 20, "opponent": 8 },
  "manaPool": { "W": 0, "U": 0, "B": 0, "R": 2, "G": 0, "C": 0 },
  "you": {
    "battlefield": [
      { "name": "Mountain", "tapped": true },
      { "name": "Monastery Swiftspear", "tapped": false }
    ],
    "hand": [{ "name": "Lightning Bolt" }],
    "graveyard": [],
    "exile": []
  },
  "opponent": {
    "battlefield": [{ "name": "Snapcaster Mage", "tapped": false }],
    "hand": { "count": 4 },
    "graveyard": [],
    "exile": []
  },
  "stack": []
}
```

## Data Sync

OracleMint maintains a local cache of Scryfall data that syncs daily via Vercel Cron. The sync:
- Downloads `oracle_cards` bulk data
- Processes incrementally with checkpoints
- Handles Vercel serverless timeouts with resume capability
- Respects Scryfall rate limits

## License

MIT

## Acknowledgments

- Card data provided by [Scryfall](https://scryfall.com)
- Magic: The Gathering is a trademark of Wizards of the Coast
