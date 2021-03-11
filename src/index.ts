import { TwBrowser } from './browser';
import fastify from 'fastify';

require('dotenv').config();

const browser = new TwBrowser();
browser.start();

const app = fastify({ logger: false });
app.get('/', (request, reply) => {
  reply.send(browser.servers);
});

// Run the server!
const start = async () => {
  try {
    await app.listen(3001);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};
start();
