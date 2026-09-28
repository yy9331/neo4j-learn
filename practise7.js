// 第 6 阶段 练习脚本:APOC 库(常用存储过程)
// 用法: node practise7.js
// 前置: Neo4j 已装 APOC 5.26.30(已通过 NEO4J_PLUGINS=['apoc'] 自动安装)
// 只读,不写数据,跑完无需重跑 import

import { verify, getSession, close, cleanObject } from './neo4j-helper.js';

// ============ 主流程 ============
const main = async () => {
  await verify();
  const { session } = getSession();

  // ============ 场景 1:集合分批(apoc.coll.partition) ============
  // 原生 collect() 只能聚成 1 个数组,没法按 N 个一组分批
  // APOC apoc.coll.partition(list, batchSize) 一行搞定
  console.log('\n📋 [场景 1] 集合分批 apoc.coll.partition (按 5 个一组)');
  const res1 = await session.run(`
    MATCH (p:Person)
    WITH collect(p.name) AS allNames
    CALL apoc.coll.partition(allNames, 5) YIELD value AS batch
    RETURN batch
  `);
  console.log(`  共 ${res1.records.length} 批:`);
  for (const record of res1.records) {
    console.log('  →', JSON.stringify(cleanObject(record.get('batch'))));
  }

  // ============ 场景 2:可配置图遍历(apoc.path.expandConfig) ============
  // 原生变长路径 MATCH (t)-[:师徒*1..3]->() 不能动态改关系类型/方向/过滤
  // APOC apoc.path.expandConfig(startNode, config) 支持丰富配置
  console.log('\n📋 [场景 2] 可配置图遍历 apoc.path.expandConfig (从唐僧走师徒关系,深度 1~3)');
  const res2 = await session.run(`
    MATCH (t:Person {name: '唐僧'})
    CALL apoc.path.expandConfig(t, {
      relationshipFilter: '师徒>',
      minLevel: 1,
      maxLevel: 3
    }) YIELD path
    RETURN [n IN nodes(path) | n.name] AS 路径, length(path) AS 跳数
    ORDER BY 跳数
  `);
  console.log(`  共 ${res2.records.length} 条路径:`);
  for (const record of res2.records) {
    console.log('  →', JSON.stringify(cleanObject(record.toObject())));
  }

  // ============ 场景 3:数据模型 Schema(apoc.meta.schema) ============
  // 原生要分别调 db.labels() / db.relationshipTypes() / db.propertyKeys
  // APOC apoc.meta.schema() 一行拿到完整 Schema
  console.log('\n📋 [场景 3] Schema 查询 apoc.meta.schema (完整数据模型)');
  const res3 = await session.run(`
    CALL apoc.meta.schema() YIELD value
    RETURN value
  `);
  const schema = cleanObject(res3.records[0].get('value'));
  // schema 是 { labelName: { properties: {...}, relationships: {...} } } 的 Map
  console.log(`  Schema 包含 ${Object.keys(schema).length} 个标签的元信息:`);
  for (const [label, info] of Object.entries(schema)) {
    const propCount = info.properties ? Object.keys(info.properties).length : 0;
    const relCount = info.relationships ? Object.keys(info.relationships).length : 0;
    console.log(`  → [${label}] 属性 ${propCount} 个, 关系类型 ${relCount} 个`);
  }
};

main()
  .catch((e) => {
    console.error('❌', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await close();
  });
