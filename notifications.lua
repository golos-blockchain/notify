queue = require 'queue'
require 'table_utils'

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
    account = account:gsub('-', '_')
    local q = box.space.notification_queues:auto_increment{account, scopes}

    local queue_id = account .. '_' .. q[1]
    queue.create_tube(queue_id, 'fifottl', {temporary = false, if_not_exists = true, ttr = 2})

    return q[1]
end

function notification_take(account, subscriber_id, task_ids)
    account = account:gsub('-', '_')
    local queue_id = account .. '_' .. subscriber_id

    local the_tube = queue.tube[queue_id]

    for idx,task_id in ipairs(task_ids) do
        pcall(the_tube.delete, the_tube, task_id)
    end

    local task = the_tube:take(60)
    if task ~= nil then
      task = the_tube:release(task[1])
    end

    local tasks = {}
    if task ~= nil then
      tasks[1] = {
        id = task[1],
        scope = task[3].scope,
        data = task[3].data,
        timestamp = task[3].timestamp
      }
    end

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
        local qs = box.space.notification_queues.index.by_acc_subscriber:select{account}
        for i,val in ipairs(qs) do
            local q_scope = val[3]
            if q_scope['0'] or q_scope[tostring(scope)] then
                local queue_id = val[2] .. '_' .. val[1]
                -- if it is not custom_json
                if not op_data[1] then
                  op_data = { op_data['type'], op_data }
                end
                queue.tube[queue_id]:put({ scope = scope, data = op_data, timestamp = timestamp})
            end
        end
    end
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

function add_follower(account, follower)
  local space = box.space.followers
  local res = space:select({account})
  if #res == 0 then return nil end
  local followers = res[1][2]
  if not contains(followers, follower) then
    table.insert(followers, #followers+1, follower)
    space:update(account, {{'=', 2, followers}})
  end
  return true
end

function webpush_subscribe(account, new_subscription)
  local space = box.space.webpush_subscribers
  local res = space:select{account}
  if #res > 0 then
    local subscriptions = res[1][2]
    local new_auth = new_subscription['keys']['auth']
    for k,v in ipairs(subscriptions) do
      if v['keys']['auth'] == new_auth then
        return
      end
    end
    if #subscriptions >= 3 then
       table.remove(subscriptions, 1)
    end
    table.insert(subscriptions, new_subscription)
    space:update(account, {{'=', 2, subscriptions}})
  else
    local tuple = {account, {new_subscription}, nil, nil}
    space:insert(tuple)
  end
end

function webpush_unsubscribe(account, subscription_auth)
  local space = box.space.webpush_subscribers
  local res = space:select{account}
  if #res > 0 then
    local subscriptions = res[1][2]
    for k,v in ipairs(subscriptions) do
      if v['keys']['auth'] == subscription_auth then
        table.remove(subscriptions, k)
      end
      if #subscriptions > 0 then
        space:update(account, {{'=', 2, subscriptions}})
      else
        space:delete{account}
      end
    end
  end
end

function webpush_get_delivery_queue()
  local space = box.space.notifications_delivery_queue
  local queue = space:select{}
  local result = {}
  for k,v in ipairs(queue) do
    local account = v[2]
    local subscription = box.space.webpush_subscribers:select{account}
    if #subscription > 0 then
      subscription = subscription[1]
      table.insert(result, {account, subscription[2], v[4], v[5], v[6], v[7]})
      local current_time = math.floor(fiber.time())
      box.space.webpush_subscribers:update(account, {{'=', 3, current_time}, {'=', 4, v[3]}})
    end
  end
  space:truncate()
  return result
end
