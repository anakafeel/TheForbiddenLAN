const fs = require('fs');
const filepath = 'packages/mobile/.env.local';
let code = fs.readFileSync(filepath, 'utf8');

code = code.replace(
  `EXPO_PUBLIC_MOCK_MODE=true`,
  `EXPO_PUBLIC_MOCK_MODE=false`
);

fs.writeFileSync(filepath, code);
