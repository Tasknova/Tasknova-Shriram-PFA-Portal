const fs = require('fs');

async function testAiCall() {
  const p = {
    customer_number: "919579026852",
    agent_id: "AGT_4BE8DF48", // ID for Shriram_PFA maybe? Or something else. Let me use one from recent calls
    did: "101",
    transcript: true
  };
  
  console.log("Testing AI Call Initiate...");
  try {
    const res = await fetch('http://localhost:3000/api/ai-agents/calls/initiate', {
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
testAiCall();
