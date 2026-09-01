# SkillSpring LMS

A full-stack learning platform built with React, Vite, Tailwind CSS, Express, and MongoDB.

## Included

- Responsive public homepage, searchable course catalog, and course pages
- JWT authentication with Student, Instructor, and Admin role controls
- Admin-controlled instructor invitations: 5-seat atomic quota, email-bound acceptance, 7-day expiry, resend/cancel, and access removal
- Student dashboard, enrollment, progress tracking, resume learning, and course player
- Instructor course management and nested section/lesson curriculum model
- Quiz builder API, timed attempts, scoring, limits, and feedback
- Learning analytics, activity events, learning time, progress, and weak-topic-ready quiz data
- Auto-issued certificates on 100% completion
- Admin user/instructor management and course approval workflows
- AI tutor endpoint compatible with OpenAI-style chat completion APIs
- In-app notifications and platform health/analytics foundation
- Helmet, CORS, rate limiting, input validation, password hashing, and centralized errors
- Render, Vercel, and MongoDB Atlas configuration

## Project structure

```text
client/                 React + Vite + Tailwind web app
  src/App.jsx           Product UI and role-based dashboards
  src/lib/api.js        Authenticated API client
server/                 Express API
  src/models/           MongoDB schemas
  src/routes/           Auth, course, learning, quiz, admin, platform APIs
  src/middleware/       JWT/RBAC and error handling
render.yaml             Render Blueprint
vercel.json             Vercel SPA configuration
.env.example            Required environment variables
```

## Local setup

### 1. Requirements

- Node.js 20+
- A MongoDB Atlas database (or MongoDB connection URI)
- An OpenAI-compatible AI API key

### 2. Configure environment

```bash
cp .env.example .env
```

Set at minimum:

```env
MONGODB_URI=mongodb+srv://...
JWT_SECRET=a-long-random-secret-at-least-32-characters
AI_API_KEY=...
CLIENT_URL=http://localhost:5173
APP_URL=http://localhost:5173
EMAIL_API_KEY=re_your_resend_api_key
EMAIL_FROM=SkillSpring <invitations@your-verified-domain.com>
```

### 3. Install and run

```bash
npm install
npm run dev
```

- Web: http://localhost:5173
- API: http://localhost:5000/api
- Health check: http://localhost:5000/api/health

The selected strict-services configuration deliberately does not use mock authentication, an in-memory database, or a fake AI response. The API exits early if `MONGODB_URI` or `JWT_SECRET` is missing; the tutor returns `503` until `AI_API_KEY` is configured.

## Primary API routes

| Area | Routes |
|---|---|
| Authentication | `POST /api/auth/register`, `POST /api/auth/login`, `GET/PATCH /api/auth/me` |
| Courses | `GET/POST /api/courses`, `GET/PATCH/DELETE /api/courses/:id`, `POST /api/courses/:id/submit` |
| Learning | `POST /api/learning/enroll/:courseId`, `GET /api/learning/my-courses`, `PATCH /api/learning/:courseId/progress` |
| Analytics | `GET /api/learning/analytics` |
| Quizzes | `POST /api/quizzes`, `GET /api/quizzes/:id`, `POST /api/quizzes/:id/attempt` |
| Admin | `GET /api/admin/overview`, user management, pending courses, review actions |
| Instructor invitations | `GET/POST /api/instructor-invitations`, resend/cancel/manage endpoints, `POST /api/instructor-invitations/:token/accept` |
| AI tutor | `POST /api/ai/tutor` |
| Notifications | `GET /api/notifications`, `PATCH /api/notifications/:id/read` |
| Certificates | `GET /api/certificates` |

## Deployment

### MongoDB Atlas

1. Create a cluster and database user.
2. Allow Render's outbound access (or use the appropriate Atlas network rules).
3. Copy the connection URI into Render as `MONGODB_URI`.

### Render API

1. Connect this repository in Render.
2. Render detects `render.yaml`.
3. Add `MONGODB_URI`, `CLIENT_URL`, and `AI_API_KEY`.
4. Render generates `JWT_SECRET` automatically.

### Vercel web app

1. Import the same repository.
2. The included `vercel.json` builds `client`.
3. Add `VITE_API_URL=https://YOUR-RENDER-SERVICE.onrender.com/api`.
4. Add the Vercel production URL to the API's `CLIENT_URL` (comma-separated values are supported).
5. Redeploy the client after changing `VITE_API_URL` because Vite embeds it at build time.

## Production checklist

- Create the first admin securely by registering a user, then changing the role directly in MongoDB; do not expose public admin registration.
- Replace placeholder course media with signed uploads from a service such as Cloudinary or S3.
- Add transactional email for instructor decisions and certificate delivery.
- Add refresh-token rotation if sessions longer than seven days are required.
- Add payment processing before enabling paid course enrollment.
- Run API integration tests against a dedicated test database and browser E2E tests for each role.
- Configure logging, uptime monitoring, database backups, CSP directives, and error reporting.

## Notes

The UI includes polished representative screens for all three roles. Backend endpoints and data models cover the complete requested foundation. Media storage, email delivery, payment processing, and PDF certificate rendering are intentionally provider-neutral so deployment credentials can be selected without locking the project to one vendor.

## Admin-controlled instructor access

The protected frontend route is `/admin`. Non-admin users are redirected to their own dashboard, while all `/api/admin/*` endpoints also enforce JWT authentication and the `admin` role on the server.

Normal registration always creates a `student`. To bootstrap the first administrator safely, first create the account through normal registration so the existing password hashing and validation are used. Then, through an authenticated database administration channel such as MongoDB Atlas Data Explorer or `mongosh`, update only that known account:

```javascript
db.users.updateOne(
  { email: "trusted-owner@example.com", role: "student" },
  { $set: { role: "admin", status: "active" } }
)
```

Do not add an admin registration endpoint and do not store an admin password in source code. Sign out and back in after the role update so the current user state is refreshed.

Invitation email delivery uses the server-only adapter at `server/src/services/invitationEmail.js`. Configure `APP_URL`, `EMAIL_API_KEY`, and `EMAIL_FROM`; no email credential is exposed through Vite or browser code.
