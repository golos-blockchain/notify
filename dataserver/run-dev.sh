#!/bin/sh

export TARANTOOL_HOST=89.22.173.104
export NODE_URL=wss://apibeta.golos.today/ws
export CHAIN_ID=782a3039b478c839e4cb0c941ff4eaeb7df40bdd68bd441afd444b9da763de12
export SESSION_SECRET=should-be-really-generated-secret
export AUTH_HOST=https://dev.golos.app
export SITE_DOMAIN=89.22.173.104

nodemon
