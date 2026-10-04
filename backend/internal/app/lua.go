package app

import "github.com/redis/go-redis/v9"

// Every integrity-critical mutation is a single Lua script (atomic in Redis).
// Postgres unique constraints are the second line of defence (see ledger.go).

// issueLua: one token per verified identity per drop.
// KEYS: 1 drop hash, 2 issued hash(user->sha256(blinded_msg)), 3 events stream, 4 live hash
// ARGV: user, blinded_hash, tier, epoch, drop
var issueLua = redis.NewScript(`
local st = redis.call('HGET', KEYS[1], 'state')
if st ~= 'OPEN' then return {'closed', st or ''} end
local cur = redis.call('HGET', KEYS[2], ARGV[1])
if cur then
  if cur == ARGV[2] then return {'replay'} end
  redis.call('HINCRBY', KEYS[4], 'rejected_already_issued', 1)
  return {'already'}
end
redis.call('HSET', KEYS[2], ARGV[1], ARGV[2])
redis.call('HINCRBY', KEYS[4], 'tokens_issued', 1)
redis.call('XADD', KEYS[3], '*', 'type', 'token_issued', 'drop', ARGV[5], 'epoch', ARGV[4],
  'payload', cjson.encode({user_id=ARGV[1], tier=ARGV[3]}))
return {'ok'}
`)

// registerLua: verify-then-store. Signature verification happens before (stateless);
// this script owns "token unused", window-open, arrival time (Redis TIME = one clock for all replicas),
// idempotent replay and the attempts stream (counterfactual input).
// KEYS: 1 drop, 2 spent set, 3 entries hash, 4 idem key, 5 attempts stream, 6 events, 7 live
// ARGV: receipt, tier, replica, idemKey, idemTTL, actor, ip, epoch, drop
var registerLua = redis.NewScript(`
local t = redis.call('TIME'); local now = t[1]*1000 + math.floor(t[2]/1000)
local function attempt(o)
  redis.call('XADD', KEYS[5], 'MAXLEN', '~', 5000000, '*', 't', now, 'tier', ARGV[2], 'o', o, 'r', ARGV[1], 'a', ARGV[6], 'ip', ARGV[7], 'rep', ARGV[3])
end
local st = redis.call('HGET', KEYS[1], 'state')
if st ~= 'OPEN' then attempt('closed'); redis.call('HINCRBY', KEYS[7], 'rejected_closed', 1); return {'closed'} end
if redis.call('SISMEMBER', KEYS[2], ARGV[1]) == 1 then
  local e = redis.call('HGET', KEYS[3], ARGV[1]) or ''
  if ARGV[4] ~= '' and redis.call('GET', KEYS[4]) == ARGV[1] then
    attempt('replay'); redis.call('HINCRBY', KEYS[7], 'replays', 1); return {'replay', e}
  end
  attempt('spent'); redis.call('HINCRBY', KEYS[7], 'rejected_reused', 1); return {'spent', e}
end
redis.call('SADD', KEYS[2], ARGV[1])
local v = ARGV[2] .. '|' .. now .. '|' .. ARGV[3]
redis.call('HSET', KEYS[3], ARGV[1], v)
if ARGV[4] ~= '' then redis.call('SET', KEYS[4], ARGV[1], 'EX', ARGV[5]) end
attempt('ok')
redis.call('HINCRBY', KEYS[7], 'entries', 1)
redis.call('XADD', KEYS[6], '*', 'type', 'entry_registered', 'drop', ARGV[9], 'epoch', ARGV[8],
  'payload', cjson.encode({receipt_id=ARGV[1], tier=ARGV[2], arrival_ms=now, replica=ARGV[3]}))
return {'ok', v}
`)

