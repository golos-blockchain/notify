
local MAX_VIEWS_BY_IP = 5

function record_view(hash, ip)
    local res = {}
    local views = box.space.views.index.by_hash_ip:select({hash, ip})
    if views[1] then
        if views[1][5] >= MAX_VIEWS_BY_IP then
            res.error = {
                msg = 'limit_by_ip',
                data = {
                    current = views[1][5],
                    max = MAX_VIEWS_BY_IP
                }
            }
        else
            box.space.views:update(views[1][1], {{'=', 4, fiber.clock64()}, {'+', 5, 1}})
            res.updated = true
        end
    else
        box.space.views:auto_increment{hash, ip, fiber.clock64(), 1}
        res.added = true
    end

    if res.added or res.updated then
        local viewables = box.space.viewables.index.by_hash:select({hash})
        if viewables[1] then
            res.views = viewables[1][4] + 1
            box.space.viewables:update(viewables[1][1], {{'=', 3, fiber.clock64()}, {'+', 4, 1}})
        else
            box.space.viewables:auto_increment{hash, fiber.clock64(), 1}
            res.views = 1
        end
    end

    return res
end

function get_viewable(hash)
    local res = {}
    res.hash = hash
    res.updated = 0
    res.views = 0
    local viewables = box.space.viewables.index.by_hash:select({hash})
    if viewables[1] then
        local v = viewables[1]
        res.updated = v[3]
        res.views = v[4]
    end
    return res
end

local VIEWS_CLEANUP_INTERVAL_MSEC = 7*24*60*60*1000000

function cleanup_stats()
    local now = fiber.clock64()
    local ves = box.space.viewables.index.by_date:select({1}, {iterator = 'GT', limit = 100})
    for i,val in ipairs(ves) do
        if (now - val[3]) > VIEWS_CLEANUP_INTERVAL_MSEC then
            local views = box.space.views.index.by_hash_ip:select({val[2]})
            for i,view in ipairs(views) do
                box.space.views:delete(view[1])
            end
        else
            break
        end
    end
end
