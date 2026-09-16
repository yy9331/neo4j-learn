const neo4j = require('neo4j-driver');
const fs = require('fs');
const path = require('path');

const URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const USER = process.env.NEO4J_USER || 'neo4j';
const PASSWORD = process.env.NEO4J_PASSWORD || 'your_password';

// 简单 CSV 解析(处理逗号、引号)
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

async function main() {
  const driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD));
  const session = driver.session();

  try {
    // 1) 清空
    await session.run('MATCH (n) DETACH DELETE n');
    console.log('已清空数据库');

    // 2) 导入节点
    const nodes = parseCSV(path.join(__dirname, 'data', 'nodes.csv'));
    const nodeRes = await session.run(
      `UNWIND $rows AS row
       CREATE (p:Person {id: row.id, name: row.name, role: row.role, description: row.description})`,
      { rows: nodes }
    );
    console.log(`✅ 导入节点 ${nodeRes.summary.counters.updates().nodesCreated} 个`);

    // 3) 按关系类型分别创建(纯 Cypher 不支持动态关系类型,按类型分组)
    const rels = parseCSV(path.join(__dirname, 'data', 'relationships.csv'));
    let total = 0;

    // 按 relation_type 分组
    const byType = {};
    for (const r of rels) {
      (byType[r.relation_type] ||= []).push(r);
    }

    for (const [type, list] of Object.entries(byType)) {
      const res = await session.run(
        `UNWIND $rows AS row
         MATCH (a:Person {id: row.from_id})
         MATCH (b:Person {id: row.to_id})
         CREATE (a)-[r:${escapeType(type)} {description: row.description}]->(b)`,
        { rows: list }
      );
      const n = res.summary.counters.updates().relationshipsCreated;
      total += n;
      console.log(`  [${type}] 创建 ${n} 条`);
    }
    console.log(`✅ 导入关系 ${total} 条`);
  } finally {
    await session.close();
    await driver.close();
  }
}

// 关系类型名需要符合 Cypher 标识符规则,中文也可以
function escapeType(t) {
  // 中文可以直接用,不需要转义
  return t;
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exitCode = 1;
});
