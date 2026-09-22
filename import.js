import neo4j from 'neo4j-driver';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  Match,
  Node,
  Param,
  Pattern,
  Unwind,
  count,
  NamedVariable,
  NamedNode,
} from '@neo4j/cypher-builder';

// ============ 配置 ============
const URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const USER = process.env.NEO4J_USER || 'neo4j';
const PASSWORD = process.env.NEO4J_PASSWORD || 'your_password';

// ESM 中没有 __dirname,需要用 import.meta.url 手动构造
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============ 简易 CSV 解析(处理逗号分隔,不含引号转义) ============
function parseCSV(filePath) {
  const text = fs.readFileSync(filePath, 'utf-8');
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const vals = line.split(',');
    const obj = {};
    headers.forEach((h, i) => (obj[h] = vals[i]));
    return obj;
  });
}

// ============ 工具:执行 cypher-builder 查询并打印对照 ============
async function runQuery(session, clause, label = '') {
  const { cypher, params } = clause.build();
  if (label) console.log(`\n📋 [${label}] 生成的 Cypher:\n  ${cypher.replace(/\n/g, '\n  ')}`);
  const res = await session.run(cypher, params);
  return res;
}

async function main() {
  const driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD));
  await driver.verifyConnectivity();
  console.log('✅ Neo4j 连接成功');

  const session = driver.session();

  try {
    // ===== 0) 确保约束和索引存在(IF NOT EXISTS,幂等) =====
    // Schema 操作和数据操作分开,约束/索引只需一次,写在这里保证每次重建数据都能用上
    console.log('\n📋 [Schema] 检查约束和索引...');
    await session.run(`
      CREATE CONSTRAINT person_id_unique IF NOT EXISTS
      FOR (p:Person) REQUIRE p.id IS UNIQUE;
    `);
    await session.run(`
      CREATE INDEX person_name IF NOT EXISTS
      FOR (p:Person) ON (p.name);
    `);
    console.log('  ✅ 约束 person_id_unique: 已存在或已创建');
    console.log('  ✅ 索引 person_name: 已存在或已创建');

    // ===== 1) 清空数据库 =====
    // Cypher: MATCH (n) DETACH DELETE n
    const n = new Node();
    const clearClause = new Match(new Pattern(n)).detachDelete(n);
    await runQuery(session, clearClause, '清空');
    console.log('🗑️  数据库已清空');

    // ===== 2) 导入人物节点 =====
    // 用 cypher-builder 构造:
    //   UNWIND $param AS row
    //   CREATE (p:Person { id: row.id, name: row.name, role: row.role, description: row.description })
    const nodes = parseCSV(path.join(__dirname, 'data', 'nodes.csv'));

    const rowVar = new NamedVariable('row');
    const pNode = new NamedNode('p');
    const nodePattern = new Pattern(pNode, {
      labels: ['Person'],
      properties: {
        id: rowVar.property('id'),
        name: rowVar.property('name'),
        role: rowVar.property('role'),
        description: rowVar.property('description'),
      },
    });

    const nodeClause = new Unwind([new Param(nodes), rowVar]).create(nodePattern);
    const nodeRes = await runQuery(session, nodeClause, '导入节点');
    console.log(`✅ 导入节点 ${nodeRes.summary.counters.updates().nodesCreated} 个`);

    // ===== 3) 按关系类型分组导入关系 =====
    // Cypher 不支持动态关系类型,所以必须按类型分组,每种类型单独构造一条 CREATE
    const rels = parseCSV(path.join(__dirname, 'data', 'relationships.csv'));

    // 按 relation_type 分组
    const byType = {};
    for (const r of rels) {
      (byType[r.relation_type] ||= []).push(r);
    }

    let totalRels = 0;
    console.log(`\n📊 共 ${Object.keys(byType).length} 种关系类型:`);

    for (const [type, list] of Object.entries(byType)) {
      // 构造:
      //   UNWIND $param AS row
      //   MATCH (a:Person { id: row.from_id })
      //   MATCH (b:Person { id: row.to_id })
      //   CREATE (a)-[:`师徒` { description: row.description }]->(b)
      const rowRel = new NamedVariable('row');
      const aNode = new NamedNode('a');
      const bNode = new NamedNode('b');

      const patternA = new Pattern(aNode, {
        labels: ['Person'],
        properties: { id: rowRel.property('from_id') },
      });
      const patternB = new Pattern(bNode, {
        labels: ['Person'],
        properties: { id: rowRel.property('to_id') },
      });
      const relPattern = new Pattern(aNode)
        .related(null, {
          type, // 关系类型(中文也可以,生成时自动加反引号)
          direction: 'right',
          properties: { description: rowRel.property('description') },
        })
        .to(bNode);

      const relClause = new Unwind([new Param(list), rowRel])
        .match(patternA)
        .match(patternB)
        .create(relPattern);

      const relRes = await runQuery(session, relClause);
      const created = relRes.summary.counters.updates().relationshipsCreated;
      totalRels += created;
      console.log(`  [${type}] 创建 ${created} 条`);
    }
    console.log(`\n✅ 导入关系 ${totalRels} 条`);

    // ===== 4) 验证 =====
    // MATCH (n) RETURN count(n)
    const verifyNode = new Node();
    const verifyClause = new Match(new Pattern(verifyNode)).return(count(verifyNode));
    const verifyRes = await runQuery(session, verifyClause);
    const totalNodes = verifyRes.records[0].get('count(this0)').toNumber();
    console.log(`\n📊 验证:节点 ${totalNodes} 个,关系 ${totalRels} 条`);
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exitCode = 1;
});
