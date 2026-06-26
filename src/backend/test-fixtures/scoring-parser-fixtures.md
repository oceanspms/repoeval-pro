# Scoring Parser Fixtures

These fixtures document the deterministic parser/scoring cases that must stay stable.
They are intentionally simple so they can be converted into Motoko tests when the
backend test harness is added.

## Frontend assignment

Assignment:
Build a React frontend dashboard with responsive layout, reusable components,
state management, documentation, and a deployed demo link.

Expected:
- role: Frontend
- required_items includes frontend UI, responsive layout, documentation, demo
- stackMatch should not require backend, database, or API routes
- coverage must not report 0 of 0

## Backend assignment

Assignment:
Build a REST API server with authentication, PostgreSQL persistence, validation,
tests, setup instructions, and Docker support.

Expected:
- role: Backend
- required_items includes backend/API, authentication, database, tests, docs, Docker
- stackMatch should require backend/API and database signals
- missing core backend/API work should materially reduce coverage

## Notes as evidence

Assignment:
Build a frontend UI with a deployed demo and setup documentation.

Notes:
The candidate deployed the app to Vercel and included the prompt log in a Google
Doc. The README forgot to mention the link.

Expected:
- assignment rubric remains frontend UI, demo, docs
- notes count as evidence for demo and prompt-log signals
- notes must not replace or redefine the assignment rubric

## Empty or malformed parser response

Assignment:
Create a responsive React product listing page with filters and sorting.

Expected:
- heuristic parser infers Frontend
- required_items is non-empty
- coverage is never inflated to 100 from an empty rubric
