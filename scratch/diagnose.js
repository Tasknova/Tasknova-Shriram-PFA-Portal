async function diagnoseCall() {
  const callId = 'call_8da222e9a769407f';
  console.log(`\n=== Diagnosing call: ${callId} ===\n`);

  // 1. Check current state
  const callsRes = await fetch(`http://localhost:3000/api/c2c/calls`);
  const callsData = await callsRes.json();
  const call = callsData.calls?.find((c) => c.call_id === callId);
  if (call) {
    console.log('Call status:', call.status);
    console.log('Transcript status:', call.transcript_status);
    console.log('Recording URL:', call.recording_url ? call.recording_url.substring(0, 80) + '...' : 'MISSING');
    console.log('Evaluations count:', call.c2c_evaluations?.length ?? 0);
    if (call.c2c_evaluations?.length > 0) {
      console.log('Evaluation status:', call.c2c_evaluations[0].status);
      console.log('Evaluation error:', call.c2c_evaluations[0].error_message);
      console.log('Overall score:', call.c2c_evaluations[0].overall_score);
    }
  } else {
    console.log('Call not found in DB');
  }

  // 2. Trigger re-evaluate
  console.log('\n--- Triggering re-evaluate ---');
  const evalRes = await fetch(`http://localhost:3000/api/c2c/evaluations/${callId}/re-evaluate`, { method: 'POST' });
  const evalData = await evalRes.json();
  console.log('Re-evaluate response:', evalRes.status, evalData);
}

diagnoseCall().catch(console.error);
