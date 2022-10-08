fiber = require 'fiber'
json = require('json')
require 'counters'
require 'queues'
require 'locks'
require 'subscriptions'
require 'stats'
require 'guid'
require 'actions'

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
    pages = box.schema.create_space('pages')
    pages:create_index('primary', {type = 'tree', parts = {1, 'unsigned'}})
    pages:create_index('secondary', {
        type = 'tree',
        unique = true,
        parts = {2, 'string'}
    })
    unique_page_views = box.schema.create_space('unique_page_views')
    unique_page_views:create_index('primary', {type = 'hash', parts = {1, 'unsigned', 2, 'string'}})
    refs = box.schema.create_space('refs')
    refs:create_index('primary', {type = 'tree', parts = {1, 'unsigned'}})
    refs:create_index('by_ref', {type = 'tree', unique = false, parts = {2, 'unsigned'}})
    refs:create_index('by_page', {type = 'tree', unique = false, parts = {3, 'unsigned'}})

    quota = box.schema.create_space('quota')
    quota:create_index('primary', {type = 'tree', parts = {1, 'unsigned'}})
    quota:create_index('secondary', {
        type = 'tree',
        unique = false,
        parts = {2, 'string', 3, 'string'}
    })

    guid = box.schema.create_space('guid')
    guid:create_index('primary', {type = 'tree', parts = {1, 'STR'}})

    actions = box.schema.create_space('actions')
    actions:create_index('primary', {type = 'tree', parts = {1, 'string'}})
    actions:create_index('secondary', {type = 'tree', unique = false, parts = {2, 'string'}})
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
