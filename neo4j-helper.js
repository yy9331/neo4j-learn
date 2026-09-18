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

/** 递归清理对象/数组里的 Integer */
export function cleanObject(obj) {
  if (obj && typeof obj === 'object' && 'low' in obj && 'high' in obj) return cleanValue(obj);
  if (Array.isArray(obj)) return obj.map(cleanObject);
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, cleanObject(v)])
    );
  }
  return obj;
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
    console.log('  →', cleanObject(record.toObject()));
  }
  return res;
}

/** 验证连接 + 打印状态(脚本开头用) */
export async function verify() {
  const { driver } = getSession();
  await driver.verifyConnectivity();
  console.log('✅ Neo4j 连接成功');
}
