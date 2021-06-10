import fs from 'fs';
import spawn from 'child_process';
import _ from 'lodash';
import geoip from 'geoip-lite';

interface RawServerState {
  ip?: string;
  addresses: string[];
  location?: string;
  info: {
    max_clients: number;
    max_players: number;
    passworded: boolean;
    game_type: string;
    name: string;
    map: {
      name: string;
    };
    version: string;
    clients: RawPlayerState[];
  };
}

interface RawPlayerState {
  name: string;
  clan: string;
  country: number;
  score: number;
  is_player: boolean;
}

interface ServerState {
  ip: string;
  port: number;

  protocols: string[];
  max_clients: number;
  max_players: number;
  passworded: boolean;
  game_type: string;
  name: string;
  map: string;
  version: string;
  clients: PlayerState[];

  locale: string;
  num_clients: number;
  num_players: number;
  num_spectators: number;
  reachable: boolean;
  lastSeen: number;
}

interface PlayerState {
  name: string;
  clan: string;
  flag: number;
  score: number;
  is_player: boolean;
}

const isConnecting = (player: PlayerState | RawPlayerState) => {
  return (
    player.name == '(connecting)' && (!player.is_player || (player.clan == '' && player.score == 0))
  );
};

export class TwBrowser {
  private process: spawn.ChildProcess;
  private db: { [ip: string]: ServerState };
  constructor() {
    this.db = {};
  }

  public updateDB(data: RawServerState[]) {
    const now = Date.now();

    // check unreachables
    const allServers = _.keys(this.db);
    const currentServers = data.map(v => (v.ip = v.addresses[0].match(/:\/\/(.*)/)[1]));

    const unreachables = _.difference(allServers, currentServers);
    for (const server of unreachables) {
      if (this.db[server].reachable) {
        this.db[server].reachable = false;
      }

      // server timedout
      if (!this.db[server].reachable && this.db[server].lastSeen < now - 10 * 60 * 1000) {
        delete this.db[server];
      }
    }

    // update infos
    for (const server of data) {
      const address = server.addresses[0].match(/:\/\/(.*)/)[1];
      const ipParts = address.split(':');

      const playerCount = _.countBy(server.info.clients, p => {
        if (isConnecting(p)) return 'connecting';
        if (p.is_player) return 'player';
        return 'spectator';
      });

      const oldState = this.db[address];

      const newState: ServerState = {
        ip: oldState?.ip || ipParts[0],
        port: oldState?.port || parseInt(ipParts[1]),

        protocols: server.addresses.map(uri => uri.match(/(.*):\/\//)[1]),
        ..._.omit(server.info, 'map', 'clients'),
        map: server.info.map.name,
        clients: server.info.clients.map(c => ({ ..._.omit(c, 'country'), flag: c.country })),

        locale: oldState?.locale || server.location || 'ZZZ',

        num_clients: server.info.clients.length,
        num_players: playerCount['player'] || 0,
        num_spectators: playerCount['spectator'] || 0,

        reachable: true,
        lastSeen: now,
      };

      this.db[address] = newState;
    }
  }

  public start() {
    if (process.env.TWSTATS_EXEC) {
      const args = ['-f', 'json', '--filename', process.env.TWSTATS_JSON];

      if (process.env.TWSTATS_LOCATIONS) {
        args.push('--locations', process.env.TWSTATS_LOCATIONS);
      }
      this.process = spawn.spawn(process.env.TWSTATS_EXEC, args);

      this.process.on('exit', code => {
        console.warn(
          `stats_browser is exiting with code: ${code}. attempting to restart in 5 seconds`
        );
        setTimeout(() => {
          // remove the outdated file if stats_browser is down
          fs.unlinkSync(process.env.TWSTATS_JSON);
          fs.unwatchFile(process.env.TWSTATS_JSON);
          this.start();
        }, 5000);
      });
    }

    fs.watchFile(
      process.env.TWSTATS_JSON,
      {
        persistent: true,
        interval: 2000,
      },
      (curr, prev) => {
        fs.readFile(process.env.TWSTATS_JSON, { encoding: 'utf-8' }, (err, data) => {
          try {
            this.updateDB(JSON.parse(data).servers || []);
          } catch (err) {
            console.error(err);
          }
        });
      }
    );
  }

  public findPlayer(query: Partial<PlayerState>, withServers: boolean) {
    return _.flatten(
      _.map(_.values(this.db), s =>
        _.filter(s.clients, _.matches(query)).map(p => ({
          ...p,
          server: withServers ? _.omit(s, 'clients', 'reachable', 'lastSeen') : undefined,
        }))
      )
    );
  }

  public findServer(query: Partial<ServerState>, withClients: boolean) {
    return _.mapValues(_.pickBy(this.db, _.matches(query)), s =>
      withClients
        ? _.omit(s, 'reachable', 'lastSeen')
        : _.omit(s, 'reachable', 'lastSeen', 'clients')
    );
  }

  public get servers() {
    return this.db;
  }
}
