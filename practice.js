// 第 1 阶段 cypher-builder 练习脚本
// 用法: node practice.js
// 前置: 先跑 `node import.js` 确保数据已导入(15 节点 + 26 关系)

import { Match, NamedNode, Param, Pattern, in as inOp, contains, count, collect, gt, NamedVariable } from '@neo4j/cypher-builder';
import { verify, run, close } from './neo4j-helper.js';

// ============ 主流程 ============
async function main() {
  await verify();

  // ---------- 示例 1:多 pattern ----------
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

  // ---------- 示例 2a:WHERE IN ----------
  const p2 = new NamedNode('p2');
  const clause2a = new Match(new Pattern(p2, { labels: ['Person'] }))
    .where(inOp(p2.property('role'), new Param(['主角', '佛门'])))
    .return(p2.property('name'), p2.property('role'));
  await run('示例 2a:WHERE IN 查主角和佛门', clause2a);

  // ---------- 示例 2b:WHERE CONTAINS ----------
  const p2b = new NamedNode('p2b');
  const clause2b = new Match(new Pattern(p2b, { labels: ['Person'] }))
    .where(contains(p2b.property('name'), new Param('悟空')))
    .return(p2b.property('name'));
  await run('示例 2b:WHERE CONTAINS 查名字带悟空', clause2b);

  // ---------- 示例 3:别名 + 中文列名 ----------
  const p3 = new NamedNode('p3');
  const clause3 = new Match(new Pattern(p3, { labels: ['Person'] })).return(
    [p3.property('name'), '姓名'],
    [p3.property('role'), '角色'],
    [p3.property('description'), '简介'],
  );
  await run('示例 3:别名 + 中文列名', clause3);

  // ---------- 示例 4:排序分页 ----------
  const p4 = new NamedNode('p4');
  const clause4 = new Match(new Pattern(p4, { labels: ['Person'] }))
    .return(p4.property('name'))
    .orderBy([p4.property('name'), 'ASC'])
    .skip(3)
    .limit(5);
  await run('示例 4:排序分页(SKIP 3 LIMIT 5)', clause4);

  // ---------- 示例 5a:DISTINCT ----------
  const p5a = new NamedNode('p5a');
  const clause5a = new Match(new Pattern(p5a, { labels: ['Person'] }))
    .return(p5a.property('role'))
    .distinct();
  await run('示例 5a:DISTINCT 查所有不重复 role', clause5a);

  // ---------- 示例 5b:count + 分组排序 ----------
  const p5b = new NamedNode('p5b');
  const nExpr = count(p5b);
  const clause5b = new Match(new Pattern(p5b, { labels: ['Person'] }))
    .return(p5b.property('role'), [nExpr, '人数'])
    .orderBy([nExpr, 'DESC']);
  await run('示例 5b:count + 分组排序', clause5b);

  // ---------- 示例 6:collect ----------
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
  await run('示例 7:WITH 流水线(人数>1 的角色)', clause7);
}

main()
  .catch((e) => {
    console.error('❌', e.message);
    process.exitCode = 1;
  })
  .finally(close);
