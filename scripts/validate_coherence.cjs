const fs = require('fs');

const verificationContent = fs.readFileSync('docs/VERIFICATION.md', 'utf8');
const todoContent = fs.readFileSync('docs/TODO.md', 'utf8');

const checks = {};
const checkRegex = /- (✅|🔲) (🤖|🧑|🤖🧑)?\s*`\[([A-Z0-9\.]+)\]`/g;
let match;
while ((match = checkRegex.exec(verificationContent)) !== null) {
    const isImplemented = match[1] === '✅';
    const id = match[3];
    const type = id.split('.').pop();
    checks[id] = { implemented: isImplemented, type };
}

const tasks = {};
const taskRegex = /### (?:✅ |⏳ |🔲 |🚨 )?\[(TASK-\d{3}(?:\.\d)?)\][\s\S]*?\*\*Covered checks:\*\* (.*?)(\n\n|\n- )/g;
while ((match = taskRegex.exec(todoContent)) !== null) {
    const taskId = match[1];
    let coveredStr = match[2];
    let covered = [];
    if (!coveredStr.includes('Transversal governance')) {
        const idMatches = coveredStr.match(/\[([A-Z0-9\.]+)\]/g);
        if (idMatches) {
            covered = idMatches.map(m => m.slice(1, -1));
        }
    }
    tasks[taskId] = covered;
}

const orphanChecks = [];
Object.keys(checks).forEach(checkId => {
    let found = false;
    Object.values(tasks).forEach(taskChecks => {
        if (taskChecks.includes(checkId)) found = true;
    });
    if (!found) orphanChecks.push(checkId);
});

const ghostChecks = [];
Object.keys(tasks).forEach(taskId => {
    tasks[taskId].forEach(checkId => {
        if (!checks[checkId]) ghostChecks.push({ taskId, checkId });
    });
});

console.log('Total checks:', Object.keys(checks).length);
console.log('Orphan checks (in VERIFICATION, missing in TODO):', orphanChecks);
console.log('Ghost checks (in TODO, missing in VERIFICATION):', ghostChecks);
