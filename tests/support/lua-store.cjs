'use strict';
require('./isolation.cjs');
const { lua, lauxlib, to_luastring } = require('fengari');
const { FakeStore } = require('../../dist/scripts/test-inventory-deduction-queue');

// Executes the application's actual Lua, with only redis.call/KEYS/ARGV exposed.
// This is not a real Redis server and does not claim network/cluster fidelity.
class LuaStore extends FakeStore {
  command(name, ...args) {
    const [key, value] = args;
    if ((this.expires.get(key) ?? Infinity) <= Date.now()) {
      this.strings.delete(key); this.expires.delete(key);
    }
    switch (name.toLowerCase()) {
      case 'get': return this.strings.get(key) ?? false;
      case 'exists': return Number(this.strings.has(key) || this.lists.has(key));
      case 'set':
        this.strings.set(key, value); this.expires.delete(key);
        if (args[2] === 'EX') this.expires.set(key, Date.now() + Number(args[3]) * 1000);
        return 'OK';
      case 'del': return args.reduce((count, k) => {
        const existed = this.strings.has(k) || this.lists.has(k);
        this.strings.delete(k); this.lists.delete(k); this.expires.delete(k);
        return count + Number(existed);
      }, 0);
      case 'rpush': {
        const list = this.lists.get(key) ?? [];
        this.lists.set(key, list); return list.push(...args.slice(1));
      }
      case 'lrem': {
        if (Number(value) !== 1) throw new Error('Unsupported test Redis list count');
        const list = this.lists.get(key) ?? [];
        const index = list.indexOf(args[2]);
        if (index < 0) return 0;
        list.splice(index, 1); return 1;
      }
      default: throw new Error('Unsupported test Redis command');
    }
  }
  async expire(key, seconds) { this.expires.set(key, Date.now() + seconds * 1000); return true; }
  async del(keys) { return this.command('del', ...(Array.isArray(keys) ? keys : [keys])); }
  async eval(script, { keys, arguments: args }) {
    const state = lauxlib.luaL_newstate();
    try {
      for (const [name, values] of [['KEYS', keys], ['ARGV', args]]) {
        lua.lua_newtable(state);
        values.forEach((value, index) => { lua.lua_pushstring(state, to_luastring(value)); lua.lua_rawseti(state, -2, index + 1); });
        lua.lua_setglobal(state, to_luastring(name));
      }
      lua.lua_newtable(state);
      lua.lua_pushjsfunction(state, L => {
        const params = [];
        for (let i = 1; i <= lua.lua_gettop(L); i++) {
          lauxlib.luaL_checkstring(L, i); params.push(lua.lua_tojsstring(L, i));
        }
        const result = this.command(...params);
        if (typeof result === 'number') lua.lua_pushinteger(L, result);
        else if (typeof result === 'boolean') lua.lua_pushboolean(L, result);
        else lua.lua_pushstring(L, to_luastring(result));
        return 1;
      });
      lua.lua_setfield(state, -2, to_luastring('call'));
      lua.lua_setglobal(state, to_luastring('redis'));
      if (lauxlib.luaL_loadstring(state, to_luastring(script)) !== lua.LUA_OK
          || lua.lua_pcall(state, 0, 1, 0) !== lua.LUA_OK) throw new Error('Redis Lua execution failed');
      return lua.lua_tonumber(state, -1);
    } finally { lua.lua_close(state); }
  }
}
module.exports = { LuaStore };
