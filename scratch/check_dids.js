const fs = require('fs');

async function checkDids() {
  try {
    const res = await fetch('http://localhost:3000/api/ai-agents/calls?limit=10');
    const data = await res.json();
    console.log("Recent calls DIDs:");
    if (data.calls) {
      data.calls.forEach(c => console.log(`Call ID: ${c.call_id}, DID: ${c.did}, From: ${c.agent_number}, To: ${c.customer_number}`));
    }
  } catch (e) {
    console.error(e);
  }
}
checkDids();
