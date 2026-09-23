// 公共工具:Neo4j 连接、Integer 清理、cypher-builder 执行
// 用法:import { getSession, run, cleanObject } from './neo4j-helper.js';

import neo4j from 'neo4j-driver';

// ============ 配置 ============
export const URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
export const USER = process.env.NEO4J_USER || 'neo4j';
export const PASSWORD = process.env.NEO4J_PASSWORD || 'your_password';

let _driver = null;
let _session = null;

/**
 * 获取(或创建)一个 driver + session,全局复用
 * @returns {{ driver: Driver, session: Session }}
 */
export function getSession() {
  if (!_driver) {
    _driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD));
    _session = _driver.session();
  }
  return { driver: _driver, session: _session };
}

/** 关闭 session + driver(进程退出时调用) */
export async function close() {
  if (_session) await _session.close();
  if (_driver) await _driver.close();
  _session = null;
  _driver = null;
}

// ============ Integer 清理 ============

/**
 * 把 neo4j-driver 的 Integer {low, high} 转成普通 JS number
 * 注意:只有 < 2^53 才精确,超大整数会丢精度
 */
export function cleanValue(v) {
  if (v && typeof v === 'object' && 'low' in v && 'high' in v) {
    if (typeof v.toNumber === 'function') return v.toNumber();
    return v.low + v.high * 0x100000000;
  }
  return v;
}

/** 递归清理对象/数组里的 Integer + Neo4j Path/Node 对象 */
export function cleanObject(obj) {
  // Integer(数字)
  if (obj && typeof obj === 'object' && 'low' in obj && 'high' in obj) return cleanValue(obj);
  // Neo4j Path 对象(有 start/end/segments/length 字段)
  if (isPath(obj)) return simplifyPath(obj);
  // Neo4j Node 对象(有 identity/labels/properties/elementId 字段)
  if (isNode(obj)) return simplifyNode(obj);
  // Neo4j Relationship 对象(有 identity/startNode/endNode/type/properties/elementId)
  if (isRelationship(obj)) return simplifyRelationship(obj);
  // 数组
  if (Array.isArray(obj)) return obj.map(cleanObject);
  // 普通对象
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, cleanObject(v)])
    );
  }
  return obj;
}

// ============ Neo4j 对象简化 ============

/** 判断是否是 Neo4j Path 对象 */
function isPath(obj) {
  return obj && typeof obj === 'object' && !Array.isArray(obj)
    && 'start' in obj && 'end' in obj && 'segments' in obj && 'length' in obj;
}

/** 判断是否是 Neo4j Node 对象 */
function isNode(obj) {
  return obj && typeof obj === 'object' && !Array.isArray(obj)
    && 'identity' in obj && 'labels' in obj && 'elementId' in obj && !('startNode' in obj);
}

/** 判断是否是 Neo4j Relationship 对象 */
function isRelationship(obj) {
  return obj && typeof obj === 'object' && !Array.isArray(obj)
    && 'identity' in obj && 'startNode' in obj && 'endNode' in obj && 'type' in obj;
}

/** 取节点的可读标识(优先 name 属性) */
function nodeToName(node) {
  if (!node || typeof node !== 'object') return node;
  if (node.properties && node.properties.name != null) return node.properties.name;
  if ('identity' in node) return `<node#${node.identity}>`;
  return node;
}

/** 把 Path 对象简化为 {length, nodes, relationships} */
function simplifyPath(path) {
  // 从 segments 提取所有节点名(start + 每个 segment 的 end)
  const nodeNames = [nodeToName(path.start)];
  const relTypes = [];
  for (const seg of path.segments || []) {
    nodeNames.push(nodeToName(seg.end));
    if (seg.relationship && seg.relationship.type) relTypes.push(seg.relationship.type);
  }
  return {
    length: path.length,
    nodes: nodeNames,
    ...(relTypes.length ? { relationships: relTypes } : {}),
  };
}

/** 把 Node 对象简化为 name(或 identity) */
function simplifyNode(node) {
  return nodeToName(node);
}

/** 把 Relationship 对象简化为 type 字符串 */
function simplifyRelationship(rel) {
  return `<${rel.type}>`;
}

// ============ 执行 cypher-builder clause 并打印 ============

/**
 * 执行一个 cypher-builder clause,打印 Cypher 对照 + 结果
 * @param {string} label - 示例标签,如 '示例 1:多 pattern'
 * @param {import('@neo4j/cypher-builder').Clause} clause - cypher-builder 构造的 clause
 * @param {import('neo4j-driver').Session} [session] - 可选,不传则用默认 session
 */
export async function run(label, clause, session) {
  const { cypher, params } = clause.build();
  const { session: defaultSession } = getSession();
  const s = session || defaultSession;

  console.log(`\n📋 [${label}]`);
  console.log('  生成的 Cypher:');
  console.log('  ' + cypher.replace(/\n/g, '\n  '));
  console.log('  参数:', params);

  const res = await s.run(cypher, params);
  console.log(`  结果(${res.records.length} 行):`);
  for (const record of res.records) {
    // 用 JSON.stringify 输出单行紧凑形式,避免 console.log 多行展开
    const obj = cleanObject(record.toObject());
    console.log('  →', JSON.stringify(obj));
  }
  return res;
}

/** 验证连接 + 打印状态(脚本开头用) */
export async function verify() {
  const { driver } = getSession();
  await driver.verifyConnectivity();
  console.log('✅ Neo4j 连接成功');
}
