require 'queue_utils'

function queue_subscribe(account, scopes)
    account = esc_account_name(account)
    local q = box.space.queues:auto_increment{account, scopes, fiber.clock64()}

    local queue_id = queue_id(account, q[1])

    local queue_tasks = box.schema.create_space(queue_id)
    queue_tasks:create_index('primary', {
        type = 'tree', parts = {1, 'unsigned'}
    })

    return q[1]
end

function queue_unsubscribe(account, subscriber_id)
    local queue_id = queue_id(account, subscriber_id)

    if box.space[queue_id] == nil then
        return { was = false }
    end

    clear_queue_groups(subscriber_id)

    local q = box.space.queues:delete{subscriber_id}
    if q == nil then
        return { was = false }
    end

    box.space[queue_id]:drop()

    return { was = true }
end

local function take_tasks(queue_id)
    local tasks = {}

    if box.space[queue_id] == nil then
        return tasks
    end

    local qts = box.space[queue_id]:select(nil, { limit = 1 })
    if #qts > 0 then
        local qt = qts[1]
        tasks[1] = normalize_task(qt)
        box.space[queue_id]:delete(qt[1])
    end

    return tasks
end

function queue_take(account, subscriber_id, task_ids)
    local tasks = {}

    local found = box.space.queues:update(subscriber_id, {{'=', 4, fiber.clock64()}})
    if found == nil then
        return { tasks = tasks, error = 'No such queue' }
    end

    local queue_id = queue_id(account, subscriber_id)

    if box.space[queue_id] == nil then
        return { tasks = tasks, error = 'No such queue' }
    end

    tasks = take_tasks(queue_id)
    return { tasks = tasks }
end

function queue_list(account, scope)
    local queue_ids = {}
    account = esc_account_name(account)
    scope_str = tostring(scope)
    local qs = box.space.queues.index.by_acc_subscriber:select{account}
    for i,val in ipairs(qs) do
        local q_scope = val[3]
        if q_scope['0'] or q_scope[scope_str] then
            queue_ids[#queue_ids + 1] = {account, val[1]}
        end
    end
    return { queue_ids = queue_ids }
end

function queue_list_for_cleanup()
    local queue_ids = {}
    local now = fiber.clock64()
    local qs = box.space.queues.index.by_update:select({1}, {iterator = 'GT', limit = 100})
    for i,val in ipairs(qs) do
        if (now - val[4]) > 60*1000000 then -- 1 minute
            queue_ids[#queue_ids + 1] = {val[2], val[1]}
        else
            break
        end
    end
    return { queue_ids = queue_ids }
end

function queue_put(subscriber_id, scope, op_data, timestamp)
    local res = {}
    res.account = ''
    local q = box.space.queues:get{subscriber_id}
    if q ~= nil then
        res.account = q[2]
        local queue_id = queue_id(res.account, subscriber_id)
        if box.space[queue_id] == nil then
            print('WARNING: queue_put detected what record present but no space: ')
            print(q)
            print(res.account)
            return res
        end
        box.space[queue_id]:auto_increment{{scope = scope, data = op_data, timestamp = timestamp}}
    end
    return res
end

function queue_stats()
    return box.space.queues:count()
end
