// Starts every lab api.js listed in labs.json in this one process.
// Run directly (node start-apis.js) or automatically via `npm run dev` in sd101-ui.
const fs = require('fs');
const path = require('path');
const labs = require('./labs.json');

for (const [topic, levels] of Object.entries(labs)) {
  for (const level of Object.keys(levels)) {
    const file = path.join(__dirname, topic, `${topic}-${level}`, 'api.js');
    if (fs.existsSync(file)) require(file);
    else console.warn(`missing ${path.relative(__dirname, file)}`);
  }
}
