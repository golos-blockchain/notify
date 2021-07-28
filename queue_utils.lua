function esc_account_name(account)
    return account:gsub('-', '_')
end

function queue_id(account, subscriber_id)
    return 'queue_' .. esc_account_name(account) .. '_' .. subscriber_id
end

function normalize_task(qt)
    local id = 1
    local data = 2
    return {
        id = qt[id],
        scope = qt[data].scope,
        data = qt[data].data,
        timestamp = qt[data].timestamp,
    }
end
