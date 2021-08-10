require 'table_utils'
require 'queue_utils'
fiber = require 'fiber'

-- SCOPES = {
--     'total': 0,
--     'feed': 1, # not used
--     'reward': 2, # not used
--     'send': 3,
--     'mention': 4,
--     'follow': 5, # not used
--     'vote': 6, # not used
--     'comment_reply': 7,
--     'post_reply': 8, # not used, uses comment_reply
--     'account_update': 9, # not used
--     'message': 10,
--     'receive': 11,
--     'donate': 12,
--     'reserved2': 13,
--     'reserved3': 14,
--     'reserved4': 15
-- }

function notification_subscribe(account, scopes)
    account = esc_account_name(account)
    local q = box.space.queues:auto_increment{account, scopes, fiber.clock64()}

    local queue_id = queue_id(account, q[1])

    local queue_tasks = box.schema.create_space(queue_id)
    queue_tasks:create_index('primary', {
        type = 'tree', parts = {1, 'unsigned'}
    })

    return q[1]
end

function notification_unsubscribe(account, subscriber_id)
    local queue_id = queue_id(account, subscriber_id)
    if box.space[queue_id] == nil then
        return { was = false }
    end

    local q = box.space.queues:delete{subscriber_id}
    if q == nil then
        return { was = false }
    end

    unlock_entity(queue_id)

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

function notification_take(account, subscriber_id, task_ids)
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

function notification_add(account, scope, add_counter, op_data, timestamp)
  -- print('notification_push -->', account, scope, add_counter, op_data, timestamp)
  if scope ~= nil and add_counter then
    local space = box.space.notifications
    local res = space:select{account}
    if #res > 0 then
      -- print_r(res)
      local tuple = res[1]
      -- print('existing:', tuple, #tuple)
      space:update(account, {{'+', 2, 1}, {'+', scope + 2, 1}})
    else
      local tuple = {account, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0}
      tuple[scope + 2] = 1;
      space:insert(tuple)
    end
  end

    if op_data ~= nil then
        account = account:gsub('-', '_')
        local qs = box.space.queues.index.by_acc_subscriber:select{account}
        for i,val in ipairs(qs) do
            local q_scope = val[3]
            if q_scope['0'] or q_scope[tostring(scope)] then
                -- if it is not custom_json
                if not op_data[1] then
                    op_data = { op_data['type'], op_data }
                end

                local queue_id = queue_id(account, val[1])
                if box.space[queue_id] ~= nil then
                    box.space[queue_id]:auto_increment{{scope = scope, data = op_data, timestamp = timestamp}}
                end

                unlock_entity(queue_id)
            end
        end
    end
end

function notification_cleanup()
    print('notification_cleanup')
    local now = fiber.clock64()
    local qs = box.space.queues.index.by_update:select({1}, {iterator = 'GT', limit = 100})
    for i,val in ipairs(qs) do
        if (now - val[4]) > 60*1000000 then -- 1 minute
            print('cleaning: ' .. val[2] .. '_' .. val[1])
            local q = box.space.queues:delete{val[1]}
            if q ~= nil then
                local queue_id = queue_id(val[2], val[1])

                if box.space[queue_id] ~= nil then
                    box.space[queue_id]:drop()
                end

                unlock_entity(queue_id)
            end
        else
            break
        end
    end
    print('notification_cleanup_end')
end

x = 1
function notification_stats()
    return box.space.queues:count()
end

function notification_read(account, scope)
  -- print('notification_read -->', account, scope)
  local space = box.space.notifications
  local res = space:select{account}
  if #res == 0 then return nil end
  local tuple = res[1]
  local count = tuple[scope + 2]
  if count == nil or count <= 0 then return tuple end
  local res = space:update(account, {{'-', 2, count}, {'=', scope + 2, 0}})
  return res
end
