# Backend API - Short Notes


## GET /api/admin/users (paged)

The paged users endpoint now includes a `roleCode` field on each user item to make it easier for frontends to filter/display by role without additional requests.

Request:

- Method: GET
- Path: `/api/admin/users`
- Query params: `page`, `pageSize`, `q`, `roleId`, `status`, `sortBy`, `sortDir` (same as before)
- Authentication: Requires valid JWT and `ADMIN` role

Response (200):

```json
{
  "items": [
    {
      "id": 1,
      "roleId": 3,
      "roleCode": "CRM",
      "name": "Alice",
      "email": "alice@example.com",
      "mobile": null,
      "isActive": true,
      "createdAt": "2025-12-01T12:00:00.000Z"
    }
  ],
  "total": 42,
  "page": 1,
  "pageSize": 20
}
```

## GET /api/admin/users/list

Returns a flat list of users including their `roleCode` for simple dropdowns (unchanged).

Request:

- Method: GET
- Path: `/api/admin/users/list`
- Authentication: Requires valid JWT and `ADMIN` role (same guards as other admin routes)

Response (200):

```json
[ {
  "id": 1,
  "name": "Alice",
  "email": "alice@example.com",
  "roleCode": "CRM",
  "isActive": true
}, ... ]
```
