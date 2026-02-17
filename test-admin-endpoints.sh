#!/bin/bash

# StatCo Admin Endpoint Testing Script
# Tests all accessible admin endpoints with ADMIN role

# Get JWT token
echo "=== Getting JWT Token ==="
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d @test-login.json | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)

echo "Token obtained: ${TOKEN:0:50}..."
echo ""

# Test Admin Dashboard Endpoints
echo "=== Testing Admin Dashboard Endpoints ==="
echo ""

echo "1. GET /api/admin/dashboard/summary"
curl -s -X GET http://localhost:3000/api/admin/dashboard/summary \
  -H "Authorization: Bearer $TOKEN" | head -c 200
echo ""
echo ""

echo "2. GET /api/admin/dashboard/system-health"
curl -s -X GET http://localhost:3000/api/admin/dashboard/system-health \
  -H "Authorization: Bearer $TOKEN" | head -c 200
echo ""
echo ""

echo "3. GET /api/admin/clients"
curl -s -X GET http://localhost:3000/api/admin/clients \
  -H "Authorization: Bearer $TOKEN" | head -c 200
echo ""
echo ""

echo "4. GET /api/admin/users"
curl -s -X GET http://localhost:3000/api/admin/users \
  -H "Authorization: Bearer $TOKEN" | head -c 200
echo ""
echo ""

echo "5. GET /api/admin/assignments"
curl -s -X GET http://localhost:3000/api/admin/assignments \
  -H "Authorization: Bearer $TOKEN" | head -c 200
echo ""
echo ""

echo "6. GET /api/admin/notifications"
curl -s -X GET http://localhost:3000/api/admin/notifications \
  -H "Authorization: Bearer $TOKEN" | head -c 200
echo ""
echo ""

echo "=== Testing Complete ==="