// tarpitLua: decoy "fast" endpoint. Burns the token (spent) and stores a fake entry that never enters the real list.
// KEYS: 1 drop, 2 spent, 3 tarpit hash, 4 attempts, 5 live, 6 events
// ARGV: receipt, tier, replica, actor, ip, epoch, drop
var tarpitLua = redis.NewScript(`
local t = redis.call('TIME'); local now = t[1]*1000 + math.floor(t[2]/1000)
if redis.call('HGET', KEYS[1], 'state') ~= 'OPEN' then return {'closed'} end
redis.call('XADD', KEYS[4], 'MAXLEN', '~', 5000000, '*', 't', now, 'tier', ARGV[2], 'o', 'tarpit', 'r', ARGV[1], 'a', ARGV[4], 'ip', ARGV[5], 'rep', ARGV[3])
redis.call('HINCRBY', KEYS[5], 'tarpit_hits', 1)
if redis.call('SISMEMBER', KEYS[2], ARGV[1]) == 1 then return {'spent'} end
redis.call('SADD', KEYS[2], ARGV[1])
redis.call('HSET', KEYS[3], ARGV[1], now)
redis.call('XADD', KEYS[6], '*', 'type', 'tarpit_hit', 'drop', ARGV[7], 'epoch', ARGV[6], 'payload', cjson.encode({receipt_id=ARGV[1], arrival_ms=now}))
return {'ok', string.format('%d', now)}
`)

// advanceLua: compare-and-set on drop state. ARGV: from, to, event payload, epoch, drop, then k,v pairs to HSET.
var advanceLua = redis.NewScript(`
if redis.call('HGET', KEYS[1], 'state') ~= ARGV[1] then return 0 end
redis.call('HSET', KEYS[1], 'state', ARGV[2])
local tt = redis.call('TIME'); redis.call('HSET', KEYS[1], 'at_' .. ARGV[2], tt[1]*1000 + math.floor(tt[2]/1000))
for i = 6, #ARGV, 2 do redis.call('HSET', KEYS[1], ARGV[i], ARGV[i+1]) end
redis.call('XADD', KEYS[2], '*', 'type', 'state_changed', 'drop', ARGV[5], 'epoch', ARGV[4], 'payload', ARGV[3])
return 1
`)

// claimLua: one seat per winning receipt, atomic. Seat numbers are fixed at draw time by rank,
// so allocation never depends on who claims first.
// KEYS: 1 drop, 2 seat:{receipt}, 3 elig zset, 4 seatown hash, 5 seatstate hash, 6 claimed_by hash, 7 events, 8 user tickets set, 9 integ
// ARGV: receipt, user, epoch, drop
var claimLua = redis.NewScript(`
local st = redis.call('HGET', KEYS[1], 'state')
if st ~= 'CLAIM' then return {'state', st or ''} end
local status = redis.call('HGET', KEYS[2], 'status')
if not status then return {'not_winner'} end
local seat = redis.call('HGET', KEYS[2], 'seat_no')
local tier = redis.call('HGET', KEYS[2], 'tier')
if status == 'claimed' then return {'ok', seat, tier, 'replay'} end
if status == 'expired' then return {'expired'} end
local t = redis.call('TIME'); local now = t[1]*1000 + math.floor(t[2]/1000)
local dl = redis.call('ZSCORE', KEYS[3], ARGV[1])
if not dl or tonumber(dl) < now then return {'expired'} end
if redis.call('HSETNX', KEYS[4], seat, ARGV[1]) == 0 then
  redis.call('HINCRBY', KEYS[9], 'duplicate_seat_blocked', 1); return {'conflict'}
end
redis.call('HSET', KEYS[2], 'status', 'claimed', 'claimed_at', now)
redis.call('ZREM', KEYS[3], ARGV[1])
redis.call('HSET', KEYS[5], seat, 'claimed')
redis.call('HSET', KEYS[6], ARGV[1], ARGV[2])
redis.call('HINCRBY', 'live:' .. ARGV[4], 'seats_claimed', 1)
redis.call('SADD', KEYS[8], ARGV[4] .. '|' .. ARGV[1])
redis.call('XADD', KEYS[7], '*', 'type', 'seat_claimed', 'drop', ARGV[4], 'epoch', ARGV[3],
  'payload', cjson.encode({receipt_id=ARGV[1], user_id=ARGV[2], seat_no=tonumber(seat), tier=tier}))
return {'ok', seat, tier}
`)

