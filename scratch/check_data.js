async function checkData() {
  // Check evaluations API directly
  const evRes = await fetch('http://localhost:3000/api/c2c/evaluations?_t=' + Date.now());
  const evData = await evRes.json();
  console.log('\n=== Evaluations API ===');
  if (evData.evaluations?.length > 0) {
    const ev = evData.evaluations[0];
    console.log('Evaluation found:');
    console.log('  call_id:', ev.call_id);
    console.log('  status:', ev.status);
    console.log('  score:', ev.score);
    console.log('  overall_score:', ev.overall_score);
  } else {
    console.log('No evaluations found');
  }

  // Check calls API
  const callsRes = await fetch('http://localhost:3000/api/c2c/calls?_t=' + Date.now());
  const callsData = await callsRes.json();
  const call = callsData.calls?.[0];
  console.log('\n=== Calls API ===');
  console.log('Call found:', call?.call_id);
  console.log('c2c_evaluations count:', call?.c2c_evaluations?.length);
  console.log('c2c_evaluations[0]:', JSON.stringify(call?.c2c_evaluations?.[0], null, 2));
}
checkData().catch(console.error);
