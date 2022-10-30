local MAX_PER_ACCOUNT = 50

function subscribe_it(account, id, hashlink)
    local res = {}

    local subs = box.space.subs.index.by_subscriber_date:select({account}, {iterator = 'GE', limit = 100})
    if #subs >= MAX_PER_ACCOUNT and subs[1][2] == account then
        res.deleted = subs[1]
        box.space.subs:delete(subs[1][1])
    end

    -- 1 - post replies. 1-500 are reserved for Golos, another can be used by 3rd party
    local q = box.space.subs:auto_increment{account, 1, id, fiber.clock64(), 0, hashlink}
    res.added = q[1]
    return res
end

function put_event(account, entity_id, data)
    -- 1 - comment. 1-500 are reserved for Golos, another can be used by 3rd party
    local event = box.space.events:auto_increment{account, 1, entity_id, fiber.clock64(), data}

    local subs = box.space.subs.index.by_entity_id_subscriber:select({entity_id, account})
    if #subs > 0 then
        box.space.subs:update(subs[1][1], {{'+', 6, 1}})
    else
        box.error('No such sub')
    end

    return event
end

local function fill_sub(sub, data)
    sub.id = data[1]
    sub.account = data[2]
    sub.type = 'post_replies'
    sub.entityId = data[4]
    sub.createsMsec = data[5]
    sub.eventCount = data[6]
    sub.hashlink = data[7]
end

function get_subs(entity_id)
    local res = {}
    local subs = box.space.subs.index.by_entity_id_subscriber:select({entity_id})
    for i,sub in ipairs(subs) do
        local obj = {}
        fill_sub(obj, sub)
        res[i] = obj
    end
    return res
end

function list_subs(account, from, limit)
    local subs = box.space.subs.index.by_subscriber_events:select({account}, {iterator = 'LE', limit = 100})
    local arr = {}
    if from == 0 then
        from = 1
    end
    if limit == 0 then
        limit = #subs
    end
    local total = 0
    for i,sub in ipairs(subs) do
        if sub[2] ~= account then
            break
        end
        total = total + 1
        if i >= from and #arr <= limit then
            local obj = {}
            fill_sub(obj, sub)
            arr[#arr + 1] = obj
        end
    end
    local res = {}
    res.subs = arr
    res.total = total
    return res
end

function get_events(account, entity_id)
    local events = box.space.events.index.by_entity_id_subscriber:select({entity_id, account})
    local res = {}
    for i,event in ipairs(events) do
        local obj = {}
        obj.account = account
        obj.entityId = entity_id
        obj.data = event[6]
        res[i] = obj
    end
    return res
end

local function drop_events(account, entity_id)
    local events = box.space.events.index.by_entity_id_subscriber:select({entity_id, account})
    for i,event in ipairs(events) do
        box.space.events:delete(event[1])
    end
end

local function get_sub(account, entity_id)
    local subs = box.space.subs.index.by_entity_id_subscriber:select({entity_id, account})
    if #subs == 0 then
        error('No such sub')
    end
    return subs[1]
end

function mark_read(account, entity_id)
    local sub = get_sub(account, entity_id)
    drop_events(account, entity_id)
    box.space.subs:update(sub[1], {{'=', 6, 0}})
end

function unsubscribe_it(account, entity_id)
    local sub = get_sub(account, entity_id)
    drop_events(account, entity_id)
    box.space.subs:delete(sub[1])
end


