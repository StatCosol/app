const https = require('http');

// Login first
const loginData = JSON.stringify({
  email: 'admin@statcosol.com',
  password: 'Admin@123'
});

const loginOptions = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': loginData.length
  }
};

console.log('=== Testing CEO Dashboard Endpoints ===\n');
console.log('1. Logging in...');

const loginReq = https.request(loginOptions, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    if (res.statusCode === 200 || res.statusCode === 201) {
      const loginResponse = JSON.parse(data);
      const token = loginResponse.accessToken;
      console.log('✓ Login successful\n');
      
      // Test CEO endpoints
      testCeoEndpoints(token);
    } else {
      console.log('✗ Login failed:', res.statusCode, data);
    }
  });
});

loginReq.on('error', (error) => {
  console.error('Login error:', error);
});

loginReq.write(loginData);
loginReq.end();

function testCeoEndpoints(token) {
  const endpoints = [
    '/api/ceo/dashboard/summary',
    '/api/ceo/dashboard/client-overview',
    '/api/ceo/dashboard/cco-crm-performance',
    '/api/ceo/dashboard/governance-compliance',
    '/api/ceo/dashboard/recent-escalations'
  ];
  
  let index = 0;
  
  function testNext() {
    if (index >= endpoints.length) {
      console.log('\n=== CEO Dashboard Testing Complete ===');
      return;
    }
    
    const endpoint = endpoints[index];
    console.log(`${index + 2}. Testing GET ${endpoint}`);
    
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: endpoint,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('✓ Success:', res.statusCode);
          try {
            const json = JSON.parse(data);
            console.log(JSON.stringify(json, null, 2));
          } catch (e) {
            console.log(data);
          }
        } else {
          console.log('✗ Failed:', res.statusCode, data);
        }
        console.log('');
        index++;
        testNext();
      });
    });
    
    req.on('error', (error) => {
      console.error('✗ Request error:', error.message);
      console.log('');
      index++;
      testNext();
    });
    
    req.end();
  }
  
  testNext();
}
