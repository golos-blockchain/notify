function generate_guid()
    local template ='xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
    return string.gsub(template, '[xy]', function (c)
        local v = (c == 'x') and math.random(0, 0xf) or math.random(8, 0xb)
        return string.format('%x', v)
    end)
end

function get_guid(account)
    local res =  box.space.guid:select{account}
    if #res > 0 then 
        return {res}
    else
        local guid = generate_guid()
        box.space.guid:insert{account, guid}
        return {account, guid}
    end
end
