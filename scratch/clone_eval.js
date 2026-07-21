const fs = require('fs');

let content = fs.readFileSync('src/lib/aiCallingEvaluation.ts', 'utf8');

content = content.replace(/ai_evaluations/g, 'c2c_evaluations');
content = content.replace(/ai_calls/g, 'c2c_calls');
content = content.replace(/ai_transcripts/g, 'c2c_transcripts');
content = content.replace(/ai_agents\(name\)/g, 'from_number, to_number');
content = content.replace(/const agentRecord = getFirstRelationRecord\(call.ai_agents\)/g, '');
content = content.replace(/agentName: asString\(agentRecord\?.name, ''\) \|\| null/g, 'agentName: call.from_number');

fs.writeFileSync('src/lib/c2cEvaluation.ts', content);
console.log("Created c2cEvaluation.ts");
