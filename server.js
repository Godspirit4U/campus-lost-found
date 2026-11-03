require('dotenv').config();
const app = require('./src/app');
const { connectDB } = require('./src/config/db');
const { archiveStaleItems } = require('./src/utils/housekeeping');

const PORT = process.env.PORT || 3000;
const DAY = 24 * 60 * 60 * 1000;

async function start() {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`[server] listening on http://localhost:${PORT}`);
    });
    archiveStaleItems();
    setInterval(archiveStaleItems, DAY);
  } catch (err) {
    console.error('[server] failed to start:', err.message);
    process.exit(1);
  }
}

if (require.main === module) start();

module.exports = { start };