// expireLua: claims past their deadline lose the seat; it passes to the next waitlisted receipt.
// KEYS: 1 drop, 2 elig zset, 3 seatstate, 4 wlptr hash, 5 events. ARGV: drop, claim_ms, epoch
var expireLua = redis.NewScript(`
if redis.call('HGET', KEYS[1], 'state') ~= 'CLAIM' then return 0 end
local t = redis.call('TIME'); local now = t[1]*1000 + math.floor(t[2]/1000)
local exp = redis.call('ZRANGEBYSCORE', KEYS[2], '-inf', '(' .. now, 'LIMIT', 0, 200)
local d = ARGV[1]
for _, r in ipairs(exp) do
  local sk = 'drop:' .. d .. ':seat:' .. r
  local tier = redis.call('HGET', sk, 'tier'); local seat = redis.call('HGET', sk, 'seat_no')
  redis.call('ZREM', KEYS[2], r)
  redis.call('HINCRBY', 'live:' .. ARGV[1], 'claims_expired', 1)
  redis.call('HSET', sk, 'status', 'expired')
  redis.call('XADD', KEYS[5], '*', 'type', 'claim_expired', 'drop', d, 'epoch', ARGV[3], 'payload', cjson.encode({receipt_id=r, seat_no=tonumber(seat), tier=tier}))
  local idx = redis.call('HINCRBY', KEYS[4], tier, 1)
  local w = redis.call('LINDEX', 'drop:' .. d .. ':result:' .. tier, idx)
  if w then
    local wk = 'drop:' .. d .. ':seat:' .. w
    redis.call('HSET', wk, 'tier', tier, 'seat_no', seat, 'status', 'reserved', 'deadline', now + ARGV[2], 'promoted', 1)
    redis.call('ZADD', KEYS[2], now + ARGV[2], w)
    redis.call('HINCRBY', 'live:' .. d, 'claims_promoted', 1)
    redis.call('XADD', KEYS[5], '*', 'type', 'waitlist_promoted', 'drop', d, 'epoch', ARGV[3], 'payload', cjson.encode({receipt_id=w, seat_no=tonumber(seat), tier=tier, rank=idx+1}))
  else
    redis.call('HSET', KEYS[3], seat, 'unclaimed')
  end
end
return #exp
`)

// baselineLua: the classic first-come-first-served sale used as the demo baseline.
// KEYS: 1 drop, 2 buyers hash, 3 sold hash(tier->n), 4 seats hash(seat->user), 5 attempts, 6 events, 7 live
// ARGV: user, tier, tier_seats, tier_offset, cap, replica, ip, epoch, drop
var baselineLua = redis.NewScript(`
local t = redis.call('TIME'); local now = t[1]*1000 + math.floor(t[2]/1000)
local function attempt(o)
  redis.call('XADD', KEYS[5], 'MAXLEN', '~', 5000000, '*', 't', now, 'tier', ARGV[2], 'o', o, 'r', '', 'a', ARGV[1], 'ip', ARGV[7], 'rep', ARGV[6])
end
local nows = string.format('%d', now)
if redis.call('HGET', KEYS[1], 'state') ~= 'OPEN' then attempt('closed'); return {'closed', '', nows} end
local have = tonumber(redis.call('HGET', KEYS[2], ARGV[1]) or '0')
if have >= tonumber(ARGV[5]) then attempt('capped'); return {'capped', '', nows} end
local sold = tonumber(redis.call('HGET', KEYS[3], ARGV[2]) or '0')
if sold >= tonumber(ARGV[3]) then attempt('soldout'); redis.call('HINCRBY', KEYS[7], 'sold_out_rejects', 1); return {'soldout', '', nows} end
sold = redis.call('HINCRBY', KEYS[3], ARGV[2], 1)
local seat = tonumber(ARGV[4]) + sold
redis.call('HINCRBY', KEYS[2], ARGV[1], 1)
redis.call('HSET', KEYS[4], seat, ARGV[1])
attempt('ok')
redis.call('XADD', KEYS[6], '*', 'type', 'baseline_purchase', 'drop', ARGV[9], 'epoch', ARGV[8], 'payload', cjson.encode({user_id=ARGV[1], seat_no=seat, tier=ARGV[2], arrival_ms=now}))
return {'ok', string.format('%d', seat), string.format('%d', now)}
`)

// rlLua: fixed-window counter. Protects availability only; never read by allocation code.
var rlLua = redis.NewScript(`
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return n
`)
