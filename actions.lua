
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
