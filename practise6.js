// 第 6 阶段 练习脚本:Driver 调优(连接池行为观察)
// 用法: node practise6.js
// 前置: 先跑 `node import.js` 确保数据已导入(15 节点 + 26 关系)
// 只读,不写数据,跑完无需重跑 import

import neo4j from 'neo4j-driver';
import { cleanObject } from './neo4j-helper.js';  // 只借纯函数,不用全局 driver

// ============ 配置:自己创建一个临时 driver,池子调到 2 放大排队效果 ============
const URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const USER = process.env.NEO4J_USER || 'neo4j';
const PASSWORD = process.env.NEO4J_PASSWORD || 'your_password';
const MAX_CONNECTION_POOL_SIZE = 10;

// 💡 如果把 maxConnectionPoolSize 改成 1:
//   5 个查询会强制串行执行(池子只有 1 条连接),
//   总耗时 ≈ 5 个查询耗时之和,阶梯效果更明显。
// 改成 2:前 2 个并发,后 3 个排队等前面释放连接。
const driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD), {
  maxConnectionPoolSize: MAX_CONNECTION_POOL_SIZE,
});

// ============ 5 条只读 Cypher,复杂度递增 ============
const queries = [
  { name: '节点总数',         cypher: `MATCH (n:Person) RETURN count(n) AS 总数` },
  { name: '关系总数',         cypher: `MATCH ()-[r]->() RETURN count(r) AS 关系数` },
  { name: '角色分组统计',     cypher: `MATCH (p:Person) RETURN p.role AS 角色, count(p) AS 人数 ORDER BY 人数 DESC` },
  { name: '观音度化名单',     cypher: `MATCH (g:Person {name:'观音菩萨'})-[:度化]->(p) RETURN collect(p.name) AS 度化名单` },
  { name: '唐僧-悟空最短路径', cypher: `MATCH p = shortestPath((t:Person {name:'唐僧'})-[*..5]-(s:Person {name:'孙悟空'})) RETURN length(p) AS 跳数` },
];

// ============ 单个查询任务:借连接 → 打时间戳 → 跑 → 归还连接 ============
let globalStart;  // main 里赋值,用于算相对时间

async function runQuery(i, { name, cypher }) {
  const session = driver.session();          // 每个任务独立开 session(从池子借 1 条连接)
  const startTs = Date.now();
  console.log(`[Q${i}] 🚀 开始 ${name.padEnd(15)}  相对+${String(startTs - globalStart).padStart(4)}ms`);
  try {
    const res = await session.run(cypher);
    const elapsed = Date.now() - startTs;
    const row = cleanObject(res.records[0]?.toObject() ?? {});
    console.log(`[Q${i}] ✅ 完成 ${name.padEnd(15)}  耗时=${String(elapsed).padStart(4)}ms  行数=${res.records.length}  首行=${JSON.stringify(row)}`);
  } finally {
    await session.close();                   // 关键:归还连接到池子,后面排队的才能拿到
  }
}

// ============ 主流程 ============
const main = async () => {
  await driver.verifyConnectivity();
  console.log(`✅ Neo4j 连接成功(maxConnectionPoolSize=${MAX_CONNECTION_POOL_SIZE})\n`);

  globalStart = Date.now();
  // 5 个查询同时发起,但池子只有 2 条连接 → 前 2 个立刻起,后 3 个排队
  await Promise.all(queries.map((q, i) => runQuery(i + 1, q)));

  console.log(`\n📊 全部完成,总耗时=${Date.now() - globalStart}ms`);
}

main()
  .catch((e) => {
    console.error('❌', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await driver.close();   // 清理自己创建的临时 driver(不动 helper.js 的全局 driver)
  });
