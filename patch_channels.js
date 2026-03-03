const fs = require('fs');
const filepath = 'packages/mobile/src/screens/Channels.jsx';
let code = fs.readFileSync(filepath, 'utf8');

// replace mock channel list
code = code.replace(
  `  const [channels, setChannels] = useState(CONFIG.MOCK_MODE ? MOCK_CHANNELS : []);`,
  `  // const [channels, setChannels] = useState(CONFIG.MOCK_MODE ? MOCK_CHANNELS : []);
  const [channels, setChannels] = useState(MOCK_CHANNELS); // Initial state before fetch`
);

code = code.replace(
  `      socket.emit('list-channels');\n      socket.on('channels', list => setChannels(list));\n      return () => socket.off('channels');`,
  `      // socket.emit('list-channels');
      // socket.on('channels', list => setChannels(list));
      // return () => socket.off('channels');
      
      // Real API fetch
      const jwt = useStore.getState().jwt; // We need to import useStore at the top
      fetch(\`\$\{CONFIG.API_URL\}/talkgroups\`, {
        headers: { Authorization: \`Bearer \$\{jwt\}\` }
      })
      .then(res => res.json())
      .then(data => {
        const channelData = data.map(tg => ({
          id: tg.id,
          name: tg.name,
          status: 'active',
          users: 0,
          transmitting: false
        }));
        setChannels(channelData);
      })
      .catch(err => console.error('Failed to fetch channels:', err));`
);

// Add missing useStore import
code = code.replace(
  `import { CONFIG } from '../config';`,
  `import { CONFIG } from '../config';
import { useStore } from '../store';`
);

fs.writeFileSync(filepath, code);
