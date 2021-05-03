### Build

```bash
docker-compose build
```

### Run

```bash
docker-compose up
```

### Use

Tarantool database should be available on port 3301 of your local host.

To access the data via console please to the following:

```bash
$ docker-compose exec datastore /bin/sh
$ tarantoolctl connect guest@localhost:3301

or

$ docker-compose exec datastore tarantoolctl connect guest@localhost:3301
```

### Docker Compose (recommended)

```
version: "3"
services:

  datastore:
    image: golosblockchain/notify:datastore
    build:
      context: .
      dockerfile: Dockerfile-datastore
    volumes:
      - ./tarantool:/var/lib/tarantool
    ports:
      - "3301:3301"

  datafeed:
    image: golosblockchain/notify:datafeed
    build:
      context: .
      dockerfile: Dockerfile-datafeed
    restart: unless-stopped
    depends_on:
      - datastore
    environment:
      NODE_URL: https://api-full.golos.id
      TARANTOOL_HOST: datastore
```