const fs = require('fs');
const path = require('path');

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let originalContent = content;

      // Match basic toLocaleString without options
      content = content.replace(/\.toLocaleString\(\"es-CL\"\)/g, 
        `.toLocaleString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })`);
      
      content = content.replace(/\.toLocaleString\(\"en-US\"\)/g, 
        `.toLocaleString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })`);
        
      content = content.replace(/\.toLocaleString\(\)/g, 
        `.toLocaleString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })`);

      // Match toLocaleTimeString
      content = content.replace(/\.toLocaleTimeString\(\"es-CL\"\)/g, 
        `.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false })`);
        
      content = content.replace(/\.toLocaleTimeString\(\"en-US\"/g, 
        `.toLocaleTimeString("es-CL"`);
        
      content = content.replace(/\.toLocaleTimeString\(\)/g, 
        `.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false })`);

      // We should also replace options inside if they exist to force hour12: false
      // This is trickier. Let's just blindly inject hour12: false if options exist
      content = content.replace(/toLocaleString\("es-CL",\s*\{/g, `toLocaleString("es-CL", { hour12: false,`);
      content = content.replace(/toLocaleString\("en-US",\s*\{/g, `toLocaleString("es-CL", { hour12: false,`);
      content = content.replace(/toLocaleTimeString\("es-CL",\s*\{/g, `toLocaleTimeString("es-CL", { hour12: false,`);
      content = content.replace(/toLocaleTimeString\("en-US",\s*\{/g, `toLocaleTimeString("es-CL", { hour12: false,`);

      if (content !== originalContent) {
        fs.writeFileSync(fullPath, content);
        console.log(`Updated ${fullPath}`);
      }
    }
  }
}

processDir(path.join(__dirname, '../ops-console/src'));
