fiber = require 'fiber'
json = require('json')
require 'counters'
require 'queues'
require 'locks'
require 'stats'
require 'subscriptions'

io.output():setvbuf("no")

box.cfg {
    log_level = 5,
    listen = '0.0.0.0:3301',
    memtx_memory = 1 * 1024*1024*1024,
    wal_dir    = "/var/lib/tarantool",
    memtx_dir   = "/var/lib/tarantool",
    vinyl_dir = "/var/lib/tarantool"
}

box.once('bootstrap', function()
    print('initializing..')
    box.schema.user.grant('guest', 'read,write,execute,create,drop,alter ', 'universe')
    box.session.su('guest')

    steem = box.schema.create_space('steem')
    steem:create_index('primary', {type = 'tree', parts = {1, 'STR'}})

    counters = box.schema.create_space('counters')
    counters:create_index('primary', {type = 'tree', parts = {1, 'STR'}})

    queues = box.schema.create_space('queues')
    queues:create_index('primary', {
        type = 'tree', parts = {1, 'unsigned'}
    })
    queues:create_index('by_acc_subscriber', {
        type = 'tree', parts = {2, 'STR', 1, 'unsigned'}
    })
    queues:create_index('by_update', {
        type = 'tree', parts = {4, 'unsigned'}, unique = false
    })

    locks = box.schema.create_space('locks')
    locks:create_index('primary', {type = 'tree', parts = {1, 'STR'}})

    -- subs spaces

    subs = box.schema.create_space('subs')
    subs:create_index('primary', {
        type = 'tree', parts = {1, 'unsigned'}
    })
    subs:create_index('by_subscriber_date', {
        type = 'tree', parts = {2, 'STR', 5, 'unsigned'}, unique = false
    })
    subs:create_index('by_subscriber_events', {
        type = 'tree', parts = {2, 'STR', 6, 'unsigned'}, unique = false
    })
    subs:create_index('by_entity_id_subscriber', {
        type = 'tree', parts = {4, 'STR', 2, 'STR'}
    })

    events = box.schema.create_space('events')
    events:create_index('primary', {
        type = 'tree', parts = {1, 'unsigned'}
    })
    events:create_index('by_entity_id_subscriber', {
        type = 'tree', parts = {4, 'STR', 2, 'STR'}, unique = false
    })

    -- stats spaces

    viewables = box.schema.create_space('viewables')
    viewables:create_index('primary', {
        type = 'tree', parts = {1, 'unsigned'}
    })
    viewables:create_index('by_hash', {
        type = 'tree', parts = {2, 'unsigned'}
    })
    viewables:create_index('by_date', {
        type = 'tree', parts = {3, 'unsigned'}, unique = false
    })

    views = box.schema.create_space('views')
    views:create_index('primary', {
        type = 'tree', parts = {1, 'unsigned'}
    })
    views:create_index('by_hash_ip', {
        type = 'tree', parts = {2, 'unsigned', 3, 'STR'}
    })
    views:create_index('by_date', {
        type = 'tree', parts = {4, 'unsigned'}, unique = false
    })
end)

function send_json(req, table)
    local resp = req:render({text = json.encode(table)})
    resp.headers['content-type'] = 'application/json'
    resp.status = 200
    return resp
end

function root_handler(req)
    return send_json(req, {status = 'ok'})
end

-- require('console').start()
