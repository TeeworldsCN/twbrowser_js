import fs from 'fs';
import spawn from 'child_process';
import _ from 'lodash';

interface RawServerState {
  ip?: string;
  addresses: string[];
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
    clients: PlayerState[];
  };
}

interface PlayerState {
  name: string;
  clan: string;
  country: number;
  score: number;
  is_player: boolean;
}

interface ServerState {
  protocols: string[];
  max_clients: number;
  max_players: number;
  passworded: boolean;
  game_type: string;
  name: string;
  map: string;
  version: string;
  clients: PlayerState[];

  reachable: boolean;
  lastSeen: number;
}

const isConnecting = (player: PlayerState) => {
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
      const ip = server.addresses[0].match(/:\/\/(.*)/)[1];
      const newState: ServerState = {
        protocols: server.addresses.map(uri => uri.match(/(.*):\/\//)[1]),
        ..._.omit(server.info, 'map'),
        map: server.info.map.name,
        reachable: true,
        lastSeen: now,
      };

      const oldState = this.db[ip];
      const joinedClients = [];
      // const leftClients = [];
      if (!oldState) {
        joinedClients.push(...newState.clients);
      } else {
        joinedClients.push(
          ..._.differenceWith(
            newState.clients,
            oldState.clients,
            (a, b) => a.name == b.name && a.clan == b.clan
          )
        );
        // leftClients.push(
        //   ..._.differenceWith(
        //     oldState.clients,
        //     newState.clients,
        //     (a, b) => a.name == b.name && a.clan == b.clan
        //   )
        // );
      }
      this.db[ip] = newState;

      for (let client of joinedClients) {
        if (client.name == '(connecting)' && !isConnecting(client)) {
          // TODO: onPlayerAppear
        }
      }

      // for (let client of leftClients) {
      //   if (client.name == '(connecting)' && !isConnecting(client)) {
      //     // MAYBE: onPlayerDisappear
      //   }
      // }
    }
  }

  public start() {
    if (process.env.TWSTATS_EXEC) {
      this.process = spawn.spawn(process.env.TWSTATS_EXEC, [
        '-f',
        'json',
        '--filename',
        process.env.TWSTATS_JSON,
      ]);
    }

    fs.watchFile(
      process.env.TWSTATS_JSON,
      {
        persistent: true,
        interval: 500,
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

  public get servers() {
    return this.db;
  }
}
