#!/bin/sh

export TARANTOOL_HOST=127.0.0.1
export NODE_URL=ws://127.0.0.1:8091
export CHAIN_ID=5876894a41e6361bde2e73278f07340f2eb8b41c2facd29099de9deef6cdb679
export SESSION_SECRET=should-be-really-generated-secret
export ALLOWED_CLIENTS="localhost 127.0.0.1"

nodemon
