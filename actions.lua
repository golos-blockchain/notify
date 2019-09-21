
local one_week = 7 * 24 * 60 * 60
local two_weeks = (7 + 7) * 24 * 60 * 60
local REG_USER = 'reg_user'
local NEW_USER = 'new_user'

function update_actions(account, type)
    local space = box.space.actions
    local res = space:select{account}
    local time = os.time()

    if #res > 0 then
        local actions = res[1][3]
        actions[type] = time
        space:update(account, {{'=', 3, actions}})
    else
        local user_type = REG_USER
        local actions = {}
        
        if type == 'login' then
            actions.login = time
        elseif type == 'registered' then
            actions.registered = time
            user_type = NEW_USER
        end
        space:insert({account, user_type, actions})
    end
end

function inactive_users()
    local space = box.space.actions
    local index = space.index.secondary
    local accounts = index:select{NEW_USER}
    
    local time = os.time()
    local result = {
        inactive_one_week = {},
        inactive_two_weeks = {}
    }

    for _, account in pairs(accounts) do
        local cur = account[3]
        if ((time - cur.registered) > two_weeks) and is_inactive(cur) then
            table.insert(result.inactive_two_weeks, account[1])
        elseif ((time - cur.registered) > one_week) and (not cur.post) then 
            table.insert(result.inactive_one_week, account[1])
        end
    end
    return result
end

function is_inactive(user)
    return  (not user.post)     and
            (not user.vote)     and
            (not user.flag)     and
            (not user.comment)  and
            (not user.transfer)
end
