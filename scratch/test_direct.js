const fs = require('fs');

async function testClick2Call() {
  const p = {
    to_number: "919579026852",
    from_number: "919763798289",
    did: "101",
    transcript: true
  };
  
  console.log("Testing with from_number and to_number...");
  try {
    const res = await fetch('http://localhost:3000/api/c2c/calls/initiate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p)
    });
    const data = await res.json();
    console.log(`Result: ${res.status}`, data);
  } catch (e) {
    console.error(e.message);
  }
}
testClick2Call();
