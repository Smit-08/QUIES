# QUIES

B.Tech Cybersecurity Capstone — 8-Week Build

A mobile safety app for detecting stalkerware, scoring device risk,
storing tamper-proof evidence, and providing AI-powered safety guidance.

## Team
| Name | Role |
|------|------|
| Rohan | Frontend + AI/ML |
| Smit | Backend + AI/ML |
| Vedant | AI/Cloud |

## Services
| Folder | Tech | Owner |
|--------|------|-------|
| `app/` | React Native (Expo) | Rohan |
| `backend/` | Node.js + Express + Prisma | Smit |
| `ai-service/` | Python + FastAPI | Smit + Vedant |
| `blockchain/` | Solidity + Hardhat | Vedant |

## Docs
- `docs/Quies_Tech_Stack_Workflow.docx` — full build guide
- `docs/Quies_API_Contract.md` — endpoint shapes and data models

## Local Setup
1. Copy each `.env.example` to `.env` and fill in values (ask the team)
2. `docker-compose up` — spins up all 3 services + Postgres
3. `cd backend && npx prisma migrate dev` — run DB migrations

## Branch Rules
- `main` → demo-ready only, PR + 1 approval required
- `dev` → integration, branch off here for all features
- `feature/your-feature-name` → your working branch, one per feature
