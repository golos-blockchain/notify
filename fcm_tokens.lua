require 'misc_utils'

-- msecs, how much application notification channel will live
-- (without any notifications or user re-logins)
token_lifetime = 6*30*24*60*60*1000
token_lifetime = 10*1000

function migrate_fcm_tokens()
    if box.space.ft_migrated09012025 ~= nil then
        print('FCM tokens already migrated.')
        return
    end

    print('Migrating fcm tokens...')

    fcm_tokens = box.schema.create_space('fcm_tokens')
    fcm_tokens:create_index('primary', {
        type = 'tree', parts = {1, 'unsigned'}
    })
    fcm_tokens:create_index('by_acc_token', {
        type = 'tree', parts = {2, 'STR', 3, 'STR'}
    })
    fcm_tokens:create_index('by_last_update', {
        type = 'tree', parts = {6, 'unsigned'}, unique = false
    })

    box.schema.create_space('ft_migrated09012025')
end

function normalize_ft(ft)
    return {
        id = ft[1],
        account = ft[2],
        token = ft[3],
        scopes = ft[4],
        created = ft[5],
        last_update = ft[6],
    }
end

function register_token(account, token, scopes)
    local res = {}

    local unow = now()
    res.created = unow

    local ft = box.space.fcm_tokens.index.by_acc_token:get{account, token}
    if ft ~= nil then
        box.space.fcm_tokens:update(ft[1], {{'=', 4, scopes}, {'=', 6, unow}})
        res.created = 0
        res.updated = unow
    else
        box.space.fcm_tokens:auto_increment{account, token, scopes, unow, unow}
    end

    return res
end

function unregister_token(account, token)
    local res = {}
    res.unregistered = 0

    local ft = box.space.fcm_tokens.index.by_acc_token:get{account, token}
    if ft ~= nil then
        box.space.fcm_tokens:delete(ft[1])
        res.unregistered = now()
    end

    return res
end

function list_tokens(account, scope)
    local scope_str = scope ~= nil and tostring(scope) or nil

    local tokens = {}

    local fts = box.space.fcm_tokens.index.by_acc_token:select{account}
    for i,ft in ipairs(fts) do
        local ft_scope = ft[4]
        if scope_str == nil or ft_scope['0'] or ft_scope[scope_str] then
            tokens[#tokens + 1] = normalize_ft(ft)
        end
    end

    return { tokens = tokens }
end

function update_token(ft_id)
    box.space.fcm_tokens:update(ft_id, {{'=', 6, now()}})
end

function delete_token(ft_id)
    box.space.fcm_tokens:delete(ft_id)
end

function cleanup_tokens()
    local res = {}
    res.removed = 0

    local unow = now()
    local fts = box.space.fcm_tokens.index.by_last_update:select({}, {iterator = 'GT', limit = 100})
    for i,ft in ipairs(fts) do
        if (unow - ft[6]) > token_lifetime then
            delete_token(ft[1])
            res.removed = res.removed + 1
        else
            break
        end
    end

    return res
end