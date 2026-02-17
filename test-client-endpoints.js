const http = require('http');

const BASE_URL = 'http://localhost:3000';
const TEST_USER = {
  email: 'admin@statcosol.com',
  password: 'Admin@123'
};

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
          data: responseData
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

async function runTests() {
  console.log('=== Testing Client Endpoints ===\n');
  
  // Step 1: Login
  console.log('1. Authenticating...');
  try {
    const loginResponse = await makeRequest('POST', '/api/auth/login', TEST_USER);
    if (loginResponse.statusCode === 200 || loginResponse.statusCode === 201) {
      const loginData = JSON.parse(loginResponse.data);
      const token = loginData.accessToken;
      console.log('✓ Login successful\n');
      
      // Step 2: Test Client dashboard summary
      console.log('2. Testing Client Dashboard...');
      const summaryResponse = await makeRequest('GET', '/api/client/dashboard', null, {
        'Authorization': `Bearer ${token}`
      });
      console.log(`Status: ${summaryResponse.statusCode}`);
      if (summaryResponse.statusCode === 200) {
        const summary = JSON.parse(summaryResponse.data);
        console.log('Response:', JSON.stringify(summary, null, 2));
      } else {
        console.log('Error:', summaryResponse.data);
      }
      console.log('');
      
      // Step 3: Test Client compliance
      console.log('3. Testing Client Compliance Tasks...');
      const complianceResponse = await makeRequest('GET', '/api/client/compliance/tasks', null, {
        'Authorization': `Bearer ${token}`
      });
      console.log(`Status: ${complianceResponse.statusCode}`);
      if (complianceResponse.statusCode === 200) {
        const compliance = JSON.parse(complianceResponse.data);
        console.log(`Response: ${compliance.length} compliance items`);
        if (compliance.length > 0) {
          console.log('First item:', JSON.stringify(compliance[0], null, 2));
        }
      } else {
        console.log('Error:', complianceResponse.data);
      }
      console.log('');
      
      // Step 4: Test Client contractors
      console.log('4. Testing Client Contractors...');
      const contractorsResponse = await makeRequest('GET', '/api/client/contractors', null, {
        'Authorization': `Bearer ${token}`
      });
      console.log(`Status: ${contractorsResponse.statusCode}`);
      if (contractorsResponse.statusCode === 200) {
        const contractors = JSON.parse(contractorsResponse.data);
        console.log(`Response: ${contractors.length} contractors`);
        if (contractors.length > 0) {
          console.log('First contractor:', JSON.stringify(contractors[0], null, 2));
        }
      } else {
        console.log('Error:', contractorsResponse.data);
      }
      console.log('');
      
      // Step 5: Test Client audits
      console.log('5. Testing Client Audits...');
      const auditsResponse = await makeRequest('GET', '/api/client/audits', null, {
        'Authorization': `Bearer ${token}`
      });
      console.log(`Status: ${auditsResponse.statusCode}`);
      if (auditsResponse.statusCode === 200) {
        const audits = JSON.parse(auditsResponse.data);
        console.log(`Response: ${audits.length} audits`);
        if (audits.length > 0) {
          console.log('First audit:', JSON.stringify(audits[0], null, 2));
        }
      } else {
        console.log('Error:', auditsResponse.data);
      }
      
    } else {
      console.log('✗ Login failed:', loginResponse.statusCode);
      console.log(loginResponse.data);
    }
  } catch (error) {
    console.log('✗ Error:', error.message);
  }
  
  console.log('\n=== Testing Complete ===');
}

runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
