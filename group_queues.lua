require 'queue_utils'

function now()
    return math.floor(clock.time() * 1000)
end

function migrate_group_queues()
    if box.space.gq_migrated ~= nil then
        print('Group queues already migrated.')
        return
    end

    print('Migrating group queues...')

    group_queues = box.schema.create_space('group_queues')
    group_queues:create_index('primary', {
        type = 'tree', parts = {1, 'unsigned'}
    })
    group_queues:create_index('by_subscriber_scope', {
        type = 'tree', parts = {2, 'unsigned', 4, 'STR'}, unique = false
    })
    group_queues:create_index('by_group_subscriber', {
        type = 'tree', parts = {3, 'STR', 2, 'unsigned'},
    })

    box.schema.create_space('gq_migrated')
end

function clear_queue_groups(subscriber_id, scope)
    local res = {}
    res.deleted = 0

    local gq = box.space.group_queues.index.by_subscriber_scope:select({subscriber_id, scope})
    for i,val in ipairs(gq) do
        box.space.group_queues:delete(val[1])
        res.deleted = res.deleted + 1
    end

    return res
end

function set_queue_groups(account, subscriber_id, groups)
    local res = {}
    res.added = 0
    res.updated = 0

    local qid = queue_id(account, subscriber_id)
    if box.space[qid] == nil then
        res.err = 'no_queue'
        return res
    end

    local unow = now()
    for nam, group_scope in pairs(groups) do
        local g = box.space.group_queues.index.by_group_subscriber:get{nam, subscriber_id}
        if g ~= nil then
            if g[4] ~= group_scope then
                box.space.group_queues:update(g[1], {{'=', 4, group_scope}, {'=', 5, unow}})
                res.updated = res.updated + 1
            end
        else
            if group_scope == '*' then
                local qs = box.space.group_queues.index.by_subscriber_scope:select({subscriber_id, group_scope})
                if qs[1] ~= nil then
                    box.space.group_queues:delete(qs[1][1])
                    res.updated = res.updated + 1
                else
                    res.added = res.added + 1
                end
            else
                res.added = res.added + 1
            end
            box.space.group_queues:auto_increment{subscriber_id, nam, group_scope, unow}
        end
    end

    return res
end

function list_queues_by_group(group)
    local res = {}
    res.subscriber_ids = {}

    local recs = box.space.group_queues.index.by_group_subscriber:select({group})
    for i,q in ipairs(recs) do
         res.subscriber_ids[tostring(q[2])] = q[4]
    end

    return res
end
