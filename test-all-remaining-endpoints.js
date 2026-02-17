const http = require('http');

// Test configuration
const BASE_URL = 'http://localhost:3000';
const TEST_USER = {
  email: 'admin@statcosol.com',
  password: 'Admin@123'
};

let token = '';
let testResults = {
  passed: 0,
  failed: 0,
  total: 0,
  details: []
};

// Helper function to make HTTP requests
function makeRequest(method, path, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          data: responseData,
          headers: res.headers
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// Test a single endpoint
async function testEndpoint(name, method, path, expectedStatus = 200) {
  testResults.total++;
  try {
    const response = await makeRequest(method, path, null, {
      'Authorization': `Bearer ${token}`
    });
    
    const passed = response.statusCode === expectedStatus;
    if (passed) {
      testResults.passed++;
      console.log(`✓ ${name}: ${response.statusCode}`);
      try {
        const json = JSON.parse(response.data);
        console.log(`  Data: ${JSON.stringify(json).substring(0, 100)}...`);
      } catch (e) {
        console.log(`  Data: ${response.data.substring(0, 100)}...`);
      }
    } else {
      testResults.failed++;
      console.log(`✗ ${name}: Expected ${expectedStatus}, got ${response.statusCode}`);
      console.log(`  Error: ${response.data.substring(0, 200)}`);
    }
    
    testResults.details.push({
      name,
      method,
      path,
      expected: expectedStatus,
      actual: response.statusCode,
      passed
    });
  } catch (error) {
    testResults.failed++;
    console.log(`✗ ${name}: ${error.message}`);
    testResults.details.push({
      name,
      method,
      path,
      expected: expectedStatus,
      actual: 'ERROR',
      passed: false,
      error: error.message
    });
  }
  console.log('');
}

// Main test function
async function runTests() {
  console.log('=== StatCo Comply - Comprehensive Endpoint Testing ===\n');
  
  // Step 1: Login
  console.log('1. Authenticating...');
  try {
    const loginResponse = await makeRequest('POST', '/api/auth/login', TEST_USER);
    if (loginResponse.statusCode === 200 || loginResponse.statusCode === 201) {
      const loginData = JSON.parse(loginResponse.data);
      token = loginData.accessToken;
      console.log('✓ Login successful\n');
    } else {
      console.log('✗ Login failed:', loginResponse.statusCode);
      return;
    }
  } catch (error) {
    console.log('✗ Login error:', error.message);
    return;
  }

  // Step 2: Test CCO Module
  console.log('=== Testing CCO Module ===\n');
  await testEndpoint('CCO Dashboard', 'GET', '/api/cco/dashboard');
  await testEndpoint('CCO CRM Users', 'GET', '/api/cco/crms-under-me');
  await testEndpoint('CCO Clients', 'GET', '/api/cco/clients');
  
  // Step 3: Test Client Module
  console.log('=== Testing Client Module ===\n');
  await testEndpoint('Client Dashboard', 'GET', '/api/client/dashboard');
  await testEndpoint('Client Compliance Tasks', 'GET', '/api/client/compliance/tasks');
  await testEndpoint('Client Contractors', 'GET', '/api/client/contractors');
  await testEndpoint('Client Audits', 'GET', '/api/client/audits');
  
  // Step 4: Test Contractor Module
  console.log('=== Testing Contractor Module ===\n');
  await testEndpoint('Contractor Dashboard', 'GET', '/api/contractor/dashboard');
  await testEndpoint('Contractor Documents', 'GET', '/api/contractor/documents');
  
  // Step 5: Test Payroll Module
  console.log('=== Testing Payroll Module ===\n');
  await testEndpoint('Payroll Dashboard', 'GET', '/api/payroll/dashboard');
  await testEndpoint('Payroll Runs', 'GET', '/api/payroll/runs');
  await testEndpoint('Payroll Templates', 'GET', '/api/payroll/templates');
  await testEndpoint('Payslips', 'GET', '/api/payroll/payslips');
  
  // Step 6: Test Reports Module
  console.log('=== Testing Reports Module ===\n');
  await testEndpoint('Reports List', 'GET', '/api/reports');
  await testEndpoint('Reports Generate', 'GET', '/api/reports/generate');
  
  // Step 7: Test Notifications
  console.log('=== Testing Notifications Module ===\n');
  await testEndpoint('Notifications List', 'GET', '/api/notifications/list');
  await testEndpoint('Notifications Inbox', 'GET', '/api/notifications/inbox');
  await testEndpoint('Notifications Outbox', 'GET', '/api/notifications/outbox');
  
  // Step 8: Test Admin Additional Endpoints
  console.log('=== Testing Additional Admin Endpoints ===\n');
  await testEndpoint('Admin System Health', 'GET', '/api/admin/dashboard/system-health');
  await testEndpoint('Admin Branches', 'GET', '/api/admin/branches');
  await testEndpoint('Admin Reminders Status', 'GET', '/api/admin/reminders/status');
  
  // Step 9: Test Edge Cases
  console.log('=== Testing Edge Cases ===\n');
  
  // Invalid token
  const oldToken = token;
  token = 'invalid_token_12345';
  await testEndpoint('Invalid Token Test', 'GET', '/api/admin/dashboard/summary', 401);
  token = oldToken;
  
  // Missing parameters (if applicable)
  await testEndpoint('Missing Params Test', 'GET', '/api/admin/clients?page=invalid', 200); // Should handle gracefully
  
  // Print Summary
  console.log('=== Test Summary ===\n');
  console.log(`Total Tests: ${testResults.total}`);
  console.log(`Passed: ${testResults.passed} (${Math.round(testResults.passed/testResults.total*100)}%)`);
  console.log(`Failed: ${testResults.failed} (${Math.round(testResults.failed/testResults.total*100)}%)`);
  console.log('\n=== Failed Tests ===\n');
  
  const failedTests = testResults.details.filter(t => !t.passed);
  if (failedTests.length === 0) {
    console.log('No failed tests! 🎉');
  } else {
    failedTests.forEach(test => {
      console.log(`✗ ${test.name}`);
      console.log(`  ${test.method} ${test.path}`);
      console.log(`  Expected: ${test.expected}, Got: ${test.actual}`);
      if (test.error) {
        console.log(`  Error: ${test.error}`);
      }
      console.log('');
    });
  }
  
  console.log('\n=== Testing Complete ===');
}

// Run the tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
