import { TwBrowser } from './browser';
import fastify from 'fastify';
import _ from 'lodash';

require('dotenv').config();

const int = parseInt;
const bool = (s: string) => s == 'true' || s == '1';

const browser = new TwBrowser();
browser.start();

const app = fastify({ logger: false });

const SERVER_TYPES: any = {
  max_clients: int,
  max_players: int,
  passworded: bool,
  num_clients: int,
  num_players: int,
  num_spectators: int,
  lastSeen: int,
};

app.get('/', (request, reply) => {
  const query = request.query as any;
  const servers = _.pickBy(
    browser.servers,
    _.matches(_.mapValues(query, (v, k) => (SERVER_TYPES[k] ? SERVER_TYPES[k](v) : v)))
  );
  reply.send({
    num_servers: _.size(servers),
    servers: servers,
  });
});

app.get('/list', (request, reply) => {
  const query = request.query as any;
  const servers = _.pickBy(
    browser.servers,
    _.matches(_.mapValues(query, (v, k) => (SERVER_TYPES[k] ? SERVER_TYPES[k](v) : v)))
  );
  reply.send({ servers: _.values(servers) });
});

const PLAYER_TYPES: any = {
  flag: int,
  is_player: bool,
};

app.get('/players', (request, reply) => {
  const query = _.omit(request.query as any, 'hook');
  const players = browser.findPlayer(
    _.mapValues(query, (v, k) => (PLAYER_TYPES[k] ? PLAYER_TYPES[k](v) : v))
  );
  reply.send({ players });
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
