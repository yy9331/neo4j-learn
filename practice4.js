// 第 5 阶段 cypher-builder 练习脚本:高级 Cypher
// 用法: node practice4.js
// 前置: 先跑 `node import.js` 确保数据已导入(15 节点 + 26 关系)
// ⚠️ 示例 6 (FOREACH) 会修改数据,跑完请重跑 `node import.js` 恢复

import {
  Match,
  NamedNode,
  Param,
  Pattern,
  NamedVariable,
  Unwind,
  Union,
  ListComprehension,
  PatternComprehension,
  count,
  collect,
  plus,
  Literal,
  List,
} from '@neo4j/cypher-builder';
import { verify, run, close, getSession, cleanObject } from './neo4j-helper.js';

// ============ 主流程 ============
async function main() {
  await verify();

  // ============ 知识点 1:CALL {} 子查询 ============

  // ---------- 示例 1a:相关子查询 CALL(p) {} ----------
  // Cypher:
  //   MATCH (p:Person {role:'主角'})
  //   CALL (p) {
  //     MATCH (g:Person)-[:度化]->(p)
  //     RETURN g.name AS 度化者
  //   }
  //   RETURN p.name AS 姓名, collect(度化者) AS 被谁度化
  const p1 = new NamedNode('p1');
  const g1 = new NamedNode('g1');
  const 度化者1 = new NamedVariable('度化者');
  const 子查询1 = new Match(
    new Pattern(g1, { labels: ['Person'] })
      .related(null, { type: '度化', direction: 'right' }).to(p1)
  ).return([g1.property('name'), 度化者1]);  // 二元组形式:[expr, alias]
  const clause1 = new Match(
    new Pattern(p1, { labels: ['Person'], properties: { role: new Param('主角') } })
  )
    .call(子查询1, [p1])  // 第二个参数 [p] 对应 CALL(p) 的新语法
    .return(
      [p1.property('name'), '姓名'],
      [collect(度化者1), '被谁度化'],
    );
  await run('示例 1a:相关子查询 CALL(p) {}(每个主角被谁度化)', clause1);

  // ---------- 示例 1b:不相关子查询 CALL () {}----------
  // Cypher:
  //   MATCH (p:Person {role:'妖魔'})
  //   CALL () {
  //     MATCH (a:Person {role:'主角'})
  //     RETURN count(a) AS 主角总数
  //   }
  //   RETURN p.name AS 姓名, 主角总数
  const p1b = new NamedNode('p1b');
  const a1b = new NamedNode('a1b');
  const 主角总数1b = new NamedVariable('主角总数');
  const 子查询1b = new Match(
    new Pattern(a1b, { labels: ['Person'], properties: { role: new Param('主角') } })
  ).return([count(a1b), 主角总数1b]);
  const clause1b = new Match(
    new Pattern(p1b, { labels: ['Person'], properties: { role: new Param('妖魔') } })
  )
    .call(子查询1b, [])  // 传空数组 [] → CALL() {} (新语法的空括号)
    .return(
      [p1b.property('name'), '姓名'],
      主角总数1b,
    );
  await run('示例 1b:不相关子查询 CALL() {}(妖魔带主角总数)', clause1b);

  // ============ 知识点 2:EXISTS 子查询 ============

  // ---------- 示例 2:EXISTS 检查关系存在 ----------
  // Cypher (函数式,推荐):
  //   MATCH (p:Person)
  //   WHERE EXISTS((p)-[:度化]->())
  //   RETURN p.name AS 度化者
  //
  // 注:cypher-builder 的 Exists 类生成块式语法 EXISTS { MATCH ... },
  // 但 Neo4j 5.x 推荐用函数式 EXISTS(...) —— 更简洁,和教程一致。
  // 这里直接用原生 Cypher 演示推荐写法。
  console.log('\n📋 [示例 2:EXISTS 检查度化出边]');
  console.log('  Cypher: MATCH (p:Person) WHERE EXISTS((p)-[:度化]->()) RETURN p.name AS 度化者');
  const { session: sess2 } = getSession();
  const res2 = await sess2.run(
    'MATCH (p:Person) WHERE EXISTS((p)-[:度化]->()) RETURN p.name AS 度化者'
  );
  console.log(`  结果(${res2.records.length} 行):`);
  for (const record of res2.records) {
    console.log('  →', cleanObject(record.toObject()));
  }

  // ============ 知识点 3:列表推导 ============

  // ---------- 示例 3:列表推导过滤 + 映射 ----------
  // Cypher: RETURN [x IN range(1,10) WHERE x % 2 <> 0 | x * 10] AS 奇数乘十
  //
  // 注:cypher-builder 的 ListComprehension 对内置函数 range() 和算术运算
  //   支持不友好,这里直接用原生 Cypher 演示最简洁。
  //   示例 3b 演示 cypher-builder 的 ListComprehension 在节点列表上的用法。
  console.log('\n📋 [示例 3:列表推导 - 奇数乘 10]');
  console.log('  Cypher: RETURN [x IN range(1, 10) WHERE x % 2 <> 0 | x * 10] AS 奇数乘十');
  const { session: sess3 } = getSession();
  const res3 = await sess3.run('RETURN [x IN range(1, 10) WHERE x % 2 <> 0 | x * 10] AS `奇数乘十`');
  console.log('  结果:', cleanObject(res3.records[0].toObject()));

  // ---------- 示例 3b:列表推导在 RETURN 中处理节点属性 ----------
  // Cypher:
  //   MATCH (a:Person {name:'孙悟空'})-[:师兄弟]-(b)
  //   WITH collect(b) AS brothers
  //   RETURN [x IN brothers | x.name] AS 师兄弟名字
  const a3b = new NamedNode('a3b');
  const b3b = new NamedNode('b3b');
  const brothers3b = new NamedVariable('brothers');
  const x3b = new NamedVariable('x');
  const listComp3b = new ListComprehension(x3b)
    .in(brothers3b)
    .map(x3b.property('name'));
  const clause3b = new Match(
    new Pattern(a3b, { labels: ['Person'], properties: { name: new Param('孙悟空') } })
      .related(null, { type: '师兄弟', direction: 'undirected' }).to(b3b)
  )
    .with([collect(b3b), brothers3b])
    .return([listComp3b, '师兄弟名字']);
  await run('示例 3b:列表推导从节点列表提取名字(悟空的师兄弟名字)', clause3b);

  // ============ 知识点 4:模式推导 ============

  // ---------- 示例 4:模式推导直接从 pattern 生成数组 ----------
  // Cypher:
  //   MATCH (a:Person {name:'观音菩萨'})
  //   RETURN [(a)-[:度化]->(b) | b.name] AS 度化名单
  const a4 = new NamedNode('a4');
  const b4 = new NamedNode('b4');
  const pattern4 = new Pattern(a4)
    .related(null, { type: '度化', direction: 'right' }).to(b4);
  const patternComp4 = new PatternComprehension(pattern4)
    .map(b4.property('name'));
  const clause4 = new Match(
    new Pattern(a4, { labels: ['Person'], properties: { name: new Param('观音菩萨') } })
  ).return([patternComp4, '度化名单']);
  await run('示例 4:模式推导(观音度化的人名数组)', clause4);

  // ============ 知识点 5:UNWIND ============

  // ---------- 示例 5:UNWIND + MATCH + collect ----------
  // Cypher:
  //   UNWIND ['唐僧','孙悟空','猪八戒','沙僧'] AS name
  //   MATCH (p:Person {name: name})
  //   RETURN collect(p.name + '-' + p.role) AS 介绍
  const name5 = new NamedVariable('name');
  const p5 = new NamedNode('p5');
  const clause5 = new Unwind([new List([
    new Literal('唐僧'),
    new Literal('孙悟空'),
    new Literal('猪八戒'),
    new Literal('沙僧'),
  ]), name5])
    .match(new Pattern(p5, { labels: ['Person'], properties: { name: name5 } }))
    .return([collect(plus(p5.property('name'), plus(new Literal('-'), p5.property('role')))), '介绍']);
  await run('示例 5:UNWIND 展开数组 + MATCH + 聚合(介绍)', clause5);

  // ============ 知识点 6:FOREACH ============

  // ---------- 示例 6:FOREACH 批量 SET ----------
  // Cypher:
  //   MATCH (p:Person {role:'妖魔'})
  //   FOREACH (n IN [p] | SET n.danger = 'high')
  //   RETURN p.name AS 姓名, p.danger
  // ⚠️ 会修改数据,跑完重跑 import.js 恢复
  //
  // 注:cypher-builder 的 Foreach.do() 只接受 Create/Merge/Foreach,
  //   不能直接写 SET 子句。这里直接用原生 Cypher 演示 FOREACH 的标准用法。
  console.log('\n📋 [示例 6:FOREACH 批量 SET danger=high]');
  console.log('  Cypher: MATCH (p:Person {role:\'妖魔\'}) FOREACH (n IN [p] | SET n.danger = \'high\') RETURN p.name, p.danger');
  const { session: sess6 } = getSession();
  const res6 = await sess6.run(
    `MATCH (p:Person {role: '妖魔'})
     FOREACH (n IN [p] | SET n.danger = 'high')
     RETURN p.name AS 姓名, p.danger AS danger`
  );
  console.log(`  结果(${res6.records.length} 行):`);
  for (const record of res6.records) {
    console.log('  →', cleanObject(record.toObject()));
  }
  console.log('  ⚠️ 已修改 4 个妖魔的 danger 属性,记得重跑 import.js 恢复');

  // ============ 知识点 7:CASE WHEN ============

  // ---------- 示例 7:CASE WHEN + EXISTS 给每个人分类 ----------
  // Cypher:
  //   MATCH (p:Person)
  //   RETURN p.name AS 姓名,
  //          CASE
  //            WHEN EXISTS((p)-[:度化]->()) THEN '度化者'
  //            WHEN EXISTS(()-[:度化]->(p)) THEN '被度化'
  //            ELSE '无关'
  //          END AS 身份
  //
  // 注:cypher-builder 的 Case 和 Exists 嵌套使用存在 API 限制,
  // 这里直接用原生 Cypher 演示 CASE WHEN + EXISTS 函数式的组合用法。
  console.log('\n📋 [示例 7:CASE WHEN + EXISTS 度化身份分类]');
  console.log('  Cypher: MATCH (p:Person) RETURN p.name AS 姓名, CASE WHEN EXISTS(...) THEN ... END AS 身份');
  const { session: sess7 } = getSession();
  const res7 = await sess7.run(`
    MATCH (p:Person)
    RETURN p.name AS 姓名,
           CASE
             WHEN EXISTS((p)-[:度化]->()) THEN '度化者'
             WHEN EXISTS(()-[:度化]->(p)) THEN '被度化'
             ELSE '无关'
           END AS 身份
    ORDER BY 身份, 姓名
  `);
  console.log(`  结果(${res7.records.length} 行):`);
  for (const record of res7.records) {
    console.log('  →', cleanObject(record.toObject()));
  }

  // ============ 知识点 8:UNION / UNION ALL ============

  // ---------- 示例 8a:UNION 去重合并 ----------
  // Cypher:
  //   MATCH (g:Person {name:'观音菩萨'})-[:度化]->(p)
  //   RETURN p.name AS 姓名
  //   UNION
  //   MATCH (a:Person {name:'孙悟空'})-[:师兄弟]-(p)
  //   RETURN p.name AS 姓名
  const g8a = new NamedNode('g8a');
  const p8a = new NamedNode('p8a');
  const sub8a1 = new Match(
    new Pattern(g8a, { labels: ['Person'], properties: { name: new Param('观音菩萨') } })
      .related(null, { type: '度化', direction: 'right' }).to(p8a)
  ).return([p8a.property('name'), '姓名']);

  const a8a = new NamedNode('a8a');
  const p8a2 = new NamedNode('p8a2');
  const sub8a2 = new Match(
    new Pattern(a8a, { labels: ['Person'], properties: { name: new Param('孙悟空') } })
      .related(null, { type: '师兄弟', direction: 'undirected' }).to(p8a2)
  ).return([p8a2.property('name'), '姓名']);

  // UNION 默认就是去重(Neo4j 5.19+ 用 .distinct() 显式加 DISTINCT,不加也是去重)
  const clause8a = new Union(sub8a1, sub8a2);
  await run('示例 8a:UNION 去重合并(观音度化的人 ∪ 悟空师兄弟)', clause8a);

  // ---------- 示例 8b:UNION ALL 保留重复 ----------
  // 同样的两个子查询,加 .all() 改为 UNION ALL
  const sub8b1 = new Match(
    new Pattern(new NamedNode('g8b'), { labels: ['Person'], properties: { name: new Param('观音菩萨') } })
      .related(null, { type: '度化', direction: 'right' }).to(new NamedNode('p8b1'))
  ).return([new NamedNode('p8b1').property('name'), '姓名']);
  const sub8b2 = new Match(
    new Pattern(new NamedNode('a8b'), { labels: ['Person'], properties: { name: new Param('孙悟空') } })
      .related(null, { type: '师兄弟', direction: 'undirected' }).to(new NamedNode('p8b2'))
  ).return([new NamedNode('p8b2').property('name'), '姓名']);
  const clause8b = new Union(sub8b1, sub8b2).all();
  await run('示例 8b:UNION ALL 保留重复(对照 UNION 的行数)', clause8b);

  // 恢复数据提示
  console.log('\n🗑️  示例 6 修改了数据,请重跑 node import.js 恢复');
}

main()
  .catch((e) => {
    console.error('❌', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await close();
  });
