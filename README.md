# SEB Hub

**Santam Emerging Business — Operations Platform**

SEB Hub is a unified four-pillar operations platform for Santam Emerging Business, covering Claims intelligence, Mailbox triage, Underwriting analytics, and Strategic reporting.

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Environment Variables

Copy `.env.local.example` to `.env.local` and fill in the values.

## Database

```bash
npm run db:push      # Push schema to database
npm run db:generate  # Regenerate Prisma client
npm run db:seed      # Seed initial data
npm run db:studio    # Open Prisma Studio
```

## Deploy

Deployed on Netlify via `@netlify/plugin-nextjs`. See `netlify.toml` for configuration.
