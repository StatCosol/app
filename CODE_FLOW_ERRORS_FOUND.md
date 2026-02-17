# Code Flow Errors Found and Corrected

## Critical Issues Identified

### 1. **CORS Security Misconfiguration** (HIGH PRIORITY)
**File**: `backend/src/main.ts` (line 45)
**Issue**: Wildcard CORS origin conflicts with credentialed requests
- Line 30-32: `enableCors()` sets credentials to true with specific origins
- Line 45: Middleware override sets `Access-Control-Allow-Origin: *`
- **Problem**: Cannot use wildcard (`*`) with `credentials: true`. This violates CORS spec and will fail in browsers.
- **Impact**: Auth-protected endpoints will fail with CORS errors on production
- **Fix**: Remove the wildcard header override or use specific origins

### 2. **Generic Error Throws** (MEDIUM PRIORITY)
**File**: `backend/src/branches/branches-common.controller.ts` (line 102)
**Issue**: Throws generic `Error` instead of NestJS exception
```typescript
throw new Error('Access denied');
```
**Problem**: Won't be properly caught by NestJS exception filters, returns 500 instead of 403
**Fix**: Use `ForbiddenException`

**File**: `backend/src/compliances/compliance-applicability.service.ts` (line 29)
**Issue**: Throws generic `Error` instead of NestJS exception
```typescript
throw new Error('Branch not found');
```
**Problem**: Won't be properly caught by exception filters, returns 500 instead of 404
**Fix**: Use `NotFoundException`

**File**: `backend/src/assignments/assignment-rotation.service.ts`
**Issue**: Missing error handling for empty assignee pool
```typescript
if (!assignees.length) {
  this.logger.warn(`No active assignees found for ${type} rotation`);
  await qr.commitTransaction();
  return 0;
}
```
**Problem**: Should throw proper exception, not silently continue
**Fix**: Use `BadRequestException` or specific error

### 3. **Silent Error Suppression** (MEDIUM PRIORITY)
**File**: `backend/src/users/users.service.ts`
**Issue**: Empty catch block that suppresses errors
```typescript
this.regenerateUserCodesOnce().catch(() => {});
```
**Problem**: Any errors in `regenerateUserCodesOnce()` are silently ignored, making debugging impossible
**Fix**: Proper error logging or specific error handling

### 4. **Worker Process Leak** (LOW PRIORITY)
**Issue**: Jest test suite shows worker process doesn't exit gracefully
**Problem**: Could indicate unresolved promises or hanging connections in tests
**Fix**: Add `.unref()` to timers or ensure proper cleanup in test teardown

## Summary
- **3 Generic Error throws** need to be converted to NestJS exceptions
- **1 CORS security misconfiguration** needs immediate fix
- **1 Silent error handler** needs logging
- **1 Worker leak** in tests needs investigation

All issues are non-breaking from a compilation perspective but represent runtime/security problems.
