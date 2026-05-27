# TPR Max

TPR Max is a cloud-based Connected Workforce & Site Safety Platform that helps businesses manage visitors, contractors, and staff with 23 modules covering contractor compliance, emergency mustering, audits & inspections, risk assessments, HR lifecycle, lone worker protection, CDM 2015, PPM, and more.

## Run & Operate
- `npm run dev`: Starts the development server.
- `npm run build`: Compiles the frontend and backend for production.
- `npm run typecheck`: Runs TypeScript type checking.
- `drizzle-kit generate:pg`: Generates Drizzle migrations based on schema changes.
- `drizzle-kit push:pg`: Applies pending database migrations.

Required Environment Variables:
- `DATABASE_URL`: PostgreSQL connection string.
- `SESSION_SECRET`: Secret for session encryption.
- `STRIPE_SECRET_KEY`: Stripe API key.
- `EIGHT_X_EIGHT_API_KEY`: 8x8 API key for voice notifications.
- `REPLIT_AI_API_KEY`: API key for Replit AI integrations.

## Stack
- **Frontend**: React 18, TypeScript, Wouter, TanStack Query, Radix UI, Tailwind CSS
- **Backend**: Node.js, Express.js, TypeScript, Drizzle ORM
- **Database**: PostgreSQL
- **Validation**: Zod
- **Build Tool**: Vite
- **Runtime**: Node.js (latest LTS)

## Where things live
- `src/`: Frontend source code.
- `server/`: Backend source code.
- `drizzle/`: Database migrations.
- `drizzle.config.ts`: Drizzle ORM configuration and schema definition.
- `server/routes/`: Contains domain-specific API route definitions.
- `server/db/schema.ts`: Defines the database schema.
- `server/middleware/auth.ts`: Authentication middleware.

## Architecture decisions
- **Single-Tenant-per-Database**: Ensures strict data isolation for each customer by providing a dedicated PostgreSQL database.
- **Glassmorphism UI**: A deliberate choice for a modern, enterprise-grade aesthetic.
- **Schema-First ORM (Drizzle)**: Prioritizes database schema definition for type safety and robust data modeling.
- **Optimistic UI Updates (React Query)**: Enhances user experience by providing immediate feedback for server-side operations.
- **Customer-Isolated Feature Toggles**: Allows granular control over feature availability for individual customers.

## Product
- Visitor, contractor, and staff management with QR code ID passes.
- Kiosk check-in system.
- Pre-booking and invitation management.
- Real-time tracking of on-site personnel.
- Emergency evacuation and Fire Marshal systems.
- AI-powered induction video generation.
- CO2 sustainability reporting.
- Integrations with Paxton Net2 and Suprema BioStar 2 access control.
- Lone worker protection system with automated welfare checks.
- Martyn's Law (UK Protect Duty) compliance tools.
- Comprehensive reporting and audit logs (e.g., Email Outbox, Incident Reports).
- Advanced contractor onboarding with UK compliance checks (Right to Work, RAMS).

## User preferences
Preferred communication style: Simple, everyday language.

## Gotchas
- Always run `drizzle-kit generate:pg` after modifying `server/db/schema.ts` to create new migrations.
- Database migrations must be pushed manually using `drizzle-kit push:pg` after generation.
- Ensure all environment variables are correctly configured for both development and production.
- Paxton Net2 and BioStar 2 integrations require specific external API configurations and credentials.

## Pointers
- **React Query**: https://tanstack.com/query/latest/docs/react/overview
- **Drizzle ORM**: https://orm.drizzle.team/docs/overview
- **Tailwind CSS**: https://tailwindcss.com/docs
- **Radix UI**: https://www.radix-ui.com/docs/primitives
- **Zod**: https://zod.dev/
- **Express.js**: https://expressjs.com/
- **PostgreSQL**: https://www.postgresql.org/docs/