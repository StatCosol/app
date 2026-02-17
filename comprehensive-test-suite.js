const https = require('https');
const http = require('http');

// Test configuration
const BASE_URL = 'http://localhost:3000';
const TEST_CREDENTIALS = {
  admin: { email: 'admin@statcosol.com', password: 'Admin@123' }
};

let adminToken = null;
let testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: []
};

// Helper function to make HTTP requests
function makeRequest(method, path, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(url, options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const jsonBody = body ? JSON.parse(body) : {};
          resolve({ status: res.statusCode, body: jsonBody, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, body: body, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// Test logging
function logTest(category, name, status, details = '') {
  testResults.total++;
  const result = {
    category,
    name,
    status,
    details,
    timestamp: new Date().toISOString()
  };
  
  if (status === 'PASS') {
    testResults.passed++;
    console.log(`✅ [${category}] ${name}`);
  } else if (status === 'FAIL') {
    testResults.failed++;
    console.log(`❌ [${category}] ${name} - ${details}`);
  } else if (status === 'SKIP') {
    testResults.skipped++;
    console.log(`⏭️  [${category}] ${name} - ${details}`);
  }
  
  testResults.tests.push(result);
}

// Authentication Tests
async function testAuthentication() {
  console.log('\n🔐 === AUTHENTICATION TESTS ===\n');
  
  try {
    // Test 1: Valid login
    const loginRes = await makeRequest('POST', '/api/auth/login', TEST_CREDENTIALS.admin);
    if ((loginRes.status === 200 || loginRes.status === 201) && loginRes.body.accessToken) {
      adminToken = loginRes.body.accessToken;
      logTest('AUTH', 'Login with valid credentials', 'PASS', `Token received (${loginRes.status})`);
    } else {
      logTest('AUTH', 'Login with valid credentials', 'FAIL', `Status: ${loginRes.status}, Body: ${JSON.stringify(loginRes.body)}`);
      return false;
    }
    
    // Test 2: Invalid login
    const invalidLogin = await makeRequest('POST', '/api/auth/login', {
      email: 'admin@statcosol.com',
      password: 'wrongpassword'
    });
    if (invalidLogin.status === 401) {
      logTest('AUTH', 'Login with invalid credentials', 'PASS', 'Correctly rejected');
    } else {
      logTest('AUTH', 'Login with invalid credentials', 'FAIL', `Status: ${invalidLogin.status}`);
    }
    
    // Test 3: Missing credentials
    const noCredsLogin = await makeRequest('POST', '/api/auth/login', {});
    if (noCredsLogin.status === 400 || noCredsLogin.status === 401) {
      logTest('AUTH', 'Login without credentials', 'PASS', 'Correctly rejected');
    } else {
      logTest('AUTH', 'Login without credentials', 'FAIL', `Status: ${noCredsLogin.status}`);
    }
    
    // Test 4: Invalid token
    const invalidTokenRes = await makeRequest('GET', '/api/admin/dashboard/summary', null, 'invalid-token');
    if (invalidTokenRes.status === 401) {
      logTest('AUTH', 'Request with invalid token', 'PASS', 'Correctly rejected');
    } else {
      logTest('AUTH', 'Request with invalid token', 'FAIL', `Status: ${invalidTokenRes.status}`);
    }
    
    return true;
  } catch (error) {
    logTest('AUTH', 'Authentication tests', 'FAIL', error.message);
    return false;
  }
}

// Infrastructure Tests
async function testInfrastructure() {
  console.log('\n🏗️  === INFRASTRUCTURE TESTS ===\n');
  
  try {
    // Test 1: Health check
    const healthRes = await makeRequest('GET', '/api/health');
    if (healthRes.status === 200 && healthRes.body.ok) {
      logTest('INFRA', 'Health check endpoint', 'PASS');
    } else {
      logTest('INFRA', 'Health check endpoint', 'FAIL', `Status: ${healthRes.status}`);
    }
    
    // Test 2: CORS headers
    if (healthRes.headers['access-control-allow-origin']) {
      logTest('INFRA', 'CORS headers present', 'PASS');
    } else {
      logTest('INFRA', 'CORS headers present', 'FAIL', 'No CORS headers');
    }
    
    // Test 3: Security headers
    if (healthRes.headers['x-content-type-options']) {
      logTest('INFRA', 'Security headers (Helmet)', 'PASS');
    } else {
      logTest('INFRA', 'Security headers (Helmet)', 'FAIL', 'Missing security headers');
    }
    
  } catch (error) {
    logTest('INFRA', 'Infrastructure tests', 'FAIL', error.message);
  }
}

// Admin Module Tests
async function testAdminModule() {
  console.log('\n👨‍💼 === ADMIN MODULE TESTS ===\n');
  
  if (!adminToken) {
    logTest('ADMIN', 'Admin module tests', 'SKIP', 'No admin token available');
    return;
  }
  
  try {
    // Dashboard endpoints
    const dashboardEndpoints = [
      '/api/admin/dashboard/summary',
      '/api/admin/clients',
      '/api/admin/users',
      '/api/admin/assignments',
      '/api/admin/audit-logs',
      '/api/admin/notifications',
      '/api/admin/payroll/client-settings',
      '/api/admin/payroll/templates',
      '/api/admin/payroll/runs'
    ];
    
    for (const endpoint of dashboardEndpoints) {
      try {
        const res = await makeRequest('GET', endpoint, null, adminToken);
        if (res.status === 200) {
          logTest('ADMIN', `GET ${endpoint}`, 'PASS');
        } else if (res.status === 404) {
          logTest('ADMIN', `GET ${endpoint}`, 'FAIL', 'Endpoint not found (404)');
        } else {
          logTest('ADMIN', `GET ${endpoint}`, 'FAIL', `Status: ${res.status}`);
        }
      } catch (error) {
        logTest('ADMIN', `GET ${endpoint}`, 'FAIL', error.message);
      }
    }
    
  } catch (error) {
    logTest('ADMIN', 'Admin module tests', 'FAIL', error.message);
  }
}

// CEO Module Tests
async function testCEOModule() {
  console.log('\n👔 === CEO MODULE TESTS ===\n');
  
  if (!adminToken) {
    logTest('CEO', 'CEO module tests', 'SKIP', 'No token available');
    return;
  }
  
  const ceoEndpoints = [
    '/api/ceo/dashboard/summary',
    '/api/ceo/dashboard/client-overview',
    '/api/ceo/dashboard/cco-crm-performance',
    '/api/ceo/dashboard/governance-compliance',
    '/api/ceo/dashboard/recent-escalations'
  ];
  
  for (const endpoint of ceoEndpoints) {
    try {
      const res = await makeRequest('GET', endpoint, null, adminToken);
      if (res.status === 200) {
        logTest('CEO', `GET ${endpoint}`, 'PASS');
      } else if (res.status === 404) {
        logTest('CEO', `GET ${endpoint}`, 'FAIL', 'Endpoint not found (404)');
      } else if (res.status === 403) {
        logTest('CEO', `GET ${endpoint}`, 'SKIP', 'Requires CEO role (403)');
      } else {
        logTest('CEO', `GET ${endpoint}`, 'FAIL', `Status: ${res.status}`);
      }
    } catch (error) {
      logTest('CEO', `GET ${endpoint}`, 'FAIL', error.message);
    }
  }
}

// CRM Module Tests
async function testCRMModule() {
  console.log('\n📊 === CRM MODULE TESTS ===\n');
  
  if (!adminToken) {
    logTest('CRM', 'CRM module tests', 'SKIP', 'No token available');
    return;
  }
  
  const crmEndpoints = [
    '/api/crm/dashboard',
    '/api/crm/dashboard/due-compliances?tab=OVERDUE',
    '/api/crm/dashboard/low-coverage-branches',
    '/api/crm/dashboard/pending-documents',
    '/api/crm/dashboard/queries'
  ];
  
  for (const endpoint of crmEndpoints) {
    try {
      const res = await makeRequest('GET', endpoint, null, adminToken);
      if (res.status === 200) {
        logTest('CRM', `GET ${endpoint}`, 'PASS');
      } else if (res.status === 404) {
        logTest('CRM', `GET ${endpoint}`, 'FAIL', 'Endpoint not found (404)');
      } else if (res.status === 403) {
        logTest('CRM', `GET ${endpoint}`, 'SKIP', 'Requires CRM role (403)');
      } else {
        logTest('CRM', `GET ${endpoint}`, 'FAIL', `Status: ${res.status}`);
      }
    } catch (error) {
      logTest('CRM', `GET ${endpoint}`, 'FAIL', error.message);
    }
  }
}

// CCO Module Tests
async function testCCOModule() {
  console.log('\n🎯 === CCO MODULE TESTS ===\n');
  
  if (!adminToken) {
    logTest('CCO', 'CCO module tests', 'SKIP', 'No token available');
    return;
  }
  
  const ccoEndpoints = [
    '/api/cco/dashboard',
    '/api/cco/crms-under-me',
    '/api/cco/clients'
  ];
  
  for (const endpoint of ccoEndpoints) {
    try {
      const res = await makeRequest('GET', endpoint, null, adminToken);
      if (res.status === 200) {
        logTest('CCO', `GET ${endpoint}`, 'PASS');
      } else if (res.status === 404) {
        logTest('CCO', `GET ${endpoint}`, 'FAIL', 'Endpoint not found (404)');
      } else if (res.status === 403) {
        logTest('CCO', `GET ${endpoint}`, 'SKIP', 'Requires CCO role (403)');
      } else {
        logTest('CCO', `GET ${endpoint}`, 'FAIL', `Status: ${res.status}`);
      }
    } catch (error) {
      logTest('CCO', `GET ${endpoint}`, 'FAIL', error.message);
    }
  }
}

// Auditor Module Tests
async function testAuditorModule() {
  console.log('\n🔍 === AUDITOR MODULE TESTS ===\n');
  
  if (!adminToken) {
    logTest('AUDITOR', 'Auditor module tests', 'SKIP', 'No token available');
    return;
  }
  
  const auditorEndpoints = [
    '/api/auditor/dashboard/summary',
    '/api/auditor/audits',
    '/api/auditor/compliance'
  ];
  
  for (const endpoint of auditorEndpoints) {
    try {
      const res = await makeRequest('GET', endpoint, null, adminToken);
      if (res.status === 200) {
        logTest('AUDITOR', `GET ${endpoint}`, 'PASS');
      } else if (res.status === 404) {
        logTest('AUDITOR', `GET ${endpoint}`, 'FAIL', 'Endpoint not found (404)');
      } else if (res.status === 403) {
        logTest('AUDITOR', `GET ${endpoint}`, 'SKIP', 'Requires AUDITOR role (403)');
      } else {
        logTest('AUDITOR', `GET ${endpoint}`, 'FAIL', `Status: ${res.status}`);
      }
    } catch (error) {
      logTest('AUDITOR', `GET ${endpoint}`, 'FAIL', error.message);
    }
  }
}

// Client Module Tests
async function testClientModule() {
  console.log('\n🏢 === CLIENT MODULE TESTS ===\n');
  
  if (!adminToken) {
    logTest('CLIENT', 'Client module tests', 'SKIP', 'No token available');
    return;
  }
  
  const clientEndpoints = [
    '/api/client/dashboard',
    '/api/client/compliance/tasks',
    '/api/client/contractors',
    '/api/client/audits'
  ];
  
  for (const endpoint of clientEndpoints) {
    try {
      const res = await makeRequest('GET', endpoint, null, adminToken);
      if (res.status === 200) {
        logTest('CLIENT', `GET ${endpoint}`, 'PASS');
      } else if (res.status === 404) {
        logTest('CLIENT', `GET ${endpoint}`, 'FAIL', 'Endpoint not found (404)');
      } else if (res.status === 403) {
        logTest('CLIENT', `GET ${endpoint}`, 'SKIP', 'Requires CLIENT role (403)');
      } else {
        logTest('CLIENT', `GET ${endpoint}`, 'FAIL', `Status: ${res.status}`);
      }
    } catch (error) {
      logTest('CLIENT', `GET ${endpoint}`, 'FAIL', error.message);
    }
  }
}

// Contractor Module Tests
async function testContractorModule() {
  console.log('\n👷 === CONTRACTOR MODULE TESTS ===\n');
  
  if (!adminToken) {
    logTest('CONTRACTOR', 'Contractor module tests', 'SKIP', 'No token available');
    return;
  }
  
  const contractorEndpoints = [
    '/api/contractor/dashboard',
    '/api/contractor/documents'
  ];
  
  for (const endpoint of contractorEndpoints) {
    try {
      const res = await makeRequest('GET', endpoint, null, adminToken);
      if (res.status === 200) {
        logTest('CONTRACTOR', `GET ${endpoint}`, 'PASS');
      } else if (res.status === 404) {
        logTest('CONTRACTOR', `GET ${endpoint}`, 'FAIL', 'Endpoint not found (404)');
      } else if (res.status === 403) {
        logTest('CONTRACTOR', `GET ${endpoint}`, 'SKIP', 'Requires CONTRACTOR role (403)');
      } else {
        logTest('CONTRACTOR', `GET ${endpoint}`, 'FAIL', `Status: ${res.status}`);
      }
    } catch (error) {
      logTest('CONTRACTOR', `GET ${endpoint}`, 'FAIL', error.message);
    }
  }
}

// Payroll Module Tests
async function testPayrollModule() {
  console.log('\n💰 === PAYROLL MODULE TESTS ===\n');
  
  if (!adminToken) {
    logTest('PAYROLL', 'Payroll module tests', 'SKIP', 'No token available');
    return;
  }
  
  const payrollEndpoints = [
    '/api/payroll/dashboard',
    '/api/payroll/templates',
    '/api/payroll/payslips'
  ];
  
  for (const endpoint of payrollEndpoints) {
    try {
      const res = await makeRequest('GET', endpoint, null, adminToken);
      if (res.status === 200) {
        logTest('PAYROLL', `GET ${endpoint}`, 'PASS');
      } else if (res.status === 404) {
        logTest('PAYROLL', `GET ${endpoint}`, 'FAIL', 'Endpoint not found (404)');
      } else if (res.status === 403) {
        logTest('PAYROLL', `GET ${endpoint}`, 'SKIP', 'Requires PAYROLL role (403)');
      } else {
        logTest('PAYROLL', `GET ${endpoint}`, 'FAIL', `Status: ${res.status}`);
      }
    } catch (error) {
      logTest('PAYROLL', `GET ${endpoint}`, 'FAIL', error.message);
    }
  }
}

// Notification System Tests
async function testNotifications() {
  console.log('\n🔔 === NOTIFICATION SYSTEM TESTS ===\n');
  
  if (!adminToken) {
    logTest('NOTIFICATIONS', 'Notification tests', 'SKIP', 'No token available');
    return;
  }
  
  try {
    // Test inbox
    const inboxRes = await makeRequest('GET', '/api/notifications/list?box=inbox', null, adminToken);
    if (inboxRes.status === 200) {
      logTest('NOTIFICATIONS', 'GET inbox list', 'PASS');
    } else {
      logTest('NOTIFICATIONS', 'GET inbox list', 'FAIL', `Status: ${inboxRes.status}`);
    }
    
    // Test outbox
    const outboxRes = await makeRequest('GET', '/api/notifications/list?box=outbox', null, adminToken);
    if (outboxRes.status === 200) {
      logTest('NOTIFICATIONS', 'GET outbox list', 'PASS');
    } else {
      logTest('NOTIFICATIONS', 'GET outbox list', 'FAIL', `Status: ${outboxRes.status}`);
    }
    
  } catch (error) {
    logTest('NOTIFICATIONS', 'Notification tests', 'FAIL', error.message);
  }
}

// Common Endpoints Tests
async function testCommonEndpoints() {
  console.log('\n🔧 === COMMON ENDPOINTS TESTS ===\n');
  
  if (!adminToken) {
    logTest('COMMON', 'Common endpoints tests', 'SKIP', 'No token available');
    return;
  }
  
  const commonEndpoints = [
    '/api/branches',
    '/api/compliance/master',
    '/api/assignments/rotation'
  ];
  
  for (const endpoint of commonEndpoints) {
    try {
      const res = await makeRequest('GET', endpoint, null, adminToken);
      if (res.status === 200) {
        logTest('COMMON', `GET ${endpoint}`, 'PASS');
      } else if (res.status === 404) {
        logTest('COMMON', `GET ${endpoint}`, 'FAIL', 'Endpoint not found (404)');
      } else {
        logTest('COMMON', `GET ${endpoint}`, 'FAIL', `Status: ${res.status}`);
      }
    } catch (error) {
      logTest('COMMON', `GET ${endpoint}`, 'FAIL', error.message);
    }
  }
}

// Generate final report
function generateReport() {
  console.log('\n' + '='.repeat(80));
  console.log('📊 COMPREHENSIVE TEST REPORT');
  console.log('='.repeat(80));
  console.log(`\nTotal Tests: ${testResults.total}`);
  console.log(`✅ Passed: ${testResults.passed} (${((testResults.passed/testResults.total)*100).toFixed(1)}%)`);
  console.log(`❌ Failed: ${testResults.failed} (${((testResults.failed/testResults.total)*100).toFixed(1)}%)`);
  console.log(`⏭️  Skipped: ${testResults.skipped} (${((testResults.skipped/testResults.total)*100).toFixed(1)}%)`);
  
  console.log('\n📋 Summary by Category:');
  const categories = {};
  testResults.tests.forEach(test => {
    if (!categories[test.category]) {
      categories[test.category] = { total: 0, passed: 0, failed: 0, skipped: 0 };
    }
    categories[test.category].total++;
    if (test.status === 'PASS') categories[test.category].passed++;
    if (test.status === 'FAIL') categories[test.category].failed++;
    if (test.status === 'SKIP') categories[test.category].skipped++;
  });
  
  Object.keys(categories).sort().forEach(cat => {
    const stats = categories[cat];
    console.log(`  ${cat}: ${stats.passed}/${stats.total} passed, ${stats.failed} failed, ${stats.skipped} skipped`);
  });
  
  console.log('\n❌ Failed Tests:');
  const failedTests = testResults.tests.filter(t => t.status === 'FAIL');
  if (failedTests.length === 0) {
    console.log('  None! 🎉');
  } else {
    failedTests.forEach(test => {
      console.log(`  - [${test.category}] ${test.name}: ${test.details}`);
    });
  }
  
  console.log('\n' + '='.repeat(80));
  console.log(`Test completed at: ${new Date().toISOString()}`);
  console.log('='.repeat(80) + '\n');
  
  // Save results to file
  const fs = require('fs');
  fs.writeFileSync('test-results.json', JSON.stringify(testResults, null, 2));
  console.log('📄 Detailed results saved to: test-results.json\n');
}

// Main test runner
async function runAllTests() {
  console.log('🚀 Starting Comprehensive Test Suite for StatCo Comply');
  console.log('Backend URL:', BASE_URL);
  console.log('Start Time:', new Date().toISOString());
  console.log('='.repeat(80) + '\n');
  
  await testInfrastructure();
  await testAuthentication();
  await testAdminModule();
  await testCEOModule();
  await testCRMModule();
  await testCCOModule();
  await testAuditorModule();
  await testClientModule();
  await testContractorModule();
  await testPayrollModule();
  await testNotifications();
  await testCommonEndpoints();
  
  generateReport();
}

// Run tests
runAllTests().catch(error => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});
