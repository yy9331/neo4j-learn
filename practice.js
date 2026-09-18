// 第 1 阶段 cypher-builder 练习脚本
// 用法: node practice.js
// 前置: 先跑 `node import.js` 确保数据已导入(15 节点 + 26 关系)

import neo4j from 'neo4j-driver';
import {
  Match,
  Node,
  NamedNode,
  Param,
  Pattern,
  in as inOp,
  contains,
  count,
  collect,
  gt,
  NamedVariable,
} from '@neo4j/cypher-builder';

// ============ 配置 ============
const URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const USER = process.env.NEO4J_USER || 'neo4j';
const PASSWORD = process.env.NEO4J_PASSWORD || 'your_password';

const driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD));
const session = driver.session();

// ============ 工具:执行 clause 并打印对照 ============

// 把 neo4j-driver 的 Integer {low, high} 转成普通 JS number,让输出更可读
function cleanValue(v) {
  if (v && typeof v === 'object' && 'low' in v && 'high' in v) {
    // Integer 类型(64 位整数),用 toNumber() 安全转换(< 2^53 才准)
    if (typeof v.toNumber === 'function') return v.toNumber();
    // 兜底:手动拼接
    return v.low + v.high * 0x100000000;
  }
  return v;
}

// 递归清理 record 里的 Integer
function cleanObject(obj) {
  if (obj && typeof obj === 'object' && 'low' in obj && 'high' in obj) return cleanValue(obj);
  if (Array.isArray(obj)) return obj.map(cleanObject);
  if (obj && typeof obj === 'object') return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, cleanObject(v)])
    );
  
  return obj;
}

async function run(label, clause) {
  const { cypher, params } = clause.build();
  console.log(`\n📋 [${label}]`);
  console.log('  生成的 Cypher:');
  console.log('  ' + cypher.replace(/\n/g, '\n  '));
  console.log('  参数:', params);

  const res = await session.run(cypher, params);
  console.log(`  结果(${res.records.length} 行):`);
  for (const record of res.records) {
    console.log('  →', cleanObject(record.toObject()));
  }
}

// ============ 主流程 ============
async function main() {
  await driver.verifyConnectivity();
  console.log('✅ Neo4j 连接成功');

  // ---------- 示例 1:多 pattern ----------
  // Cypher: MATCH (a:Person {name:'唐僧'}), (b:Person {name:'如来佛祖'})
  //         RETURN a.role AS 唐僧角色, b.role AS 如来角色
  // 注意:properties 的值必须用 new Param(...) 包装,不能直接传字符串
  const a = new NamedNode('a');
  const b = new NamedNode('b');
  const clause1 = new Match(
    new Pattern(a, { labels: ['Person'], properties: { name: new Param('唐僧') } })
  ).match(
    new Pattern(b, { labels: ['Person'], properties: { name: new Param('如来佛祖') } })
  ).return(
    [a.property('role'), '唐僧角色'],
    [b.property('role'), '如来角色'],
  );
  await run('示例 1:多 pattern 查唐僧 + 如来', clause1);

  // ---------- 示例 2:WHERE + IN + CONTAINS ----------
  // Cypher 2a: MATCH (p:Person) WHERE p.role IN ['主角','佛门'] RETURN p.name, p.role
  // Cypher 2b: MATCH (p:Person) WHERE p.name CONTAINS '悟空' RETURN p.name
  // 注意:
  //   - in 是 JS 保留字,cypher-builder 把 inOp 导出为 in,导入用 in as inOp
  //   - 比较函数右边的值也必须用 new Param(...) 包装
  //   - 多字段 return 用多参数,不要写成嵌套数组
  const p2 = new NamedNode('p2');
  const clause2a = new Match(new Pattern(p2, { labels: ['Person'] }))
    .where(inOp(p2.property('role'), new Param(['主角', '佛门'])))
    .return(p2.property('name'), p2.property('role'));
  await run('示例 2a:WHERE IN 查主角和佛门', clause2a);

  const p2b = new NamedNode('p2b');
  const clause2b = new Match(new Pattern(p2b, { labels: ['Person'] }))
    .where(contains(p2b.property('name'), new Param('悟空')))
    .return(p2b.property('name'));
  await run('示例 2b:WHERE CONTAINS 查名字带悟空', clause2b);

  // ---------- 示例 3:别名 + 中文列名 ----------
  // Cypher: MATCH (p:Person) RETURN p.name AS 姓名, p.role AS 角色, p.description AS 简介
  const p3 = new NamedNode('p3');
  const clause3 = new Match(new Pattern(p3, { labels: ['Person'] })).return(
    [p3.property('name'), '姓名'],
    [p3.property('role'), '角色'],
    [p3.property('description'), '简介'],
  );
  await run('示例 3:别名 + 中文列名', clause3);

  // ---------- 示例 4:排序分页 ----------
  // Cypher: MATCH (p:Person) RETURN p.name ORDER BY p.name ASC SKIP 3 LIMIT 5
  const p4 = new NamedNode('p4');
  const clause4 = new Match(new Pattern(p4, { labels: ['Person'] }))
    .return(p4.property('name'))
    .orderBy([p4.property('name'), 'ASC'])
    .skip(3)
    .limit(5);
  await run('示例 4:排序分页(SKIP 3 LIMIT 5)', clause4);

  // ---------- 示例 5a:DISTINCT 去重 ----------
  // Cypher: MATCH (p:Person) RETURN DISTINCT p.role
  const p5a = new NamedNode('p5a');
  const clause5a = new Match(new Pattern(p5a, { labels: ['Person'] }))
    .return(p5a.property('role'))
    .distinct();
  await run('示例 5a:DISTINCT 查所有不重复 role', clause5a);

  // ---------- 示例 5b:count + 分组排序 ----------
  // Cypher: MATCH (p:Person) RETURN p.role, count(p) AS 人数 ORDER BY 人数 DESC
  const p5b = new NamedNode('p5b');
  const nExpr = count(p5b);
  const clause5b = new Match(new Pattern(p5b, { labels: ['Person'] }))
    .return(p5b.property('role'), [nExpr, '人数'])
    .orderBy([nExpr, 'DESC']);
  await run('示例 5b:count + 分组排序', clause5b);

  // ---------- 示例 6:collect 聚合成数组 ----------
  // Cypher: MATCH (g:Person {name:'观音菩萨'})-[:度化]->(p)
  //         RETURN collect(p.name) AS 度化名单
  const g6 = new NamedNode('g6');
  const p6 = new NamedNode('p6');
  const pattern6 = new Pattern(g6, {
    labels: ['Person'],
    properties: { name: new Param('观音菩萨') },
  })
    .related(null, { type: '度化' })
    .to(p6);
  const clause6 = new Match(pattern6).return(
    [collect(p6.property('name')), '度化名单'],
  );
  await run('示例 6:collect 把度化过的人聚成数组', clause6);

  // ---------- 示例 7:WITH 流水线 ----------
  // Cypher: MATCH (p:Person)
  //         WITH p.role AS r, count(p) AS n
  //         WHERE n > 1
  //         RETURN r, n
  const p7 = new NamedNode('p7');
  const r = new NamedVariable('r');
  const n = new NamedVariable('n');
  const clause7 = new Match(new Pattern(p7, { labels: ['Person'] }))
    .with(
      [p7.property('role'), r],
      [count(p7), n],
    )
    .where(gt(n, new Param(1)))
    .return(r, n);
  await run('示例 7:WITH 流水线(被度化次数>1 的角色)', clause7);
}

main()
  .catch((e) => {
    console.error('❌', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await session.close();
    await driver.close();
  });
