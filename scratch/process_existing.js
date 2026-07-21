async function processExistingCalls() {
  console.log("Fetching existing C2C calls...");
  const res = await fetch('http://localhost:3000/api/c2c/calls?limit=100');
  const data = await res.json();
  const calls = data.calls || [];

  for (const call of calls) {
    if (call.transcript_status !== 'completed' || !call.c2c_evaluations || call.c2c_evaluations.length === 0) {
      console.log(`Processing call: ${call.call_id}`);
      // 1. Fetch transcript (which will also trigger evaluation)
      const transcriptRes = await fetch(`http://localhost:3000/api/c2c/calls/${call.call_id}/transcript-status`, {
        method: 'POST'
      });
      const transcriptData = await transcriptRes.json();
      console.log(`Transcript status:`, transcriptData.transcript_status);

      // 2. If it's ready, trigger re-evaluate just in case
      if (transcriptData.transcript_status === 'ready' || call.transcript_status === 'completed') {
        const evalRes = await fetch(`http://localhost:3000/api/c2c/evaluations/${call.call_id}/re-evaluate`, {
          method: 'POST'
        });
        const evalData = await evalRes.json();
        console.log(`Evaluation triggered:`, evalData);
      }
    }
  }
}

processExistingCalls().catch(console.error);
