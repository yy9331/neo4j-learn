// 第 3 阶段 cypher-builder 练习脚本:写入与数据建模
// 用法: node practice3.js
// 前置: 先跑 `node import.js` 确保数据已导入(15 节点 + 26 关系)
// ⚠️ 本阶段会修改/删除数据,全部跑完后重跑 `node import.js` 恢复

import { Match, NamedNode, Param, Pattern, Merge, labels, type, eq } from '@neo4j/cypher-builder';
import { verify, run, close, getSession } from './neo4j-helper.js';

// ============ 主流程 ============
async function main() {
  await verify();

  // ---------- 示例 1:SET 单个属性 ----------
  // Cypher: MATCH (p:Person {name:'孙悟空'}) SET p.weapon = '金箍棒' RETURN p.name, p.weapon
  const p1 = new NamedNode('p1');
  const clause1 = new Match(
    new Pattern(p1, { labels: ['Person'], properties: { name: new Param('孙悟空') } })
  )
    .set([p1.property('weapon'), new Param('金箍棒')])
    .return(p1.property('name'), p1.property('weapon'));
  await run('示例 1:SET 单个属性(孙悟空→金箍棒)', clause1);

  // ---------- 示例 2:SET 多个属性(等价 +=) ----------
  // 注:cypher-builder 3.3.0 已支持 SET +=,写法是 .set([p, "+=", new Map({...})])
  //   但多条 .set() 更直观,这里用等价写法演示
  // Cypher: MATCH (p:Person {name:'白龙马'}) SET p.weapon = '龙鳞枪', p.origin = '西海龙宫'
  const p2 = new NamedNode('p2');
  const clause2 = new Match(
    new Pattern(p2, { labels: ['Person'], properties: { name: new Param('白龙马') } })
  )
    .set([p2.property('weapon'), new Param('龙鳞枪')])
    .set([p2.property('origin'), new Param('西海龙宫')])
    .return(p2.property('name'), p2.property('weapon'), p2.property('origin'));
  await run('示例 2:SET 多个属性(白龙马→武器+出身)', clause2);

  // ---------- 示例 3:REMOVE 删除属性 ----------
  // Cypher: MATCH (p:Person {name:'白龙马'}) REMOVE p.origin
  const p3 = new NamedNode('p3');
  const clause3 = new Match(
    new Pattern(p3, { labels: ['Person'], properties: { name: new Param('白龙马') } })
  )
    .remove(p3.property('origin'))
    .return(p3.property('name'), p3.property('weapon'), p3.property('origin'));
  await run('示例 3:REMOVE 属性(删白龙马的 origin)', clause3);

  // ---------- 示例 4:SET :标签 加标签 ----------
  // Cypher: MATCH (p:Person {name:'观音菩萨'}) SET p:Buddha RETURN labels(p) AS 标签
  const p4 = new NamedNode('p4');
  const clause4 = new Match(
    new Pattern(p4, { labels: ['Person'], properties: { name: new Param('观音菩萨') } })
  )
    .set(p4.label('Buddha'))
    .return([labels(p4), '标签']);
  await run('示例 4:加标签(观音→Buddha)', clause4);

  // ---------- 示例 5:REMOVE :标签 减标签 ----------
  // Cypher: MATCH (p:Person {name:'观音菩萨'}) REMOVE p:Buddha
  const p5 = new NamedNode('p5');
  const clause5 = new Match(
    new Pattern(p5, { labels: ['Person'], properties: { name: new Param('观音菩萨') } })
  )
    .remove(p5.label('Buddha'))
    .return([labels(p5), '剩余标签']);
  await run('示例 5:减标签(观音→去掉 Buddha)', clause5);

  // ---------- 示例 6:MERGE + ON CREATE SET / ON MATCH SET ----------
  // Cypher: MERGE (p:Person {id:'erlang_shen', name:'杨戬'})
  //         ON CREATE SET p.created = true, p.role = '天庭'
  //         ON MATCH SET p.matched = true
  //         RETURN p
  const p6 = new NamedNode('p6');
  const mergePattern = new Pattern(p6, {
    labels: ['Person'],
    properties: { id: new Param('erlang_shen'), name: new Param('杨戬') }
  });
  const clause6 = new Merge(mergePattern)
    .onCreateSet(
      [p6.property('created'), new Param(true)],
      [p6.property('role'), new Param('天庭')]
    )
    .onMatchSet([p6.property('matched'), new Param(true)])
    .return(p6);
  await run('示例 6:MERGE + ON CREATE/ON MATCH(创建杨戬)', clause6);

  // 再 MERGE 一次,观察 matched 被设为 true
  const clause6b = new Merge(mergePattern)
    .onCreateSet(
      [p6.property('created'), new Param(true)],
      [p6.property('role'), new Param('天庭')]
    )
    .onMatchSet([p6.property('matched'), new Param(true)])
    .return(p6);
  await run('示例 6b:第二次 MERGE 杨戬(观察 matched=true)', clause6b);

  // ---------- 示例 7:DETACH DELETE ----------
  // Cypher: MATCH (p:Person {id:'erlang_shen'}) DETACH DELETE p
  const p7 = new NamedNode('p7');
  const clause7 = new Match(
    new Pattern(p7, { labels: ['Person'], properties: { id: new Param('erlang_shen') } })
  )
    .detachDelete(p7)
    .return([p7.property('name'), '已删除的名字']);
  // 注意:DETACH DELETE 后不能 RETURN 已删除节点的属性
  // 因为 Neo4j 事务内删除后节点就不可访问了
  // 上面的代码会报 "Node with id 0 has been deleted"
  // 正确写法:DELETE 后不 RETURN 节点属性,用 count 或不加 RETURN
  console.log('\n📋 [示例 7:DETACH DELETE 杨戬]');
  console.log('  Cypher: MATCH (p:Person {id:"erlang_shen"}) DETACH DELETE p');
  console.log('  (DETACH DELETE 后不能 RETURN 已删除节点的属性,直接执行即可)');
  const { session } = getSession();
  const delRes = await session.run('MATCH (p:Person {id: $id}) DETACH DELETE p', { id: 'erlang_shen' });
  console.log('  ✅ 已删除,删除节点数:', delRes.summary.counters.nodesDeleted);

  // ---------- 示例 8:关系 SET 属性 ----------
  // Cypher: MATCH (t:Person {name:'唐僧'})-[r:师徒]->(s:Person {name:'孙悟空'})
  //         SET r.rank = '大徒弟'
  //         RETURN t.name, type(r) AS 关系, r.rank AS 排行, s.name
  const t8 = new NamedNode('t8');
  const s8 = new NamedNode('s8');
  const r8 = new NamedNode('r8');
  const clause8 = new Match(
    new Pattern(t8, { labels: ['Person'], properties: { name: new Param('唐僧') } })
      .related(r8, { type: '师徒', direction: 'right' }).to(s8, { labels: ['Person'], properties: { name: new Param('孙悟空') } })
  )
    .set([r8.property('rank'), new Param('大徒弟')])
    .return(
      t8.property('name'),
      [type(r8), '关系'],
      [r8.property('rank'), '排行'],
      s8.property('name')
    );
  await run('示例 8:关系 SET 属性(唐僧→孙悟空 rank=大徒弟)', clause8);

  // ---------- 示例 9:方向查询(复习) ----------
  // Cypher: MATCH (m:Person)-[:师徒]->(t) WHERE m.name='唐僧' RETURN t.name AS 徒弟
  const m9 = new NamedNode('m9');
  const t9 = new NamedNode('t9');
  const clause9 = new Match(
    new Pattern(m9, { labels: ['Person'] })
      .related(null, { type: '师徒', direction: 'right' }).to(t9)
  )
    .where(eq(m9.property('name'), new Param('唐僧')))
    .return([t9.property('name'), '徒弟']);
  await run('示例 9:方向查询(查唐僧的徒弟)', clause9);

  // 恢复数据
  console.log('\n🗑️  练习已修改数据,请重跑 node import.js 恢复');
}

main()
  .catch((e) => {
    console.error('❌', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await close();
  });
