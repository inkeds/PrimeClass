# SQL Notes

1. Import the project-level schema file:

- `../../docs/schema.mysql.sql`

2. Import seed data for local bootstrap:

- `./seed.mysql.sql`

The seed script provides:

- admin account skeleton for `admin`
- demo app account skeleton for `student_demo`
- super admin role and backend permissions
- storage provider defaults
- basic system settings
- basic dictionaries: `subject`, `grade`, `term`, `version`
- sample membership packages
- sample courses, lessons and banner

For a public-safe local setup, prefer `npm run db:bootstrap`, which injects or generates passwords before importing the seed.
