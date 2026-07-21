const fs = require('fs');

async function testClick2Call() {
  const tokenRes = await fetch('http://localhost:3000/api/ai-agents/settings');
  // Just use the API directly by bypassing UI
  // Wait, I can just use the credentials from the DB or trigger the C2C endpoint with different payloads.
  console.log("Will hit local C2C endpoint with different DIDs");
  
  const testPayloads = [
    { from_number: "919763798289", to_number: "919579026852", did: "101" },
    { from_number: "919763798289", to_number: "919579026852", did: "02047320092" },
    { from_number: "919763798289", to_number: "919579026852", did: "9102047320092" },
    { from_number: "919763798289", to_number: "919579026852", did: "919763798289" },
    { from_number: "AGT_4BE8DF48", to_number: "919579026852", did: "101" }, // AI call format
  ];
  
  for (const p of testPayloads) {
    console.log(`Testing DID: ${p.did}, Agent: ${p.from_number}...`);
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
}

testClick2Call();
