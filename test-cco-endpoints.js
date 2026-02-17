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
  console.log('=== Testing CCO Endpoints ===\n');
  
  // Step 1: Login
  console.log('1. Authenticating...');
  try {
    const loginResponse = await makeRequest('POST', '/api/auth/login', TEST_USER);
    if (loginResponse.statusCode === 200 || loginResponse.statusCode === 201) {
      const loginData = JSON.parse(loginResponse.data);
      const token = loginData.accessToken;
      console.log('✓ Login successful\n');
      
      // Step 2: Test CCO endpoints
      console.log('2. Testing CCO Dashboard...');
      const summaryResponse = await makeRequest('GET', '/api/cco/dashboard', null, {
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
      
      console.log('3. Testing CCO CRM Users...');
      const crmsResponse = await makeRequest('GET', '/api/cco/crms-under-me', null, {
        'Authorization': `Bearer ${token}`
      });
      console.log(`Status: ${crmsResponse.statusCode}`);
      if (crmsResponse.statusCode === 200) {
        const crms = JSON.parse(crmsResponse.data);
        console.log('Response:', JSON.stringify(crms, null, 2));
      } else {
        console.log('Error:', crmsResponse.data);
      }
      console.log('');
      
      console.log('4. Testing CCO Clients...');
      const clientsResponse = await makeRequest('GET', '/api/cco/clients', null, {
        'Authorization': `Bearer ${token}`
      });
      console.log(`Status: ${clientsResponse.statusCode}`);
      if (clientsResponse.statusCode === 200) {
        const clients = JSON.parse(clientsResponse.data);
        console.log('Response:', JSON.stringify(clients, null, 2));
      } else {
        console.log('Error:', clientsResponse.data);
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
