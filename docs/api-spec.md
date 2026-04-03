# CineRide API Specification

Interactive Swagger UI is served at `/api/docs`. Raw OpenAPI JSON at `GET /api/docs.json`.

## Base URL
`http://localhost:8080/api` (via Nginx reverse proxy on port 8080)

## Authentication
All endpoints except `/api/auth/login` and `/api/health` require authentication.

Sensor ingest endpoints (`/api/sensors/ingest`, `/api/sensors/ingest/batch`) require per-device
authentication via `X-Device-Id` and `X-Device-Secret` headers. The body `device_id` must match
the authenticated header device (cross-device spoofing is rejected with 403).

```
Authorization: Bearer <token>
```

## Endpoints Summary

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/login | Login with username/password |
| POST | /api/auth/logout | Revoke current session |
| GET | /api/auth/me | Get current user info |
| GET | /api/auth/sessions | List active sessions |
| POST | /api/auth/change-password | Change password |
| POST | /api/auth/revoke-sessions | Revoke all other sessions |

### Users (Admin only)
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/users | List users |
| POST | /api/users | Create user |
| GET | /api/users/:id | Get user |
| PUT | /api/users/:id | Update user |
| DELETE | /api/users/:id | Soft delete user |

### Movies
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/movies | List movies |
| POST | /api/movies | Create movie (staff) |
| GET | /api/movies/:id | Get movie |
| PUT | /api/movies/:id | Update movie (staff) |
| DELETE | /api/movies/:id | Delete movie (staff) |
| POST | /api/movies/:id/poster | Upload poster (staff) |
| POST | /api/movies/:id/stills | Upload stills (staff) |
| POST | /api/movies/:id/unpublish | Unpublish (staff) |
| POST | /api/movies/:id/republish | Republish (staff) |
| GET | /api/movies/:id/revisions | Revision history (staff) |

### Movie Import
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/movie-import/upload | Upload JSON/CSV |
| GET | /api/movie-import/:jobId | Get import job |
| PUT | /api/movie-import/:jobId/resolve/:idx | Resolve conflicts |
| POST | /api/movie-import/:jobId/execute | Execute import |

### Content
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/content | List content |
| POST | /api/content | Create draft (staff) |
| GET | /api/content/:id | Get content item |
| PUT | /api/content/:id | Update draft (staff) |
| DELETE | /api/content/:id | Delete (staff) |
| POST | /api/content/:id/submit | Submit for review |
| POST | /api/content/:id/unpublish | Unpublish (staff) |
| GET | /api/content/:id/reviews | Review history |

### Content Review
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/content-review/:id/review | Review content (reviewer) |

### Rides
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/rides | List rides |
| POST | /api/rides | Create ride request |
| GET | /api/rides/:id | Get ride details |
| POST | /api/rides/:id/cancel | Cancel ride |
| POST | /api/rides/:id/feedback | Submit feedback |

### Dispatch
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/dispatch/queue | Pending rides queue |
| POST | /api/dispatch/rides/:id/accept | Accept ride |
| POST | /api/dispatch/rides/:id/transition | Transition status |
| POST | /api/dispatch/rides/:id/approve-cancel | Approve cancellation |
| GET | /api/dispatch/disputes | List disputes |
| GET | /api/dispatch/disputes/:id | Get dispute |
| POST | /api/dispatch/disputes/:id/assign | Assign to self |
| POST | /api/dispatch/disputes/:id/resolve | Resolve dispute |

### Disputes
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/disputes | Initiate dispute (any role) |

### Search
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/search?q=query | Unified search (movies + content for all; users for admin/dispatcher only) |
| GET | /api/search/suggest?q=partial | Query suggestions (typo-tolerant via Fuse.js fallback) |

**User search restriction:** The `type=user` filter and user results in unified search are intentionally
restricted to `administrator` and `dispatcher` roles only. This prevents regular users and non-operational
staff from enumerating the internal user directory. The UI hides the "Users" filter button for non-eligible
roles to match this backend restriction.

### Recommendations
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/recommendations/movies | Movie recommendations |
| GET | /api/recommendations/content | Content recommendations |

### Sensors
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/sensors/ingest | Ingest reading (X-Device-Id + X-Device-Secret) |
| POST | /api/sensors/ingest/batch | Batch ingest (X-Device-Id + X-Device-Secret) |
| GET | /api/sensors/devices | List devices |
| POST | /api/sensors/devices | Create device (admin) |
| PUT | /api/sensors/devices/:id | Update device (admin) |
| GET | /api/sensors/readings/:deviceId | Get readings |

### Ledger
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/ledger/entries | Record payment |
| GET | /api/ledger/entries | List entries |
| GET | /api/ledger/reconciliation/:date | Get reconciliation |
| POST | /api/ledger/reconciliation/:date/close | Close day |

### Config (Admin only)
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/config | List configs |
| GET | /api/config/:key | Get config value |
| POST | /api/config | Create/update config |
| PUT | /api/config/:key | Update config |
| DELETE | /api/config/:key | Delete config |

### Extensions
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/extensions/clients | Create API client (admin) |
| GET | /api/extensions/clients | List clients (admin) |
| GET | /api/extensions/movies | Read movies (API key) |
| GET | /api/extensions/content | Read content (API key) |
| GET | /api/extensions/rides | Read rides (API key) |

## Error Response Format
```json
{
  "code": "VALIDATION_ERROR",
  "message": "Validation failed",
  "details": [{ "field": "title", "message": "Title required" }]
}
```

## HTTP Status Codes
- 200: Success
- 201: Created
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 409: Conflict (duplicate)
- 422: Validation Error
- 429: Rate Limited
- 500: Server Error
