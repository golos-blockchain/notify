require 'table_utils'

row_len = 26

function migrate_tuple(space, account, cur_len)
    if cur_len < row_len then
        for i=cur_len+1,row_len do
            space:update(account, {{'!', i, 0}})
        end
    end
end

function counter_add(account, scope)
    -- print('counter_add -->', account, scope)
    local space = box.space.counters
    local res = space:select{account}
    if #res > 0 then
        local tuple = res[1]
        migrate_tuple(space, account, #tuple)
        space:update(account, {{'+', 2, 1}, {'+', scope + 2, 1}})
    else
        local tuple = {account, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0}
        tuple[scope + 2] = 1;
        space:insert(tuple)
    end
end

function counter_read(account, scope)
  -- print('counter_read -->', account, scope)
  local space = box.space.counters
  local res = space:select{account}
  if #res == 0 then return nil end
  local tuple = res[1]
  local count = tuple[scope + 2]
  if count == nil or count <= 0 then return tuple end
  migrate_tuple(space, account, #tuple)
  local res = space:update(account, {{'-', 2, count}, {'=', scope + 2, 0}})
  return res
end
