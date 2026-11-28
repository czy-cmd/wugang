const fs = require('fs');
const path = require('path');
const code = fs.readFileSync(path.join(__dirname, 'tree_data.js'), 'utf8');
const TREE = new Function(code + '; return TREE;')();
const groupsCode = fs.readFileSync(path.join(__dirname, 'groups_data.js'), 'utf8');
const GROUPS = new Function(groupsCode + '; return TREE_GROUPS;')();

const errs = [];
const ok = [];
function chk(name, cond, extra) {
  if (cond) ok.push(name);
  else errs.push(name + (extra ? ' | ' + extra : ''));
}

const nodes = TREE.nodes, endings = TREE.endings;
const root = TREE.root;
const VALID_GAME = ['mash', 'timing', 'react'];
const TYPES = ['TE','GE','NE','PE','OE','SE','DE','FE','CE'];

// 1. root 存在
chk('root 存在', nodes[root] !== undefined);

// 2. 所有 to 目标合法
const nodeIds = new Set(Object.keys(nodes));
const endingIds = new Set(Object.keys(endings));
let targetOK = true, badTarget = '';
for (const id in nodes) {
  for (const c of nodes[id].choices) {
    const t = c[1];
    if (!(nodeIds.has(t) || endingIds.has(t))) { targetOK = false; badTarget = id + '->' + t; }
  }
}
chk('所有 to 目标合法', targetOK, badTarget);

// 3. 每个节点 >=2 选项，标签唯一
let degOK = true, lblOK = true;
for (const id in nodes) {
  const cs = nodes[id].choices;
  if (cs.length < 2 || cs.length > 4) degOK = false;
  const seen = new Set();
  for (const c of cs) if (seen.has(c[0])) lblOK = false; else seen.add(c[0]);
}
chk('每个节点 2~4 选项', degOK);
chk('同节点选项标签唯一', lblOK);

// 4. 可达性 + 无环 + 严格树
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
    const t = c[1];
    if (parent[t] !== undefined && parent[t] !== id) { reachOK = false; }
    parent[t] = id;
    if (nodeIds.has(t)) dfs(t, stack);
  }
  stack.delete(id);
})(root, new Set());
chk('无环', !cycle);
chk('严格树（每个孩子唯一父）', reachOK);
chk('所有节点可达', nodeIds.size === visited.size, 'nodes=' + nodeIds.size + ' visited=' + visited.size);

// 5. 叶子 = 结局数
const leafTargets = [];
for (const id in nodes) for (const c of nodes[id].choices) if (endingIds.has(c[1])) leafTargets.push(c[1]);
const leafSet = new Set(leafTargets);
chk('结局总数=叶子数', leafTargets.length === leafSet.size && leafSet.size === endingIds.size, 'leaf=' + leafSet.size + ' endings=' + endingIds.size);

// 6. 所有结局可达
let allEndReach = true;
for (const e of endingIds) if (!(e in parent)) allEndReach = false;
chk('所有结局可达', allEndReach);

// 7. 路径一致
let pathOK = true, pathBad = '';
for (const e of endingIds) {
  const chain = [];
  let cur = e;
  while (cur !== root) {
    const p = parent[cur];
    if (p === undefined) { pathOK = false; pathBad = e; break; }
    const pn = nodes[p];
    let lbl = null;
    for (const c of pn.choices) if (c[1] === cur) { lbl = c[0]; break; }
    if (lbl === null) { pathOK = false; pathBad = e; break; }
    chain.unshift(lbl);
    cur = p;
  }
  const stored = endings[e].path;
  if (JSON.stringify(chain) !== JSON.stringify(stored)) { pathOK = false; pathBad = e; }
}
chk('结局达成路径与存储一致', pathOK, pathBad);

// 8. 元数据完整
let metaOK = true;
for (const e of endingIds) {
  const en = endings[e];
  if (!en.name || !en.text || !Array.isArray(en.path) || en.path.length === 0) metaOK = false;
}
chk('结局名称/文本/路径完整', metaOK);

// 9. 深度：基础结局 = 7
let baseDepthOK = true, baseBad = '';
let sideCount = 0;
for (const e of endingIds) {
  const en = endings[e];
  if (en.side) { sideCount++; continue; }
  if (en.path.length !== 7) { baseDepthOK = false; baseBad = e + ' depth=' + en.path.length; break; }
}
chk('基础结局路径深度=7', baseDepthOK, baseBad);
chk('旁支结局数=12', sideCount === 12, 'side=' + sideCount);

// 10. 类型完整 + 9 类各 >=10
let typeOK = true;
const typeCount = {};
for (const e of endingIds) {
  const t = endings[e].type;
  if (!t || !TYPES.includes(t)) { typeOK = false; continue; }
  typeCount[t] = (typeCount[t] || 0) + 1;
}
chk('所有结局类型合法', typeOK);
for (const t of TYPES) {
  chk('类型 ' + t + ' >=10', (typeCount[t] || 0) >= 10, t + '=' + (typeCount[t] || 0));
}

// 11. 隐藏结局
chk('隐藏结局=2', TREE.hidden && Object.keys(TREE.hidden).length === 2);
for (const h in (TREE.hidden || {})) {
  chk('隐藏结局 ' + h + ' 类型=IE', TREE.hidden[h].type === 'IE');
}

// 12. 节点 3 变体
let variantOK = true, variantBad = '';
for (const id in nodes) {
  const t = nodes[id].text;
  if (!Array.isArray(t) || t.length < 3) { variantOK = false; variantBad = id + ' len=' + (t ? t.length : 'nil'); break; }
}
chk('所有节点文案 >=3 变体', variantOK, variantBad);

// 13. 小游戏节点（若有）
let gameOK = true, gameBad = '', gameCount = 0;
for (const id in nodes) {
  const n = nodes[id];
  if (!n.game) continue;
  gameCount++;
  if (!VALID_GAME.includes(n.game.type)) { gameOK = false; gameBad = id + ' bad type'; }
}

console.log('=== 自检结果 ===');
console.log('通过 ' + ok.length + ' 项：');
ok.forEach(x => console.log('  [PASS] ' + x));
if (errs.length) {
  console.log('失败 ' + errs.length + ' 项：');
  errs.forEach(x => console.log('  [FAIL] ' + x));
  process.exit(1);
} else {
  console.log('全部通过。节点=' + nodeIds.size + '，基础结局=' + (endingIds.size - sideCount) + '，旁支=' + sideCount + '，小游戏=' + gameCount + '，深度=7');
}
