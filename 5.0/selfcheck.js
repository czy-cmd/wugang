const fs = require('fs');
const path = require('path');
const code = fs.readFileSync(path.join(__dirname, 'tree_data.js'), 'utf8');
const TREE = new Function(code + '; return TREE;')();

const errs = [];
const ok = [];
function chk(name, cond, extra) {
  if (cond) ok.push(name);
  else errs.push(name + (extra ? ' | ' + extra : ''));
}

const nodes = TREE.nodes, endings = TREE.endings;
const root = TREE.root;
const VALID_GAME = ['mash', 'timing', 'react'];

// 1. root 存在
chk('root 存在', nodes[root] !== undefined);

// 2. 所有 to 目标合法（节点或结局）
const nodeIds = new Set(Object.keys(nodes));
const endingIds = new Set(Object.keys(endings));
let targetOK = true, badTarget = '';
for (const id in nodes) {
  for (const c of nodes[id].choices) {
    const t = c.to;
    if (!(nodeIds.has(t) || endingIds.has(t))) { targetOK = false; badTarget = id + '->' + t; }
  }
}
chk('所有 to 目标合法', targetOK, badTarget);

// 3. 每个节点 >=2 选项，且标签唯一
let degOK = true, lblOK = true;
for (const id in nodes) {
  const cs = nodes[id].choices;
  if (cs.length < 2) { degOK = false; }
  const seen = new Set();
  for (const c of cs) if (seen.has(c.label)) lblOK = false; else seen.add(c.label);
}
chk('每个节点 >=2 选项', degOK);
chk('同节点选项标签唯一', lblOK);

// 3.5 小游戏节点验证：game.success/fail 合法、类型合法、恰好 2 choices 且指向 success/fail
let gameOK = true, gameBad = '';
let gameCount = 0;
for (const id in nodes) {
  const n = nodes[id];
  if (!n.game) continue;
  gameCount++;
  if (!VALID_GAME.includes(n.game.type)) { gameOK = false; gameBad = id + ' bad type ' + n.game.type; }
  if (!endingIds.has(n.game.success) || !endingIds.has(n.game.fail)) { gameOK = false; gameBad = id + ' bad success/fail'; }
  if (n.choices.length !== 2) { gameOK = false; gameBad = id + ' choices!=2'; }
  else {
    const tos = n.choices.map(c => c.to).sort().join(',');
    const want = [n.game.success, n.game.fail].sort().join(',');
    if (tos !== want) { gameOK = false; gameBad = id + ' choices vs game mismatch (' + tos + ' vs ' + want + ')'; }
  }
}
chk('小游戏节点合法（' + gameCount + ' 个）', gameOK, gameBad);

// 4. 可达性 + 无环 + 严格树（每个孩子仅一个父）
const parent = {};
const visited = new Set();
let reachOK = true, cycle = false;
(function dfs(id, stack) {
  if (stack.has(id)) { cycle = true; return; }
  if (visited.has(id)) return;
  visited.add(id);
  const n = nodes[id];
  if (!n) return;
  stack.add(id);
  for (const c of n.choices) {
    const t = c.to;
    if (parent[t] !== undefined && parent[t] !== id) { reachOK = false; }
    parent[t] = id;
    if (nodeIds.has(t)) dfs(t, stack);
  }
  stack.delete(id);
})(root, new Set());
chk('无环', !cycle);
chk('严格树（每个孩子唯一父）', reachOK);
chk('所有节点可达', nodeIds.size === visited.size, 'nodes=' + nodeIds.size + ' visited=' + visited.size);

// 5. 叶子=结局数
const leafTargets = [];
for (const id in nodes) for (const c of nodes[id].choices) if (endingIds.has(c.to)) leafTargets.push(c.to);
const leafSet = new Set(leafTargets);
chk('结局总数=叶子数', leafTargets.length === leafSet.size && leafSet.size === endingIds.size, 'leaf=' + leafSet.size + ' endings=' + endingIds.size);

// 6. 每个结局可达
let allEndReach = true;
for (const e of endingIds) if (!(e in parent)) allEndReach = false;
chk('所有结局可达', allEndReach);

// 7. 每个结局的存储 path 与实际路径一致
let pathOK = true, pathBad = '';
for (const e of endingIds) {
  const chain = [];
  let cur = e;
  while (cur !== root) {
    const p = parent[cur];
    if (p === undefined) { pathOK = false; pathBad = e; break; }
    const pn = nodes[p];
    let lbl = null;
    for (const c of pn.choices) if (c.to === cur) { lbl = c.label; break; }
    if (lbl === null) { pathOK = false; pathBad = e; break; }
    chain.unshift(lbl);
    cur = p;
  }
  const stored = endings[e].path;
  if (JSON.stringify(chain) !== JSON.stringify(stored)) { pathOK = false; pathBad = e + ' actual=' + JSON.stringify(chain) + ' stored=' + JSON.stringify(stored); }
}
chk('结局达成路径与存储一致', pathOK, pathBad);

// 8. 每个结局有名称与文本
let metaOK = true;
for (const e of endingIds) {
  const en = endings[e];
  if (!en.name || !en.text || !Array.isArray(en.path) || en.path.length === 0) metaOK = false;
}
chk('结局名称/文本/路径完整', metaOK);

// 9. 路径深度一致（都应为 5 步）
let depthOK = true, depthBad = '';
for (const e of endingIds) {
  if (endings[e].path.length !== 5) { depthOK = false; depthBad = e + ' depth=' + endings[e].path.length; break; }
}
chk('所有结局路径深度=5', depthOK, depthBad);

console.log('=== 自检结果 ===');
console.log('通过 ' + ok.length + ' 项：');
ok.forEach(x => console.log('  [PASS] ' + x));
if (errs.length) {
  console.log('失败 ' + errs.length + ' 项：');
  errs.forEach(x => console.log('  [FAIL] ' + x));
  process.exit(1);
} else {
  console.log('全部通过。节点=' + nodeIds.size + '，结局=' + endingIds.size + '，小游戏=' + gameCount + '，深度=5');
}
