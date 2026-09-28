// 第 6 阶段 练习脚本:事务管理(executeWrite 原子写入)
// 用法: node practise5.js
// 前置: 先跑 `node import.js` 确保数据已导入(15 节点 + 26 关系)
// ⚠️ 会写入数据(新增 2 条关系),跑完请重跑 `node import.js` 恢复

import { verify, getSession, close, cleanObject } from './neo4j-helper.js';

// ============ 主流程 ============
const main = async () => {
  await verify();
  const { session } = getSession();

  // ============ 在这里写练习逻辑 ============
  //
  // 题目:用 executeWrite 事务函数,原子地建立两条关系
  //   (观音菩萨)-[:度化]->(红孩儿)
  //   (红孩儿)-[:拜师]->(观音菩萨)
  // 任一失败 → 全部回滚;事务外查询验证
  //
  // 提示:
  //   await session.executeWrite(async tx => {
  //     await tx.run('<cypher>', { ...params });
  //   });
  //
  // 验证(事务外,可直接 session.run):
  //   const res = await session.run('<cypher>');
  //   for (const record of res.records) {
  //     console.log('  →', JSON.stringify(cleanObject(record.toObject())));
  //   }
  //
  // ==============================
  // ============ 1. 事务内:原子建立两条关系 ============
  await session.executeWrite(async tx => {
    // 关系 1:观音度化红孩儿
    await tx.run(
      `MATCH (g:Person {name: $gyName})
       with g
       MATCH (h:Person {name: $hhName})
       MERGE (g)-[:度化]->(h)`,
      { gyName: '观音菩萨', hhName: '红孩儿' }
    );
    // 关系 2:红孩儿拜观音为师
    await tx.run(
      `MATCH (g:Person {name: $gyName})
       with g
       MATCH (h:Person {name: $hhName})
       MERGE (h)-[:拜师]->(g)`,
      { gyName: '观音菩萨', hhName: '红孩儿' }
    );
  });

  // ============ 2. 事务外:验证两条关系都建好了 ============
  const res = await session.run(
    `MATCH (g:Person {name: $gyName})-[r]-(h:Person {name: $hhName})
     RETURN type(r) AS 关系类型, g.name AS 起点, h.name AS 终点
     ORDER BY 关系类型`,
    { gyName: '观音菩萨', hhName: '红孩儿' }
  );
  console.log(`\n📋 [验证] 观音-红孩儿 之间的所有关系(${res.records.length} 条):`);
  for (const record of res.records) {
    console.log('  →', JSON.stringify(cleanObject(record.toObject())));
  }
}

main()
  .catch((e) => {
    console.error('❌', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await close();
  });
