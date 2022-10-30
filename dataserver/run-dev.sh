#!/bin/sh

export TARANTOOL_HOST=37.18.27.45
export NODE_URL=wss://apibeta.golos.today/ws
export CHAIN_ID=782a3039b478c839e4cb0c941ff4eaeb7df40bdd68bd441afd444b9da763de12
export SESSION_SECRET=should-be-really-generated-secret
export AUTH_HOST=https://dev.golos.app
export SITE_DOMAIN=37.18.27.45

nodemon
